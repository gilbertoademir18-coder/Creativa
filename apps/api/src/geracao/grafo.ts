import { alvosDe, type Alvo, type Campo, type GrafoApi, type Valores } from "./definicoes.ts";

/*
 * O grafo de um workflow e os campos que mexem nele.
 *
 * O grafo é guardado como veio da ferramenta (no ComfyUI, o "Export (API)").
 * Gerar é copiar o grafo e escrever o valor de cada campo nos alvos dele —
 * o resto do grafo, o que é fixo de propósito, nunca muda.
 */

/** É o formato API do ComfyUI? Senão, diz o que está errado (ex.: o formato de tela). */
export function erroDoGrafo(g: unknown): string | null {
  if (!g || typeof g !== "object" || Array.isArray(g)) return "O arquivo não é um workflow (esperava um objeto JSON).";
  if ("nodes" in g && Array.isArray((g as { nodes: unknown }).nodes)) {
    return "Esse é o formato de tela do ComfyUI. Exporte no formato API: menu Workflow → Export (API).";
  }
  const nos = Object.entries(g as Record<string, unknown>);
  if (!nos.length) return "O workflow está vazio.";
  for (const [id, no] of nos) {
    const n = no as { class_type?: unknown; inputs?: unknown };
    if (typeof n?.class_type !== "string" || !n.inputs || typeof n.inputs !== "object") {
      return `O nó ${id} não tem class_type e inputs — o arquivo é mesmo um Export (API) do ComfyUI?`;
    }
  }
  return null;
}

/** Entrada ligada a outro nó (["7", 0]): vem de um fio, não dá para preencher. */
const ehLigacao = (v: unknown) => Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "number";

function erroDoAlvo(grafo: GrafoApi, a: Alvo, campo: string): string | null {
  const no = grafo[a.no];
  if (!no) return `“${campo}”: o nó ${a.no} não existe no grafo.`;
  if (!(a.entrada in no.inputs)) return `“${campo}”: o nó ${a.no} (${no.class_type}) não tem a entrada “${a.entrada}”.`;
  if (ehLigacao(no.inputs[a.entrada])) return `“${campo}”: a entrada “${a.entrada}” do nó ${a.no} vem de um fio — não dá para preencher.`;
  return null;
}

/**
 * Confere os campos contra o grafo: chaves únicas, alvos que existem e são
 * preenchíveis, padrões que estão nas opções, um campo só para o assistente.
 * Devolve o primeiro problema, na língua da tela, ou null.
 */
export function erroDosCampos(grafo: GrafoApi, campos: Campo[]): string | null {
  const chaves = new Set<string>();
  for (const c of campos) {
    if (chaves.has(c.chave)) return `Dois campos com a chave “${c.chave}”.`;
    chaves.add(c.chave);
    for (const a of alvosDe(c)) {
      const e = erroDoAlvo(grafo, a, c.rotulo);
      if (e) return e;
    }
    if (c.tipo === "opcoes" && !c.opcoes.some((o) => o.valor === c.padrao)) return `“${c.rotulo}”: o padrão não está entre as opções.`;
    if (c.tipo === "tamanho" && !c.opcoes.some((o) => o.valor === c.padrao)) return `“${c.rotulo}”: o padrão não está entre os tamanhos.`;
    if (c.tipo === "numero" && c.min !== undefined && c.max !== undefined && c.min > c.max) return `“${c.rotulo}”: o mínimo é maior que o máximo.`;
    if (c.tipo === "texto" && c.palavras && c.palavras.min > c.palavras.max) return `“${c.rotulo}”: a faixa de palavras está invertida.`;
  }
  if (campos.filter((c) => c.tipo === "texto" && c.assistivel).length > 1) return "Só um campo de texto pode ser o do assistente de prompt.";
  return null;
}

/** Copia o grafo e escreve o valor de cada campo nos alvos dele. */
export function montarGrafo(grafo: GrafoApi, campos: Campo[], v: Valores): GrafoApi {
  const g = structuredClone(grafo);
  const escrever = (alvos: Alvo[], valor: unknown) => {
    for (const a of alvos) g[a.no]!.inputs[a.entrada] = valor;
  };
  for (const c of campos) {
    const valor = v[c.chave];
    if (c.tipo === "tamanho") {
      const o = c.opcoes.find((x) => x.valor === valor) ?? c.opcoes.find((x) => x.valor === c.padrao) ?? c.opcoes[0]!;
      escrever(c.largura, o.largura);
      escrever(c.altura, o.altura);
    } else {
      escrever(c.alvos, valor);
    }
  }
  return g;
}
