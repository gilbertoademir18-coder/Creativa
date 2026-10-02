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
 * referência — é ela que vira a capa do cartão.
 */
const daListagem = {
  projeto: { select: { id: true, nome: true } },
  _count: { select: { referencias: true, geracoes: true } },
  referencias: {
    where: { tipo: "IMAGEM" as const },
    select: { arquivo: true },
    orderBy: { criadoEm: "asc" as const },
    take: 1,
  },
};

type DaListagem = { referencias: { arquivo: string | null }[] };

const comCapa = <T extends DaListagem>({ referencias, ...resto }: T) => ({
  ...resto,
  capa: referencias[0]?.arquivo ?? null,
});

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
    return assets.map(comCapa);
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        ...daListagem,
        referencias: { orderBy: { criadoEm: "asc" } },
        geracoes: {
          orderBy: { criadoEm: "desc" },
          include: { _count: { select: { outputs: true } } },
        },
      },
    });
    if (!asset) throw naoEncontrado("Asset não encontrado.");
    const capa = asset.referencias.find((r) => r.tipo === "IMAGEM")?.arquivo ?? null;
    return { ...asset, capa, referencias: asset.referencias.map(referenciaParaJson) };
  });

  app.post("/", async (req, reply) => {
    const dados = validar(CorpoAsset, req.body);
    const asset = await prisma.asset.create({ data: dados, include: daListagem });
    return reply.code(201).send(comCapa(asset));
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoAsset, req.body);
    return comCapa(await prisma.asset.update({ where: { id }, data: dados, include: daListagem }));
  });

  /** Recusado (409) enquanto houver referências ou gerações: elas têm arquivo e histórico. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.asset.delete({ where: { id } });
    return reply.code(204).send();
  });
}
