import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { referenciaParaJson } from "./referencias.ts";
import {
  Busca,
  contem,
  ErroHttp,
  FiltroProjeto,
  naoEncontrado,
  Nome,
  TextoOpcional,
  Uuid,
  UuidOpcional,
  validar,
} from "../lib/validacao.ts";

/**
 * Rotas de cenas (`/api/cenas`) e de shots (`/api/shots`).
 *
 * Toda cena tem pelo menos um shot: nasce com o "Shot 1", e o último shot
 * de uma cena não pode ser apagado.
 */

const CorpoCena = z.object({
  projetoId: UuidOpcional,
  nome: Nome,
  descricao: TextoOpcional(),
  storyboard: z.string().max(100_000, "storyboard longo demais").default(""),
});

const CorpoShot = z.object({
  nome: Nome,
  descricao: TextoOpcional(),
});

const shotsResumidos = {
  orderBy: { ordem: "asc" as const },
  include: { _count: { select: { referencias: true, outputs: true } } },
};

const daCena = {
  projeto: { select: { id: true, nome: true } },
  shots: shotsResumidos,
};

export async function rotasCenas(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { projeto, busca } = validar(z.object({ projeto: FiltroProjeto, busca: Busca }), req.query);
    return prisma.cena.findMany({
      where: { projetoId: projeto === "sem" ? null : projeto, nome: contem(busca) },
      include: daCena,
      orderBy: { editadoEm: "desc" },
    });
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const cena = await prisma.cena.findUnique({ where: { id }, include: daCena });
    if (!cena) throw naoEncontrado("Cena não encontrada.");
    return cena;
  });

  /** A cena e o primeiro shot nascem juntos, na mesma transação. */
  app.post("/", async (req, reply) => {
    const dados = validar(CorpoCena, req.body);
    const cena = await prisma.cena.create({
      data: { ...dados, shots: { create: { nome: "Shot 1", ordem: 0 } } },
      include: daCena,
    });
    return reply.code(201).send(cena);
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoCena, req.body);
    return prisma.cena.update({ where: { id }, data: dados, include: daCena });
  });

  /**
   * Leva os shots junto — mas o banco recusa (409) se algum deles tiver
   * referência ou geração.
   */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.cena.delete({ where: { id } });
    return reply.code(204).send();
  });

  /** Novo shot no fim da cena, já com nome: "Shot N". */
  app.post("/:id/shots", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const corpo = validar(CorpoShot.partial(), req.body ?? {});
    const shot = await prisma.$transaction(async (tx) => {
      const cena = await tx.cena.findUnique({ where: { id }, include: { shots: { select: { ordem: true } } } });
      if (!cena) throw naoEncontrado("Cena não encontrada.");
      const proxima = Math.max(-1, ...cena.shots.map((s) => s.ordem)) + 1;
      return tx.shot.create({
        data: {
          cenaId: id,
          nome: corpo.nome ?? `Shot ${cena.shots.length + 1}`,
          descricao: corpo.descricao ?? null,
          ordem: proxima,
        },
      });
    });
    return reply.code(201).send(shot);
  });

  /** Reordena: recebe os ids dos shots da cena na ordem nova, todos eles. */
  app.put("/:id/ordem", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { shots } = validar(z.object({ shots: z.array(Uuid).min(1) }), req.body);
    return prisma.$transaction(async (tx) => {
      const atuais = await tx.shot.findMany({ where: { cenaId: id }, select: { id: true } });
      const mesmos =
        atuais.length === shots.length && new Set(shots).size === shots.length && atuais.every((s) => shots.includes(s.id));
      if (!mesmos) throw new ErroHttp(400, "A lista precisa ter todos os shots da cena, cada um uma vez.");
      for (const [ordem, shotId] of shots.entries()) {
        await tx.shot.update({ where: { id: shotId }, data: { ordem } });
      }
      return tx.shot.findMany({ where: { cenaId: id }, ...shotsResumidos });
    });
  });
}

export async function rotasShots(app: FastifyInstance) {
  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const shot = await prisma.shot.findUnique({
      where: { id },
      include: {
        cena: {
          select: {
            id: true,
            nome: true,
            projeto: { select: { id: true, nome: true } },
            shots: { select: { id: true, nome: true, ordem: true }, orderBy: { ordem: "asc" } },
          },
        },
        referencias: { orderBy: { criadoEm: "asc" } },
      },
    });
    if (!shot) throw naoEncontrado("Shot não encontrado.");
    return { ...shot, referencias: shot.referencias.map(referenciaParaJson) };
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoShot, req.body);
    return prisma.shot.update({ where: { id }, data: dados });
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.$transaction(async (tx) => {
      const shot = await tx.shot.findUnique({ where: { id }, select: { cenaId: true } });
      if (!shot) throw naoEncontrado("Shot não encontrado.");
      const irmaos = await tx.shot.count({ where: { cenaId: shot.cenaId } });
      if (irmaos <= 1) throw new ErroHttp(409, "Toda cena precisa de pelo menos um shot.");
      await tx.shot.delete({ where: { id } });
    });
    return reply.code(204).send();
  });
}
