import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { catalogoPara, conferir, type DonoGeracao, lerCampos, seedDe } from "../geracao/catalogo.ts";
import { cancelarExecucao, executar, MAX_POR_ENVIO, progressoDe } from "../geracao/execucao.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp, Uuid, UuidOpcional, validar } from "../lib/validacao.ts";

/**
 * O Gerador (`/api/gerador`): o que um asset ou shot pode gerar, e o botão
 * "Gerar". Não há cadastro de geração — o pedido vai direto para a fila do
 * ComfyUI como Execuções, e cada imagem volta como um Output do dono, com
 * tudo o que foi usado para gerá-la.
 */

/** Um asset ou um shot — exatamente um. */
const Dono = z
  .object({ asset: UuidOpcional, shot: UuidOpcional })
  .refine((d) => !!d.asset !== !!d.shot, "o Gerador é de um asset ou de um shot");

const Pedido = z
  .object({
    assetId: UuidOpcional,
    shotId: UuidOpcional,
    tipo: z.string().min(1, "escolha o tipo de geração"),
    workflow: z.string().min(1, "escolha o workflow"),
    parametros: z.record(z.string(), z.unknown()).default({}),
    quantidade: z.number().int().min(1).max(MAX_POR_ENVIO, `no máximo ${MAX_POR_ENVIO} de uma vez`).default(1),
    /** O assistente que expandiu o prompt, e a ideia de origem — vão para cada output. */
    assistenteId: UuidOpcional,
    ideia: z.string().trim().max(10_000).nullish().transform((t) => t || null),
  })
  .refine((d) => !!d.assetId !== !!d.shotId, "o Gerador é de um asset ou de um shot");

/**
 * Onde o Gerador de um dono parou. O assistente vai pelo nome (como nos
 * outputs): id muda se ele for recriado, o nome é o que a pessoa reconhece.
 * Nada aqui é conferido contra o catálogo — a tela acerta ao abrir (tipo ou
 * workflow que sumiu cai para o primeiro).
 */
const Rascunho = z.object({
  tipo: z.string().max(200),
  workflow: z.string().max(200),
  valores: z.record(z.string(), z.unknown()).default({}),
  assistente: z.string().max(200).nullish().transform((t) => t || null),
  ideia: z.string().max(10_000).nullish().transform((t) => t || null),
});

const PedidoRascunho = z
  .object({ assetId: UuidOpcional, shotId: UuidOpcional, rascunho: Rascunho.nullable() })
  .refine((d) => !!d.assetId !== !!d.shotId, "o Gerador é de um asset ou de um shot");

/** O dono como o catálogo enxerga: o tipo do asset importa (só Cenário tem Placa...). */
async function donoDe(assetId: string | null, shotId: string | null): Promise<DonoGeracao> {
  if (assetId) {
    const a = await prisma.asset.findUnique({ where: { id: assetId }, select: { tipo: true } });
    if (!a) throw new ErroHttp(400, "Asset não encontrado.");
    return { asset: a.tipo };
  }
  if (!(await prisma.shot.findUnique({ where: { id: shotId! }, select: { id: true } }))) throw new ErroHttp(400, "Shot não encontrado.");
  return { shot: true };
}

/** Quanto tempo uma execução que falhou continua aparecendo no Gerador. */
const FALHA_RECENTE_MS = 30 * 60_000;

export async function rotasGerador(app: FastifyInstance) {
  /** Os tipos (e workflows, com os campos) do Gerador de um asset ou shot. */
  app.get("/catalogo", async (req) => {
    const { asset, shot } = validar(Dono, req.query);
    return catalogoPara(await donoDe(asset, shot));
  });

  /** Onde o Gerador do dono parou (null: nunca foi salvo). */
  app.get("/rascunho", async (req) => {
    const { asset, shot } = validar(Dono, req.query);
    const d = asset
      ? await prisma.asset.findUnique({ where: { id: asset }, select: { rascunhoGerador: true } })
      : await prisma.shot.findUnique({ where: { id: shot! }, select: { rascunhoGerador: true } });
    if (!d) throw new ErroHttp(404, asset ? "Asset não encontrado." : "Shot não encontrado.");
    return { rascunho: d.rascunhoGerador ?? null };
  });

  /** Guarda onde o Gerador parou. A tela chama sozinha, enquanto se mexe no formulário. */
  app.put("/rascunho", { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const { assetId, shotId, rascunho } = validar(PedidoRascunho, req.body);
    const data = { rascunhoGerador: rascunho ? (rascunho as Prisma.InputJsonObject) : Prisma.DbNull };
    if (assetId) await prisma.asset.update({ where: { id: assetId }, data, select: { id: true } });
    else await prisma.shot.update({ where: { id: shotId! }, data, select: { id: true } });
    return { rascunho };
  });

  /** "Gerar": confere o pedido contra o catálogo e manda `quantidade` execuções ao ComfyUI. */
  app.post("/executar", async (req) => {
    const { assistenteId, ...p } = validar(Pedido, req.body);
    const w = await conferir(p.tipo, p.workflow, await donoDe(p.assetId, p.shotId));
    // O nome, copiado: o assistente pode mudar ou sumir depois.
    const assistente = assistenteId
      ? ((await prisma.assistente.findUnique({ where: { id: assistenteId }, select: { nome: true } }))?.nome ?? null)
      : null;
    await executar(w, { ...p, assistente, ideia: assistente ? p.ideia : null });
    return { ok: true };
  });

  /**
   * O que o Gerador de um dono mostra além dos outputs prontos: o que está
   * na fila ou executando (com o progresso) e as falhas recentes, para a
   * pessoa saber por que uma imagem não veio.
   */
  app.get("/execucoes", async (req) => {
    const { asset, shot } = validar(Dono, req.query);
    const execucoes = await prisma.execucao.findMany({
      where: {
        assetId: asset ?? undefined,
        shotId: shot ?? undefined,
        OR: [
          { status: { in: ["NA_FILA", "EXECUTANDO"] } },
          { status: "FALHOU", concluidaEm: { gte: new Date(Date.now() - FALHA_RECENTE_MS) } },
        ],
      },
      select: {
        id: true,
        status: true,
        workflow: true,
        parametros: true,
        promptIdComfy: true,
        erro: true,
        criadoEm: true,
        iniciadaEm: true,
        concluidaEm: true,
      },
      orderBy: { criadoEm: "asc" },
    });
    // A seed de cada uma, pelo campo de seed do workflow dela.
    const workflows = await prisma.workflow.findMany({
      where: { chave: { in: [...new Set(execucoes.map((e) => e.workflow))] } },
      select: { chave: true, campos: true },
    });
    const campos = new Map(workflows.map((w) => [w.chave, lerCampos(w.campos, w.chave)]));
    return execucoes.map(({ promptIdComfy, parametros, ...e }) => ({
      ...e,
      seed: seedDe(campos.get(e.workflow) ?? [], parametros as Record<string, unknown>),
      progresso: progressoDe(promptIdComfy),
    }));
  });

  app.post("/execucoes/:id/cancelar", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await cancelarExecucao(id);
    return { ok: true };
  });
}
