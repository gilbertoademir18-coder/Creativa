import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { configOllama, conversar, LIMITE_CONTEXTO, type MensagemLlm } from "../lib/ollama.ts";
import { prisma } from "../lib/prisma.ts";
import { Busca, ErroHttp, FiltroProjeto, naoEncontrado, Uuid, UuidOpcional, validar } from "../lib/validacao.ts";
import { abrirEspacoParaLlm, exigirOllama } from "./assistentes.ts";

/**
 * Conversas livres com a LLM local (`/api/conversas`) — a página Conversas,
 * um chat no estilo do ChatGPT. Cada conversa guarda as mensagens; a cada
 * pergunta, a LLM recebe a conversa inteira (ou o fim dela, se não couber).
 *
 * Conversa de um projeto (aberta pela barra do projeto) leva a descrição
 * inteira dele no sistema: dá para conversar sobre aquele projeto.
 *
 * A GPU se reveza com o ComfyUI do mesmo jeito que no assistente de prompt
 * (`abrirEspacoParaLlm`).
 */

const TITULO_PADRAO = "Nova conversa";

const Titulo = z.string().trim().min(1, "não pode ficar vazio").max(120, "no máximo 120 caracteres");

const PedidoMensagem = z.object({
  /** Sem conversa: começa uma nova. */
  conversaId: z.union([Uuid, z.null()]).default(null),
  /** De que projeto é a conversa nova (só vale ao criar). */
  projetoId: UuidOpcional,
  texto: z.string().trim().min(1, "escreva a mensagem").max(20_000, "mensagem longa demais"),
});

/** A descrição do projeto vai inteira, até este tamanho: a conversa é sobre ele. */
const LIMITE_DESCRICAO = 15_000;

type ProjetoDaConversa = { nome: string; descricao: string | null } | null;

function sistema(projeto: ProjetoDaConversa): string {
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const linhas = [
    "Você é um assistente prestativo, conversando com uma pessoa que cria vídeos, imagens e sons com IA.",
    "Responda em português do Brasil, a não ser que ela peça outro idioma.",
    "Seja direto e natural. Use markdown (listas, negrito, blocos de código, tabelas) quando ajudar a ler.",
    "Se não souber algo, diga que não sabe — não invente.",
    `Hoje é ${hoje}.`,
  ];
  if (projeto) {
    linhas.push(
      "",
      `# O projeto: ${projeto.nome}`,
      "Esta conversa é sobre este projeto. Use a descrição abaixo (a \"bíblia\" do projeto) como a verdade sobre ele: personagens, mundo, tom, estilo. Quando a pessoa propuser algo que contradiz a descrição, aponte. Ideias novas são bem-vindas, mas diga que ainda não estão na descrição.",
      "",
      projeto.descricao?.trim() ? projeto.descricao.trim().slice(0, LIMITE_DESCRICAO) : "(O projeto ainda não tem descrição.)",
    );
  }
  return linhas.join("\n");
}

/**
 * A conversa que vai à LLM: o sistema e as últimas falas que cabem no
 * contexto. A última (a pergunta nova) vai sempre, mesmo se for longa.
 */
function montarConversa(falas: MensagemLlm[], projeto: ProjetoDaConversa): MensagemLlm[] {
  const sis: MensagemLlm = { role: "system", content: sistema(projeto) };
  let espaco = LIMITE_CONTEXTO - sis.content.length;
  const cabem: MensagemLlm[] = [];
  for (const fala of [...falas].reverse()) {
    espaco -= fala.content.length;
    if (espaco < 0 && cabem.length) break;
    cabem.unshift(fala);
  }
  return [sis, ...cabem];
}

/** Um título curto para a conversa, pela LLM, a partir da primeira troca. Se falhar, o começo da pergunta. */
async function tituloPara(pergunta: string, resposta: string): Promise<string> {
  const reserva = pergunta.replace(/\s+/g, " ").slice(0, 60).trim();
  try {
    let t = "";
    const texto = conversar(
      [
        {
          role: "system",
          content:
            "Dê um título curto (de 2 a 6 palavras) para a conversa abaixo, em português do Brasil. Responda só com o título: sem aspas, sem ponto final, sem markdown.",
        },
        { role: "user", content: `Pergunta: ${pergunta.slice(0, 2000)}\n\nResposta: ${resposta.slice(0, 2000)}` },
      ],
      AbortSignal.timeout(20_000),
    );
    for await (const pedaco of texto) t += pedaco;
    t = t.replace(/[*#"“”]/g, "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
    return t && t.length <= 80 ? t : reserva;
  } catch {
    return reserva;
  }
}

export async function rotasConversas(app: FastifyInstance) {
  /** As conversas, a mais recente em cima. A busca procura no título; o projeto filtra ("sem": as livres). */
  app.get("/", async (req) => {
    const { busca, projeto } = validar(z.object({ busca: Busca, projeto: FiltroProjeto }), req.query);
    return prisma.conversa.findMany({
      where: {
        ...(busca ? { titulo: { contains: busca, mode: "insensitive" as const } } : {}),
        ...(projeto ? { projetoId: projeto === "sem" ? null : projeto } : {}),
      },
      include: { projeto: { select: { id: true, nome: true } } },
      orderBy: { editadoEm: "desc" },
    });
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const c = await prisma.conversa.findUnique({
      where: { id },
      include: { mensagens: { orderBy: { criadoEm: "asc" } }, projeto: { select: { id: true, nome: true } } },
    });
    if (!c) throw naoEncontrado("Conversa não encontrada.");
    return c;
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const { titulo } = validar(z.object({ titulo: Titulo }), req.body);
    return prisma.conversa.update({ where: { id }, data: { titulo } });
  });

  /** Apaga a conversa e as mensagens dela. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.conversa.delete({ where: { id } });
    return reply.code(204).send();
  });

  /**
   * Manda uma mensagem e devolve a resposta em streaming (texto puro): a
   * tela escreve conforme chega. Sem `conversaId`, começa uma conversa nova,
   * e o id dela vai no cabeçalho X-Conversa-Id.
   *
   * A conversa nova e a pergunta só são gravadas quando a LLM começa a
   * responder — se ela recusar, não sobra conversa vazia nem pergunta sem
   * resposta. Se a pessoa parar no meio, grava o que já veio.
   *
   * Na primeira troca, a LLM também dá o título (antes de fechar a resposta:
   * a tela recarrega a lista quando o streaming acaba).
   */
  app.post("/mensagens", async (req, reply) => {
    const { conversaId, texto, projetoId } = validar(PedidoMensagem, req.body);
    const conversa = conversaId
      ? await prisma.conversa.findUnique({
          where: { id: conversaId },
          include: { mensagens: { orderBy: { criadoEm: "asc" }, select: { papel: true, conteudo: true } } },
        })
      : { titulo: TITULO_PADRAO, mensagens: [], projetoId };
    if (!conversa) throw naoEncontrado("Conversa não encontrada.");
    // O projeto é o da conversa (a nova herda o pedido); lido agora, para ir a descrição mais recente.
    const projeto = conversa.projetoId
      ? await prisma.projeto.findUnique({ where: { id: conversa.projetoId }, select: { nome: true, descricao: true } })
      : null;
    if (conversa.projetoId && !projeto) throw new ErroHttp(400, "O projeto desta conversa não existe mais.");

    await exigirOllama();
    const ocupado = await abrirEspacoParaLlm();

    const falas: MensagemLlm[] = [
      ...conversa.mensagens.map((m): MensagemLlm => ({ role: m.papel === "USUARIO" ? "user" : "assistant", content: m.conteudo })),
      { role: "user", content: texto },
    ];

    // A pessoa parou ou fechou a página: para de gerar.
    const cancelar = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableFinished) cancelar.abort();
    });

    const resposta = conversar(montarConversa(falas, projeto), cancelar.signal);
    let primeiro: IteratorResult<string>;
    try {
      primeiro = await resposta.next();
    } catch (e) {
      throw new ErroHttp(502, `A LLM falhou: ${(e as Error).message}`);
    }

    // A pergunta entra antes da resposta (criadoEm em ordem).
    const pergunta = { mensagens: { create: { papel: "USUARIO" as const, conteudo: texto } } };
    const { id } = conversaId
      ? await prisma.conversa.update({ where: { id: conversaId }, data: pergunta, select: { id: true } })
      : await prisma.conversa.create({ data: { titulo: TITULO_PADRAO, projetoId, ...pergunta }, select: { id: true } });

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Comfy-Ocupado": ocupado ? "1" : "0",
      "X-Conversa-Id": id,
    });
    let tudo = primeiro.done ? "" : primeiro.value;
    try {
      if (tudo) reply.raw.write(tudo);
      for await (const pedaco of resposta) {
        tudo += pedaco;
        reply.raw.write(pedaco);
      }
    } catch (e) {
      if (!cancelar.signal.aborted) req.log.warn({ err: e }, "a LLM parou no meio");
    }

    try {
      if (tudo.trim()) {
        await prisma.conversa.update({
          where: { id },
          data: { mensagens: { create: { papel: "ASSISTENTE", conteudo: tudo, modelo: configOllama().modelo } } },
        });
      }
      if (!conversa.mensagens.length && conversa.titulo === TITULO_PADRAO) {
        await prisma.conversa.update({ where: { id }, data: { titulo: await tituloPara(texto, tudo) } });
      }
    } catch (e) {
      req.log.error({ err: e }, "não gravou a resposta da conversa");
    } finally {
      reply.raw.end();
    }
  });
}
