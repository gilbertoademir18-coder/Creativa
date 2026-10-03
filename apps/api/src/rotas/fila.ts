import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nomesDoCatalogo } from "../geracao/catalogo.ts";
import { cancelarExecucao, lerFila, progressoDe } from "../geracao/execucao.ts";
import { configComfy } from "../lib/comfyui.ts";
import { prisma } from "../lib/prisma.ts";
import { Uuid, validar } from "../lib/validacao.ts";

/**
 * A fila global (`/api/fila`), para a barra do rodapé: tudo o que está
 * esperando ou executando no ComfyUI, de qualquer asset ou shot, mais o que
 * acabou de terminar — dá para ir enfileirando e acompanhar de qualquer
 * página.
 */

/** Quanto tempo uma execução terminada continua aparecendo como "recente". */
const RECENTE_MS = 10 * 60_000;

const daExecucao = {
  id: true,
  status: true,
  tipo: true,
  parametros: true,
  promptIdComfy: true,
  erro: true,
  criadoEm: true,
  iniciadaEm: true,
  concluidaEm: true,
  asset: { select: { id: true, nome: true } },
  shot: { select: { id: true, nome: true, cena: { select: { nome: true } } } },
} as const;

type ExecucaoDaFila = {
  tipo: string;
  parametros: unknown;
  asset: { id: string; nome: string } | null;
  shot: { id: string; nome: string; cena: { nome: string } } | null;
};

/** O que a barra precisa de cada execução: título, tipo, e de quem é (com o link para lá). */
function resumo(e: ExecucaoDaFila, nomes: Awaited<ReturnType<typeof nomesDoCatalogo>>) {
  const prompt = (e.parametros as Record<string, unknown> | null)?.prompt;
  return {
    titulo: typeof prompt === "string" && prompt.trim() ? prompt.slice(0, 80) : "Sem prompt",
    tipoNome: nomes.tipo(e.tipo),
    dono: e.asset ? e.asset.nome : e.shot ? `${e.shot.cena.nome} › ${e.shot.nome}` : null,
    link: e.asset ? `/assets/${e.asset.id}` : e.shot ? `/shots/${e.shot.id}` : null,
  };
}

export async function rotasFila(app: FastifyInstance) {
  app.get("/", async () => {
    const [ativas, recentes, nomes] = await Promise.all([
      prisma.execucao.findMany({
        where: { status: { in: ["NA_FILA", "EXECUTANDO"] } },
        select: daExecucao,
        orderBy: { criadoEm: "asc" },
      }),
      prisma.execucao.findMany({
        where: { status: { in: ["CONCLUIDA", "FALHOU", "CANCELADA"] }, concluidaEm: { gte: new Date(Date.now() - RECENTE_MS) } },
        select: { ...daExecucao, outputs: { select: { arquivo: true }, take: 1 } },
        orderBy: { concluidaEm: "desc" },
        take: 8,
      }),
      nomesDoCatalogo(),
    ]);

    // Prompts na fila do ComfyUI que não são do Creativa (a interface dele
    // aberta ao mesmo tempo, por exemplo): também ocupam a GPU e atrasam a fila.
    let externos: number | null = null;
    try {
      const f = await lerFila(configComfy().url);
      const nossos = new Set(ativas.map((e) => e.promptIdComfy));
      externos = [...f.rodando, ...f.esperando].filter((p) => !nossos.has(p)).length;
    } catch {
      // ComfyUI fora do ar: sem como saber.
    }

    return {
      itens: ativas.map((e) => ({
        execucaoId: e.id,
        status: e.status,
        criadoEm: e.criadoEm,
        iniciadaEm: e.iniciadaEm,
        progresso: progressoDe(e.promptIdComfy),
        ...resumo(e, nomes),
      })),
      recentes: recentes.map((e) => ({
        execucaoId: e.id,
        status: e.status,
        concluidaEm: e.concluidaEm,
        erro: e.erro,
        capa: e.outputs[0]?.arquivo ?? null,
        ...resumo(e, nomes),
      })),
      externos,
    };
  });

  app.post("/:execucaoId/cancelar", async (req) => {
    const { execucaoId } = validar(z.object({ execucaoId: Uuid }), req.params);
    await cancelarExecucao(execucaoId);
    return { ok: true };
  });
}
