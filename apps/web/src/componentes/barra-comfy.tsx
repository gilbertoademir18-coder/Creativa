import { ExternalLink, LoaderCircle, Play, ScrollText, Square, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { ConfirmarExclusao, Modal } from "./modal.tsx";
import { Aviso } from "./ui.tsx";

type EstadoComfy = {
  noAr: boolean;
  versao: string | null;
  url: string;
  /** Iniciado pelo site e ainda subindo. */
  iniciando: boolean;
  /** Iniciado pelo site e não respondeu no prazo (5 min). */
  naoRespondeu: boolean;
  segundos: number | null;
};

/**
 * O estado do ComfyUI, sempre à vista no topo de toda página — é ele que
 * gera tudo —, com os botões de ligar e desligar.
 *
 * Quem liga e desliga é o servidor do Creativa, nesta máquina: dá para
 * subir o ComfyUI de qualquer PC do tailnet.
 *
 * Consulta a cada 5 s; enquanto sobe, a cada 2 s, para a barra virar verde
 * assim que ele responder.
 */
export function BarraComfy() {
  const [estado, setEstado] = useState<EstadoComfy | null>(null);
  const [semServidor, setSemServidor] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [parando, setParando] = useState(false);
  const [vendoLog, setVendoLog] = useState(false);
  const vivo = useRef(true);

  const consultar = useCallback(async () => {
    try {
      const e = await api<EstadoComfy>("/comfyui/estado");
      if (vivo.current) {
        setEstado(e);
        setSemServidor(false);
      }
    } catch {
      if (vivo.current) setSemServidor(true);
    }
  }, []);

  const subindo = !!estado?.iniciando;
  useEffect(() => {
    vivo.current = true;
    consultar();
    const id = setInterval(consultar, subindo ? 2_000 : 5_000);
    return () => {
      vivo.current = false;
      clearInterval(id);
    };
  }, [consultar, subindo]);

  async function iniciar() {
    setPedindo(true);
    setErro(null);
    try {
      setEstado(await api<EstadoComfy>("/comfyui/iniciar", { method: "POST" }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setPedindo(false);
    }
  }

  const desconectado = !!estado && !estado.noAr && !estado.iniciando;
  const cor = semServidor || desconectado ? "border-red-800 bg-red-900/35" : subindo ? "border-amber-800/70 bg-amber-900/25" : "border-zinc-800 bg-zinc-950";

  return (
    <div className={`flex h-10 items-center justify-end gap-3 border-b px-8 text-sm ${cor}`}>
      {erro && <span className="mr-auto text-red-300">{erro}</span>}

      {semServidor && (
        <span className="flex items-center gap-2 font-medium text-red-300">
          <Unplug className="size-4" /> Sem conexão com o servidor do Creativa
        </span>
      )}

      {!semServidor && estado === null && (
        <span className="flex items-center gap-2 text-zinc-500">
          <span className="size-2 rounded-full bg-zinc-600" /> Verificando o ComfyUI...
        </span>
      )}

      {!semServidor && estado?.noAr && (
        <>
          <span className="flex items-center gap-2 text-zinc-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            ComfyUI conectado
            {estado.versao && <span className="text-zinc-600">v{estado.versao}</span>}
          </span>
          <a
            href={estado.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ExternalLink className="size-3.5" />
            Abrir o ComfyUI
          </a>
          <BotaoBarra icone={<ScrollText className="size-3.5" />} onClick={() => setVendoLog(true)}>
            Log
          </BotaoBarra>
          <BotaoBarra icone={<Square className="size-3.5" />} onClick={() => setParando(true)}>
            Parar
          </BotaoBarra>
        </>
      )}

      {!semServidor && subindo && (
        <>
          <span className="flex items-center gap-2 font-medium text-amber-200">
            <LoaderCircle className="size-4 animate-spin" />
            Iniciando o ComfyUI...
            <span className="font-normal text-amber-200/60 tabular-nums">{estado?.segundos ?? 0}s</span>
          </span>
          <BotaoBarra icone={<ScrollText className="size-3.5" />} onClick={() => setVendoLog(true)}>
            Log
          </BotaoBarra>
        </>
      )}

      {!semServidor && desconectado && (
        <>
          <span className="flex items-center gap-2 font-medium text-red-300">
            <Unplug className="size-4" />
            {estado.naoRespondeu ? "O ComfyUI não respondeu em 5 minutos" : "ComfyUI desconectado"}
          </span>
          {estado.naoRespondeu && (
            <BotaoBarra icone={<ScrollText className="size-3.5" />} onClick={() => setVendoLog(true)}>
              Ver o log
            </BotaoBarra>
          )}
          <button
            type="button"
            onClick={iniciar}
            disabled={pedindo}
            className="inline-flex h-7 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {pedindo ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {estado.naoRespondeu ? "Tentar de novo" : "Iniciar o ComfyUI"}
          </button>
        </>
      )}

      <ConfirmarExclusao
        aberto={parando}
        titulo="Parar o ComfyUI"
        rotuloConfirmar="Parar o ComfyUI"
        texto={
          <>
            O ComfyUI será desligado e a GPU liberada. <b>Uma geração em andamento será interrompida.</b>
          </>
        }
        aoFechar={() => setParando(false)}
        aoConfirmar={async () => {
          setEstado(await api<EstadoComfy>("/comfyui/parar", { method: "POST" }));
          setParando(false);
        }}
      />
      <Modal aberto={vendoLog} titulo="Log do ComfyUI" largura="enorme" aoFechar={() => setVendoLog(false)}>
        <LogComfy />
      </Modal>
    </div>
  );
}

function BotaoBarra({ icone, onClick, children }: { icone: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
    >
      {icone}
      {children}
    </button>
  );
}

/**
 * As últimas linhas do log, atualizando a cada 2 s — dá para acompanhar a
 * partida (carregando nós, modelos...) de outro PC. Rola sozinho para o fim,
 * a não ser que a pessoa tenha subido para ler.
 */
function LogComfy() {
  const [linhas, setLinhas] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLPreElement>(null);
  const noFim = useRef(true);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const r = await api<{ linhas: string[] }>("/comfyui/log");
        if (vivo) setLinhas(r.linhas);
      } catch (e) {
        if (vivo) setErro((e as Error).message);
      }
    };
    ler();
    const id = setInterval(ler, 2_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const c = caixa.current;
    if (c && noFim.current) c.scrollTop = c.scrollHeight;
  }, [linhas]);

  if (erro) return <Aviso>{erro}</Aviso>;
  return (
    <pre
      ref={caixa}
      onScroll={(e) => {
        const c = e.currentTarget;
        noFim.current = c.scrollHeight - c.scrollTop - c.clientHeight < 40;
      }}
      className="h-[70vh] overflow-auto rounded-lg bg-black p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300"
    >
      {linhas === null ? "Carregando..." : linhas.length ? linhas.join("\n") : "O log está vazio — o ComfyUI ainda não foi iniciado pelo tray nem pelo site."}
    </pre>
  );
}
