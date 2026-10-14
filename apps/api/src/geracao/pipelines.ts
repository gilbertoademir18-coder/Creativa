import { z } from "zod";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp } from "../lib/validacao.ts";

/*
 * Pipelines: o roteiro de etapas para gerar um shot.
 *
 * Um shot costuma precisar de mais de uma geração — o primeiro quadro e,
 * dele, o vídeo. Cada etapa é um compartimento do Gerador: tem o formulário
 * dela, a galeria dela e uma imagem escolhida, que é o que alimenta a etapa
 * seguinte.
 *
 * ETAPA NÃO É REGISTRO. O pipeline é cadastro do usuário (tabela
 * `pipeline`), mas as etapas moram no JSON dele, e o que uma etapa acumula
 * num shot mora no rascunho do Gerador desse shot. Uma tabela de etapas
 * obrigaria a criar linhas para cada shot e reconciliá-las a cada mudança no
 * pipeline — e isso é escrever nos dados do usuário por conta própria.
 *
 * Quem não escolheu nada fica no pipeline embutido "unica": uma etapa, sem
 * tipo fixo. É a tela de sempre, e não custa registro nenhum.
 */

/** A chave do pipeline embutido — e da etapa dele. Reservada no cadastro. */
export const CHAVE_UNICA = "unica";

const Entrada = z.object({
  /** A chave do campo de imagem do workflow que recebe a imagem. */
  campo: z.string().min(1, "escolha o campo que recebe a imagem"),
  /** De que etapa anterior vem a imagem escolhida. */
  daEtapa: z.string().min(1, "escolha de que etapa vem a imagem"),
});

export const EtapaPipeline = z.object({
  chave: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "a chave da etapa é minúscula, sem espaço nem acento (ex.: first-frame, video)")
    .max(80),
  nome: z.string().trim().min(1, "a etapa precisa de um nome").max(80),
  /**
   * O tipo de geração desta etapa. Nulo só faz sentido num pipeline de uma
   * etapa: aí o Gerador oferece todos os tipos, como sempre fez.
   */
  tipoGeracao: z
    .string()
    .max(200)
    .nullish()
    .transform((t) => t || null),
  /** Os campos de imagem que já vêm preenchidos com o escolhido de outra etapa. */
  entradas: z
    .array(Entrada)
    .max(8)
    .default([])
    .refine((e) => new Set(e.map((x) => x.campo)).size === e.length, "dois campos iguais na mesma etapa"),
});
export type EtapaPipeline = z.infer<typeof EtapaPipeline>;

export const Etapas = z
  .array(EtapaPipeline)
  .min(1, "o pipeline precisa de pelo menos uma etapa")
  .max(10, "no máximo 10 etapas")
  .refine((e) => new Set(e.map((x) => x.chave)).size === e.length, "duas etapas com a mesma chave")
  // Com mais de uma etapa, é o tipo que diz em qual delas cai um output já
  // gerado (os de antes dos pipelines não têm etapa gravada). Sem tipo, todo
  // o histórico do shot cairia na mesma etapa.
  .refine(
    (e) => e.length === 1 || e.every((x) => x.tipoGeracao),
    "com mais de uma etapa, cada etapa precisa de um tipo de geração",
  )
  .refine(
    (e) => e.every((x, i) => x.entradas.every((en) => e.slice(0, i).some((a) => a.chave === en.daEtapa))),
    "uma entrada vem de uma etapa que não está antes dela no pipeline",
  );

/** Um pipeline pronto para usar: o do banco ou o embutido. */
export type PipelineResolvido = {
  chave: string;
  nome: string;
  descricao: string | null;
  etapas: EtapaPipeline[];
};

export const PIPELINE_UNICO: PipelineResolvido = {
  chave: CHAVE_UNICA,
  nome: "Geração única",
  descricao: "Uma geração só, sem etapas.",
  etapas: [{ chave: CHAVE_UNICA, nome: "Geração única", tipoGeracao: null, entradas: [] }],
};

/** As etapas como estão no banco (JSON), validadas. */
export function lerEtapas(json: unknown, pipeline: string): EtapaPipeline[] {
  const r = Etapas.safeParse(json);
  if (!r.success) throw new ErroHttp(500, `As etapas do pipeline ${pipeline} estão inválidas no banco: ${r.error.issues[0]?.message}`);
  return r.data;
}

/** O pipeline pela chave, ou null se não existe (mais). */
export async function acharPipeline(chave: string): Promise<PipelineResolvido | null> {
  if (chave === CHAVE_UNICA) return PIPELINE_UNICO;
  const p = await prisma.pipeline.findUnique({ where: { chave } });
  return p && { chave: p.chave, nome: p.nome, descricao: p.descricao, etapas: lerEtapas(p.etapas, p.chave) };
}

/**
 * O pipeline de um dono do Gerador. O asset tem sempre o embutido — pipeline
 * é coisa de shot. O shot que não escolheu herda o padrão do projeto: assim,
 * mudar o padrão vale na hora para todos os que não escolheram o seu.
 *
 * Pipeline que sumiu do cadastro cai no embutido, como a chave de um ícone
 * que não existe mais: a tela não quebra por causa de um cadastro apagado.
 */
export async function pipelineDe(dono: { assetId: string | null; shotId: string | null }): Promise<PipelineResolvido> {
  if (!dono.shotId) return PIPELINE_UNICO;
  const s = await prisma.shot.findUnique({
    where: { id: dono.shotId },
    select: { pipeline: true, cena: { select: { projeto: { select: { pipelinePadrao: true } } } } },
  });
  if (!s) throw new ErroHttp(404, "Shot não encontrado.");
  const chave = s.pipeline ?? s.cena.projeto?.pipelinePadrao ?? CHAVE_UNICA;
  return (await acharPipeline(chave)) ?? PIPELINE_UNICO;
}

/**
 * Onde o Gerador de uma etapa parou. `escolhido` é o output aprovado dela —
 * o que as etapas seguintes recebem nos campos de imagem.
 */
export const RascunhoEtapa = z.object({
  tipo: z.string().max(200),
  workflow: z.string().max(200),
  valores: z.record(z.string(), z.unknown()).default({}),
  assistente: z
    .string()
    .max(200)
    .nullish()
    .transform((t) => t || null),
  ideia: z
    .string()
    .max(10_000)
    .nullish()
    .transform((t) => t || null),
  escolhido: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
});
export type RascunhoEtapa = z.infer<typeof RascunhoEtapa>;

const Rascunhos = z.object({ etapas: z.record(z.string().max(80), RascunhoEtapa) });

/**
 * O rascunho como está no banco, por etapa.
 *
 * Reconhece o formato de antes dos pipelines (um Gerador só, com `tipo` na
 * raiz) e o trata como o da etapa única — por isso nenhuma migração mexeu
 * nos rascunhos que já existem. A primeira gravação já sai no formato novo.
 */
export function lerRascunhos(json: unknown): Record<string, RascunhoEtapa> {
  const novo = Rascunhos.safeParse(json);
  if (novo.success) return novo.data.etapas;
  const velho = RascunhoEtapa.safeParse(json);
  return velho.success ? { [CHAVE_UNICA]: velho.data } : {};
}

/**
 * O rascunho por etapa, já encaixado no pipeline: o que estava na etapa única
 * (de antes dos pipelines, ou de quando o shot não tinha etapas) passa para a
 * primeira etapa dele, em vez de ficar órfão.
 */
export function encaixarNoPipeline(json: unknown, pipeline: PipelineResolvido): Record<string, RascunhoEtapa> {
  const r = lerRascunhos(json);
  const primeira = pipeline.etapas[0]!.chave;
  if (primeira !== CHAVE_UNICA && r[CHAVE_UNICA] && !r[primeira]) {
    r[primeira] = r[CHAVE_UNICA]!;
    delete r[CHAVE_UNICA];
  }
  return r;
}
