import { Check, ChevronDown, ChevronUp, ListOrdered, LoaderCircle, Square, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, urlArquivo } from "../api.ts";

type GeracaoDaFila = { id: string; titulo: string; tipoNome: string; dono: string | null };

type ItemFila = {
  rodadaId: string;
  status: "NA_FILA" | "EXECUTANDO";
  criadoEm: string;
  iniciadaEm: string | null;
  progresso: { valor: number; max: number } | null;
  geracao: GeracaoDaFila;
};

type Recente = {
  rodadaId: string;
  status: "CONCLUIDA" | "FALHOU" | "CANCELADA";
  concluidaEm: string;
  erro: string | null;
  capa: string | null;
  geracao: GeracaoDaFila;
};

type Fila = { itens: ItemFila[]; recentes: Recente[]; externos: number | null };

const CHAVE_ABERTA = "creativa:fila-aberta";

/** Lembra se a fila estava aberta — só conveniência deste navegador. */
function lerAberta(): boolean {
  try {
    return localStorage.getItem(CHAVE_ABERTA) === "1";
  } catch {
    return false;
  }
}

/**
 * A fila global de gerações, fixa no rodapé de toda página: dá para ir
 * enfileirando gerações e seguir trabalhando, de olho no que está rodando.
 *
 * Recolhida, é uma linha: quantas gerando/esperando e o progresso da atual.
 * Aberta, mostra cada rodada (com link e cancelar) e o que terminou nos
 * últimos 10 minutos, com a miniatura do resultado.
 */
export function BarraFila() {
  const [fila, setFila] = useState<Fila | null>(null);
  const [aberta, setAberta] = useState(lerAberta);
  const vivo = useRef(true);

  const consultar = useCallback(async () => {
    try {
      const f = await api<Fila>("/fila");
      if (vivo.current) setFila(f);
    } catch {
      // Sem servidor: a barra do topo já avisa.
    }
  }, []);

  const ocupada = !!fila?.itens.length;
  useEffect(() => {
    vivo.current = true;
    consultar();
    const id = setInterval(consultar, ocupada ? 1_500 : 5_000);
    return () => {
      vivo.current = false;
      clearInterval(id);
    };
  }, [consultar, ocupada]);

  function alternar() {
    setAberta((a) => {
      try {
        localStorage.setItem(CHAVE_ABERTA, a ? "0" : "1");
      } catch {
        // Sem armazenamento: só não lembra.
      }
      return !a;
    });
  }

  async function cancelar(rodadaId: string) {
    try {
      await api(`/fila/${rodadaId}/cancelar`, { method: "POST" });
    } finally {
      consultar();
    }
  }

  const itens = fila?.itens ?? [];
  const recentes = fila?.recentes ?? [];
  const rodando = itens.filter((i) => i.status === "EXECUTANDO");
  const esperando = itens.length - rodando.length;
  const atual = rodando[0];

  return (
    <div className="border-t border-zinc-800 bg-zinc-950">
      {aberta && (
        <div className="max-h-[45vh] overflow-y-auto border-b border-zinc-800 px-8 py-4">
          <div className="grid grid-cols-2 gap-8">
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Na fila ({itens.length})</h3>
              {itens.length === 0 && <p className="text-sm text-zinc-500">Nada esperando. Gere à vontade — cada “Gerar” entra aqui.</p>}
              {itens.map((i, n) => (
                <ItemNaFila key={i.rodadaId} item={i} posicao={n + 1} aoCancelar={() => cancelar(i.rodadaId)} />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Terminaram há pouco</h3>
              {recentes.length === 0 && <p className="text-sm text-zinc-500">Nada nos últimos 10 minutos.</p>}
              {recentes.map((r) => (
                <ItemRecente key={r.rodadaId} r={r} />
              ))}
            </div>
          </div>
        </div>
      )}

      <button type="button" onClick={alternar} className="flex h-11 w-full items-center gap-4 px-8 text-left text-sm hover:bg-zinc-900/60">
        <span className="flex shrink-0 items-center gap-2 font-medium text-zinc-300">
          <ListOrdered className="size-4 text-zinc-500" /> Fila
        </span>
        {itens.length === 0 ? (
          <span className="text-zinc-500">vazia</span>
        ) : (
          <>
            <span className="shrink-0 text-zinc-300 tabular-nums">
              {rodando.length > 0 && <b className="text-sky-300">{rodando.length} gerando</b>}
              {rodando.length > 0 && esperando > 0 && " · "}
              {esperando > 0 && `${esperando} esperando`}
            </span>
            {atual && (
              <span className="flex min-w-0 items-center gap-3">
                <span className="truncate text-zinc-400">{atual.geracao.titulo}</span>
                <Progresso item={atual} largura="w-48" />
              </span>
            )}
          </>
        )}
        {!!fila?.externos && <span className="shrink-0 text-xs text-amber-300/80">+{fila.externos} de fora do Creativa no ComfyUI</span>}
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-zinc-500">
          {recentes.length > 0 && !aberta && <span>{recentes.length} terminada(s) há pouco</span>}
          {aberta ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </span>
      </button>
    </div>
  );
}

function Progresso({ item, largura }: { item: ItemFila; largura: string }) {
  const p = item.progresso;
  const pct = item.status === "EXECUTANDO" && p?.max ? Math.round((p.valor / p.max) * 100) : null;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className={`h-1.5 overflow-hidden rounded-full bg-zinc-800 ${largura}`}>
        {item.status === "EXECUTANDO" && (
          <span
            className={`block h-full bg-sky-400 transition-all ${pct === null ? "w-1/3 animate-pulse" : ""}`}
            style={pct === null ? undefined : { width: `${pct}%` }}
          />
        )}
      </span>
      {pct !== null && <span className="w-9 text-xs text-sky-300 tabular-nums">{pct}%</span>}
    </span>
  );
}

function ItemNaFila({ item, posicao, aoCancelar }: { item: ItemFila; posicao: number; aoCancelar: () => void }) {
  const [cancelando, setCancelando] = useState(false);
  const executando = item.status === "EXECUTANDO";
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${executando ? "border-sky-900/70 bg-sky-950/30" : "border-zinc-800 bg-zinc-900/50"}`}>
      <span className="w-5 shrink-0 text-center text-xs text-zinc-500 tabular-nums">{posicao}</span>
      {executando ? <LoaderCircle className="size-4 shrink-0 animate-spin text-sky-300" /> : <span className="size-4 shrink-0 rounded-full border-2 border-zinc-700" />}
      <Link to={`/geracoes/${item.geracao.id}`} className="flex min-w-0 flex-1 flex-col hover:text-violet-300">
        <span className="truncate text-sm">{item.geracao.titulo}</span>
        <span className="truncate text-xs text-zinc-500">
          {item.geracao.tipoNome}
          {item.geracao.dono && ` · ${item.geracao.dono}`}
          {!executando && " · esperando a vez"}
        </span>
      </Link>
      {executando && <Progresso item={item} largura="w-28" />}
      <button
        type="button"
        title={executando ? "Interromper esta rodada" : "Tirar da fila"}
        disabled={cancelando}
        onClick={async () => {
          setCancelando(true);
          await aoCancelar();
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-red-950/60 hover:text-red-300 disabled:opacity-40"
      >
        {executando ? <Square className="size-3.5" /> : <X className="size-4" />}
      </button>
    </div>
  );
}

function ItemRecente({ r }: { r: Recente }) {
  const minutos = Math.max(0, Math.round((Date.now() - +new Date(r.concluidaEm)) / 60_000));
  return (
    <Link
      to={`/geracoes/${r.geracao.id}`}
      title={r.erro ?? undefined}
      className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 hover:border-zinc-600"
    >
      <span className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
        {r.capa && <img src={urlArquivo(r.capa)} alt="" className="size-full object-cover" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{r.geracao.titulo}</span>
        <span className="truncate text-xs text-zinc-500">
          {r.geracao.tipoNome}
          {r.geracao.dono && ` · ${r.geracao.dono}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs">
        {r.status === "CONCLUIDA" && <Check className="size-3.5 text-emerald-400" />}
        {r.status === "FALHOU" && <TriangleAlert className="size-3.5 text-red-400" />}
        <span className={r.status === "CONCLUIDA" ? "text-emerald-300" : r.status === "FALHOU" ? "text-red-300" : "text-zinc-500"}>
          {r.status === "CONCLUIDA" ? "Pronta" : r.status === "FALHOU" ? "Falhou" : "Cancelada"}
        </span>
        <span className="text-zinc-600">· {minutos === 0 ? "agora" : `${minutos} min`}</span>
      </span>
    </Link>
  );
}
