import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { Busca, contem, ErroHttp, naoEncontrado, Nome, TextoOpcional, Uuid, validar } from "../lib/validacao.ts";

/**
 * Rotas de projetos, montadas em `/api/projetos`.
 *
 * A descrição é um documento à parte (markdown longo, com editor próprio na
 * tela): tem rota própria, e salvar o nome não mexe nela. Ela tem histórico:
 * cada gravação com texto diferente vira uma versão (`versao_descricao`),
 * e as antigas ficam para consultar e restaurar.
 */

const CorpoProjeto = z.object({ nome: Nome });

/** Markdown longo, no modelo de docs/descricao-de-projeto.md. */
const CorpoDescricao = z.object({
  descricao: TextoOpcional(500_000),
  /**
   * A versão em que o texto se baseou (`descricaoVersao` de quando foi
   * lido). Se outra entrou no meio, a gravação é recusada: ninguém apaga sem
   * querer o que o outro salvou. Sem ela, grava por cima da que estiver.
   */
  base: z.number().int().min(0).optional(),
  origem: z.enum(["TELA", "CLAUDE"]).default("TELA"),
  /** O que mudou, em uma linha. */
  nota: TextoOpcional(500),
});

const ParamsVersao = z.object({ id: Uuid, numero: z.coerce.number().int().min(1) });

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

  /** Salva a descrição como versão nova. Texto igual ao atual não cria versão. */
  app.put("/:id/descricao", { bodyLimit: 5 * 1024 * 1024 }, async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { descricao, base, origem, nota } = validar(CorpoDescricao, req.body);
    return prisma.$transaction(async (tx) => {
      const atual = await tx.projeto.findUnique({ where: { id }, select: { descricao: true, descricaoVersao: true } });
      if (!atual) throw naoEncontrado("Projeto não encontrado.");
      if (base !== undefined && base !== atual.descricaoVersao)
        throw new ErroHttp(
          409,
          `A descrição mudou depois que foi aberta: esta edição partiu da versão ${base}, e a atual é a ${atual.descricaoVersao}. Copie o que escreveu, feche e abra de novo.`,
        );
      if (descricao === atual.descricao) return tx.projeto.findUniqueOrThrow({ where: { id }, include: contagens });
      const numero = atual.descricaoVersao + 1;
      await tx.versaoDescricao.create({ data: { projetoId: id, numero, texto: descricao, origem, nota } });
      return tx.projeto.update({ where: { id }, data: { descricao, descricaoVersao: numero }, include: contagens });
    });
  });

  /** O histórico da descrição, da mais nova para a mais velha — sem os textos. */
  app.get("/:id/descricao/versoes", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    return prisma.versaoDescricao.findMany({
      where: { projetoId: id },
      select: { numero: true, origem: true, nota: true, criadoEm: true },
      orderBy: { numero: "desc" },
    });
  });

  app.get("/:id/descricao/versoes/:numero", async (req) => {
    const { id, numero } = validar(ParamsVersao, req.params);
    const v = await prisma.versaoDescricao.findUnique({ where: { projetoId_numero: { projetoId: id, numero } } });
    if (!v) throw naoEncontrado("Versão não encontrada.");
    return v;
  });

  /** Apagar o projeto solta os assets e as cenas dele — não os apaga. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.projeto.delete({ where: { id } });
    return reply.code(204).send();
  });
}
