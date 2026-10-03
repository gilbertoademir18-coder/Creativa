import { z } from "zod";
import type { TipoAsset } from "../generated/prisma/enums.ts";
import { ErroHttp } from "../lib/validacao.ts";
import type { Campo, DefTipo, DefWorkflow, Valores } from "./definicoes.ts";
import { placaCenarioZImage } from "./workflows/placa-cenario-zimage.ts";

/**
 * O catálogo: os tipos de geração e os workflows de cada um.
 *
 * Tipo novo: uma entrada em TIPOS. Workflow novo: um arquivo em `workflows/`
 * e uma linha em WORKFLOWS. Tipo sem workflow nenhum não aparece na tela —
 * não dá para gerar nada com ele.
 */

export const TIPOS: DefTipo[] = [
  {
    chave: "placa-cenario",
    nome: "Placa de cenário",
    descricao: "O lugar, vazio, sem pessoa nenhuma: plate de ambiente ou base para pôr personagens dentro depois.",
    saida: "IMAGEM",
    donos: { assets: ["CENARIO"] },
  },
];

export const WORKFLOWS: DefWorkflow[] = [placaCenarioZImage];

export const acharTipo = (chave: string) => TIPOS.find((t) => t.chave === chave);
export const acharWorkflow = (chave: string) => WORKFLOWS.find((w) => w.chave === chave);

/** De quem é o Gerador, como o catálogo enxerga: o tipo do asset importa (só Cenário tem Placa...). */
export type DonoGeracao = { asset: TipoAsset } | { shot: true };

function aceita(t: DefTipo, dono: DonoGeracao): boolean {
  if ("asset" in dono) return !!t.donos.assets?.includes(dono.asset);
  return !!t.donos.shot;
}

/**
 * Os tipos (com os workflows) que valem para um dono — o que o Gerador
 * daquele asset ou shot oferece, na ordem do catálogo: o primeiro já vem
 * escolhido. Sem `montar`: o front só precisa da descrição.
 */
export function catalogoPara(dono: DonoGeracao) {
  return TIPOS.filter((t) => aceita(t, dono))
    .map((t) => ({
      ...t,
      workflows: WORKFLOWS.filter((w) => w.tipo === t.chave).map(({ montar: _m, saidas: _s, ...w }) => w),
    }))
    .filter((t) => t.workflows.length > 0);
}

/** Confere que o tipo existe, aceita o dono, e o workflow é dele. Devolve o workflow. */
export function conferir(tipo: string, workflow: string, dono: DonoGeracao): DefWorkflow {
  const t = acharTipo(tipo);
  if (!t) throw new ErroHttp(400, `Tipo de geração desconhecido: ${tipo}`);
  if (!aceita(t, dono)) throw new ErroHttp(400, `“${t.nome}” não serve para este dono.`);
  const w = acharWorkflow(workflow);
  if (!w || w.tipo !== tipo) throw new ErroHttp(400, `O workflow ${workflow} não é de “${t.nome}”.`);
  return w;
}

/** O validador zod de um campo. */
function esquemaCampo(c: Campo) {
  switch (c.tipo) {
    case "texto": {
      const base = z.string().max(50_000, "texto longo demais");
      return c.obrigatorio ? base.trim().min(1, "não pode ficar vazio") : base.default(c.padrao ?? "");
    }
    case "opcoes":
      return z.enum(c.opcoes.map((o) => o.valor) as [string, ...string[]], "opção inválida").default(c.padrao);
    case "seed":
      // null = aleatória. O teto é o do JavaScript, não o do ComfyUI (2^64):
      // acima disso o número perderia dígitos no caminho.
      return z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().default(null);
  }
}

/**
 * Valida os valores dos campos de um workflow. Campos que o workflow não
 * conhece são descartados — sobra de outro workflow escolhido antes.
 */
export function validarValores(w: DefWorkflow, valores: unknown): Record<string, unknown> {
  const forma = Object.fromEntries(w.campos.map((c) => [c.chave, esquemaCampo(c)]));
  const r = z.object(forma).safeParse(valores ?? {});
  if (!r.success) {
    const p = r.error.issues[0]!;
    const campo = w.campos.find((c) => c.chave === p.path[0]);
    throw new ErroHttp(400, `${campo?.rotulo ?? String(p.path[0])}: ${p.message}`);
  }
  return r.data;
}

/** Sorteia a seed "aleatória" e devolve os valores prontos para montar o grafo. */
export function prepararParaEnvio(w: DefWorkflow, valores: Record<string, unknown>): Valores {
  const prontos: Valores = {};
  for (const c of w.campos) {
    const v = valores[c.chave];
    if (c.tipo === "seed") prontos[c.chave] = typeof v === "number" ? v : Math.floor(Math.random() * 2 ** 48);
    else prontos[c.chave] = v as string;
  }
  return prontos;
}
