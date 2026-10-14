import { Clapperboard, Plus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { cenasApi } from "../api.ts";
import type { Cena } from "../tipos.ts";
import { BotaoEditarShot } from "./editar-shot.tsx";
import { BotaoPainelCena } from "./painel-cena.tsx";

/*
 * A barra da cena: aparece embaixo da barra do projeto em todo shot, com o
 * nome da cena e os shots dela. Neutra de propósito — a violeta é o projeto,
 * esta é a cena dentro dele; duas violetas coladas competiriam.
 *
 * Não existe mais página de cena: tudo o que era dela (storyboard, ordem dos
 * shots, renomear, excluir) mora no painel que esta barra abre, e `/cenas/:id`
 * manda para o último shot trabalhado.
 */

type Contexto = {
  id: string | null;
  setId: (id: string | null) => void;
  cena: Cena | null;
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
  setCena: () => {},
  recarregar: () => {},
  recarga: 0,
});

export function ProvedorCenaAtual({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const [cena, setCena] = useState<Cena | null>(null);
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

  return <CenaAtual.Provider value={{ id, setId, cena, setCena, recarregar, recarga }}>{children}</CenaAtual.Provider>;
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
  const { id, cena, setCena, recarregar } = useContext(CenaAtual);
  const navegar = useNavigate();
  // Qual shot acender vem da URL: o Layout desenha a barra e não sabe da página.
  const shotAtivo = useLocation().pathname.match(/^\/shots\/([^/]+)/)?.[1];
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState(false);

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
    <div className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-900/60 px-8 py-2">
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
      />
    </div>
  );
}
