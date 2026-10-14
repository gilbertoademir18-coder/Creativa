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
    // `favoritos=1`: só os marcados — é o que o menu lateral lista.
    const { busca, favoritos } = validar(
      z.object({ busca: Busca, favoritos: z.enum(["1"]).optional().or(z.literal("").transform(() => undefined)) }),
      req.query,
    );
    return prisma.projeto.findMany({
      where: { nome: contem(busca), ...(favoritos && { favorito: true }) },
      include: contagens,
      // A posição manda; empate (ninguém arrastou ainda) desempata pela edição.
      orderBy: [{ ordem: "asc" }, { editadoEm: "desc" }],
    });
  });

  /**
   * Reordena a página de projetos: recebe todos os ids, na ordem nova. Vem
   * antes do "/:id" para "ordem" não cair na rota de um projeto chamado assim.
   */
  app.put("/ordem", async (req) => {
    const { projetos } = validar(z.object({ projetos: z.array(Uuid).min(1) }), req.body);
    return prisma.$transaction(async (tx) => {
      const atuais = await tx.projeto.findMany({ select: { id: true } });
      const mesmos =
        atuais.length === projetos.length && new Set(projetos).size === projetos.length && atuais.every((p) => projetos.includes(p.id));
      if (!mesmos) throw new ErroHttp(400, "A ordem nova precisa ter todos os projetos, cada um uma vez só.");
      for (const [ordem, id] of projetos.entries()) await tx.projeto.update({ where: { id }, data: { ordem } });
      return tx.projeto.findMany({ include: contagens, orderBy: [{ ordem: "asc" }, { editadoEm: "desc" }] });
    });
  });

  /**
   * A estrela do cartão: só destaca, não mexe na ordem.
   *
   * SQL cru de propósito: o `update` do Prisma toca o `editadoEm` (@updatedAt),
   * e como a listagem desempata por ele, favoritar fazia o projeto pular para
   * o começo — justo o que esta marca não deve fazer.
   */
  app.put("/:id/favorito", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { favorito } = validar(z.object({ favorito: z.boolean() }), req.body);
    const linhas = await prisma.$executeRaw`UPDATE projeto SET favorito = ${favorito} WHERE id = ${id}::uuid`;
    if (linhas === 0) throw naoEncontrado("Projeto não encontrado.");
    return prisma.projeto.findUniqueOrThrow({ where: { id }, include: contagens });
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
