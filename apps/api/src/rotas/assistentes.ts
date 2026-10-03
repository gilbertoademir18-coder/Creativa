import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Campo, DefWorkflow } from "../geracao/definicoes.ts";
import { lerFila } from "../geracao/execucao.ts";
import { acharTipo, acharWorkflow, WORKFLOWS } from "../geracao/registro.ts";
import { configComfy } from "../lib/comfyui.ts";
import { consultarOllama, gerarTexto } from "../lib/ollama.ts";
import { prisma } from "../lib/prisma.ts";
import { Busca, ErroHttp, FiltroProjeto, naoEncontrado, Nome, TextoOpcional, Uuid, UuidOpcional, validar } from "../lib/validacao.ts";

/**
 * Assistentes de prompt (`/api/assistentes`).
 *
 * Um assistente é um markdown com instruções — como uma skill — que a LLM
 * local segue para transformar uma ideia curta no prompt de um workflow.
 * Quem escreve é o usuário; aqui se guarda, se lista o que vale para cada
 * Gerador (workflow + projeto do dono) e se expande a ideia.
 */

const CorpoAssistente = z.object({
  nome: Nome,
  descricao: TextoOpcional(1000),
  projetoId: UuidOpcional,
  workflows: z
    .array(z.string())
    .default([])
    .refine((ws) => ws.every((w) => acharWorkflow(w)), "workflow desconhecido")
    .transform((ws) => [...new Set(ws)]),
  instrucoes: z.string().trim().min(1, "escreva as instruções").max(100_000, "texto longo demais"),
});

const FiltroAssistentes = z.object({
  projeto: FiltroProjeto,
  workflow: z.string().optional().transform((v) => v || undefined),
  busca: Busca,
});

const Dono = z
  .object({ asset: UuidOpcional, shot: UuidOpcional })
  .refine((d) => !!d.asset !== !!d.shot, "o Gerador é de um asset ou de um shot");

const PedidoExpandir = z
  .object({
    assetId: UuidOpcional,
    shotId: UuidOpcional,
    workflow: z.string().min(1),
    ideia: z.string().trim().min(1, "escreva a ideia antes de expandir").max(10_000, "ideia longa demais"),
  })
  .refine((d) => !!d.assetId !== !!d.shotId, "o Gerador é de um asset ou de um shot");

const TIPO_ASSET = { PERSONAGEM: "personagem", CENARIO: "cenário", OBJETO: "objeto", OUTRO: "outro" } as const;

const comProjeto = { projeto: { select: { id: true, nome: true } } } as const;

/** Vale para o workflow (lista vazia = todos) e para o projeto (sem projeto = todos). */
function queValem(workflow: string, projetoId: string | null) {
  return {
    AND: [
      { OR: [{ workflows: { isEmpty: true } }, { workflows: { has: workflow } }] },
      { OR: [{ projetoId: null }, ...(projetoId ? [{ projetoId }] : [])] },
    ],
  };
}

/** O que o dono do Gerador conta à LLM: quem é, de que projeto, e as descrições. */
async function contextoDoDono(assetId: string | null, shotId: string | null): Promise<{ projetoId: string | null; linhas: string[] }> {
  if (assetId) {
    const a = await prisma.asset.findUnique({ where: { id: assetId }, include: { projeto: { select: { nome: true } } } });
    if (!a) throw new ErroHttp(400, "Asset não encontrado.");
    return {
      projetoId: a.projetoId,
      linhas: [
        a.projeto && `Projeto: ${a.projeto.nome}`,
        `Asset: ${a.nome} (${TIPO_ASSET[a.tipo]})`,
        a.descricao && `Descrição do asset:\n${a.descricao}`,
      ].filter((l): l is string => !!l),
    };
  }
  const s = await prisma.shot.findUnique({
    where: { id: shotId! },
    include: { cena: { include: { projeto: { select: { nome: true } } } } },
  });
  if (!s) throw new ErroHttp(400, "Shot não encontrado.");
  return {
    projetoId: s.cena.projetoId,
    linhas: [
      s.cena.projeto && `Projeto: ${s.cena.projeto.nome}`,
      `Cena: ${s.cena.nome}`,
      s.cena.descricao && `Descrição da cena:\n${s.cena.descricao}`,
      // O storyboard pode ser longo: o começo basta para dar o tom.
      s.cena.storyboard.trim() && `Storyboard da cena:\n${s.cena.storyboard.trim().slice(0, 3000)}`,
      `Shot: ${s.nome}`,
      s.descricao && `Descrição do shot:\n${s.descricao}`,
    ].filter((l): l is string => !!l),
  };
}

/** O campo em que o assistente escreve: o de texto marcado como `assistivel`. */
export const campoAssistivel = (w: DefWorkflow) =>
  w.campos.find((c): c is Extract<Campo, { tipo: "texto" }> => c.tipo === "texto" && !!c.assistivel);

/**
 * As instruções para a LLM: as do assistente e, depois, o que o código sabe
 * do workflow — a dica do campo, a faixa de palavras e as regras que a tela
 * confere. Fecha com o formato: só o texto, pronto para colar.
 */
export function montarSistema(instrucoes: string, w: DefWorkflow, campo: Extract<Campo, { tipo: "texto" }>): string {
  const regras = (campo.avisos ?? []).map((a) => `- ${a.mensagem}`);
  return [
    instrucoes.trim(),
    "",
    "---",
    "",
    `# O workflow`,
    `Você escreve o campo "${campo.rotulo}" do workflow "${w.nome}" (${acharTipo(w.tipo)?.nome ?? w.tipo}).`,
    w.descricao,
    campo.dica && `Orientação do campo: ${campo.dica}`,
    campo.palavras && `Tamanho: entre ${campo.palavras.min} e ${campo.palavras.max} palavras.`,
    regras.length ? `A tela confere o texto com estas regras — respeite todas:\n${regras.join("\n")}` : null,
    "",
    "# Formato da resposta",
    "Responda somente com o texto final do campo, pronto para colar. Sem título, sem aspas, sem markdown, sem comentários e sem explicar o que fez.",
  ]
    .filter((l) => typeof l === "string")
    .join("\n");
}

/** O ComfyUI está com algo na fila ou rodando? null: não deu para saber (fora do ar). */
async function comfyOcupado(): Promise<boolean | null> {
  try {
    const f = await lerFila(configComfy().url);
    return f.rodando.length + f.esperando.length > 0;
  } catch {
    return null;
  }
}

export async function rotasAssistentes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const f = validar(FiltroAssistentes, req.query);
    return prisma.assistente.findMany({
      where: {
        projetoId: f.projeto === "sem" ? null : f.projeto,
        ...(f.workflow ? { OR: [{ workflows: { isEmpty: true } }, { workflows: { has: f.workflow } }] } : {}),
        nome: f.busca ? { contains: f.busca, mode: "insensitive" } : undefined,
      },
      include: comProjeto,
      orderBy: { nome: "asc" },
    });
  });

  /** O Ollama está no ar, e o modelo foi baixado? A tela avisa o que fazer se não. */
  app.get("/estado", async () => consultarOllama());

  /** Os assistentes do Gerador de um asset ou shot, para um workflow: os gerais e os do projeto do dono. */
  app.get("/disponiveis", async (req) => {
    const { workflow, ...d } = validar(Dono.and(z.object({ workflow: z.string().min(1) })), req.query);
    const { projetoId } = await contextoDoDono(d.asset, d.shot);
    const lista = await prisma.assistente.findMany({
      where: queValem(workflow, projetoId),
      select: { id: true, nome: true, descricao: true, projetoId: true, ...comProjeto },
      orderBy: { nome: "asc" },
    });
    // Os do projeto primeiro: são os mais específicos.
    return lista.sort((a, b) => Number(!!b.projetoId) - Number(!!a.projetoId));
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const a = await prisma.assistente.findUnique({ where: { id }, include: comProjeto });
    if (!a) throw naoEncontrado("Assistente não encontrado.");
    return a;
  });

  app.post("/", async (req, reply) => {
    const dados = validar(CorpoAssistente, req.body);
    return reply.code(201).send(await prisma.assistente.create({ data: dados, include: comProjeto }));
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoAssistente, req.body);
    return prisma.assistente.update({ where: { id }, data: dados, include: comProjeto });
  });

  /** Os outputs guardam o nome do assistente, não o id: apagar não mexe neles. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await prisma.assistente.delete({ where: { id } });
    return reply.code(204).send();
  });

  /**
   * Expande a ideia no prompt completo, com a LLM local. A resposta é o
   * texto puro, em streaming: a tela vai preenchendo a caixa conforme chega.
   *
   * A GPU: com o ComfyUI parado, os modelos dele saem da VRAM (/free) para a
   * LLM rodar inteira na placa — a próxima geração recarrega do NVMe. Com o
   * ComfyUI ocupado, ninguém é interrompido: a LLM roda com o que sobrar
   * (mais devagar), e o cabeçalho X-Comfy-Ocupado avisa a tela.
   */
  app.post("/:id/expandir", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const p = validar(PedidoExpandir, req.body);
    const assistente = await prisma.assistente.findUnique({ where: { id } });
    if (!assistente) throw naoEncontrado("Assistente não encontrado.");
    const w = acharWorkflow(p.workflow);
    if (!w) throw new ErroHttp(400, `O workflow ${p.workflow} não existe no código.`);
    const campo = campoAssistivel(w);
    if (!campo) throw new ErroHttp(400, `O workflow “${w.nome}” não tem campo para o assistente escrever.`);

    const estado = await consultarOllama();
    if (!estado.noAr) throw new ErroHttp(409, "O Ollama não está no ar. Abra o Ollama pelo menu Iniciar (ele fica na bandeja).");
    if (!estado.modeloBaixado) throw new ErroHttp(409, `O modelo ${estado.modelo} não foi baixado. Rode: ollama pull ${estado.modelo}`);

    const dono = await contextoDoDono(p.assetId, p.shotId);
    const ocupado = await comfyOcupado();
    if (ocupado === false) {
      await fetch(`${configComfy().url}/free`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
        signal: AbortSignal.timeout(10_000),
      }).catch(() => {});
    }

    const usuario = [`Ideia: ${p.ideia}`, "", "Contexto (use o que servir à ideia):", ...dono.linhas.map((l) => `- ${l}`)].join("\n");

    // A pessoa fechou a página ou clicou de novo: para de gerar.
    const cancelar = new AbortController();
    req.raw.on("close", () => cancelar.abort());

    // O primeiro pedaço antes de responder: se o Ollama recusar, ainda dá
    // para devolver um erro HTTP normal, com a mensagem na tela.
    const texto = gerarTexto(montarSistema(assistente.instrucoes, w, campo), usuario, cancelar.signal);
    let primeiro: IteratorResult<string>;
    try {
      primeiro = await texto.next();
    } catch (e) {
      throw new ErroHttp(502, `A LLM falhou: ${(e as Error).message}`);
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Comfy-Ocupado": ocupado ? "1" : "0",
    });
    try {
      if (!primeiro.done) reply.raw.write(primeiro.value);
      for await (const pedaco of texto) reply.raw.write(pedaco);
    } catch (e) {
      if (!cancelar.signal.aborted) req.log.warn({ err: e }, "a LLM parou no meio");
    } finally {
      reply.raw.end();
    }
  });
}
