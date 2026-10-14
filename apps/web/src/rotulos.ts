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

/*
 * Como chamar uma cena ou um shot que não tem nome.
 *
 * Os dois nascem sem nome: o número — a posição na lista — já identifica. Nome
 * é para quando a cena merece um ("A fuga"), e vem do usuário.
 *
 * O número sai sempre do **índice na lista ordenada**, não do campo `ordem`:
 * apagar um shot do meio deixa buraco na ordem guardada, e o que a pessoa
 * conta na tela é a posição.
 */

/** Na barra e nas listas: `2` sem nome, `2. A fuga` com. */
export const comNumero = (nome: string | null, numero: number): string => (nome ? `${numero}. ${nome}` : String(numero));

/** Em títulos e frases corridas: `A fuga`, ou `Cena 2` / `Shot 1` quando não há nome. */
export const titulo = (tipo: "Cena" | "Shot", nome: string | null, numero: number): string => nome ?? `${tipo} ${numero}`;

/** O que o campo "Nome" mostra: vazio quando não há nome. */
export const paraCampo = (nome: string | null): string => nome ?? "";

/** O caminho até um shot, para rótulos de dono: `A fuga › 2`, `Cena 3 › Shot 1`. */
export const caminhoDoShot = (s: { nome: string | null; ordem: number; cena: { nome: string | null; ordem: number } }): string =>
  `${titulo("Cena", s.cena.nome, s.cena.ordem + 1)} › ${titulo("Shot", s.nome, s.ordem + 1)}`;
