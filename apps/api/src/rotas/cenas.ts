import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.ts";
import { Marcacao } from "../geracao/blockout.ts";
import { prisma } from "../lib/prisma.ts";
import { referenciaParaJson } from "./referencias.ts";
import {
  Busca,
  contem,
  ErroHttp,
  FiltroProjeto,
  naoEncontrado,
  Nome,
  NomeOpcional,
  TextoOpcional,
  Uuid,
  UuidOpcional,
  validar,
} from "../lib/validacao.ts";

/**
 * Rotas de cenas (`/api/cenas`) e de shots (`/api/shots`).
 *
 * Toda cena tem pelo menos um shot: nasce com um, e o último shot de uma
 * cena não pode ser apagado. Cena e shot nascem SEM nome — o número (a
 * posição) identifica; nome é para quando merecem um, e vem do usuário.
 *
 * A cena pode estar num vídeo (de uma lista de vídeos do projeto). Aí o
 * projeto dela é o da lista — quem manda é o vídeo — e ela entra no fim.
 */

const CorpoCena = z.object({
  projetoId: UuidOpcional,
  videoId: UuidOpcional,
  nome: NomeOpcional,
  descricao: TextoOpcional(),
  storyboard: z.string().max(100_000, "storyboard longo demais").default(""),
});

const CorpoShot = z.object({
  nome: NomeOpcional,
  descricao: TextoOpcional(),
  /**
   * O pipeline deste shot (a chave). Nulo: herda o padrão do projeto. A API
   * não confere se existe — pipeline apagado cai na geração única, como a
   * chave de um ícone que sumiu.
   */
  pipeline: z.string().trim().max(60).nullish().transform((p) => p || null),
});

/** Os shots de uma cena, em ordem, com as contagens. */
export const shotsResumidos = {
  orderBy: { ordem: "asc" as const },
  include: { _count: { select: { referencias: true, outputs: true } } },
};

/** A cena como a tela a recebe: projeto, vídeo e shots. */
export const daCena = {
  projeto: { select: { id: true, nome: true, pipelinePadrao: true } },
  video: { select: { id: true, nome: true, lista: { select: { id: true, nome: true } } } },
  shots: shotsResumidos,
};

/**
 * Todo vídeo precisa de pelo menos uma cena — o mesmo que "toda cena precisa
 * de pelo menos um shot". Vale para apagar a cena **e** para tirá-la do vídeo:
 * sem as duas pontas a regra não se sustenta, porque bastaria mover a última
 * cena para outro vídeo para esvaziar este.
 *
 * Cena fora de vídeo (solta ou só do projeto) não tem essa amarra.
 */
async function exigirOutraCenaNoVideo(tx: Prisma.TransactionClient, videoId: string | null, cenaId: string) {
  if (!videoId) return;
  const irmas = await tx.cena.count({ where: { videoId, id: { not: cenaId } } });
  if (irmas === 0) {
    throw new ErroHttp(409, "Todo vídeo precisa de pelo menos uma cena. Crie outra cena no vídeo antes de tirar esta.");
  }
}

/**
 * Projeto e ordem da cena a partir do vídeo: com vídeo, o projeto é o da
 * lista dele, e a cena vai para o fim do vídeo (só quando muda de vídeo —
 * editar o nome não mexe na posição).
 */
async function encaixarNoVideo(
  tx: Prisma.TransactionClient,
  dados: z.infer<typeof CorpoCena>,
  atual?: { videoId: string | null; ordem: number },
) {
  if (!dados.videoId) return { ...dados, ordem: 0 };
  const v = await tx.video.findUnique({ where: { id: dados.videoId }, select: { lista: { select: { projetoId: true } } } });
  if (!v) throw new ErroHttp(400, "Vídeo não encontrado.");
  if (atual?.videoId === dados.videoId) return { ...dados, projetoId: v.lista.projetoId, ordem: atual.ordem };
  const ultima = await tx.cena.aggregate({ where: { videoId: dados.videoId }, _max: { ordem: true } });
  return { ...dados, projetoId: v.lista.projetoId, ordem: (ultima._max.ordem ?? -1) + 1 };
}

export async function rotasCenas(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { projeto, video, busca } = validar(
      z.object({ projeto: FiltroProjeto, video: z.union([Uuid, z.literal("sem")]).optional(), busca: Busca }),
      req.query,
    );
    return prisma.cena.findMany({
      where: {
        projetoId: projeto === "sem" ? null : projeto,
        // "sem": só as cenas fora de vídeo (a seção "Cenas sem vídeo" do projeto).
        videoId: video === "sem" ? null : video,
        nome: contem(busca),
      },
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
    const corpo = validar(CorpoCena, req.body);
    const cena = await prisma.$transaction(async (tx) =>
      tx.cena.create({
        data: { ...(await encaixarNoVideo(tx, corpo)), shots: { create: { ordem: 0 } } },
        include: daCena,
      }),
    );
    return reply.code(201).send(cena);
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const corpo = validar(CorpoCena, req.body);
    return prisma.$transaction(async (tx) => {
      const atual = await tx.cena.findUnique({ where: { id }, select: { videoId: true, ordem: true } });
      if (!atual) throw naoEncontrado("Cena não encontrada.");
      // Saindo do vídeo (para outro ou para nenhum): o de origem não pode ficar vazio.
      if (atual.videoId && corpo.videoId !== atual.videoId) await exigirOutraCenaNoVideo(tx, atual.videoId, id);
      return tx.cena.update({ where: { id }, data: await encaixarNoVideo(tx, corpo, atual), include: daCena });
    });
  });

  /**
   * A marcação do blockout: o cenário e quem fica onde. Null apaga. Os assets
   * têm de ser do projeto da cena — cenário e personagens, cada um no tipo certo.
   */
  app.put("/:id/marcacao", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { marcacao } = validar(z.object({ marcacao: Marcacao.nullable() }), req.body);
    const cena = await prisma.cena.findUnique({ where: { id }, select: { projetoId: true } });
    if (!cena) throw naoEncontrado("Cena não encontrada.");
    if (marcacao) {
      const ids = [marcacao.cenario, ...marcacao.personagens.map((p) => p.asset)];
      const assets = await prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true, tipo: true, nome: true, projetoId: true } });
      const de = new Map(assets.map((a) => [a.id, a]));
      const cenario = de.get(marcacao.cenario);
      if (cenario?.tipo !== "CENARIO") throw new ErroHttp(400, "cenario: escolha um asset de cenário.");
      for (const p of marcacao.personagens) if (de.get(p.asset)?.tipo !== "PERSONAGEM") throw new ErroHttp(400, "personagens: só assets de personagem.");
      const fora = assets.find((a) => a.projetoId !== cena.projetoId);
      if (fora) throw new ErroHttp(400, `"${fora.nome}" não é do projeto desta cena.`);
    }
    await prisma.cena.update({ where: { id }, data: { marcacao: marcacao ?? Prisma.DbNull } });
    return { marcacao };
  });

  /**
   * Leva os shots junto — mas o banco recusa (409) se algum deles tiver
   * referência ou geração.
   */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.$transaction(async (tx) => {
      const cena = await tx.cena.findUnique({ where: { id }, select: { videoId: true } });
      if (!cena) throw naoEncontrado("Cena não encontrada.");
      await exigirOutraCenaNoVideo(tx, cena.videoId, id);
      await tx.cena.delete({ where: { id } });
    });
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
          nome: corpo.nome ?? null,
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
            video: { select: { id: true, nome: true, lista: { select: { id: true, nome: true } } } },
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
