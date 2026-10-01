import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

// O .env mora na raiz do monorepo e é opcional por enquanto: tudo que se lê
// dele tem um padrão que funciona nesta máquina.
const RAIZ = path.resolve(import.meta.dirname, "../../..");
try {
  process.loadEnvFile(path.join(RAIZ, ".env"));
} catch {
  // Sem .env: valem os padrões.
}

// 3400 é a do app de verdade (a que o ícone da bandeja sobe). O `npm run dev`
// usa a 3401, para dar para mexer no código com o app do dia a dia no ar.
const MODO_DEV = process.argv.includes("--dev");
const PORTA = Number(process.env.PORT ?? (MODO_DEV ? 3401 : 3400));
const WEB_DIST = path.join(RAIZ, "apps/web/dist");
const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

// Todo erro sai no mesmo formato `{ erro }`. O detalhe técnico fica no log.
app.setErrorHandler((erro: Error & { statusCode?: number; code?: string }, req, reply) => {
  const status = erro.statusCode ?? 500;
  if (status < 500) return reply.code(status).send({ erro: erro.message });

  req.log.error(erro);
  // Pelo código, e não pela mensagem: o texto vem do Postgres no idioma da
  // instalação. P10xx são os erros de conexão do Prisma; ECONNREFUSED é o
  // Postgres parado.
  const semBanco =
    erro.code?.startsWith("P10") || /ECONNREFUSED|DatabaseNotReachable/.test(JSON.stringify(erro.cause ?? ""));
  return reply.code(500).send({
    erro: semBanco
      ? "Sem conexão com o banco de dados. O PostgreSQL está rodando?"
      : "Erro no servidor. Veja o log pelo ícone da bandeja.",
  });
});

// O ícone da bandeja pergunta aqui se quem ouve na porta é mesmo o Creativa.
app.get("/api/saude", async () => ({ app: "Creativa", ok: true }));

/*
 * O banco responde? Só lê (`SELECT 1`). O Prisma é importado aqui dentro, e
 * não no topo: sem DATABASE_URL ele lança ao ser carregado, e isso derrubaria
 * o servidor inteiro em vez de só responder "fora do ar".
 */
app.get("/api/banco/estado", async (req) => {
  try {
    const { prisma } = await import("./lib/prisma.ts");
    await prisma.$queryRaw`SELECT 1`;
    return { noAr: true };
  } catch (erro) {
    // `err`, e não `erro`: é a chave que o logger sabe serializar.
    req.log.warn({ err: erro }, "banco fora do ar");
    return { noAr: false };
  }
});

/*
 * O ComfyUI está no ar? O front pergunta aqui, e não direto ao ComfyUI: de
 * outro PC pelo Tailscale, "127.0.0.1:8188" seria a máquina errada — quem
 * alcança o ComfyUI é este servidor.
 */
app.get("/api/comfyui/estado", async () => {
  try {
    const r = await fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { noAr: false };
    const stats = (await r.json()) as { system?: { comfyui_version?: string } };
    return { noAr: true, versao: stats.system?.comfyui_version ?? null };
  } catch {
    return { noAr: false };
  }
});

/*
 * O front pronto (`npm run build`) é servido por este mesmo processo: uma
 * porta só para o Tailscale publicar, sem CORS, sem segundo servidor para o
 * ícone vigiar. Em desenvolvimento quem serve o front é o Vite.
 */
if (!MODO_DEV && existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });

  app.setNotFoundHandler((req, reply) => {
    // Rota da API que não existe é 404 de verdade, em JSON.
    if (req.url.startsWith("/api/")) {
      return reply.code(404).send({ erro: "Rota não encontrada." });
    }
    // Arquivo que não existe (`.js`, `.png`...) também é 404, e não o
    // index.html disfarçado de script.
    if (/^[^?]*\.[a-z0-9]+(\?|$)/i.test(req.url)) {
      return reply.code(404).send();
    }
    return reply.header("Cache-Control", "no-cache").sendFile("index.html");
  });
} else if (!MODO_DEV) {
  app.log.warn(`Front não encontrado em ${WEB_DIST} — rode "npm run build". Servindo só a API.`);
}

// 0.0.0.0 e não localhost: assim os outros PCs chegam pelo IP do tailnet.
await app.listen({ port: PORTA, host: "0.0.0.0" });
