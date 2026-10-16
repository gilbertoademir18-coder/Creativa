import { Check, ChevronRight, GalleryHorizontal, Maximize2 } from "lucide-react";
import { Fragment } from "react";
import { pipelinesApi } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import type { PipelineResolvido, TipoOutput } from "../tipos.ts";
import { Miniatura } from "./midia.tsx";
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
 * A etapa em que o shot está: a primeira que ainda não tem escolhida. Etapa
 * com escolhida está feita — passa para a seguinte. Se todas estiverem (até o
 * vídeo, que também se escolhe), a última. É a que o Gerador abre ao entrar
 * no shot (ou no F5).
 */
export function etapaDaVez(p: PipelineResolvido, rascunhos: Record<string, { escolhido?: string | null }>): string {
  const daVez = p.etapas.find((e) => !rascunhos[e.chave]?.escolhido);
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

export type EstadoEtapa = {
  outputs: number;
  escolhida: boolean;
  /** A miniatura do escolhido (a prévia, quando houver): o que a etapa entregou. */
  miniatura?: { tipo: TipoOutput; arquivo: string };
};

/**
 * A trilha do pipeline, no topo do Gerador: um cartão por etapa, com a
 * miniatura do escolhido dela, ligados por setas — dá para ver de relance o
 * que já está pronto e como ficou. Clicar no cartão abre a etapa; o botão de
 * ampliar, na miniatura, abre o "Ver pipeline" naquela etapa.
 */
export function AbasEtapas({
  pipeline,
  atual,
  aoTrocar,
  estado,
  aoVerPipeline,
}: {
  pipeline: PipelineResolvido;
  atual: string;
  aoTrocar: (chave: string) => void;
  estado: (chave: string) => EstadoEtapa;
  /** O "Ver pipeline": os escolhidos de cada etapa, em sequência (aberto na etapa dada). Ausente: nada escolhido. */
  aoVerPipeline?: (chave?: string) => void;
}) {
  if (!temEtapas(pipeline)) return null;
  return (
    <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-3" title={`Pipeline: ${pipeline.nome}`}>
      {pipeline.etapas.map((e, n) => {
        const { outputs, escolhida, miniatura } = estado(e.chave);
        const aqui = e.chave === atual;
        return (
          <Fragment key={e.chave}>
            {n > 0 && <ChevronRight className="size-4 shrink-0 text-zinc-600" />}
            <div className="group relative min-w-0 max-w-32 flex-1">
              <button
                type="button"
                onClick={() => aoTrocar(e.chave)}
                aria-current={aqui}
                className={`flex w-full flex-col gap-1 rounded-lg border p-1 text-left transition-colors ${
                  aqui ? "border-violet-500 bg-violet-950/40" : "border-zinc-800 hover:border-zinc-600"
                }`}
              >
                <span className="relative block aspect-video w-full overflow-hidden rounded-md bg-zinc-950">
                  {miniatura ? (
                    <Miniatura tipo={miniatura.tipo} arquivo={miniatura.arquivo} ajuste="contain" />
                  ) : (
                    <span className="flex h-full items-center justify-center px-1 text-center text-[11px] leading-tight text-zinc-600">
                      {outputs ? `${outputs} output${outputs > 1 ? "s" : ""}, nenhum escolhido` : "vazia"}
                    </span>
                  )}
                  {escolhida && (
                    <span className="absolute top-1 left-1 flex size-4 items-center justify-center rounded-full bg-violet-600" title="Escolhida">
                      <Check className="size-3 text-white" />
                    </span>
                  )}
                </span>
                <span className={`flex items-center gap-1 px-0.5 text-xs ${aqui ? "text-zinc-100" : "text-zinc-400"}`}>
                  <span className="font-mono text-[11px] text-zinc-600 tabular-nums">{n + 1}</span>
                  <span className="truncate">{e.nome}</span>
                  {outputs > 0 && (
                    <span className="ml-auto shrink-0 text-[11px] text-zinc-600 tabular-nums" title={`${outputs} output${outputs > 1 ? "s" : ""} nesta etapa`}>
                      {outputs}
                    </span>
                  )}
                </span>
              </button>
              {miniatura && aoVerPipeline && (
                <button
                  type="button"
                  onClick={() => aoVerPipeline(e.chave)}
                  title="Ver no pipeline (← → passam pelas etapas)"
                  className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-zinc-200 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:bg-black/85"
                >
                  <Maximize2 className="size-3.5" />
                </button>
              )}
            </div>
          </Fragment>
        );
      })}
      {aoVerPipeline && (
        <button
          type="button"
          onClick={() => aoVerPipeline()}
          title="Os escolhidos de cada etapa, um depois do outro (← →)"
          className="ml-auto flex shrink-0 flex-col items-center justify-center gap-1 self-stretch rounded-lg border border-zinc-800 px-2.5 text-[11px] leading-tight text-violet-300 transition-colors hover:border-violet-500/60 hover:bg-violet-950/40 hover:text-violet-200"
        >
          <GalleryHorizontal className="size-5" />
          <span className="text-center">
            Ver
            <br />
            pipeline
          </span>
        </button>
      )}
    </div>
  );
}
