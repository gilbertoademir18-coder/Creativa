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

/**
 * Escreve um texto com a LLM, em pedaços, conforme ela gera. Sem
 * "pensamento" (think: false): o que se quer é o prompt direto, rápido.
 *
 * O modelo fica carregado por 5 minutos depois: expandir de novo em seguida
 * não paga o carregamento outra vez.
 */
export async function* gerarTexto(sistema: string, usuario: string, sinal?: AbortSignal): AsyncGenerator<string> {
  const { url, modelo } = configOllama();
  const r = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      stream: true,
      think: false,
      keep_alive: "5m",
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: usuario },
      ],
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
