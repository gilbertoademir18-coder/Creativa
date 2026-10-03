import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Star, Trash, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { outputsApi, urlArquivo } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { formatarBytes, formatarData } from "../rotulos.ts";
import type { Output, OutputDetalhe } from "../tipos.ts";
import { Miniatura } from "./midia.tsx";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { DescricaoDono } from "./referencias.tsx";
import { Aviso, Botao, Carregando } from "./ui.tsx";

/*
 * Outputs: o que o Gerador produziu. Cada um guarda tudo o que foi usado
 * para gerá-lo — o visor mostra isso, e "Usar estas configurações" devolve
 * ao Gerador para repetir ou variar.
 */

export const GRADE_OUTPUTS = "grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4";

/** O cartão da galeria: a imagem, a seed e a estrela de favorito. */
export function CartaoOutput({
  o,
  mostrarDono,
  aoAbrir,
  aoFavoritar,
}: {
  o: Output;
  mostrarDono?: boolean;
  aoAbrir: () => void;
  aoFavoritar: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-violet-500/60">
      <div className="relative">
        <button type="button" onClick={aoAbrir} className="block aspect-video w-full overflow-hidden bg-black">
          <Miniatura tipo={o.tipo} arquivo={o.arquivo} ajuste="contain" />
        </button>
        <BotaoFavorito
          favorito={o.favorito}
          aoMudar={aoFavoritar}
          className={`absolute top-2 right-2 ${o.favorito ? "" : "opacity-0 group-hover:opacity-100"}`}
        />
      </div>
      <button type="button" onClick={aoAbrir} className="flex w-full flex-col gap-0.5 px-3 py-2 text-left">
        {mostrarDono && <span className="truncate text-sm text-zinc-200">{o.asset?.nome ?? (o.shot && `${o.shot.cena.nome} › ${o.shot.nome}`)}</span>}
        <span className="flex justify-between gap-3 text-xs text-zinc-500">
          <span className="truncate">{o.tipoGeracaoNome}</span>
          <span className="shrink-0 tabular-nums">{formatarData(o.criadoEm)}</span>
        </span>
      </button>
    </div>
  );
}

function BotaoFavorito({ favorito, aoMudar, className = "" }: { favorito: boolean; aoMudar: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={aoMudar}
      title={favorito ? "Tirar dos favoritos" : "Favoritar — o favorito vira a capa do asset"}
      className={`flex size-8 items-center justify-center rounded-full bg-black/60 backdrop-blur transition-opacity hover:bg-black/85 ${className}`}
    >
      <Star className={`size-4 ${favorito ? "fill-amber-400 text-amber-400" : "text-zinc-200"}`} />
    </button>
  );
}

/**
 * O visor, numa janela: a imagem grande à esquerda (setas e ← → passam de
 * uma para outra) e, à direita, tudo o que foi usado para gerá-la.
 *
 * `aoUsar`: devolve as configurações ao Gerador (ou leva até ele).
 * `aoAlterar`: favoritou ou excluiu — quem abriu recarrega a lista.
 */
export function VisorOutputs({
  outputs,
  abertoId,
  aoMudar,
  aoFechar,
  aoUsar,
  aoAlterar,
  mostrarDono,
}: {
  outputs: Output[];
  abertoId: string | null;
  aoMudar: (id: string) => void;
  aoFechar: () => void;
  aoUsar: (o: OutputDetalhe) => void;
  aoAlterar: () => void;
  mostrarDono?: boolean;
}) {
  return (
    <Modal aberto={!!abertoId} titulo="Output" largura="enorme" aoFechar={aoFechar}>
      {abertoId && (
        <CorpoVisor
          outputs={outputs}
          abertoId={abertoId}
          aoMudar={aoMudar}
          aoFechar={aoFechar}
          aoUsar={aoUsar}
          aoAlterar={aoAlterar}
          mostrarDono={mostrarDono}
        />
      )}
    </Modal>
  );
}

function CorpoVisor({
  outputs,
  abertoId,
  aoMudar,
  aoFechar,
  aoUsar,
  aoAlterar,
  mostrarDono,
}: {
  outputs: Output[];
  abertoId: string;
  aoMudar: (id: string) => void;
  aoFechar: () => void;
  aoUsar: (o: OutputDetalhe) => void;
  aoAlterar: () => void;
  mostrarDono?: boolean;
}) {
  const { dados: o, erro, setDados } = useCarregar(() => outputsApi.ler(abertoId), [abertoId]);
  const [excluindo, setExcluindo] = useState(false);
  const i = outputs.findIndex((x) => x.id === abertoId);
  const varios = outputs.length > 1 && i >= 0;
  const ir = (delta: number) => {
    const proximo = outputs[(i + delta + outputs.length) % outputs.length];
    if (proximo) aoMudar(proximo.id);
  };

  useEffect(() => {
    if (!varios || excluindo) return;
    const tecla = (e: KeyboardEvent) => {
      // Setas dentro de um campo de texto são do campo.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") ir(-1);
      if (e.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  async function favoritar() {
    if (!o) return;
    await outputsApi.favoritar(o.id, !o.favorito);
    setDados({ ...o, favorito: !o.favorito });
    aoAlterar();
  }

  if (erro) return <Aviso>{erro}</Aviso>;
  // A imagem da lista já aparece enquanto os metadados chegam.
  const base = o ?? outputs[i];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_26rem] gap-6">
      <div className="flex flex-col gap-2">
        <div className="relative flex min-h-[50vh] items-center justify-center rounded-lg bg-black">
          {base && <img src={urlArquivo(base.arquivo)} alt="" className="max-h-[75vh] object-contain" />}
          {varios && (
            <>
              <BotaoSeta lado="esquerda" onClick={() => ir(-1)} />
              <BotaoSeta lado="direita" onClick={() => ir(1)} />
            </>
          )}
        </div>
        {varios && (
          <div className="flex justify-between text-xs text-zinc-500">
            <span className="tabular-nums">
              <b className="text-zinc-300">{i + 1}</b> de {outputs.length}
            </span>
            <span>← → para navegar</span>
          </div>
        )}
      </div>

      {!o ? (
        <Carregando />
      ) : (
        <div className="flex max-h-[78vh] min-w-0 flex-col gap-5 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-2">
            <Botao variante="primario" icone={<Wand2 className="size-4" />} onClick={() => aoUsar(o)} title="Leva tipo, workflow, assistente, prompt, seed e o resto para o Gerador">
              Usar estas configurações
            </Botao>
            <Botao icone={<Star className={`size-4 ${o.favorito ? "fill-amber-400 text-amber-400" : ""}`} />} onClick={favoritar}>
              {o.favorito ? "Favorito" : "Favoritar"}
            </Botao>
          </div>

          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {mostrarDono && (
              <Linha rotulo="Pertence a">
                <DescricaoDono r={o} />
              </Linha>
            )}
            <Linha rotulo="Tipo">{o.tipoGeracaoNome}</Linha>
            <Linha rotulo="Workflow">{o.workflowNome}</Linha>
            {o.modelo && <Linha rotulo="Modelo"><span className="font-mono text-xs">{o.modelo}</span></Linha>}
            {o.seed !== null && (
              <Linha rotulo="Seed">
                <span className="flex items-center gap-1.5 font-mono text-xs">
                  {o.seed} <BotaoCopiar texto={String(o.seed)} />
                </span>
              </Linha>
            )}
            {o.largura && <Linha rotulo="Tamanho">{o.largura} × {o.altura}{o.tamanhoBytes !== null && ` · ${formatarBytes(o.tamanhoBytes)}`}</Linha>}
            <Linha rotulo="Gerado em">{formatarData(o.criadoEm)}</Linha>
            {o.duracaoComfySeg !== null && <Linha rotulo="Levou">{o.duracaoComfySeg}s no ComfyUI</Linha>}
            {o.assistente && <Linha rotulo="Assistente">{o.assistente}</Linha>}
          </dl>

          {o.ideia && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Ideia (antes do assistente)</span>
              <p className="rounded-lg border border-violet-500/20 bg-violet-950/20 p-3 text-sm whitespace-pre-wrap text-zinc-300">{o.ideia}</p>
            </div>
          )}

          <Parametros o={o} />

          <details className="rounded-lg border border-zinc-800 bg-zinc-900/50 text-sm">
            <summary className="cursor-pointer px-3 py-2 text-zinc-400 hover:text-zinc-200">Grafo enviado ao ComfyUI (formato API)</summary>
            <div className="relative border-t border-zinc-800">
              <BotaoCopiar texto={JSON.stringify(o.grafoEnviado, null, 2)} className="absolute top-2 right-2" />
              <pre className="max-h-80 overflow-auto p-3 font-mono text-xs text-zinc-400">{JSON.stringify(o.grafoEnviado, null, 2)}</pre>
            </div>
          </details>

          <div className="mt-auto flex flex-wrap justify-between gap-2 border-t border-zinc-800 pt-4">
            <a href={urlArquivo(o.arquivo)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-violet-300 hover:underline">
              <ExternalLink className="size-4" /> Tamanho real numa aba nova
            </a>
            <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
              Excluir
            </Botao>
          </div>
        </div>
      )}

      {o && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir output"
          texto={
            <>
              Este output será excluído — a imagem é apagada de <span className="font-mono">D:\Creativa</span> e não dá para desfazer. As
              configurações dele (prompt, seed...) vão junto.
            </>
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await outputsApi.apagar(o.id);
            setExcluindo(false);
            // Passa para o próximo; se era o único, fecha o visor.
            const proximo = varios ? outputs[(i + 1) % outputs.length] : undefined;
            aoAlterar();
            if (proximo && proximo.id !== o.id) aoMudar(proximo.id);
            else aoFechar();
          }}
        />
      )}
    </div>
  );
}

/** Os valores de cada campo do workflow. O prompt vem inteiro, com botão de copiar. */
function Parametros({ o }: { o: OutputDetalhe }) {
  const entradas = Object.entries(o.parametros);
  if (!entradas.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {entradas.map(([chave, valor]) => {
        const rotulo = o.rotulos[chave] ?? chave;
        const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
        if (typeof valor === "string" && valor.length > 60) {
          return (
            <div key={chave} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{rotulo}</span>
                <BotaoCopiar texto={valor} />
              </div>
              <p className="max-h-72 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-300">
                {valor}
              </p>
            </div>
          );
        }
        return (
          <div key={chave} className="flex items-baseline gap-3 text-sm">
            <span className="w-28 shrink-0 text-xs font-medium tracking-wide text-zinc-400 uppercase">{rotulo}</span>
            <span className="min-w-0 truncate font-mono text-xs text-zinc-300">{texto}</span>
          </div>
        );
      })}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className="min-w-0 truncate text-zinc-200">{children}</dd>
    </>
  );
}

function BotaoCopiar({ texto, className = "" }: { texto: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title="Copiar"
      onClick={async () => {
        await navigator.clipboard.writeText(texto).catch(() => {});
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1200);
      }}
      className={`flex size-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 ${className}`}
    >
      {copiado ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function BotaoSeta({ lado, onClick }: { lado: "esquerda" | "direita"; onClick: () => void }) {
  const Icone = lado === "esquerda" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "esquerda" ? "Output anterior" : "Próximo output"}
      className={`absolute top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-zinc-100 backdrop-blur hover:bg-black/85 ${lado === "esquerda" ? "left-3" : "right-3"}`}
    >
      <Icone className="size-7" />
    </button>
  );
}
