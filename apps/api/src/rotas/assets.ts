import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TipoAsset } from "../generated/prisma/enums.ts";
import { prisma } from "../lib/prisma.ts";
import { referenciaParaJson } from "./referencias.ts";
import {
  Busca,
  contem,
  FiltroProjeto,
  naoEncontrado,
  Nome,
  TextoOpcional,
  Uuid,
  UuidOpcional,
  validar,
} from "../lib/validacao.ts";

/** Rotas de assets (personagens, cenários, objetos...), montadas em `/api/assets`. */

const CorpoAsset = z.object({
  projetoId: UuidOpcional,
  tipo: z.enum(TipoAsset, "tipo inválido"),
  nome: Nome,
  descricao: TextoOpcional(),
});

const FiltroAssets = z.object({
  projeto: FiltroProjeto,
  tipo: z.enum(TipoAsset, "tipo inválido").optional().or(z.literal("").transform(() => undefined)),
  busca: Busca,
});

/**
 * O que a listagem traz: o projeto, as contagens e a primeira imagem de
 * referência — a capa de quem ainda não tem output (ver `capasDeOutputs`).
 */
const daListagem = {
  projeto: { select: { id: true, nome: true } },
  _count: { select: { referencias: true, outputs: true } },
  referencias: {
    where: { tipo: "IMAGEM" as const },
    select: { arquivo: true },
    orderBy: { criadoEm: "asc" as const },
    take: 1,
  },
};

type DaListagem = { id: string; referencias: { arquivo: string | null }[] };

/**
 * A imagem que representa cada asset, entre os outputs dele:
 * o favorito, senão o mais recente. Uma consulta só para a lista inteira
 * (DISTINCT ON pega o primeiro de cada asset na ordem do ORDER BY).
 */
async function capasDeOutputs(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const linhas = await prisma.$queryRaw<{ asset_id: string; arquivo: string }[]>`
    SELECT DISTINCT ON (o.asset_id) o.asset_id, o.arquivo
    FROM output o
    WHERE o.tipo = 'IMAGEM' AND o.asset_id = ANY(${ids}::uuid[])
    ORDER BY o.asset_id, o.favorito DESC, o.criado_em DESC`;
  return new Map(linhas.map((l) => [l.asset_id, l.arquivo]));
}

/**
 * A capa do asset: um output gerado para ele (é a cara dele de verdade) e,
 * enquanto não houver nenhum, a primeira imagem de referência.
 */
async function comCapas<T extends DaListagem>(assets: T[]) {
  const deOutputs = await capasDeOutputs(assets.map((a) => a.id));
  return assets.map(({ referencias, ...resto }) => ({
    ...resto,
    capa: deOutputs.get(resto.id) ?? referencias[0]?.arquivo ?? null,
  }));
}

const comCapa = async <T extends DaListagem>(asset: T) => (await comCapas([asset]))[0]!;

export async function rotasAssets(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { projeto, tipo, busca } = validar(FiltroAssets, req.query);
    const assets = await prisma.asset.findMany({
      where: {
        projetoId: projeto === "sem" ? null : projeto,
        tipo,
        nome: contem(busca),
      },
      include: daListagem,
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    });
    return comCapas(assets);
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        ...daListagem,
        referencias: { orderBy: { criadoEm: "asc" } },
      },
    });
    if (!asset) throw naoEncontrado("Asset não encontrado.");
    const capa = (await capasDeOutputs([id])).get(id) ?? asset.referencias.find((r) => r.tipo === "IMAGEM")?.arquivo ?? null;
    return { ...asset, capa, referencias: asset.referencias.map(referenciaParaJson) };
  });

  app.post("/", async (req, reply) => {
    const dados = validar(CorpoAsset, req.body);
    const asset = await prisma.asset.create({ data: dados, include: daListagem });
    return reply.code(201).send(await comCapa(asset));
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoAsset, req.body);
    return comCapa(await prisma.asset.update({ where: { id }, data: dados, include: daListagem }));
  });

  /** Recusado (409) enquanto houver referências ou outputs: eles têm arquivo. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.asset.delete({ where: { id } });
    return reply.code(204).send();
  });
}
