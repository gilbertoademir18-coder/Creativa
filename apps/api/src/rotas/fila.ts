import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { cancelarRodada, lerFila, progressoDe } from "../geracao/execucao.ts";
import { acharTipo } from "../geracao/registro.ts";
import { configComfy } from "../lib/comfyui.ts";
import { prisma } from "../lib/prisma.ts";
import { Uuid, validar } from "../lib/validacao.ts";

/**
 * A fila global de gerações (`/api/fila`), para a barra do rodapé: tudo o
 * que está esperando ou executando no ComfyUI, de qualquer geração, mais o
 * que acabou de terminar — dá para ir enfileirando e acompanhar de qualquer
 * página.
 */

/** Quanto tempo uma rodada terminada continua aparecendo como "recente". */
const RECENTE_MS = 10 * 60_000;

const daGeracao = {
  select: {
    id: true,
    nome: true,
    prompt: true,
    tipo: true,
    asset: { select: { id: true, nome: true } },
    shot: { select: { id: true, nome: true, cena: { select: { nome: true } } } },
  },
};

type GeracaoDaFila = {
  id: string;
  nome: string | null;
  prompt: string;
  tipo: string;
  asset: { id: string; nome: string } | null;
  shot: { id: string; nome: string; cena: { nome: string } } | null;
};

/** O que a barra precisa de cada geração: título, tipo e de quem é. */
const resumoGeracao = (g: GeracaoDaFila) => ({
  id: g.id,
  titulo: g.nome || g.prompt.slice(0, 80) || "Geração sem prompt",
  tipoNome: acharTipo(g.tipo)?.nome ?? g.tipo,
  dono: g.asset ? g.asset.nome : g.shot ? `${g.shot.cena.nome} › ${g.shot.nome}` : null,
});

export async function rotasFila(app: FastifyInstance) {
  app.get("/", async () => {
    const [ativas, recentes] = await Promise.all([
      prisma.rodada.findMany({
        where: { status: { in: ["NA_FILA", "EXECUTANDO"] } },
        include: { geracao: daGeracao },
        orderBy: { criadoEm: "asc" },
      }),
      prisma.rodada.findMany({
        where: { status: { in: ["CONCLUIDA", "FALHOU", "CANCELADA"] }, concluidaEm: { gte: new Date(Date.now() - RECENTE_MS) } },
        include: { geracao: daGeracao, outputs: { select: { arquivo: true }, take: 1 } },
        orderBy: { concluidaEm: "desc" },
        take: 8,
      }),
    ]);

    // Prompts na fila do ComfyUI que não são do Creativa (a interface dele
    // aberta ao mesmo tempo, por exemplo): também ocupam a GPU e atrasam a fila.
    let externos: number | null = null;
    try {
      const f = await lerFila(configComfy().url);
      const nossos = new Set(ativas.map((r) => r.promptIdComfy));
      externos = [...f.rodando, ...f.esperando].filter((p) => !nossos.has(p)).length;
    } catch {
      // ComfyUI fora do ar: sem como saber.
    }

    return {
      itens: ativas.map((r) => ({
        rodadaId: r.id,
        status: r.status,
        criadoEm: r.criadoEm,
        iniciadaEm: r.iniciadaEm,
        progresso: progressoDe(r.promptIdComfy),
        geracao: resumoGeracao(r.geracao),
      })),
      recentes: recentes.map((r) => ({
        rodadaId: r.id,
        status: r.status,
        concluidaEm: r.concluidaEm,
        erro: r.erro,
        capa: r.outputs[0]?.arquivo ?? null,
        geracao: resumoGeracao(r.geracao),
      })),
      externos,
    };
  });

  app.post("/:rodadaId/cancelar", async (req) => {
    const { rodadaId } = validar(z.object({ rodadaId: Uuid }), req.params);
    await cancelarRodada(rodadaId);
    return { ok: true };
  });
}
