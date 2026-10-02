import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import type { FastifyBaseLogger } from "fastify";
import type { StatusGeracao } from "../generated/prisma/enums.ts";
import { apagar, caminhoAbsoluto, gravar } from "../lib/arquivos.ts";
import { configComfy, consultarComfy } from "../lib/comfyui.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp } from "../lib/validacao.ts";
import { acharWorkflow, prepararParaEnvio, validarValores } from "./registro.ts";

/**
 * Enviar gerações ao ComfyUI e acompanhar até o fim.
 *
 * Cada envio é uma Rodada: "Gerar" cria a primeira, "Gerar mais" cria outras
 * com as mesmas configurações e seed nova. Uma rodada vai NA_FILA →
 * EXECUTANDO → CONCLUIDA (com Outputs) ou FALHOU; a geração resume as suas
 * rodadas (`resumirStatus`). O estado mora no banco, não na memória: se o
 * servidor reiniciar no meio, o acompanhamento retoma as rodadas em andamento.
 *
 * Duas fontes, cada uma no que faz bem:
 * - fila (/queue) e histórico (/history): a verdade sobre em que pé está cada
 *   prompt, consultada a cada 1,5 s enquanto houver rodada em andamento;
 * - WebSocket (/ws): o progresso passo a passo (passo 3 de 8...), que só
 *   existe ali. Se cair, perde-se a barra de progresso, não a geração.
 */

/** Identifica o Creativa para o ComfyUI: as mensagens do WebSocket vêm para este id. */
const CLIENT_ID = `creativa-${randomUUID()}`;

/** O progresso de cada prompt em execução, vindo do WebSocket. Só memória. */
const progresso = new Map<string, { valor: number; max: number }>();

export const progressoDe = (promptId: string | null) => (promptId ? (progresso.get(promptId) ?? null) : null);

/** Quantas rodadas um clique pode pedir de uma vez. A GPU é uma só: elas vão para a fila. */
export const MAX_POR_ENVIO = 4;

type ErroComfyApi = {
  error?: { message?: string; details?: string };
  node_errors?: Record<string, { errors?: { message: string; details?: string }[]; class_type?: string }>;
};

/** A mensagem de erro do ComfyUI em uma linha legível — é o que aparece na tela. */
function mensagemDoComfy(j: ErroComfyApi): string {
  const partes: string[] = [];
  if (j.error?.message) partes.push(j.error.message + (j.error.details ? `: ${j.error.details}` : ""));
  for (const [no, e] of Object.entries(j.node_errors ?? {})) {
    for (const er of e.errors ?? []) partes.push(`nó ${no} (${e.class_type}): ${er.message}${er.details ? ` — ${er.details}` : ""}`);
  }
  return partes.join(" | ") || "O ComfyUI recusou o workflow.";
}

/**
 * O status da geração a partir das rodadas: alguma rodando ganha, depois
 * alguma na fila; senão vale o resultado da mais recente. Sem rodada, é
 * rascunho.
 */
export async function resumirStatus(geracaoId: string): Promise<void> {
  const rodadas = await prisma.rodada.findMany({ where: { geracaoId }, select: { status: true }, orderBy: { criadoEm: "desc" } });
  const tem = (s: StatusGeracao) => rodadas.some((r) => r.status === s);
  const status: StatusGeracao = !rodadas.length
    ? "RASCUNHO"
    : tem("EXECUTANDO")
      ? "EXECUTANDO"
      : tem("NA_FILA")
        ? "NA_FILA"
        : rodadas[0]!.status;
  await prisma.geracao.update({ where: { id: geracaoId }, data: { status } });
}

/**
 * Manda `quantidade` rodadas para a fila do ComfyUI.
 *
 * Da primeira vez (rascunho), a primeira rodada respeita a seed do
 * formulário; as demais — e todas as de "Gerar mais" — sorteiam seed nova:
 * gerar mais da mesma seed daria a mesma imagem.
 *
 * Erro de validação do ComfyUI (modelo que não existe, valor fora da faixa)
 * volta como 400. Se acontecer na primeira rodada, a geração continua em
 * rascunho, para corrigir e tentar de novo.
 */
export async function enviar(id: string, quantidade: number): Promise<void> {
  const g = await prisma.geracao.findUnique({ where: { id } });
  if (!g) throw new ErroHttp(404, "Geração não encontrada.");
  const w = acharWorkflow(g.workflow);
  if (!w) throw new ErroHttp(400, `O workflow ${g.workflow} não existe mais no código.`);
  if (!(await consultarComfy()).noAr) throw new ErroHttp(409, "O ComfyUI está desconectado. Inicie pela barra do topo.");

  const base = validarValores(w, g.parametros, false);
  const primeira = g.status === "RASCUNHO";
  const seeds = w.campos.filter((c) => c.tipo === "seed").map((c) => c.chave);

  for (let i = 0; i < quantidade; i++) {
    const usarSeedDoFormulario = primeira && i === 0;
    const valores = prepararParaEnvio(w, usarSeedDoFormulario ? base : { ...base, ...Object.fromEntries(seeds.map((s) => [s, null])) });
    const grafo = w.montar(valores);

    const r = await fetch(`${configComfy().url}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: grafo, client_id: CLIENT_ID }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as ErroComfyApi & { prompt_id?: string };
    if (!r.ok || !j.prompt_id) {
      // As rodadas que já foram para a fila ficam; esta e as seguintes não.
      if (i > 0) await resumirStatus(id);
      throw new ErroHttp(400, `ComfyUI: ${mensagemDoComfy(j)}`);
    }

    await prisma.rodada.create({
      data: { geracaoId: id, status: "NA_FILA", parametros: valores, grafoEnviado: grafo as object, promptIdComfy: j.prompt_id },
    });
  }

  await prisma.geracao.update({ where: { id }, data: { modelo: w.modelo } });
  await resumirStatus(id);
  garantirWebSocket();
}

/** Cancela todas as rodadas em andamento de uma geração. */
export async function cancelar(id: string): Promise<void> {
  const ativas = await prisma.rodada.findMany({ where: { geracaoId: id, status: { in: ["NA_FILA", "EXECUTANDO"] } } });
  if (!ativas.length) throw new ErroHttp(409, "Não há nada desta geração na fila ou executando.");
  await cancelarRodadas(ativas);
}

/** Cancela uma rodada só — o "×" de cada item da fila global. */
export async function cancelarRodada(id: string): Promise<void> {
  const r = await prisma.rodada.findUnique({ where: { id } });
  if (!r) throw new ErroHttp(404, "Rodada não encontrada.");
  if (r.status !== "NA_FILA" && r.status !== "EXECUTANDO") throw new ErroHttp(409, "Esta rodada já terminou.");
  await cancelarRodadas([r]);
}

/**
 * Tira da fila do ComfyUI as que ainda não começaram e interrompe a que
 * está rodando. O /interrupt para o que estiver executando — por isso só é
 * chamado quando a vez é de uma destas rodadas.
 */
async function cancelarRodadas(rodadas: { id: string; geracaoId: string; promptIdComfy: string | null }[]): Promise<void> {
  const url = configComfy().url;
  const fila = await lerFila(url).catch(() => null);
  const pids = rodadas.map((r) => r.promptIdComfy).filter((p): p is string => !!p);

  const esperando = pids.filter((p) => !fila?.rodando.includes(p));
  if (esperando.length) await postar(`${url}/queue`, { delete: esperando });
  if (pids.some((p) => fila?.rodando.includes(p))) await postar(`${url}/interrupt`, {});

  await prisma.rodada.updateMany({
    where: { id: { in: rodadas.map((r) => r.id) } },
    data: { status: "CANCELADA", concluidaEm: new Date() },
  });
  for (const g of new Set(rodadas.map((r) => r.geracaoId))) await resumirStatus(g);
}

const postar = (url: string, corpo: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(5_000) }).catch(() => {});

/** A fila do ComfyUI: os prompt_id rodando e os esperando. */
export async function lerFila(url: string): Promise<{ rodando: string[]; esperando: string[] }> {
  const r = await fetch(`${url}/queue`, { signal: AbortSignal.timeout(5_000) });
  const j = (await r.json()) as { queue_running: unknown[][]; queue_pending: unknown[][] };
  // Cada item é [número, prompt_id, grafo, extra, saídas].
  return { rodando: j.queue_running.map((i) => String(i[1])), esperando: j.queue_pending.map((i) => String(i[1])) };
}

type Historico = {
  status?: { status_str?: string; completed?: boolean; messages?: [string, Record<string, unknown>][] };
  outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
};

/** Largura e altura de um PNG, lidas do cabeçalho (IHDR), sem biblioteca. */
async function tamanhoPng(absoluto: string): Promise<{ largura: number; altura: number } | null> {
  const f = await open(absoluto, "r");
  try {
    const b = Buffer.alloc(24);
    await f.read(b, 0, 24, 0);
    if (b.toString("ascii", 12, 16) !== "IHDR") return null;
    return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
  } finally {
    await f.close();
  }
}

/**
 * Traz as imagens de uma rodada concluída para a pasta do Creativa e cria
 * os Outputs. Se algo falha no meio, apaga o que já tinha copiado.
 */
async function coletar(rodada: { id: string; geracaoId: string }, h: Historico, saidas: string[]): Promise<void> {
  const url = configComfy().url;
  const copiados: { relativo: string; tamanho: number; mime: string; largura: number | null; altura: number | null }[] = [];
  try {
    for (const no of saidas) {
      for (const img of h.outputs?.[no]?.images ?? []) {
        if (img.type !== "output") continue;
        const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
        const r = await fetch(`${url}/view?${q}`, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok || !r.body) throw new Error(`não consegui baixar ${img.filename} do ComfyUI (${r.status})`);
        const { relativo, tamanho } = await gravar("outputs", img.filename, Readable.fromWeb(r.body as never));
        const dims = img.filename.toLowerCase().endsWith(".png") ? await tamanhoPng(caminhoAbsoluto(relativo)) : null;
        copiados.push({ relativo, tamanho, mime: r.headers.get("content-type") ?? "image/png", largura: dims?.largura ?? null, altura: dims?.altura ?? null });
      }
    }
    if (copiados.length === 0) throw new Error("o ComfyUI terminou sem gerar imagem nenhuma");
    await prisma.$transaction([
      ...copiados.map((c) =>
        prisma.output.create({
          data: {
            geracaoId: rodada.geracaoId,
            rodadaId: rodada.id,
            tipo: "IMAGEM",
            arquivo: c.relativo,
            mime: c.mime,
            tamanhoBytes: c.tamanho,
            largura: c.largura,
            altura: c.altura,
          },
        }),
      ),
      prisma.rodada.update({ where: { id: rodada.id }, data: { status: "CONCLUIDA", concluidaEm: new Date() } }),
    ]);
  } catch (e) {
    await Promise.all(copiados.map((c) => apagar(c.relativo)));
    throw e;
  }
}

/** A mensagem de erro de uma execução que falhou, tirada do histórico. */
function erroDoHistorico(h: Historico): string {
  const msg = h.status?.messages?.find(([tipo]) => tipo === "execution_error")?.[1] as
    | { node_id?: string; node_type?: string; exception_message?: string }
    | undefined;
  if (msg) return `nó ${msg.node_id} (${msg.node_type}): ${msg.exception_message?.trim()}`;
  return "O ComfyUI informou erro na execução. Veja o log do ComfyUI.";
}

const falhar = (id: string, erro: string) =>
  prisma.rodada.update({ where: { id }, data: { status: "FALHOU", erro, concluidaEm: new Date() } });

let ocupado = false;

/** Uma volta do acompanhamento: confere cada rodada em andamento contra a fila e o histórico. */
async function acompanhar(log: FastifyBaseLogger): Promise<void> {
  if (ocupado) return;
  ocupado = true;
  try {
    const ativas = await prisma.rodada.findMany({
      where: { status: { in: ["NA_FILA", "EXECUTANDO"] }, promptIdComfy: { not: null } },
      select: { id: true, geracaoId: true, status: true, promptIdComfy: true, iniciadaEm: true, geracao: { select: { workflow: true } } },
      orderBy: { criadoEm: "asc" },
    });
    if (ativas.length === 0) return;
    garantirWebSocket();

    const url = configComfy().url;
    let fila: Awaited<ReturnType<typeof lerFila>>;
    try {
      fila = await lerFila(url);
    } catch {
      return; // ComfyUI fora do ar: espera ele voltar, sem mexer em nada.
    }

    const mexidas = new Set<string>();
    for (const r of ativas) {
      const pid = r.promptIdComfy!;
      if (fila.rodando.includes(pid)) {
        if (r.status !== "EXECUTANDO" || !r.iniciadaEm) {
          await prisma.rodada.update({ where: { id: r.id }, data: { status: "EXECUTANDO", iniciadaEm: r.iniciadaEm ?? new Date() } });
          mexidas.add(r.geracaoId);
        }
        continue;
      }
      if (fila.esperando.includes(pid)) continue;

      // Nem rodando nem esperando: terminou (ou sumiu).
      mexidas.add(r.geracaoId);
      const resp = await fetch(`${url}/history/${pid}`, { signal: AbortSignal.timeout(5_000) });
      const h = ((await resp.json()) as Record<string, Historico>)[pid];
      progresso.delete(pid);
      if (!h) {
        await falhar(r.id, "A rodada sumiu da fila do ComfyUI — ele foi reiniciado no meio?");
      } else if (h.status?.status_str === "error") {
        await falhar(r.id, erroDoHistorico(h));
      } else if (h.status?.completed) {
        // Começou e terminou entre duas voltas (geração rápida): ainda conta o início.
        if (!r.iniciadaEm) await prisma.rodada.update({ where: { id: r.id }, data: { iniciadaEm: new Date() } });
        const w = acharWorkflow(r.geracao.workflow);
        try {
          await coletar(r, h, w?.saidas ?? Object.keys(h.outputs ?? {}));
        } catch (e) {
          log.error({ err: e }, "falha ao coletar outputs");
          await falhar(r.id, `Gerou, mas não consegui trazer o resultado: ${(e as Error).message}`);
        }
      }
    }
    for (const g of mexidas) await resumirStatus(g);
  } catch (e) {
    log.warn({ err: e }, "acompanhamento das gerações falhou nesta volta");
  } finally {
    ocupado = false;
  }
}

/*
 * O WebSocket do ComfyUI, só para o progresso. Abre sob demanda (quando há
 * rodada em andamento) e se reabre sozinho se cair.
 */
let ws: WebSocket | null = null;

function garantirWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(`${configComfy().url.replace(/^http/, "ws")}/ws?clientId=${CLIENT_ID}`);
  } catch {
    ws = null;
    return;
  }
  ws.addEventListener("message", (ev) => {
    // Mensagens binárias são as prévias de imagem — não usamos.
    if (typeof ev.data !== "string") return;
    try {
      const m = JSON.parse(ev.data) as { type: string; data: { prompt_id?: string; value?: number; max?: number } };
      if (m.type === "progress" && m.data.prompt_id) {
        progresso.set(m.data.prompt_id, { valor: m.data.value ?? 0, max: m.data.max ?? 1 });
      }
    } catch {
      // Mensagem que não é JSON: ignora.
    }
  });
  ws.addEventListener("close", () => {
    ws = null;
  });
  ws.addEventListener("error", () => {
    // O "close" vem logo depois; o acompanhamento reabre na próxima volta.
  });
}

/** Liga o acompanhamento. Chamado uma vez, quando o servidor sobe. */
export function iniciarAcompanhamento(log: FastifyBaseLogger) {
  setInterval(() => acompanhar(log), 1_500);
}
