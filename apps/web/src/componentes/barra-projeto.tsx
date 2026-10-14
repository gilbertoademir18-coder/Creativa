import { Clapperboard, Film, FolderKanban, Images, LayoutDashboard, MessagesSquare, Shapes, Sparkles } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { projetosApi } from "../api.ts";
import { BotaoDescricaoProjeto } from "./descricao-projeto.tsx";

/*
 * A barra do projeto: aparece embaixo da barra do ComfyUI em toda página de
 * dentro de um projeto (o projeto, um asset, um vídeo, uma cena, um shot e as
 * listas filtradas por ele), com os mesmos links fixos. Cada página diz de
 * que projeto ela é com `useProjetoAtual(id)`; o Layout desenha a barra.
 */

type Contexto = { id: string | null; setId: (id: string | null) => void };
const ProjetoAtual = createContext<Contexto>({ id: null, setId: () => {} });

export function ProvedorProjetoAtual({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  return <ProjetoAtual.Provider value={{ id, setId }}>{children}</ProjetoAtual.Provider>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Diz ao Layout de que projeto é a página aberta (null/undefined: de nenhum).
 * Aceita o filtro "projeto" das listas direto: "sem" e "" não são projeto.
 */
export function useProjetoAtual(id: string | null | undefined) {
  const { setId } = useContext(ProjetoAtual);
  const valido = id && UUID.test(id) ? id : null;
  useEffect(() => {
    setId(valido);
    return () => setId(null);
  }, [valido, setId]);
}

/** Os links fixos da barra, e as rotas em que cada um fica aceso. */
function links(id: string) {
  return [
    { rotulo: "Visão geral", para: `/projetos/${id}`, icone: LayoutDashboard, aceso: (p: string) => p.startsWith("/projetos/") },
    { rotulo: "Assets", para: `/assets?projeto=${id}`, icone: Shapes, aceso: (p: string) => p.startsWith("/assets") },
    // O vídeo aberto acende "Vídeos", não mais a visão geral do projeto.
    { rotulo: "Vídeos", para: `/videos?projeto=${id}`, icone: Film, aceso: (p: string) => p.startsWith("/videos") },
    { rotulo: "Cenas", para: `/cenas?projeto=${id}`, icone: Clapperboard, aceso: (p: string) => p.startsWith("/cenas") || p.startsWith("/shots/") },
    { rotulo: "Referências", para: `/referencias?projeto=${id}`, icone: Images, aceso: (p: string) => p.startsWith("/referencias") },
    { rotulo: "Outputs", para: `/outputs?projeto=${id}`, icone: Sparkles, aceso: (p: string) => p.startsWith("/outputs") },
    { rotulo: "Conversas", para: `/conversas?projeto=${id}`, icone: MessagesSquare, aceso: (p: string) => p.startsWith("/conversas") },
  ];
}

/** A barra em si, desenhada pelo Layout quando a página é de um projeto. */
export function BarraProjeto() {
  const { id } = useContext(ProjetoAtual);
  const { pathname } = useLocation();
  const [nome, setNome] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setNome(null);
    projetosApi
      .ler(id)
      .then((p) => vivo && setNome(p.nome))
      .catch(() => vivo && setNome("Projeto"));
    return () => {
      vivo = false;
    };
  }, [id]);

  if (!id) return null;
  return (
    <div className="flex items-center gap-4 border-b border-violet-900/60 bg-violet-950/50 px-8 py-2">
      <Link to={`/projetos/${id}`} className="flex min-w-0 shrink-0 items-center gap-2 text-sm font-semibold text-violet-100 hover:text-white" title="Visão geral do projeto">
        <FolderKanban className="size-4 text-violet-400" />
        <span className="max-w-72 truncate">{nome ?? "…"}</span>
      </Link>
      <span className="h-5 w-px bg-violet-800/60" />
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {links(id).map(({ rotulo, para, icone: Icone, aceso }) => {
          const ativo = aceso(pathname);
          return (
            <Link
              key={rotulo}
              to={para}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors ${
                ativo ? "bg-violet-500/25 font-medium text-violet-50" : "text-violet-300/80 hover:bg-violet-900/50 hover:text-violet-100"
              }`}
            >
              <Icone className="size-4" />
              {rotulo}
            </Link>
          );
        })}
      </nav>
      <BotaoDescricaoProjeto projeto={{ id }} />
    </div>
  );
}
