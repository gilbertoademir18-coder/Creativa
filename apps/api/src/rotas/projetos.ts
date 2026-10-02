import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { Busca, contem, naoEncontrado, Nome, TextoOpcional, Uuid, validar } from "../lib/validacao.ts";

/** Rotas de projetos, montadas em `/api/projetos`. */

const CorpoProjeto = z.object({
  nome: Nome,
  descricao: TextoOpcional(),
});

const contagens = { _count: { select: { assets: true, cenas: true } } } as const;

export async function rotasProjetos(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { busca } = validar(z.object({ busca: Busca }), req.query);
    return prisma.projeto.findMany({
      where: { nome: contem(busca) },
      include: contagens,
      orderBy: { editadoEm: "desc" },
    });
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const projeto = await prisma.projeto.findUnique({ where: { id }, include: contagens });
    if (!projeto) throw naoEncontrado("Projeto não encontrado.");
    return projeto;
  });

  app.post("/", async (req, reply) => {
    const dados = validar(CorpoProjeto, req.body);
    return reply.code(201).send(await prisma.projeto.create({ data: dados, include: contagens }));
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoProjeto, req.body);
    return prisma.projeto.update({ where: { id }, data: dados, include: contagens });
  });

  /** Apagar o projeto solta os assets e as cenas dele — não os apaga. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.projeto.delete({ where: { id } });
    return reply.code(204).send();
  });
}
