import { Check, Dot } from "lucide-react";
import { pipelinesApi } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import type { PipelineResolvido } from "../tipos.ts";
import { Seletor } from "./ui.tsx";

/*
 * As etapas do Gerador.
 *
 * Um shot costuma precisar de mais de uma geração — o primeiro quadro e, dele,
 * o vídeo. Cada etapa do pipeline é um compartimento do Gerador: formulário,
 * galeria e uma imagem escolhida, que é o que a etapa seguinte recebe.
 *
 * Pipeline de uma etapa (o embutido "Geração única", de quem não escolheu
 * nada) não mostra aba nenhuma: é a tela de sempre, sem nada a mais na frente.
 */

/** A chave do pipeline embutido — e da etapa dele. */
export const CHAVE_UNICA = "unica";

export const temEtapas = (p: PipelineResolvido) => p.etapas.length > 1;

/** O pipeline embutido, o mesmo que a API devolve para quem não escolheu nenhum. */
export const PIPELINE_UNICO: PipelineResolvido = {
  chave: CHAVE_UNICA,
  nome: "Geração única",
  descricao: "Uma geração só, sem etapas.",
  etapas: [{ chave: CHAVE_UNICA, nome: "Geração única", tipoGeracao: null, entradas: [] }],
};

/**
 * Em que etapa um output (ou uma execução) cai.
 *
 * O que foi gerado depois dos pipelines tem a etapa gravada. Nos de antes
 * vale o tipo de geração — é assim que o histórico do shot aparece no lugar
 * certo sem ninguém ter mexido nos registros que já existem. Vale também
 * para a etapa gravada que saiu do pipeline depois.
 *
 * null: não é de nenhuma etapa deste pipeline (um tipo que saiu dele).
 */
export function etapaDe(x: { etapa: string | null; tipoGeracao: string }, p: PipelineResolvido): string | null {
  if (x.etapa && p.etapas.some((e) => e.chave === x.etapa)) return x.etapa;
  const peloTipo = p.etapas.find((e) => e.tipoGeracao === x.tipoGeracao);
  // Uma etapa só (a geração única) recebe tudo: ela não fixa tipo.
  return peloTipo?.chave ?? (p.etapas.length === 1 ? p.etapas[0]!.chave : null);
}

/** Alguma etapa adiante come a imagem escolhida desta? Só aí vale escolher uma. */
export const alimentaOutra = (p: PipelineResolvido, chave: string) =>
  p.etapas.some((e) => e.entradas.some((en) => en.daEtapa === chave));

/**
 * A etapa em que o shot está: a primeira que ainda não tem imagem escolhida.
 * Etapa que alimenta outra e já tem a escolhida está feita — passa para a
 * seguinte. Se todas estiverem, a última (o vídeo, que não alimenta ninguém).
 * É a que o Gerador abre ao entrar no shot (ou no F5).
 */
export function etapaDaVez(p: PipelineResolvido, rascunhos: Record<string, { escolhido?: string | null }>): string {
  const daVez = p.etapas.find((e) => !(alimentaOutra(p, e.chave) && rascunhos[e.chave]?.escolhido));
  return (daVez ?? p.etapas.at(-1)!).chave;
}

/** As entradas desta etapa, com o nome da etapa de onde cada uma vem. */
export function entradasDe(p: PipelineResolvido, chave: string) {
  const etapa = p.etapas.find((e) => e.chave === chave);
  return (etapa?.entradas ?? []).map((en) => ({
    ...en,
    nomeDaEtapa: p.etapas.find((e) => e.chave === en.daEtapa)?.nome ?? en.daEtapa,
  }));
}

/**
 * A escolha do pipeline, no "Editar shot" e no "Editar projeto".
 *
 * No shot, vazio quer dizer "herda o padrão do projeto" — assim mudar o
 * padrão vale na hora para todos os que não escolheram o seu. No projeto,
 * vazio é a geração única mesmo.
 */
export function SeletorPipeline({
  valor,
  aoMudar,
  /** Só no shot: a chave do pipeline do projeto, que é o que ele herda. */
  heranca,
}: {
  valor: string | null;
  aoMudar: (chave: string | null) => void;
  heranca?: { chave: string | null };
}) {
  const lista = useCarregar(() => pipelinesApi.listar(), []);
  const nomeDe = (chave: string | null) =>
    !chave || chave === CHAVE_UNICA ? PIPELINE_UNICO.nome : (lista.dados?.find((p) => p.chave === chave)?.nome ?? chave);
  return (
    <Seletor value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)}>
      {heranca ? (
        <>
          <option value="">Herdar do projeto ({nomeDe(heranca.chave)})</option>
          <option value={CHAVE_UNICA}>Geração única</option>
        </>
      ) : (
        <option value="">Geração única</option>
      )}
      {(lista.dados ?? []).map((p) => (
        <option key={p.chave} value={p.chave}>
          {p.nome}
        </option>
      ))}
      {/* Pipeline que sumiu do cadastro: some da lista, e o shot cai na geração única. */}
      {valor && valor !== CHAVE_UNICA && lista.dados && !lista.dados.some((p) => p.chave === valor) && (
        <option value={valor}>{valor} (não existe mais)</option>
      )}
    </Seletor>
  );
}

export type EstadoEtapa = { outputs: number; escolhida: boolean };

/**
 * A fileira de etapas, no topo do Gerador. O ponto de cada uma diz em que pé
 * está: vazia, com outputs, ou já com a imagem escolhida.
 */
export function AbasEtapas({
  pipeline,
  atual,
  aoTrocar,
  estado,
}: {
  pipeline: PipelineResolvido;
  atual: string;
  aoTrocar: (chave: string) => void;
  estado: (chave: string) => EstadoEtapa;
}) {
  if (!temEtapas(pipeline)) return null;
  return (
    <div className="flex items-stretch gap-1 border-b border-zinc-800 px-3 pt-1" title={`Pipeline: ${pipeline.nome}`}>
      {pipeline.etapas.map((e, n) => {
        const { outputs, escolhida } = estado(e.chave);
        const aqui = e.chave === atual;
        return (
          <button
            key={e.chave}
            type="button"
            onClick={() => aoTrocar(e.chave)}
            aria-current={aqui}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
              aqui ? "border-violet-500 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <span className="font-mono text-xs text-zinc-600 tabular-nums">{n + 1}</span>
            {e.nome}
            {escolhida ? (
              <span title="Imagem escolhida">
                <Check className="size-3.5 text-violet-400" />
              </span>
            ) : outputs ? (
              <span className="text-xs text-zinc-600 tabular-nums">{outputs}</span>
            ) : (
              <Dot className="size-3.5 text-zinc-700" />
            )}
          </button>
        );
      })}
    </div>
  );
}
