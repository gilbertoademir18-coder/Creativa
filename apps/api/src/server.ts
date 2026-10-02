import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

// O .env mora na raiz do monorepo. Carregado antes de importar as rotas, que
// trazem o Prisma — e ele lê DATABASE_URL ao criar o cliente.
const RAIZ = path.resolve(import.meta.dirname, "../../..");
try {
  process.loadEnvFile(path.join(RAIZ, ".env"));
} catch {
  // Sem .env: o erro útil ("DATABASE_URL não está definida") vem do Prisma.
}

const { rotasProjetos } = await import("./rotas/projetos.ts");
const { rotasAssets } = await import("./rotas/assets.ts");
const { rotasCenas, rotasShots } = await import("./rotas/cenas.ts");
const { rotasReferencias } = await import("./rotas/referencias.ts");
const { rotasGeracoes, rotasOutputs } = await import("./rotas/geracoes.ts");
const { iniciarAcompanhamento } = await import("./geracao/execucao.ts");
const { rotasComfy } = await import("./rotas/comfyui.ts");
const { rotasFila } = await import("./rotas/fila.ts");
const { pastaArquivos } = await import("./lib/arquivos.ts");

// 3400 é a do app de verdade (a que o ícone da bandeja sobe). O `npm run dev`
// usa a 3401, para dar para mexer no código com o app do dia a dia no ar.
const MODO_DEV = process.argv.includes("--dev");
const PORTA = Number(process.env.PORT ?? (MODO_DEV ? 3401 : 3400));
const WEB_DIST = path.join(RAIZ, "apps/web/dist");

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

// Todo erro sai no mesmo formato `{ erro }`. O detalhe técnico fica no log.
app.setErrorHandler((erro: Error & { statusCode?: number; code?: string }, req, reply) => {
  const status = erro.statusCode ?? 500;
  if (status < 500) return reply.code(status).send({ erro: erro.message });

  // Os erros do Prisma que são culpa do pedido, e não do servidor.
  // P2003: apagar algo que ainda tem coisas presas a ele (os Restrict do
  // schema). P2025: o registro não existe. P2002: duplicado.
  if (erro.code === "P2003") {
    return reply.code(409).send({
      erro: "Não dá para excluir: ainda há itens ligados a este registro (referências, gerações ou outputs).",
    });
  }
  if (erro.code === "P2025") return reply.code(404).send({ erro: "Registro não encontrado." });
  if (erro.code === "P2002") return reply.code(409).send({ erro: "Já existe um registro igual." });

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

// Upload de referências: vídeo de referência pode ser grande, daí os 4 GB.
await app.register(fastifyMultipart, { limits: { fileSize: 4 * 1024 ** 3, files: 50 } });

await app.register(rotasProjetos, { prefix: "/api/projetos" });
await app.register(rotasAssets, { prefix: "/api/assets" });
await app.register(rotasCenas, { prefix: "/api/cenas" });
await app.register(rotasShots, { prefix: "/api/shots" });
await app.register(rotasReferencias, { prefix: "/api/referencias" });
await app.register(rotasGeracoes, { prefix: "/api/geracoes" });
await app.register(rotasOutputs, { prefix: "/api/outputs" });
await app.register(rotasComfy, { prefix: "/api/comfyui" });
await app.register(rotasFila, { prefix: "/api/fila" });

/*
 * Os arquivos (referências e outputs), em /api/arquivos/<caminho relativo>.
 * O nome é um uuid que nunca é reaproveitado, então o navegador pode guardar
 * em cache para sempre.
 */
const PASTA_ARQUIVOS = pastaArquivos();
mkdirSync(PASTA_ARQUIVOS, { recursive: true });
await app.register(fastifyStatic, {
  root: PASTA_ARQUIVOS,
  prefix: "/api/arquivos/",
  decorateReply: false,
  maxAge: "365d",
  immutable: true,
});

/*
 * O front pronto (`npm run build`) é servido por este mesmo processo: uma
 * porta só para o Tailscale publicar, sem CORS, sem segundo servidor para o
 * ícone vigiar. Em desenvolvimento quem serve o front é o Vite.
 */
const SERVIR_FRONT = !MODO_DEV && existsSync(WEB_DIST);
if (SERVIR_FRONT) {
  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
} else if (!MODO_DEV) {
  app.log.warn(`Front não encontrado em ${WEB_DIST} — rode "npm run build". Servindo só a API.`);
}

app.setNotFoundHandler((req, reply) => {
  // Rota da API (ou arquivo de /api/arquivos) que não existe é 404 em JSON,
  // no formato `{ erro }` de todo o resto.
  if (req.url.startsWith("/api/")) {
    return reply.code(404).send({ erro: "Não encontrado." });
  }
  // Arquivo que não existe (`.js`, `.png`...) também é 404, e não o
  // index.html disfarçado de script.
  if (!SERVIR_FRONT || /^[^?]*\.[a-z0-9]+(\?|$)/i.test(req.url)) {
    return reply.code(404).send();
  }
  return reply.header("Cache-Control", "no-cache").sendFile("index.html");
});

// 0.0.0.0 e não localhost: assim os outros PCs chegam pelo IP do tailnet.
await app.listen({ port: PORTA, host: "0.0.0.0" });

// Retoma e acompanha as gerações que estão no ComfyUI (ver geracao/execucao.ts).
iniciarAcompanhamento(app.log);
