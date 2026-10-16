/*
 * As opções da ideia de um assistente: grupos de escolha (Câmera, Plano,
 * Luz...) que o Gerador mostra como pílulas embaixo da ideia — uma por grupo.
 *
 * Quem edita escreve uma linha por grupo, e a dica (o termo para a LLM) vem
 * depois de um "=":
 *
 *   Câmera: parada | zoom in lento = slow push-in | zoom out lento = slow pull-out
 *   Ritmo: lento | normal | agitado
 *
 * As escolhidas vão à LLM anexadas à ideia (`ideiaComEscolhas`), logo depois
 * dela — e o output guarda esse texto inteiro como a ideia.
 */

export type GrupoOpcoes = { grupo: string; opcoes: { rotulo: string; dica?: string }[] };

/** As linhas do editor viram os grupos. Erro com o número da linha, para a tela mostrar. */
export function lerOpcoes(texto: string): { grupos: GrupoOpcoes[]; erro: string | null } {
  const grupos: GrupoOpcoes[] = [];
  const linhas = texto.split(/\r?\n/);
  for (let n = 0; n < linhas.length; n++) {
    const linha = linhas[n]!.trim().replace(/^-\s*/, "");
    if (!linha) continue;
    const doisPontos = linha.indexOf(":");
    if (doisPontos < 1) return { grupos, erro: `Linha ${n + 1}: falta o grupo antes de ":" (ex.: "Câmera: parada | zoom in")` };
    const grupo = linha.slice(0, doisPontos).trim();
    const opcoes = linha
      .slice(doisPontos + 1)
      .split("|")
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => {
        const igual = o.indexOf("=");
        if (igual < 0) return { rotulo: o };
        const dica = o.slice(igual + 1).trim();
        return dica ? { rotulo: o.slice(0, igual).trim(), dica } : { rotulo: o.slice(0, igual).trim() };
      });
    if (!opcoes.length) return { grupos, erro: `Linha ${n + 1}: "${grupo}" está sem opções (separe-as com "|")` };
    grupos.push({ grupo, opcoes });
  }
  return { grupos, erro: null };
}

/** Os grupos de volta em linhas, para o editor e para o .md. */
export const escreverOpcoes = (grupos: GrupoOpcoes[] | null | undefined) =>
  (grupos ?? []).map((g) => `${g.grupo}: ${g.opcoes.map((o) => (o.dica ? `${o.rotulo} = ${o.dica}` : o.rotulo)).join(" | ")}`).join("\n");

const MARCA = "Escolhas (siga-as):";

/**
 * A ideia com as escolhas anexadas, como vai à LLM e fica no output. Só valem
 * as escolhas dos grupos que o assistente de agora tem: trocar de assistente
 * não leva escolhas que ele não conhece.
 */
export function ideiaComEscolhas(ideia: string, escolhas: Record<string, string>, grupos: GrupoOpcoes[] | null | undefined): string {
  const linhas = (grupos ?? []).flatMap((g) => {
    const o = g.opcoes.find((x) => x.rotulo === escolhas[g.grupo]);
    return o ? [`- ${g.grupo}: ${o.rotulo}${o.dica ? ` (${o.dica})` : ""}`] : [];
  });
  return linhas.length ? `${ideia}\n\n${MARCA}\n${linhas.join("\n")}` : ideia;
}

/** O contrário, para "Usar estas configurações": a ideia que a pessoa escreveu e as escolhas. */
export function separarIdeia(texto: string): { ideia: string; escolhas: Record<string, string> } {
  const i = texto.indexOf(`\n\n${MARCA}\n`);
  if (i < 0) return { ideia: texto, escolhas: {} };
  const escolhas: Record<string, string> = {};
  for (const l of texto.slice(i + MARCA.length + 3).split("\n")) {
    const m = l.match(/^- ([^:]+): (.+?)(?: \(.*\))?$/);
    if (m) escolhas[m[1]!] = m[2]!;
  }
  return { ideia: texto.slice(0, i), escolhas };
}
