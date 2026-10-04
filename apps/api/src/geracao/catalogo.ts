import { z } from "zod";
import type { TipoAsset } from "../generated/prisma/enums.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp } from "../lib/validacao.ts";
import { Campo, nomeFerramenta, RefImagem, type DefWorkflow, type GrafoApi, type Valores } from "./definicoes.ts";

/**
 * O catálogo do Gerador: os tipos de geração e os workflows de cada um, como
 * o usuário cadastrou (tabelas `tipo_geracao` e `workflow`).
 *
 * Tipo sem workflow nenhum não aparece no Gerador — não dá para gerar nada
 * com ele.
 */

/** De quem é o Gerador, como o catálogo enxerga: o tipo do asset importa (só Cenário tem Placa...). */
export type DonoGeracao = { asset: TipoAsset } | { shot: true };

/** Os campos como estão no banco (JSON), validados. */
export function lerCampos(json: unknown, workflow: string): Campo[] {
  const r = z.array(Campo).safeParse(json);
  if (!r.success) throw new ErroHttp(500, `Os campos do workflow ${workflow} estão inválidos no banco: ${r.error.issues[0]?.message}`);
  return r.data;
}

const comTipo = { tipoGeracao: { select: { chave: true } } } as const;

type WorkflowDoBanco = {
  chave: string;
  ferramenta: string;
  nome: string;
  modelo: string | null;
  grafo: unknown;
  campos: unknown;
  saidas: string[];
  tipoGeracao: { chave: string };
};

const paraDef = (w: WorkflowDoBanco): DefWorkflow => ({
  chave: w.chave,
  tipo: w.tipoGeracao.chave,
  ferramenta: w.ferramenta,
  nome: w.nome,
  modelo: w.modelo,
  grafo: w.grafo as GrafoApi,
  campos: lerCampos(w.campos, w.chave),
  saidas: w.saidas,
});

/** O workflow pronto para montar e enviar, pela chave. null se não existe (mais). */
export async function acharWorkflow(chave: string): Promise<DefWorkflow | null> {
  const w = await prisma.workflow.findUnique({ where: { chave }, include: comTipo });
  return w && paraDef(w);
}

/** Onde o tipo aparece: no Gerador de quais assets, e no dos shots. */
const queServemPara = (dono: DonoGeracao) => ("asset" in dono ? { tiposAsset: { has: dono.asset } } : { shot: true });

/**
 * Os tipos (com os workflows) do Gerador de um dono, por nome: o primeiro já
 * vem escolhido. Sem o grafo — a tela só precisa dos campos.
 */
export async function catalogoPara(dono: DonoGeracao) {
  const tipos = await prisma.tipoGeracao.findMany({
    where: queServemPara(dono),
    include: {
      workflows: {
        select: { chave: true, ferramenta: true, nome: true, descricao: true, notas: true, origem: true, modelo: true, campos: true },
        orderBy: { nome: "asc" },
      },
    },
    orderBy: { nome: "asc" },
  });
  return tipos
    .filter((t) => t.workflows.length > 0)
    .map((t) => ({
      chave: t.chave,
      nome: t.nome,
      descricao: t.descricao,
      saida: t.saida,
      workflows: t.workflows.map((w) => ({
        ...w,
        tipo: t.chave,
        ferramentaNome: nomeFerramenta(w.ferramenta),
        campos: lerCampos(w.campos, w.chave),
      })),
    }));
}

/** Confere que o tipo existe, serve para o dono e o workflow é dele. Devolve o workflow. */
export async function conferir(tipo: string, workflow: string, dono: DonoGeracao): Promise<DefWorkflow> {
  const t = await prisma.tipoGeracao.findUnique({ where: { chave: tipo } });
  if (!t) throw new ErroHttp(400, `Tipo de geração desconhecido: ${tipo}`);
  const serve = "asset" in dono ? t.tiposAsset.includes(dono.asset) : t.shot;
  if (!serve) throw new ErroHttp(400, `“${t.nome}” não aparece no Gerador deste dono.`);
  const w = await acharWorkflow(workflow);
  if (!w || w.tipo !== tipo) throw new ErroHttp(400, `O workflow ${workflow} não é de “${t.nome}”.`);
  return w;
}

/**
 * Os nomes legíveis de tipos e workflows, pela chave — para listas que só
 * guardam a chave (outputs, fila). Chave que não existe mais aparece como está.
 */
export async function nomesDoCatalogo() {
  const [tipos, workflows] = await Promise.all([
    prisma.tipoGeracao.findMany({ select: { chave: true, nome: true } }),
    prisma.workflow.findMany({ select: { chave: true, nome: true } }),
  ]);
  const t = new Map(tipos.map((x) => [x.chave, x.nome]));
  const w = new Map(workflows.map((x) => [x.chave, x.nome]));
  return { tipo: (chave: string) => t.get(chave) ?? chave, workflow: (chave: string) => w.get(chave) ?? chave };
}

/** O validador zod do valor de um campo. */
function esquemaCampo(c: Campo) {
  switch (c.tipo) {
    case "texto": {
      const base = z.string().max(50_000, "texto longo demais");
      return c.obrigatorio ? base.trim().min(1, "não pode ficar vazio") : base.default(c.padrao ?? "");
    }
    case "numero": {
      let n = z.number("precisa ser um número");
      if (c.min !== undefined) n = n.min(c.min, `no mínimo ${c.min}`);
      if (c.max !== undefined) n = n.max(c.max, `no máximo ${c.max}`);
      return n.default(c.padrao);
    }
    case "opcoes":
      return z
        .union([z.string(), z.number()])
        .refine((v) => c.opcoes.some((o) => o.valor === v), "opção inválida")
        .default(c.padrao);
    case "tamanho":
      return z
        .string()
        .refine((v) => c.opcoes.some((o) => o.valor === v), "tamanho inválido")
        .default(c.padrao);
    case "imagem":
      return RefImagem;
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
export function validarValores(w: Pick<DefWorkflow, "campos">, valores: unknown): Record<string, unknown> {
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
export function prepararParaEnvio(w: Pick<DefWorkflow, "campos">, valores: Record<string, unknown>): Valores {
  const prontos: Valores = {};
  for (const c of w.campos) {
    const v = valores[c.chave];
    if (c.tipo === "seed") prontos[c.chave] = typeof v === "number" ? v : Math.floor(Math.random() * 2 ** 48);
    else prontos[c.chave] = v as string | number | RefImagem;
  }
  return prontos;
}

/** A seed usada, pelo campo de seed do workflow (null se ele não tiver). */
export function seedDe(campos: Campo[], parametros: Record<string, unknown>): number | null {
  const chave = campos.find((c) => c.tipo === "seed")?.chave;
  const v = chave ? parametros[chave] : null;
  return typeof v === "number" ? v : null;
}
