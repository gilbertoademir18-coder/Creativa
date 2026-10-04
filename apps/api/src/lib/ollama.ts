import { lerEnv } from "./comfyui.ts";

/**
 * A LLM local (Ollama) que os assistentes de prompt usam.
 *
 * O Ollama roda à parte (o app dele fica na bandeja e sobe com o Windows);
 * aqui só se fala com ele por HTTP. O modelo é o do .env
 * (ASSISTENTE_MODELO), lido na hora: dá para trocar sem reiniciar o Creativa.
 *
 * A GPU é uma só e tem 12 GB: a LLM e o ComfyUI se revezam. Quem coordena é
 * quem chama — `descarregar()` antes de mandar algo ao ComfyUI, e o
 * assistente libera o ComfyUI (se estiver parado) antes de escrever.
 */

export function configOllama() {
  return {
    url: lerEnv("OLLAMA_URL", "http://127.0.0.1:11434").replace(/\/$/, ""),
    modelo: lerEnv("ASSISTENTE_MODELO", "gemma4:12b-it-qat"),
  };
}

/** O contexto que se pede ao Ollama, em tokens. */
const NUM_CTX = 16_384;

/**
 * Quanto de texto cabe com folga nesse contexto, em caracteres: em português
 * dá ~3,5 caracteres por token, e sobra espaço para a resposta.
 */
export const LIMITE_CONTEXTO = 36_000;

export type EstadoOllama = { noAr: boolean; modelo: string; modeloBaixado: boolean };

/** O Ollama responde? E o modelo do .env já foi baixado (`ollama pull`)? */
export async function consultarOllama(): Promise<EstadoOllama> {
  const { url, modelo } = configOllama();
  try {
    const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!r.ok) return { noAr: false, modelo, modeloBaixado: false };
    const j = (await r.json()) as { models?: { name: string }[] };
    // Sem tag, o Ollama entende ":latest".
    const nome = modelo.includes(":") ? modelo : `${modelo}:latest`;
    return { noAr: true, modelo, modeloBaixado: !!j.models?.some((m) => m.name === nome) };
  } catch {
    return { noAr: false, modelo, modeloBaixado: false };
  }
}

/** Uma fala na conversa com a LLM, no formato do /api/chat do Ollama. */
export type MensagemLlm = { role: "system" | "user" | "assistant"; content: string };

/**
 * Escreve um texto com a LLM, em pedaços, conforme ela gera. Sem
 * "pensamento" (think: false): o que se quer é o prompt direto, rápido.
 *
 * O modelo fica carregado por 5 minutos depois: expandir de novo em seguida
 * não paga o carregamento outra vez.
 */
export function gerarTexto(sistema: string, usuario: string, sinal?: AbortSignal): AsyncGenerator<string> {
  return conversar(
    [
      { role: "system", content: sistema },
      { role: "user", content: usuario },
    ],
    sinal,
  );
}

/**
 * Manda uma conversa inteira (sistema, falas anteriores e a última) e devolve
 * a resposta em pedaços. É o que o `gerarTexto` e a página Conversas usam.
 */
export async function* conversar(mensagens: MensagemLlm[], sinal?: AbortSignal): AsyncGenerator<string> {
  const { url, modelo } = configOllama();
  const r = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      stream: true,
      think: false,
      keep_alive: "5m",
      // Sem isto o Ollama usa 4096 tokens e, quando passa, corta o começo
      // calado — justo as instruções do assistente. O assistente, o workflow
      // e a descrição do projeto passam fácil disso. Com o gemma4 12B, 16k
      // custa ~330 MB de VRAM a mais que 4k. Quem manda conversa longa corta
      // antes (`LIMITE_CONTEXTO`), para não perder as instruções.
      options: { num_ctx: NUM_CTX },
      messages: mensagens,
    }),
    signal: sinal,
  });
  if (!r.ok || !r.body) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? `O Ollama respondeu ${r.status}.`);
  }

  // A resposta é NDJSON: uma linha de JSON por pedaço.
  const leitor = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let resto = "";
  while (true) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += value;
    const linhas = resto.split("\n");
    resto = linhas.pop() ?? "";
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      const m = JSON.parse(linha) as { message?: { content?: string }; error?: string };
      if (m.error) throw new Error(m.error);
      if (m.message?.content) yield m.message.content;
    }
  }
}

/** Tira o modelo da VRAM agora (keep_alive 0) — para o ComfyUI ter a placa. Falha calada: o Ollama pode nem estar no ar. */
export async function descarregar(): Promise<void> {
  const { url, modelo } = configOllama();
  await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelo, keep_alive: 0 }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {});
}
