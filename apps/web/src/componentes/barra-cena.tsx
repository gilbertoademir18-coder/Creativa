import { Clapperboard, Film, Plus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { cenasApi, videosApi } from "../api.ts";
import type { Cena, VideoDetalhe } from "../tipos.ts";
import { BotaoEditarShot } from "./editar-shot.tsx";
import { BotaoPainelCena } from "./painel-cena.tsx";
import { BotaoPainelVideo } from "./painel-video.tsx";

/*
 * A barra do caminho até o shot: aparece embaixo da barra do projeto, em todo
 * shot. Uma linha para a cena (com os shots dela) e, quando a cena está num
 * vídeo, outra linha acima para o vídeo (com as cenas dele) — no mesmo bloco,
 * sem borda entre as duas, para não virar faixa sobre faixa. Neutra de
 * propósito: a violeta é o projeto, esta é o que está dentro dele.
 *
 * Não existe mais página de cena nem de vídeo: o que era delas (storyboard,
 * sinopse, ordem, renomear, excluir) mora nos painéis que esta barra abre.
 * `/cenas/:id` manda para o último shot trabalhado, e `/videos/:id` para o
 * shot mais recente do vídeo inteiro.
 */

type Contexto = {
  id: string | null;
  setId: (id: string | null) => void;
  cena: Cena | null;
  /** O vídeo da cena, carregado à parte: a cena só traz o nome dele, não as irmãs. */
  video: VideoDetalhe | null;
  /** Para o painel trocar a cena em memória, sem ida extra ao servidor. */
  setCena: (c: Cena) => void;
  /** Para a página do shot avisar que mexeu nos shots (renomeou, excluiu). */
  recarregar: () => void;
  /** Sobe a cada recarga: a página do shot usa para se recarregar junto. */
  recarga: number;
};

const CenaAtual = createContext<Contexto>({
  id: null,
  setId: () => {},
  cena: null,
  video: null,
  setCena: () => {},
  recarregar: () => {},
  recarga: 0,
});

export function ProvedorCenaAtual({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const [cena, setCena] = useState<Cena | null>(null);
  const [video, setVideo] = useState<VideoDetalhe | null>(null);
  const [recarga, setRecarga] = useState(0);
  const recarregar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    if (!id) {
      setCena(null);
      return;
    }
    let vivo = true;
    cenasApi
      .ler(id)
      .then((c) => vivo && setCena(c))
      .catch(() => vivo && setCena(null));
    return () => {
      vivo = false;
    };
  }, [id, recarga]);

  // O vídeo vem depois da cena, porque é ela que diz qual é.
  const videoId = cena?.video?.id ?? null;
  useEffect(() => {
    if (!videoId) {
      setVideo(null);
      return;
    }
    let vivo = true;
    videosApi
      .ler(videoId)
      .then((v) => vivo && setVideo(v))
      .catch(() => vivo && setVideo(null));
    return () => {
      vivo = false;
    };
  }, [videoId, recarga]);

  return (
    <CenaAtual.Provider value={{ id, setId, cena, video, setCena, recarregar, recarga }}>{children}</CenaAtual.Provider>
  );
}

/** Diz ao Layout de que cena é a página aberta (null/undefined: de nenhuma). */
export function useCenaAtual(id: string | null | undefined) {
  const { setId } = useContext(CenaAtual);
  const valido = id ?? null;
  useEffect(() => {
    setId(valido);
    return () => setId(null);
  }, [valido, setId]);
}

/**
 * O contador de recargas da cena. A página do shot põe na dependência do
 * carregamento: editar o shot pela barra tem de refletir na página também.
 */
export function useRecargaCena() {
  return useContext(CenaAtual).recarga;
}

/** A barra em si, desenhada pelo Layout quando a página é de um shot. */
export function BarraCena() {
  const { id, cena, video, setCena, recarregar } = useContext(CenaAtual);
  const navegar = useNavigate();
  // Qual shot acender vem da URL: o Layout desenha a barra e não sabe da página.
  const shotAtivo = useLocation().pathname.match(/^\/shots\/([^/]+)/)?.[1];
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState(false);
  const [painelVideo, setPainelVideo] = useState(false);

  if (!id) return null;

  async function novoShot() {
    setCriando(true);
    setErro(null);
    try {
      const novo = await cenasApi.novoShot(id!);
      recarregar();
      navegar(`/shots/${novo.id}`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="flex flex-col border-b border-zinc-800 bg-zinc-900/60">
      {/* A linha do vídeo, quando a cena está num: as cenas irmãs, sem borda
          abaixo — vídeo e cena são um bloco só, não duas faixas. */}
      {video && (
        <div className="flex items-center gap-4 px-8 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setPainelVideo(true)}
            title="Abrir o painel do vídeo: sinopse, ordem das cenas, renomear e excluir"
            className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white"
          >
            <Film className="size-4 text-zinc-500" />
            <span className="max-w-64 truncate">{video.nome}</span>
          </button>
          <span className="h-4 w-px bg-zinc-800" />
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {video.cenas.map((c) => (
              <Link
                key={c.id}
                to={`/cenas/${c.id}`}
                className={`shrink-0 rounded-md px-2.5 py-0.5 text-sm transition-colors ${
                  c.id === id ? "bg-zinc-700/60 font-medium text-zinc-100" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {c.nome}
              </Link>
            ))}
          </nav>
          <BotaoPainelVideo
            video={video}
            aberto={painelVideo}
            aoAbrir={() => setPainelVideo(true)}
            aoFechar={() => setPainelVideo(false)}
            aoMudar={recarregar}
          />
        </div>
      )}
      <div className={`flex items-center gap-4 px-8 ${video ? "pt-1 pb-2" : "py-2"}`}>
      <button
        type="button"
        onClick={() => setPainel(true)}
        title="Abrir o painel da cena: storyboard, ordem dos shots, renomear e excluir"
        className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold text-zinc-200 hover:text-white"
      >
        <Clapperboard className="size-4 text-zinc-500" />
        <span className="max-w-72 truncate">{cena?.nome ?? "…"}</span>
      </button>
      <span className="h-5 w-px bg-zinc-800" />
      {/* Pular de shot em shot da mesma cena, sem sair da cena. */}
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {(cena?.shots ?? []).map((s, i) => (
          <Link
            key={s.id}
            to={`/shots/${s.id}`}
            className={`shrink-0 rounded-md px-2.5 py-1 text-sm transition-colors ${
              s.id === shotAtivo ? "bg-violet-600/20 font-medium text-violet-200" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            {i + 1}. {s.nome}
          </Link>
        ))}
        {/* Cria no fim da cena, com o nome automático ("Shot 3"), e já abre. */}
        <button
          type="button"
          disabled={criando}
          onClick={novoShot}
          title="Criar um shot no fim desta cena"
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-violet-200 disabled:opacity-50"
        >
          <Plus className="size-4" /> Novo shot
        </button>
        {erro && <span className="shrink-0 self-center text-sm text-red-400">{erro}</span>}
      </nav>
      <BotaoEditarShot cena={cena} shotId={shotAtivo} aoMudar={recarregar} />
      <BotaoPainelCena
        cena={cena}
        aberto={painel}
        aoAbrir={() => setPainel(true)}
        aoFechar={() => setPainel(false)}
        aoSalvar={setCena}
        aoMudarShots={recarregar}
        // Sem vídeo, a cena não tem essa amarra; o vídeo já está carregado aqui.
        unica={!!video && video.cenas.length <= 1}
      />
      </div>
    </div>
  );
}
