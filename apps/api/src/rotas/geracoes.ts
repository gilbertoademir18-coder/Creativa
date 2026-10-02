import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Output } from "../generated/prisma/client.ts";
import { StatusGeracao } from "../generated/prisma/enums.ts";
import { cancelar, enviar, MAX_POR_ENVIO, progressoDe } from "../geracao/execucao.ts";
import { acharTipo, acharWorkflow, catalogoPara, conferir, type DonoGeracao, validarValores } from "../geracao/registro.ts";
import { apagar } from "../lib/arquivos.ts";
import { doProjeto, doVinculo, incluirDono } from "../lib/filtros.ts";
import { prisma } from "../lib/prisma.ts";
import { Busca, ErroHttp, FiltroProjeto, naoEncontrado, TextoOpcional, Uuid, UuidOpcional, validar } from "../lib/validacao.ts";
import { referenciaParaJson } from "./referencias.ts";

/**
 * Rotas de gerações, montadas em `/api/geracoes`.
 *
 * Uma geração tem um tipo e um workflow (do catálogo em `src/geracao/`) e
 * os valores dos campos daquele workflow. Nasce em rascunho; "Gerar" manda
 * para o ComfyUI uma rodada, "Gerar mais" manda outras com seed nova, e o
 * acompanhamento (`geracao/execucao.ts`) leva cada uma até concluída —
 * trazendo as imagens como Outputs — ou falhou.
 */

/** BigInt e Decimal do banco viram número: o JSON não sabe escrever os dois. */
export function outputParaJson<T extends Pick<Output, "tamanhoBytes" | "duracaoSeg">>(o: T) {
  return {
    ...o,
    tamanhoBytes: o.tamanhoBytes === null ? null : Number(o.tamanhoBytes),
    duracaoSeg: o.duracaoSeg === null ? null : o.duracaoSeg.toNumber(),
  };
}

const CorpoGeracao = z
  .object({
    assetId: UuidOpcional,
    shotId: UuidOpcional,
    nome: TextoOpcional(120),
    tipo: z.string().min(1, "escolha o tipo de geração"),
    workflow: z.string().min(1, "escolha o workflow"),
    parametros: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((d) => !(d.assetId && d.shotId), "a geração pertence a um asset ou a um shot, não aos dois");

const FiltroGeracoes = z.object({
  projeto: FiltroProjeto,
  status: z.enum(StatusGeracao, "status inválido").optional().or(z.literal("").transform(() => undefined)),
  vinculo: z.enum(["asset", "shot", "solta"], "vínculo inválido").optional().or(z.literal("").transform(() => undefined)),
  tipo: z.string().optional().transform((v) => v || undefined),
  asset: Uuid.optional(),
  shot: Uuid.optional(),
  busca: Busca,
});

const daListagem = {
  ...incluirDono,
  _count: { select: { outputs: true, entradas: true } },
  // A primeira imagem gerada vira a miniatura da linha.
  outputs: { select: { arquivo: true, tipo: true }, orderBy: { criadoEm: "asc" as const }, take: 1 },
};

/** O dono como o catálogo enxerga: o tipo do asset importa (só Cenário tem Placa...). */
async function donoDe(assetId: string | null, shotId: string | null): Promise<DonoGeracao> {
  if (assetId) {
    const a = await prisma.asset.findUnique({ where: { id: assetId }, select: { tipo: true } });
    if (!a) throw new ErroHttp(400, "Asset não encontrado.");
    return { asset: a.tipo };
  }
  if (shotId) {
    if (!(await prisma.shot.findUnique({ where: { id: shotId }, select: { id: true } }))) throw new ErroHttp(400, "Shot não encontrado.");
    return { shot: true };
  }
  return { solta: true };
}

/** Valida tudo contra o catálogo e devolve os dados prontos para o banco. */
async function dadosDoCorpo(corpo: unknown) {
  const { parametros, ...d } = validar(CorpoGeracao, corpo);
  const w = conferir(d.tipo, d.workflow, await donoDe(d.assetId, d.shotId));
  const valores = validarValores(w, parametros, true);
  return { ...d, parametros: valores as object, prompt: typeof valores.prompt === "string" ? valores.prompt : "" };
}

/** Os nomes legíveis do tipo e do workflow vão junto: o front não precisa do catálogo para a lista. */
function comNomes<T extends { tipo: string; workflow: string }>(g: T) {
  return { ...g, tipoNome: acharTipo(g.tipo)?.nome ?? g.tipo, workflowNome: acharWorkflow(g.workflow)?.nome ?? g.workflow };
}

export async function rotasGeracoes(app: FastifyInstance) {
  /** Os tipos (e workflows, com os campos) que valem para um dono. Sem asset/shot: geração solta. */
  app.get("/catalogo", async (req) => {
    const { asset, shot } = validar(z.object({ asset: Uuid.optional(), shot: Uuid.optional() }), req.query);
    return catalogoPara(await donoDe(asset ?? null, shot ?? null));
  });

  app.get("/", async (req) => {
    const f = validar(FiltroGeracoes, req.query);
    const lista = await prisma.geracao.findMany({
      where: {
        AND: [
          doProjeto(f.projeto) ?? {},
          doVinculo(f.vinculo) ?? {},
          { status: f.status, tipo: f.tipo, assetId: f.asset, shotId: f.shot },
          f.busca
            ? {
                OR: [
                  { nome: { contains: f.busca, mode: "insensitive" } },
                  { prompt: { contains: f.busca, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      include: daListagem,
      orderBy: { criadoEm: "desc" },
    });
    return lista.map(({ outputs, ...g }) => ({ ...comNomes(g), capa: outputs[0]?.arquivo ?? null }));
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const g = await prisma.geracao.findUnique({
      where: { id },
      include: {
        ...incluirDono,
        _count: { select: { outputs: true, entradas: true } },
        entradas: {
          orderBy: { ordem: "asc" },
          include: {
            referencia: true,
            output: { include: { geracao: { select: { id: true, nome: true, prompt: true } } } },
          },
        },
        rodadas: { orderBy: { criadoEm: "desc" } },
        outputs: { orderBy: { criadoEm: "desc" }, include: { rodada: { select: { parametros: true } } } },
      },
    });
    if (!g) throw naoEncontrado("Geração não encontrada.");
    // A seed de cada output vem da rodada que o gerou: é o que permite repetir aquela imagem.
    const chaveSeed = acharWorkflow(g.workflow)?.campos.find((c) => c.tipo === "seed")?.chave;
    const seedDe = (p: unknown) => (chaveSeed ? ((p as Record<string, unknown> | null)?.[chaveSeed] ?? null) : null);
    return {
      ...comNomes(g),
      rodadas: g.rodadas.map(({ grafoEnviado: _g, ...r }) => ({ ...r, seed: seedDe(r.parametros), progresso: progressoDe(r.promptIdComfy) })),
      entradas: g.entradas.map((e) => ({
        ...e,
        referencia: e.referencia && referenciaParaJson(e.referencia),
        output: e.output && outputParaJson(e.output),
      })),
      outputs: g.outputs.map(({ rodada, ...o }) => ({ ...outputParaJson(o), seed: seedDe(rodada?.parametros) })),
    };
  });

  app.post("/", async (req, reply) => {
    const g = await prisma.geracao.create({ data: await dadosDoCorpo(req.body) });
    return reply.code(201).send(g);
  });

  /**
   * Só rascunho se edita. Depois de enviada ao ComfyUI, a geração é o
   * registro do que rodou — mudar o prompt ali seria reescrever a história.
   */
  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = await dadosDoCorpo(req.body);
    const atual = await prisma.geracao.findUnique({ where: { id }, select: { status: true } });
    if (!atual) throw naoEncontrado("Geração não encontrada.");
    if (atual.status !== "RASCUNHO") throw new ErroHttp(409, "Só dá para editar uma geração em rascunho.");
    return prisma.geracao.update({ where: { id }, data: dados });
  });

  /**
   * Envia ao ComfyUI: `quantidade` rodadas (até MAX_POR_ENVIO). No rascunho é o
   * "Gerar"; depois, o "Gerar mais" — mesmas configurações, seed nova.
   */
  app.post("/:id/gerar", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { quantidade } = validar(
      z.object({ quantidade: z.number().int().min(1).max(MAX_POR_ENVIO, `no máximo ${MAX_POR_ENVIO} de uma vez`).default(1) }),
      req.body ?? {},
    );
    await enviar(id, quantidade);
    return { ok: true };
  });

  app.post("/:id/cancelar", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await cancelar(id);
    return { ok: true };
  });

  /**
   * Um rascunho novo com o mesmo tipo, workflow, dono e campos — para tentar
   * uma variação. A seed volta a ser aleatória; a da original continua
   * gravada nela, para quem quiser repetir exatamente.
   */
  app.post("/:id/duplicar", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const o = await prisma.geracao.findUnique({ where: { id } });
    if (!o) throw naoEncontrado("Geração não encontrada.");
    const w = acharWorkflow(o.workflow);
    const parametros = { ...(o.parametros as Record<string, unknown>) };
    for (const c of w?.campos ?? []) if (c.tipo === "seed") parametros[c.chave] = null;
    const nova = await prisma.geracao.create({
      data: {
        assetId: o.assetId,
        shotId: o.shotId,
        nome: o.nome,
        tipo: o.tipo,
        workflow: o.workflow,
        prompt: o.prompt,
        parametros: parametros as object,
      },
    });
    return reply.code(201).send(nova);
  });

  /**
   * Apaga a geração com tudo o que é dela: rodadas, entradas e outputs —
   * os registros e os arquivos. (A tela pede para digitar EXCLUIR quando há
   * outputs.)
   *
   * Duas recusas (409), por protegerem o que não é só desta geração:
   * - rodada na fila ou executando: cancelar antes, senão o ComfyUI gera para
   *   uma geração que já não existe;
   * - output usado como entrada de outra geração: a outra perderia o registro
   *   do que a alimentou.
   *
   * Os arquivos saem só depois do banco: se o banco recusar, eles ficam.
   */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const arquivos = await prisma.$transaction(async (tx) => {
      const g = await tx.geracao.findUnique({ where: { id }, select: { status: true } });
      if (!g) throw naoEncontrado("Geração não encontrada.");
      if (g.status === "NA_FILA" || g.status === "EXECUTANDO") {
        throw new ErroHttp(409, "Cancele a geração antes de excluir: ela está no ComfyUI.");
      }
      const usados = await tx.geracaoEntrada.findMany({
        where: { output: { geracaoId: id }, geracaoId: { not: id } },
        select: { geracao: { select: { nome: true, prompt: true } } },
      });
      if (usados.length) {
        const quais = usados.map((u) => `“${u.geracao.nome || u.geracao.prompt.slice(0, 40) || "sem nome"}”`).join(", ");
        throw new ErroHttp(409, `Não dá para excluir: outputs desta geração são entrada de outras gerações (${quais}).`);
      }
      const outputs = await tx.output.findMany({ where: { geracaoId: id }, select: { arquivo: true } });
      await tx.output.deleteMany({ where: { geracaoId: id } });
      // Rodadas e entradas caem em cascata com a geração.
      await tx.geracao.delete({ where: { id } });
      return outputs.map((o) => o.arquivo);
    });
    await Promise.all(arquivos.map((a) => apagar(a).catch((e) => req.log.warn({ err: e, arquivo: a }, "não consegui apagar o arquivo do output"))));
    return reply.code(204).send();
  });
}

/**
 * Outputs (`/api/outputs`), para escolher como entrada de outra geração.
 * Chegam pelo ComfyUI; aqui só se lista e se marca favorito.
 */
export async function rotasOutputs(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { projeto } = validar(z.object({ projeto: FiltroProjeto }), req.query);
    const outputs = await prisma.output.findMany({
      where: { geracao: doProjeto(projeto) },
      include: { geracao: { select: { id: true, nome: true, prompt: true, ...incluirDono } } },
      orderBy: { criadoEm: "desc" },
      take: 500,
    });
    return outputs.map(outputParaJson);
  });

  app.put("/:id/favorito", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { favorito } = validar(z.object({ favorito: z.boolean() }), req.body);
    return outputParaJson(await prisma.output.update({ where: { id }, data: { favorito } }));
  });
}
