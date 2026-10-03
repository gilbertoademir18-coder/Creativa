import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import type { FastifyBaseLogger } from "fastify";
import type { Execucao } from "../generated/prisma/client.ts";
import { apagar, caminhoAbsoluto, gravar } from "../lib/arquivos.ts";
import { configComfy, consultarComfy } from "../lib/comfyui.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp } from "../lib/validacao.ts";
import { acharWorkflow, prepararParaEnvio, validarValores } from "./registro.ts";

/**
 * O Gerador manda trabalho ao ComfyUI e acompanha até o fim.
 *
 * Cada "Gerar" vira uma ou mais Execuções (uma por imagem pedida). Uma
 * execução vai NA_FILA → EXECUTANDO → CONCLUIDA (com Outputs) ou FALHOU. O
 * estado mora no banco, não na memória: se o servidor reiniciar no meio, o
 * acompanhamento retoma as execuções em andamento.
 *
 * Cada Output nasce com tudo o que foi usado para gerá-lo (tipo, workflow,
 * modelo, parâmetros com a seed, grafo): não depende da execução para se
 * explicar.
 *
 * Duas fontes, cada uma no que faz bem:
 * - fila (/queue) e histórico (/history): a verdade sobre em que pé está cada
 *   prompt, consultada a cada 1,5 s enquanto houver execução em andamento;
 * - WebSocket (/ws): o progresso passo a passo (passo 3 de 8...), que só
 *   existe ali. Se cair, perde-se a barra de progresso, não a imagem.
 */

/** Identifica o Creativa para o ComfyUI: as mensagens do WebSocket vêm para este id. */
const CLIENT_ID = `creativa-${randomUUID()}`;

/** O progresso de cada prompt em execução, vindo do WebSocket. Só memória. */
const progresso = new Map<string, { valor: number; max: number }>();

export const progressoDe = (promptId: string | null) => (promptId ? (progresso.get(promptId) ?? null) : null);

/** Quantas imagens um clique pode pedir de uma vez. A GPU é uma só: elas vão para a fila. */
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

/** O pedido do Gerador: de quem, com que workflow e quais valores. */
export type Pedido = {
  assetId: string | null;
  shotId: string | null;
  tipo: string;
  workflow: string;
  parametros: Record<string, unknown>;
  quantidade: number;
};

/**
 * Manda `quantidade` execuções para a fila do ComfyUI. Quem chama já
 * conferiu o pedido contra o catálogo (`conferir`).
 *
 * A primeira respeita a seed do formulário; as demais sorteiam seed nova —
 * pedir 4 da mesma seed daria 4 imagens iguais. Com seed aleatória, cada
 * uma sorteia a sua.
 *
 * Erro de validação do ComfyUI (modelo que não existe, valor fora da faixa)
 * volta como 400. As que já foram para a fila antes do erro ficam.
 */
export async function executar(pedido: Pedido): Promise<void> {
  const w = acharWorkflow(pedido.workflow);
  if (!w) throw new ErroHttp(400, `O workflow ${pedido.workflow} não existe no código.`);
  if (!(await consultarComfy()).noAr) throw new ErroHttp(409, "O ComfyUI está desconectado. Inicie pela barra do topo.");

  const base = validarValores(w, pedido.parametros);
  const seeds = w.campos.filter((c) => c.tipo === "seed").map((c) => c.chave);

  for (let i = 0; i < pedido.quantidade; i++) {
    const valores = prepararParaEnvio(w, i === 0 ? base : { ...base, ...Object.fromEntries(seeds.map((s) => [s, null])) });
    const grafo = w.montar(valores);

    const r = await fetch(`${configComfy().url}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: grafo, client_id: CLIENT_ID }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as ErroComfyApi & { prompt_id?: string };
    if (!r.ok || !j.prompt_id) throw new ErroHttp(400, `ComfyUI: ${mensagemDoComfy(j)}`);

    await prisma.execucao.create({
      data: {
        assetId: pedido.assetId,
        shotId: pedido.shotId,
        tipo: pedido.tipo,
        workflow: w.chave,
        modelo: w.modelo,
        status: "NA_FILA",
        parametros: valores,
        grafoEnviado: grafo as object,
        promptIdComfy: j.prompt_id,
      },
    });
  }
  garantirWebSocket();
}

/** Cancela uma execução — o "×" da fila e do Gerador. */
export async function cancelarExecucao(id: string): Promise<void> {
  const e = await prisma.execucao.findUnique({ where: { id } });
  if (!e) throw new ErroHttp(404, "Execução não encontrada.");
  if (e.status !== "NA_FILA" && e.status !== "EXECUTANDO") throw new ErroHttp(409, "Esta execução já terminou.");
  await cancelarExecucoes([e]);
}

/**
 * Tira da fila do ComfyUI as que ainda não começaram e interrompe a que
 * está rodando. O /interrupt para o que estiver executando — por isso só é
 * chamado quando a vez é de uma destas execuções.
 */
async function cancelarExecucoes(execucoes: { id: string; promptIdComfy: string | null }[]): Promise<void> {
  const url = configComfy().url;
  const fila = await lerFila(url).catch(() => null);
  const pids = execucoes.map((e) => e.promptIdComfy).filter((p): p is string => !!p);

  const esperando = pids.filter((p) => !fila?.rodando.includes(p));
  if (esperando.length) await postar(`${url}/queue`, { delete: esperando });
  if (pids.some((p) => fila?.rodando.includes(p))) await postar(`${url}/interrupt`, {});

  await prisma.execucao.updateMany({
    where: { id: { in: execucoes.map((e) => e.id) } },
    data: { status: "CANCELADA", concluidaEm: new Date() },
  });
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
 * Traz as imagens de uma execução concluída para a pasta do Creativa e cria
 * os Outputs, cada um com a cópia de tudo o que a execução usou. Se algo
 * falha no meio, apaga o que já tinha copiado.
 */
async function coletar(e: Execucao, h: Historico, saidas: string[]): Promise<void> {
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
    const p = e.parametros as Record<string, unknown>;
    const seed = seedDe(e.workflow, p);
    await prisma.$transaction([
      ...copiados.map((c) =>
        prisma.output.create({
          data: {
            assetId: e.assetId,
            shotId: e.shotId,
            execucaoId: e.id,
            tipoGeracao: e.tipo,
            workflow: e.workflow,
            modelo: e.modelo,
            prompt: typeof p.prompt === "string" ? p.prompt : "",
            seed: seed === null ? null : BigInt(seed),
            parametros: e.parametros as object,
            grafoEnviado: e.grafoEnviado as object,
            tipo: "IMAGEM",
            arquivo: c.relativo,
            mime: c.mime,
            tamanhoBytes: c.tamanho,
            largura: c.largura,
            altura: c.altura,
          },
        }),
      ),
      prisma.execucao.update({ where: { id: e.id }, data: { status: "CONCLUIDA", concluidaEm: new Date() } }),
    ]);
  } catch (erro) {
    await Promise.all(copiados.map((c) => apagar(c.relativo)));
    throw erro;
  }
}

/** A seed usada, pelo campo de seed do workflow (null se ele não tiver). */
export function seedDe(workflow: string, parametros: Record<string, unknown>): number | null {
  const chave = acharWorkflow(workflow)?.campos.find((c) => c.tipo === "seed")?.chave;
  const v = chave ? parametros[chave] : null;
  return typeof v === "number" ? v : null;
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
  prisma.execucao.update({ where: { id }, data: { status: "FALHOU", erro, concluidaEm: new Date() } });

let ocupado = false;

/** Uma volta do acompanhamento: confere cada execução em andamento contra a fila e o histórico. */
async function acompanhar(log: FastifyBaseLogger): Promise<void> {
  if (ocupado) return;
  ocupado = true;
  try {
    const ativas = await prisma.execucao.findMany({
      where: { status: { in: ["NA_FILA", "EXECUTANDO"] }, promptIdComfy: { not: null } },
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

    for (const r of ativas) {
      const pid = r.promptIdComfy!;
      if (fila.rodando.includes(pid)) {
        if (r.status !== "EXECUTANDO" || !r.iniciadaEm) {
          await prisma.execucao.update({ where: { id: r.id }, data: { status: "EXECUTANDO", iniciadaEm: r.iniciadaEm ?? new Date() } });
        }
        continue;
      }
      if (fila.esperando.includes(pid)) continue;

      // Nem rodando nem esperando: terminou (ou sumiu).
      const resp = await fetch(`${url}/history/${pid}`, { signal: AbortSignal.timeout(5_000) });
      const h = ((await resp.json()) as Record<string, Historico>)[pid];
      progresso.delete(pid);
      if (!h) {
        await falhar(r.id, "A execução sumiu da fila do ComfyUI — ele foi reiniciado no meio?");
      } else if (h.status?.status_str === "error") {
        await falhar(r.id, erroDoHistorico(h));
      } else if (h.status?.completed) {
        // Começou e terminou entre duas voltas (geração rápida): ainda conta o início.
        if (!r.iniciadaEm) await prisma.execucao.update({ where: { id: r.id }, data: { iniciadaEm: new Date() } });
        const w = acharWorkflow(r.workflow);
        try {
          await coletar(r, h, w?.saidas ?? Object.keys(h.outputs ?? {}));
        } catch (e) {
          log.error({ err: e }, "falha ao coletar outputs");
          await falhar(r.id, `Gerou, mas não consegui trazer o resultado: ${(e as Error).message}`);
        }
      }
    }
  } catch (e) {
    log.warn({ err: e }, "acompanhamento das execuções falhou nesta volta");
  } finally {
    ocupado = false;
  }
}

/*
 * O WebSocket do ComfyUI, só para o progresso. Abre sob demanda (quando há
 * execução em andamento) e se reabre sozinho se cair.
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
