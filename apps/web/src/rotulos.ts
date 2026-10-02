import type { StatusGeracao, TipoAsset, TipoReferencia } from "./tipos.ts";

/** Como cada valor do banco aparece na tela. */

export const TIPOS_ASSET: { valor: TipoAsset; rotulo: string; plural: string }[] = [
  { valor: "PERSONAGEM", rotulo: "Personagem", plural: "Personagens" },
  { valor: "CENARIO", rotulo: "Cenário", plural: "Cenários" },
  { valor: "OBJETO", rotulo: "Objeto", plural: "Objetos" },
  { valor: "OUTRO", rotulo: "Outro", plural: "Outros" },
];

export const rotuloTipoAsset = (t: TipoAsset) => TIPOS_ASSET.find((x) => x.valor === t)?.rotulo ?? t;

export const TIPOS_REFERENCIA: { valor: TipoReferencia; rotulo: string; plural: string }[] = [
  { valor: "IMAGEM", rotulo: "Imagem", plural: "Imagens" },
  { valor: "VIDEO", rotulo: "Vídeo", plural: "Vídeos" },
  { valor: "TEXTO", rotulo: "Texto", plural: "Textos" },
];

export const STATUS_GERACAO: { valor: StatusGeracao; rotulo: string; cor: string }[] = [
  { valor: "RASCUNHO", rotulo: "Rascunho", cor: "bg-zinc-700 text-zinc-200" },
  { valor: "NA_FILA", rotulo: "Na fila", cor: "bg-amber-500/20 text-amber-300" },
  { valor: "EXECUTANDO", rotulo: "Executando", cor: "bg-sky-500/20 text-sky-300" },
  { valor: "CONCLUIDA", rotulo: "Concluída", cor: "bg-emerald-500/20 text-emerald-300" },
  { valor: "FALHOU", rotulo: "Falhou", cor: "bg-red-500/20 text-red-300" },
  { valor: "CANCELADA", rotulo: "Cancelada", cor: "bg-zinc-700 text-zinc-400" },
];

export const statusGeracao = (s: StatusGeracao) =>
  STATUS_GERACAO.find((x) => x.valor === s) ?? { valor: s, rotulo: s, cor: "bg-zinc-700" };

/** Uma geração sem nome aparece pelo começo do prompt. */
export const tituloGeracao = (g: { nome: string | null; prompt: string }) =>
  g.nome || (g.prompt ? g.prompt.slice(0, 80) + (g.prompt.length > 80 ? "…" : "") : "Geração sem prompt");

export const formatarData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function formatarBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
