import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Output } from "../generated/prisma/client.ts";
import { lerCampos, nomesDoCatalogo } from "../geracao/catalogo.ts";
import { apagar } from "../lib/arquivos.ts";
import { doProjeto, doVinculo, incluirDono } from "../lib/filtros.ts";
import { prisma } from "../lib/prisma.ts";
import { Busca, FiltroProjeto, naoEncontrado, Uuid, validar } from "../lib/validacao.ts";

/**
 * Outputs (`/api/outputs`): o que o Gerador produziu. Cada um pertence a um
 * asset ou shot e carrega tudo o que foi usado para gerá-lo — é o registro,
 * não há outra tabela por trás.
 */

/** BigInt e Decimal do banco viram número: o JSON não sabe escrever os dois. */
export function outputParaJson<T extends Pick<Output, "tamanhoBytes" | "duracaoSeg" | "seed">>(o: T) {
  return {
    ...o,
    tamanhoBytes: o.tamanhoBytes === null ? null : Number(o.tamanhoBytes),
    duracaoSeg: o.duracaoSeg === null ? null : o.duracaoSeg.toNumber(),
    seed: o.seed === null ? null : Number(o.seed),
  };
}

type Nomes = Awaited<ReturnType<typeof nomesDoCatalogo>>;

/** Os nomes legíveis do tipo e do workflow vão junto: o front não precisa do catálogo para mostrar. */
function comNomes<T extends { tipoGeracao: string; workflow: string }>(o: T, nomes: Nomes) {
  return { ...o, tipoGeracaoNome: nomes.tipo(o.tipoGeracao), workflowNome: nomes.workflow(o.workflow) };
}

const FiltroOutputs = z.object({
  projeto: FiltroProjeto,
  vinculo: z.enum(["asset", "shot"], "vínculo inválido").optional().or(z.literal("").transform(() => undefined)),
  tipo: z.string().optional().transform((v) => v || undefined),
  asset: Uuid.optional(),
  shot: Uuid.optional(),
  favoritos: z.enum(["1"]).optional().or(z.literal("").transform(() => undefined)),
  busca: Busca,
});

/** O que a galeria precisa — sem o grafo, que é grande e só o detalhe mostra. */
const daGaleria = {
  id: true,
  assetId: true,
  shotId: true,
  tipo: true,
  arquivo: true,
  largura: true,
  altura: true,
  tamanhoBytes: true,
  duracaoSeg: true,
  favorito: true,
  tipoGeracao: true,
  workflow: true,
  modelo: true,
  prompt: true,
  seed: true,
  criadoEm: true,
  ...incluirDono,
} as const;

export async function rotasOutputs(app: FastifyInstance) {
  /** Os tipos de geração que aparecem nos outputs, para o filtro da galeria. */
  app.get("/tipos", async () => {
    const [tipos, nomes] = await Promise.all([
      prisma.output.findMany({ distinct: ["tipoGeracao"], select: { tipoGeracao: true } }),
      nomesDoCatalogo(),
    ]);
    return tipos.map((t) => ({ chave: t.tipoGeracao, nome: nomes.tipo(t.tipoGeracao) }));
  });

  app.get("/", async (req) => {
    const f = validar(FiltroOutputs, req.query);
    const nomes = await nomesDoCatalogo();
    const outputs = await prisma.output.findMany({
      where: {
        AND: [
          doProjeto(f.projeto) ?? {},
          doVinculo(f.vinculo) ?? {},
          { tipoGeracao: f.tipo, assetId: f.asset, shotId: f.shot, favorito: f.favoritos ? true : undefined },
          f.busca ? { prompt: { contains: f.busca, mode: "insensitive" } } : {},
        ],
      },
      select: daGaleria,
      orderBy: { criadoEm: "desc" },
      take: 1000,
    });
    return outputs.map((o) => comNomes(outputParaJson(o), nomes));
  });

  /** Tudo o que foi usado para gerar o output, inclusive o grafo enviado ao ComfyUI. */
  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const o = await prisma.output.findUnique({
      where: { id },
      include: { ...incluirDono, execucao: { select: { iniciadaEm: true, concluidaEm: true } } },
    });
    if (!o) throw naoEncontrado("Output não encontrado.");
    const { execucao, ...resto } = o;
    // Quanto tempo a imagem levou no ComfyUI, sem a espera na fila.
    const duracaoComfySeg =
      execucao?.iniciadaEm && execucao.concluidaEm ? Math.round((+execucao.concluidaEm - +execucao.iniciadaEm) / 1000) : null;
    // O rótulo de cada parâmetro ("Tamanho", "Seed"), enquanto o workflow existir no cadastro.
    const [w, nomes] = await Promise.all([
      prisma.workflow.findUnique({ where: { chave: o.workflow }, select: { campos: true } }),
      nomesDoCatalogo(),
    ]);
    const rotulos = Object.fromEntries((w ? lerCampos(w.campos, o.workflow) : []).map((c) => [c.chave, c.rotulo]));
    return { ...comNomes(outputParaJson(resto), nomes), duracaoComfySeg, rotulos };
  });

  app.put("/:id/favorito", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { favorito } = validar(z.object({ favorito: z.boolean() }), req.body);
    await prisma.output.update({ where: { id }, data: { favorito } });
    return { ok: true };
  });

  /** Apaga o output e o arquivo dele. O arquivo só sai depois do banco: se o banco recusa, ele fica. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const o = await prisma.output.delete({ where: { id }, select: { arquivo: true } });
    await apagar(o.arquivo).catch((e) => req.log.warn({ err: e, arquivo: o.arquivo }, "não consegui apagar o arquivo do output"));
    return reply.code(204).send();
  });
}
