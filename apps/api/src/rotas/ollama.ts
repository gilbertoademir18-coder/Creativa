import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { FastifyInstance } from "fastify";
import { configOllama } from "../lib/ollama.ts";

/**
 * O Ollama desta máquina, repassado em `/ollama/*` — para o Creativa de outra
 * máquina (o notebook) usar a LLM daqui pelo tailnet, com
 * `OLLAMA_URL="https://overdrive.tail2c882a.ts.net:8444/ollama"`.
 *
 * Por que não um `tailscale serve` direto na 11434: o Ollama ouvindo só em
 * 127.0.0.1 recusa (403) pedido cujo Host não é local — é a defesa dele
 * contra DNS rebinding —, e o `tailscale serve` repassa o Host do tailnet. O
 * `fetch` do Node também não deixa trocar o Host. Aqui o pedido sai de novo,
 * para 127.0.0.1, e o Host fica certo.
 *
 * Só as rotas que o Creativa usa (`lib/ollama.ts`): quem está no tailnet não
 * baixa nem apaga modelo por aqui.
 */
const ROTAS = new Set(["/api/tags", "/api/chat", "/api/generate"]);

export async function rotasOllama(app: FastifyInstance) {
  // O corpo vai como veio, sem o Fastify ler o JSON no meio.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, corpo, feito) => feito(null, corpo));

  app.route({
    method: ["GET", "POST"],
    url: "/*",
    handler: async (req, reply) => {
      const caminho = `/${(req.params as { "*": string })["*"]}`;
      if (!ROTAS.has(caminho)) return reply.code(404).send({ erro: `O repasse do Ollama não atende ${caminho}.` });

      // Quem pediu desistiu (parou a expansão, fechou a página): para a LLM também.
      const controle = new AbortController();
      reply.raw.on("close", () => controle.abort());

      let r: Response;
      try {
        r = await fetch(`${configOllama().url}${caminho}`, {
          method: req.method,
          headers: { "Content-Type": req.headers["content-type"] ?? "application/json" },
          body: req.method === "POST" ? new Uint8Array(req.body as Buffer) : undefined,
          signal: controle.signal,
        });
      } catch {
        return reply.code(502).send({ erro: "O Ollama desta máquina não respondeu." });
      }

      reply.code(r.status);
      const tipo = r.headers.get("content-type");
      if (tipo) reply.header("content-type", tipo);
      // A resposta do /api/chat vem em pedaços (NDJSON): repassa conforme chega.
      return reply.send(r.body ? Readable.fromWeb(r.body as ReadableStream) : "");
    },
  });
}
