import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lerCampos, prepararParaEnvio, validarValores } from "../geracao/catalogo.ts";
import { Campo, FERRAMENTAS, nomeFerramenta, type GrafoApi } from "../geracao/definicoes.ts";
import { enviarAoComfy, estadoDoPrompt } from "../geracao/execucao.ts";
import { erroDoGrafo, erroDosCampos, montarGrafo } from "../geracao/grafo.ts";
import { chaveLivre } from "../lib/chave.ts";
import { configComfy } from "../lib/comfyui.ts";
import { prisma } from "../lib/prisma.ts";
import { Busca, ErroHttp, naoEncontrado, Nome, TextoOpcional, Uuid, validar } from "../lib/validacao.ts";

/**
 * Workflows (`/api/workflows`): o cadastro. Um workflow é o grafo como a
 * ferramenta exporta (no ComfyUI, o "Export (API)"), os campos que o Gerador
 * mostra com o alvo de cada um no grafo, e os nós de saída.
 *
 * "Testar" roda a definição — salva ou não — uma vez no ComfyUI e mostra o
 * resultado sem gravar nada: nem execução, nem output, nem arquivo no Creativa.
 */

/** Workflows grandes passam de 1 MB (o limite padrão do Fastify). */
const LIMITE = 20 * 1024 * 1024;

const Definicao = z.object({
  ferramenta: z.enum(FERRAMENTAS.map((f) => f.chave) as [string, ...string[]], "ferramenta desconhecida"),
  grafo: z.record(z.string(), z.unknown()),
  campos: z.array(Campo).default([]),
  saidas: z.array(z.string()).default([]),
});

const CorpoWorkflow = Definicao.extend({
  nome: Nome,
  tipoGeracaoId: Uuid,
  descricao: TextoOpcional(500),
  notas: TextoOpcional(50_000),
  origem: TextoOpcional(300),
  modelo: TextoOpcional(300),
});

const FiltroWorkflows = z.object({
  tipo: z.string().optional().transform((v) => v || undefined),
  busca: Busca,
});

/** O grafo é da ferramenta, os campos apontam para nós e entradas que existem, as saídas também. */
function conferirDefinicao(d: z.infer<typeof Definicao>): GrafoApi {
  const erro = erroDoGrafo(d.grafo);
  if (erro) throw new ErroHttp(400, erro);
  const grafo = d.grafo as GrafoApi;
  const e2 = erroDosCampos(grafo, d.campos);
  if (e2) throw new ErroHttp(400, e2);
  const fora = d.saidas.find((s) => !grafo[s]);
  if (fora) throw new ErroHttp(400, `O nó de saída ${fora} não existe no grafo.`);
  return grafo;
}

export async function rotasWorkflows(app: FastifyInstance) {
  /** A lista, sem o grafo (pesado): com o tipo, a ferramenta e quantos outputs cada um já gerou. */
  app.get("/", async (req) => {
    const f = validar(FiltroWorkflows, req.query);
    const [lista, usos] = await Promise.all([
      prisma.workflow.findMany({
        where: {
          tipoGeracao: f.tipo ? { chave: f.tipo } : undefined,
          nome: f.busca ? { contains: f.busca, mode: "insensitive" } : undefined,
        },
        select: {
          id: true,
          chave: true,
          ferramenta: true,
          nome: true,
          descricao: true,
          modelo: true,
          campos: true,
          editadoEm: true,
          tipoGeracao: { select: { id: true, chave: true, nome: true } },
        },
        orderBy: { nome: "asc" },
      }),
      prisma.output.groupBy({ by: ["workflow"], _count: { _all: true } }),
    ]);
    const outputs = new Map(usos.map((u) => [u.workflow, u._count._all]));
    return lista.map(({ campos, ...w }) => ({
      ...w,
      ferramentaNome: nomeFerramenta(w.ferramenta),
      qtdCampos: Array.isArray(campos) ? campos.length : 0,
      outputs: outputs.get(w.chave) ?? 0,
    }));
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const w = await prisma.workflow.findUnique({ where: { id }, include: { tipoGeracao: { select: { id: true, chave: true, nome: true } } } });
    if (!w) throw naoEncontrado("Workflow não encontrado.");
    return { ...w, campos: lerCampos(w.campos, w.chave), ferramentaNome: nomeFerramenta(w.ferramenta) };
  });

  app.post("/", { bodyLimit: LIMITE }, async (req, reply) => {
    const d = validar(CorpoWorkflow, req.body);
    conferirDefinicao(d);
    const chave = await chaveLivre(d.nome, async (c) => !!(await prisma.workflow.findUnique({ where: { chave: c } })));
    const w = await prisma.workflow.create({ data: { ...d, chave, grafo: d.grafo as object, campos: d.campos as object[] } });
    return reply.code(201).send(w);
  });

  /** A chave não muda: outputs, execuções e assistentes guardam ela. */
  app.put("/:id", { bodyLimit: LIMITE }, async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const d = validar(CorpoWorkflow, req.body);
    conferirDefinicao(d);
    return prisma.workflow.update({ where: { id }, data: { ...d, grafo: d.grafo as object, campos: d.campos as object[] } });
  });

  /**
   * Os outputs guardam a chave e os metadados, não o id: apagar o workflow
   * não mexe neles. Só não dá enquanto houver execução dele na fila.
   */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const w = await prisma.workflow.findUnique({ where: { id }, select: { chave: true } });
    if (!w) throw naoEncontrado("Workflow não encontrado.");
    const ativas = await prisma.execucao.count({ where: { workflow: w.chave, status: { in: ["NA_FILA", "EXECUTANDO"] } } });
    if (ativas) throw new ErroHttp(409, "Há gerações deste workflow na fila. Espere terminarem ou cancele antes de excluir.");
    await prisma.workflow.delete({ where: { id } });
    return reply.code(204).send();
  });

  /**
   * Roda a definição uma vez, com os valores dados (os padrões, na tela),
   * e devolve o prompt_id para acompanhar em /teste/:promptId.
   */
  app.post("/testar", { bodyLimit: LIMITE }, async (req) => {
    const { valores, ...d } = validar(Definicao.extend({ valores: z.record(z.string(), z.unknown()).default({}) }), req.body);
    if (d.ferramenta !== "comfyui") throw new ErroHttp(400, `O Creativa ainda não sabe rodar workflows de “${d.ferramenta}”.`);
    const grafo = conferirDefinicao(d);
    const prontos = prepararParaEnvio(d, validarValores(d, valores));
    const promptId = await enviarAoComfy(montarGrafo(grafo, d.campos, prontos));
    return { promptId, valores: prontos };
  });

  app.get("/teste/:promptId", async (req) => {
    const { promptId } = validar(z.object({ promptId: z.string().min(1).max(100) }), req.params);
    const { saidas } = validar(z.object({ saidas: z.string().optional() }), req.query);
    return estadoDoPrompt(promptId, saidas ? saidas.split(",").filter(Boolean) : []);
  });

  /** A imagem de um teste, direto do ComfyUI (ela não é copiada para o Creativa). */
  app.get("/teste-imagem", async (req, reply) => {
    const q = validar(z.object({ filename: z.string().min(1), subfolder: z.string().default(""), type: z.string().default("output") }), req.query);
    const r = await fetch(`${configComfy().url}/view?${new URLSearchParams(q)}`, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!r?.ok || !r.body) throw new ErroHttp(404, "O ComfyUI não tem essa imagem.");
    return reply.type(r.headers.get("content-type") ?? "image/png").send(Readable.fromWeb(r.body as never));
  });
}
