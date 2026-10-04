import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { configOllama, conversar, LIMITE_CONTEXTO, type MensagemLlm } from "../lib/ollama.ts";
import { prisma } from "../lib/prisma.ts";
import { Busca, ErroHttp, naoEncontrado, Uuid, validar } from "../lib/validacao.ts";
import { abrirEspacoParaLlm, exigirOllama } from "./assistentes.ts";

/**
 * Conversas livres com a LLM local (`/api/conversas`) — a página Conversas,
 * um chat no estilo do ChatGPT. Cada conversa guarda as mensagens; a cada
 * pergunta, a LLM recebe a conversa inteira (ou o fim dela, se não couber).
 *
 * A GPU se reveza com o ComfyUI do mesmo jeito que no assistente de prompt
 * (`abrirEspacoParaLlm`).
 */

const TITULO_PADRAO = "Nova conversa";

const Titulo = z.string().trim().min(1, "não pode ficar vazio").max(120, "no máximo 120 caracteres");

const PedidoMensagem = z.object({
  /** Sem conversa: começa uma nova. */
  conversaId: z.union([Uuid, z.null()]).default(null),
  texto: z.string().trim().min(1, "escreva a mensagem").max(20_000, "mensagem longa demais"),
});

function sistema(): string {
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return [
    "Você é um assistente prestativo, conversando com uma pessoa que cria vídeos, imagens e sons com IA.",
    "Responda em português do Brasil, a não ser que ela peça outro idioma.",
    "Seja direto e natural. Use markdown (listas, negrito, blocos de código, tabelas) quando ajudar a ler.",
    "Se não souber algo, diga que não sabe — não invente.",
    `Hoje é ${hoje}.`,
  ].join("\n");
}

/**
 * A conversa que vai à LLM: o sistema e as últimas falas que cabem no
 * contexto. A última (a pergunta nova) vai sempre, mesmo se for longa.
 */
function montarConversa(falas: MensagemLlm[]): MensagemLlm[] {
  const sis: MensagemLlm = { role: "system", content: sistema() };
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
  /** As conversas, a mais recente em cima. A busca procura no título. */
  app.get("/", async (req) => {
    const { busca } = validar(z.object({ busca: Busca }), req.query);
    return prisma.conversa.findMany({
      where: busca ? { titulo: { contains: busca, mode: "insensitive" } } : undefined,
      orderBy: { editadoEm: "desc" },
    });
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const c = await prisma.conversa.findUnique({ where: { id }, include: { mensagens: { orderBy: { criadoEm: "asc" } } } });
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
    const { conversaId, texto } = validar(PedidoMensagem, req.body);
    const conversa = conversaId
      ? await prisma.conversa.findUnique({
          where: { id: conversaId },
          include: { mensagens: { orderBy: { criadoEm: "asc" }, select: { papel: true, conteudo: true } } },
        })
      : { titulo: TITULO_PADRAO, mensagens: [] };
    if (!conversa) throw naoEncontrado("Conversa não encontrada.");

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

    const resposta = conversar(montarConversa(falas), cancelar.signal);
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
      : await prisma.conversa.create({ data: { titulo: TITULO_PADRAO, ...pergunta }, select: { id: true } });

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
