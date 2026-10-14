import { Clapperboard, Film, Plus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { cenasApi, videosApi } from "../api.ts";
import { comNumero, titulo } from "../rotulos.ts";
import type { Cena, VideoDetalhe } from "../tipos.ts";
import { BotaoEditarShot } from "./editar-shot.tsx";
import { ModalPainelCena } from "./painel-cena.tsx";
import { ModalPainelVideo } from "./painel-video.tsx";

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
  const [criandoCena, setCriandoCena] = useState(false);
  const [erroCena, setErroCena] = useState<string | null>(null);

  /*
   * A barra mora no Layout e nunca desmonta: sair da página tira o <dialog> do
   * DOM, mas o "aberto" continuaria guardado aqui, e ao voltar o painel
   * ressurgia sozinho (era o que acontecia logo depois de criar um vídeo, que
   * leva direto ao shot dele). Trocou de cena ou de vídeo, painel fechado.
   */
  useEffect(() => setPainel(false), [id]);
  useEffect(() => setPainelVideo(false), [video?.id]);
  // A posição da cena no vídeo; fora de vídeo não há irmãs, então vale a ordem.
  const numeroDaCena = video ? video.cenas.findIndex((c) => c.id === id) + 1 : (cena?.ordem ?? 0) + 1;

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

  async function novaCena() {
    if (!video) return;
    setCriandoCena(true);
    setErroCena(null);
    try {
      const nova = await videosApi.novaCena(video.id);
      recarregar();
      // A cena nasce com um shot; /cenas/<id> leva direto a ele.
      navegar(`/cenas/${nova.id}`);
    } catch (e) {
      setErroCena((e as Error).message);
    } finally {
      setCriandoCena(false);
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
            className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold text-zinc-300 underline-offset-4 hover:text-white hover:underline hover:decoration-dotted"
          >
            <Film className="size-4 text-zinc-500" />
            <span className="max-w-64 truncate">{video.nome}</span>
          </button>
          <span className="h-4 w-px bg-zinc-800" />
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {/* Numeradas pela posição, como os shots: o número é a ordem no
                vídeo, não parte do nome — reordenar renumera sozinho. */}
            {video.cenas.map((c, i) => (
              <Link
                key={c.id}
                to={`/cenas/${c.id}`}
                className={`shrink-0 rounded-md px-2.5 py-0.5 text-sm transition-colors ${
                  c.id === id ? "bg-zinc-700/60 font-medium text-zinc-100" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {comNumero(c.nome, i + 1)}
              </Link>
            ))}
            {/* Cria no fim do vídeo e já abre — a cena nasce sem nome e com um
                shot, então cai direto nele. */}
            <button
              type="button"
              disabled={criandoCena}
              onClick={novaCena}
              title="Criar uma cena no fim deste vídeo"
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-0.5 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-violet-200 disabled:opacity-50"
            >
              <Plus className="size-4" /> Nova cena
            </button>
            {erroCena && <span className="shrink-0 self-center text-sm text-red-400">{erroCena}</span>}
          </nav>
        </div>
      )}
      <div className={`flex items-center gap-4 px-8 ${video ? "pt-1 pb-2" : "py-2"}`}>
      <button
        type="button"
        onClick={() => setPainel(true)}
        title="Abrir o painel da cena: storyboard, ordem dos shots, renomear e excluir"
        className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold text-zinc-200 underline-offset-4 hover:text-white hover:underline hover:decoration-dotted"
      >
        <Clapperboard className="size-4 text-zinc-500" />
        <span className="max-w-72 truncate">{cena ? titulo("Cena", cena.nome, numeroDaCena) : "…"}</span>
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
            {comNumero(s.nome, i + 1)}
          </Link>
        ))}
        {/* Cria no fim da cena, sem nome, e já abre. */}
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
      </div>
      {/* Os painéis não têm botão: quem abre é o nome, na linha de cima. */}
      <ModalPainelVideo video={video} aberto={painelVideo} aoFechar={() => setPainelVideo(false)} aoMudar={recarregar} />
      <ModalPainelCena
        cena={cena}
        aberto={painel}
        aoFechar={() => setPainel(false)}
        aoSalvar={setCena}
        aoMudarShots={recarregar}
        // Sem vídeo, a cena não tem essa amarra; o vídeo já está carregado aqui.
        unica={!!video && video.cenas.length <= 1}
        numero={numeroDaCena}
      />
    </div>
  );
}
