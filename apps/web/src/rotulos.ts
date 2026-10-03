import type { TipoAsset, TipoReferencia } from "./tipos.ts";

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

export const formatarData = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function formatarBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
