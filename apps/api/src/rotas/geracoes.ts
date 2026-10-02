import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Output } from "../generated/prisma/client.ts";
import { StatusGeracao } from "../generated/prisma/enums.ts";
import { doProjeto, doVinculo, incluirDono } from "../lib/filtros.ts";
import { prisma } from "../lib/prisma.ts";
import { referenciaParaJson } from "./referencias.ts";
import {
  Busca,
  ErroHttp,
  FiltroProjeto,
  naoEncontrado,
  TextoOpcional,
  Uuid,
  UuidOpcional,
  validar,
} from "../lib/validacao.ts";

/**
 * Rotas de gerações, montadas em `/api/geracoes`, e de workflows (só a
 * lista, para o formulário), em `/api/workflows`.
 *
 * Uma geração guarda tudo o que foi usado no ComfyUI: prompt, entradas
 * (referências e outputs de outras gerações), workflow e modelo. Por ora
 * ela é só cadastrada (RASCUNHO); o envio ao ComfyUI vem depois.
 */

/** BigInt e Decimal do banco viram número: o JSON não sabe escrever os dois. */
export function outputParaJson<T extends Pick<Output, "tamanhoBytes" | "duracaoSeg">>(o: T) {
  return {
    ...o,
    tamanhoBytes: o.tamanhoBytes === null ? null : Number(o.tamanhoBytes),
    duracaoSeg: o.duracaoSeg === null ? null : o.duracaoSeg.toNumber(),
  };
}

const Entrada = z.union([
  z.object({ referenciaId: Uuid }),
  z.object({ outputId: Uuid }),
]);

const CorpoGeracao = z
  .object({
    assetId: UuidOpcional,
    shotId: UuidOpcional,
    nome: TextoOpcional(120),
    prompt: z.string().trim().max(20_000, "prompt longo demais").default(""),
    promptNegativo: TextoOpcional(20_000),
    modelo: TextoOpcional(300),
    workflowId: UuidOpcional,
    entradas: z.array(Entrada).max(50, "no máximo 50 entradas").default([]),
  })
  .refine((d) => !(d.assetId && d.shotId), "a geração pertence a um asset ou a um shot, não aos dois");

const FiltroGeracoes = z.object({
  projeto: FiltroProjeto,
  status: z.enum(StatusGeracao, "status inválido").optional().or(z.literal("").transform(() => undefined)),
  vinculo: z.enum(["asset", "shot", "solta"], "vínculo inválido").optional().or(z.literal("").transform(() => undefined)),
  asset: Uuid.optional(),
  shot: Uuid.optional(),
  busca: Busca,
});

const daListagem = {
  ...incluirDono,
  workflow: { select: { id: true, nome: true } },
  _count: { select: { outputs: true, entradas: true } },
};

/** Entrada repetida não entra duas vezes; a ordem é a da lista. */
function entradasParaCriar(entradas: z.output<typeof Entrada>[]) {
  const vistas = new Set<string>();
  const unicas = entradas.filter((e) => {
    const chave = "referenciaId" in e ? `r:${e.referenciaId}` : `o:${e.outputId}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  return unicas.map((e, ordem) => ({ ...e, ordem }));
}

export async function rotasGeracoes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const f = validar(FiltroGeracoes, req.query);
    return prisma.geracao.findMany({
      where: {
        AND: [
          doProjeto(f.projeto) ?? {},
          doVinculo(f.vinculo) ?? {},
          { status: f.status, assetId: f.asset, shotId: f.shot },
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
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const g = await prisma.geracao.findUnique({
      where: { id },
      include: {
        ...daListagem,
        entradas: {
          orderBy: { ordem: "asc" },
          include: {
            referencia: true,
            output: { include: { geracao: { select: { id: true, nome: true, prompt: true } } } },
          },
        },
        outputs: { orderBy: { criadoEm: "asc" } },
      },
    });
    if (!g) throw naoEncontrado("Geração não encontrada.");
    return {
      ...g,
      entradas: g.entradas.map((e) => ({
        ...e,
        referencia: e.referencia && referenciaParaJson(e.referencia),
        output: e.output && outputParaJson(e.output),
      })),
      outputs: g.outputs.map(outputParaJson),
    };
  });

  app.post("/", async (req, reply) => {
    const { entradas, ...dados } = validar(CorpoGeracao, req.body);
    const g = await prisma.geracao.create({
      data: { ...dados, entradas: { create: entradasParaCriar(entradas) } },
      include: daListagem,
    });
    return reply.code(201).send(g);
  });

  /**
   * Só rascunho se edita. Depois de enviada ao ComfyUI, a geração é o
   * registro do que rodou — mudar o prompt ali seria reescrever a história.
   * As entradas são substituídas pela lista nova, inteira.
   */
  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { entradas, ...dados } = validar(CorpoGeracao, req.body);
    return prisma.$transaction(async (tx) => {
      const atual = await tx.geracao.findUnique({ where: { id }, select: { status: true } });
      if (!atual) throw naoEncontrado("Geração não encontrada.");
      if (atual.status !== "RASCUNHO") throw new ErroHttp(409, "Só dá para editar uma geração em rascunho.");
      await tx.geracaoEntrada.deleteMany({ where: { geracaoId: id } });
      return tx.geracao.update({
        where: { id },
        data: { ...dados, entradas: { create: entradasParaCriar(entradas) } },
        include: daListagem,
      });
    });
  });

  /** Recusado (409) se houver outputs: eles têm arquivo e podem ser entrada de outras. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.geracao.delete({ where: { id } });
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

export async function rotasWorkflows(app: FastifyInstance) {
  app.get("/", async () =>
    prisma.workflow.findMany({
      where: { arquivado: false },
      select: { id: true, nome: true, categoria: true },
      orderBy: { nome: "asc" },
    }),
  );
}
