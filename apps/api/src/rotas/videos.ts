import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp, naoEncontrado, Nome, TextoOpcional, Uuid, validar } from "../lib/validacao.ts";

/**
 * Listas de vídeos (`/api/listas`) e vídeos (`/api/videos`).
 *
 * Projeto → Lista ("Temporada 1", "Trailers") → Vídeo ("EP01") → Cena →
 * Shot. Lista e vídeo são agrupadores: apagar um deles nunca apaga cena —
 * as cenas voltam a ser "sem vídeo" do projeto (SetNull no banco).
 */

const CorpoLista = z.object({ nome: Nome, descricao: TextoOpcional(5000) });
/** A descrição do vídeo é markdown longo (sinopse, roteiro). */
const CorpoVideo = z.object({ nome: Nome, descricao: TextoOpcional(500_000) });

/** Uma reordenação: a lista nova de ids, todos os do pai, cada um uma vez. */
const Ordem = z.array(Uuid).min(1);
function mesmaLista(atuais: { id: string }[], nova: string[], todos: string) {
  const ok = atuais.length === nova.length && new Set(nova).size === nova.length && atuais.every((a) => nova.includes(a.id));
  if (!ok) throw new ErroHttp(400, `A ordem nova precisa ter ${todos}, cada um uma vez só.`);
}

/** Os vídeos de uma lista, em ordem, com quantas cenas cada um tem. */
const videosDaLista = {
  orderBy: { ordem: "asc" as const },
  include: { _count: { select: { cenas: true } } },
};

/** O vídeo aberto: a lista e o projeto (para o caminho) e as cenas em ordem, com os shots. */
const daPaginaDoVideo = {
  lista: { select: { id: true, nome: true, projeto: { select: { id: true, nome: true } } } },
  cenas: {
    orderBy: { ordem: "asc" as const },
    include: {
      projeto: { select: { id: true, nome: true } },
      shots: { orderBy: { ordem: "asc" as const }, include: { _count: { select: { referencias: true, outputs: true } } } },
    },
  },
} satisfies Prisma.VideoInclude;

export async function rotasListas(app: FastifyInstance) {
  /** As listas de um projeto, em ordem, cada uma com os vídeos. */
  app.get("/", async (req) => {
    const { projeto } = validar(z.object({ projeto: Uuid }), req.query);
    return prisma.listaVideos.findMany({
      where: { projetoId: projeto },
      include: { videos: videosDaLista },
      orderBy: { ordem: "asc" },
    });
  });

  /** Lista nova no fim do projeto. */
  app.post("/", async (req, reply) => {
    const { projetoId, ...dados } = validar(CorpoLista.extend({ projetoId: Uuid }), req.body);
    const lista = await prisma.$transaction(async (tx) => {
      if (!(await tx.projeto.findUnique({ where: { id: projetoId }, select: { id: true } }))) throw new ErroHttp(400, "Projeto não encontrado.");
      const ultima = await tx.listaVideos.aggregate({ where: { projetoId }, _max: { ordem: true } });
      return tx.listaVideos.create({
        data: { ...dados, projetoId, ordem: (ultima._max.ordem ?? -1) + 1 },
        include: { videos: videosDaLista },
      });
    });
    return reply.code(201).send(lista);
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    return prisma.listaVideos.update({ where: { id }, data: validar(CorpoLista, req.body), include: { videos: videosDaLista } });
  });

  /** Leva os vídeos (agrupadores); as cenas deles ficam, sem vídeo. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.listaVideos.delete({ where: { id } });
    return reply.code(204).send();
  });

  /** Reordena as listas de um projeto: recebe todos os ids, na ordem nova. */
  app.put("/ordem", async (req) => {
    const { projetoId, listas } = validar(z.object({ projetoId: Uuid, listas: Ordem }), req.body);
    return prisma.$transaction(async (tx) => {
      mesmaLista(await tx.listaVideos.findMany({ where: { projetoId }, select: { id: true } }), listas, "todas as listas do projeto");
      for (const [ordem, id] of listas.entries()) await tx.listaVideos.update({ where: { id }, data: { ordem } });
      return tx.listaVideos.findMany({ where: { projetoId }, include: { videos: videosDaLista }, orderBy: { ordem: "asc" } });
    });
  });

  /** Vídeo novo no fim da lista. */
  app.post("/:id/videos", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoVideo, req.body);
    const video = await prisma.$transaction(async (tx) => {
      if (!(await tx.listaVideos.findUnique({ where: { id }, select: { id: true } }))) throw naoEncontrado("Lista não encontrada.");
      const ultimo = await tx.video.aggregate({ where: { listaId: id }, _max: { ordem: true } });
      return tx.video.create({ data: { ...dados, listaId: id, ordem: (ultimo._max.ordem ?? -1) + 1 }, include: { _count: { select: { cenas: true } } } });
    });
    return reply.code(201).send(video);
  });

  /** Reordena os vídeos de uma lista: recebe todos os ids, na ordem nova. */
  app.put("/:id/videos/ordem", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { videos } = validar(z.object({ videos: Ordem }), req.body);
    return prisma.$transaction(async (tx) => {
      mesmaLista(await tx.video.findMany({ where: { listaId: id }, select: { id: true } }), videos, "todos os vídeos da lista");
      for (const [ordem, v] of videos.entries()) await tx.video.update({ where: { id: v }, data: { ordem } });
      return tx.video.findMany({ where: { listaId: id }, ...videosDaLista });
    });
  });
}

export async function rotasVideos(app: FastifyInstance) {
  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const v = await prisma.video.findUnique({ where: { id }, include: daPaginaDoVideo });
    if (!v) throw naoEncontrado("Vídeo não encontrado.");
    return v;
  });

  app.put("/:id", { bodyLimit: 5 * 1024 * 1024 }, async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    return prisma.video.update({ where: { id }, data: validar(CorpoVideo, req.body), include: daPaginaDoVideo });
  });

  /** As cenas ficam: voltam a ser "sem vídeo" do projeto. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.video.delete({ where: { id } });
    return reply.code(204).send();
  });

  /** Reordena as cenas do vídeo: recebe todos os ids, na ordem nova. */
  app.put("/:id/cenas/ordem", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { cenas } = validar(z.object({ cenas: Ordem }), req.body);
    return prisma.$transaction(async (tx) => {
      mesmaLista(await tx.cena.findMany({ where: { videoId: id }, select: { id: true } }), cenas, "todas as cenas do vídeo");
      for (const [ordem, c] of cenas.entries()) await tx.cena.update({ where: { id: c }, data: { ordem } });
      return (await tx.video.findUniqueOrThrow({ where: { id }, include: daPaginaDoVideo })).cenas;
    });
  });
}
