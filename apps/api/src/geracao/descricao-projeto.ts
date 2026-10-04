import type { TipoOutput } from "../generated/prisma/enums.ts";
import { paraChave } from "../lib/chave.ts";

/**
 * O que a descrição do projeto conta ao assistente de prompt.
 *
 * A descrição segue o modelo de `docs/descricao-de-projeto.md`: seções `##`
 * com títulos fixos. Aqui ela é recortada pelos títulos e só vai o que serve
 * àquela geração — o estilo visual não interessa a um áudio, e a ficha de um
 * personagem só vai se ele aparece. A LLM é pequena e o contexto é curto:
 * mandar a bíblia inteira afogaria o que importa.
 */

/** Cada seção que vai é cortada aqui: o modelo pede que elas sejam diretas. */
const LIMITE = 2_500;

/** As seções do modelo que vão ao assistente, e quando. As outras (Formato, Público-alvo, Referências...) ficam só para leitura. */
const SECOES: Record<string, (saida: TipoOutput) => boolean> = {
  premissa: () => true,
  tom: () => true,
  "estilo-visual": (s) => s !== "AUDIO",
  mundo: () => true,
  personagens: () => true,
  recorrentes: () => true,
  som: (s) => s === "AUDIO",
  evitar: () => true,
};

type Secao = { titulo: string; corpo: string };

/** Corta o markdown nos títulos de um nível (`##` ou `###`), ignorando os de dentro de blocos de código. O que vem antes do primeiro título fica de fora. */
function secoes(md: string, nivel: number): Secao[] {
  const titulo = new RegExp(`^#{${nivel}}(?!#)\\s+(.*?)\\s*#*\\s*$`);
  const lista: Secao[] = [];
  let atual: { titulo: string; linhas: string[] } | null = null;
  let emCodigo = false;
  for (const linha of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(linha)) emCodigo = !emCodigo;
    const t = emCodigo ? null : titulo.exec(linha);
    if (t) {
      if (atual) lista.push({ titulo: atual.titulo, corpo: atual.linhas.join("\n").trim() });
      // O editor visual escapa alguns caracteres (\*, \[) e o título pode vir em negrito.
      atual = { titulo: t[1]!.replace(/\\(.)/g, "$1").replace(/[*_]/g, "").trim(), linhas: [] };
    } else atual?.linhas.push(linha);
  }
  if (atual) lista.push({ titulo: atual.titulo, corpo: atual.linhas.join("\n").trim() });
  return lista;
}

const cortar = (s: string) => (s.length > LIMITE ? `${s.slice(0, LIMITE)}…` : s);

/** "Ação, Lia!" → " acao lia ": para achar nomes como palavras inteiras, sem ligar para acento e caixa. */
const palavras = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/** "Lia (Prompt)" → ["Lia", "Prompt"]: o nome e os outros nomes entre parênteses ou depois de "/". */
const nomesDoPersonagem = (titulo: string) =>
  titulo
    .split(/[()/,]/)
    .map((n) => n.trim())
    .filter((n) => palavras(n).trim());

/**
 * As linhas de contexto que a descrição do projeto rende para uma geração.
 * `mencoes` é todo o texto da geração (a ideia, o asset, a cena, o shot):
 * é nele que se procuram os nomes dos personagens.
 *
 * Descrição fora do modelo (sem nenhum título conhecido) vai inteira, cortada
 * no começo — melhor do que nada.
 */
export function contextoDoProjeto(descricao: string | null, saida: TipoOutput, mencoes: string): string[] {
  const md = descricao?.trim();
  if (!md) return [];
  const doModelo = secoes(md, 2).filter((s) => paraChave(s.titulo) in SECOES);
  if (!doModelo.length) return [`Descrição do projeto:\n${md.slice(0, 3_000)}`];

  const texto = palavras(mencoes);
  const linhas: string[] = [];
  for (const s of doModelo) {
    const chave = paraChave(s.titulo);
    if (!SECOES[chave]!(saida) || !s.corpo) continue;
    if (chave !== "personagens") {
      linhas.push(`Projeto — ${s.titulo}:\n${cortar(s.corpo)}`);
      continue;
    }
    const presentes = secoes(s.corpo, 3).filter((p) => nomesDoPersonagem(p.titulo).some((n) => texto.includes(palavras(n))));
    if (!presentes.length) continue;
    const aviso = saida === "AUDIO" ? "" : " (o modelo não sabe quem são pelo nome: descreva-os pela aparência)";
    linhas.push(`Projeto — personagens desta geração${aviso}:\n${presentes.map((p) => `${p.titulo}\n${cortar(p.corpo)}`).join("\n\n")}`);
  }
  return linhas;
}
