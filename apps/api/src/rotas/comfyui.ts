import type { FastifyInstance } from "fastify";
import { ErroComfy, estadoComfy, iniciarComfy, logComfy, pararComfy } from "../lib/comfyui.ts";
import { ErroHttp } from "../lib/validacao.ts";

/**
 * Rotas do ComfyUI, montadas em `/api/comfyui`.
 *
 * O front pergunta aqui, e não direto ao ComfyUI: de outro PC pelo
 * Tailscale, "127.0.0.1:8188" seria a máquina errada — quem alcança o
 * ComfyUI é este servidor.
 */
export async function rotasComfy(app: FastifyInstance) {
  app.get("/estado", async () => estadoComfy());

  app.post("/iniciar", async (_req, reply) => {
    try {
      await iniciarComfy();
    } catch (e) {
      if (e instanceof ErroComfy) throw new ErroHttp(409, e.message);
      throw e;
    }
    return reply.code(202).send(await estadoComfy());
  });

  app.post("/parar", async () => {
    try {
      await pararComfy();
    } catch (e) {
      if (e instanceof ErroComfy) throw new ErroHttp(409, e.message);
      throw e;
    }
    return estadoComfy();
  });

  app.get("/log", async () => ({ linhas: await logComfy() }));
}
