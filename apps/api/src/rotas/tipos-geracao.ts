import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TipoAsset } from "../generated/prisma/enums.ts";
import { chaveLivre } from "../lib/chave.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp, naoEncontrado, Nome, TextoOpcional, Uuid, validar } from "../lib/validacao.ts";

/**
 * Tipos de geração (`/api/tipos-geracao`): para que serve uma geração e em
 * que Gerador ela aparece. A chave nasce do nome e não muda mais.
 */

const CorpoTipo = z.object({
  nome: Nome,
  descricao: TextoOpcional(1000),
  saida: z.enum(["IMAGEM", "VIDEO", "AUDIO"], "saída inválida"),
  tiposAsset: z
    .array(z.enum(TipoAsset, "tipo de asset inválido"))
    .default([])
    .transform((t) => [...new Set(t)]),
  shot: z.boolean().default(false),
});

export async function rotasTiposGeracao(app: FastifyInstance) {
  app.get("/", async () =>
    prisma.tipoGeracao.findMany({ include: { _count: { select: { workflows: true } } }, orderBy: { nome: "asc" } }),
  );

  app.post("/", async (req, reply) => {
    const dados = validar(CorpoTipo, req.body);
    const chave = await chaveLivre(dados.nome, async (c) => !!(await prisma.tipoGeracao.findUnique({ where: { chave: c } })));
    return reply.code(201).send(await prisma.tipoGeracao.create({ data: { ...dados, chave } }));
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    return prisma.tipoGeracao.update({ where: { id }, data: validar(CorpoTipo, req.body) });
  });

  /** Tipo com workflow não se apaga: os workflows ficariam sem tipo. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const t = await prisma.tipoGeracao.findUnique({ where: { id }, include: { _count: { select: { workflows: true } } } });
    if (!t) throw naoEncontrado("Tipo de geração não encontrado.");
    if (t._count.workflows) {
      throw new ErroHttp(409, `“${t.nome}” tem ${t._count.workflows} workflow(s). Exclua ou mude o tipo deles antes.`);
    }
    await prisma.tipoGeracao.delete({ where: { id } });
    return reply.code(204).send();
  });
}
