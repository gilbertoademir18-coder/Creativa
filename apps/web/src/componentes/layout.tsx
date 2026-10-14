import { Clapperboard, Film, FolderKanban, GitBranch, Images, Layers, MessagesSquare, Shapes, Sparkles, WandSparkles, Workflow } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { BarraComfy } from "./barra-comfy.tsx";
import { BarraCena, ProvedorCenaAtual } from "./barra-cena.tsx";
import { BarraProjeto, ProvedorProjetoAtual } from "./barra-projeto.tsx";
import { MenuProjetosFavoritos, ProvedorFavoritos } from "./projetos-favoritos.tsx";
import { BarraFila } from "./barra-fila.tsx";

/*
 * Tela cheia, feita para Full HD e QHD: menu fixo à esquerda, a barra do
 * ComfyUI fixa no topo, e a página ocupando todo o resto, com rolagem
 * própria. Não há versão de celular — o Creativa roda em monitor.
 */

/** O trabalho em cima; embaixo, a configuração do Gerador (o que dá para gerar e como). */
const MENU = [
  {
    titulo: null,
    itens: [
      { para: "/projetos", rotulo: "Projetos", icone: FolderKanban },
      { para: "/assets", rotulo: "Assets", icone: Shapes },
      { para: "/referencias", rotulo: "Referências", icone: Images },
      { para: "/videos", rotulo: "Vídeos", icone: Film },
      { para: "/cenas", rotulo: "Cenas", icone: Clapperboard },
      { para: "/outputs", rotulo: "Outputs", icone: Sparkles },
      { para: "/conversas", rotulo: "Conversas", icone: MessagesSquare },
    ],
  },
  {
    titulo: "Configuração",
    itens: [
      { para: "/tipos-geracao", rotulo: "Tipos de geração", icone: Layers },
      { para: "/pipelines", rotulo: "Pipelines", icone: GitBranch },
      { para: "/workflows", rotulo: "Workflows", icone: Workflow },
      { para: "/assistentes", rotulo: "Assistentes", icone: WandSparkles },
    ],
  },
];

export function Layout() {
  return (
    <ProvedorProjetoAtual>
    <ProvedorCenaAtual>
    <ProvedorFavoritos>
    <div className="grid h-screen grid-cols-[15rem_1fr] overflow-hidden">
      <aside className="flex flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">Creativa</span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
          <MenuProjetosFavoritos />
          {MENU.map(({ titulo, itens }) => (
            <div key={titulo ?? "trabalho"} className="flex flex-col gap-0.5">
              {titulo && <div className="mt-6 mb-1 px-3 text-xs font-medium tracking-wide text-zinc-600 uppercase">{titulo}</div>}
              {itens.map(({ para, rotulo, icone: Icone }) => (
                <NavLink
                  key={para}
                  to={para}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? "bg-violet-600/15 font-medium text-violet-200" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                    }`
                  }
                >
                  <Icone className="size-4.5" />
                  {rotulo}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="grid min-w-0 grid-rows-[auto_auto_auto_1fr_auto] overflow-hidden">
        <BarraComfy />
        <BarraProjeto />
        <BarraCena />
        <main className="min-w-0 overflow-y-auto bg-zinc-925">
          <Outlet />
        </main>
        <BarraFila />
      </div>
    </div>
    </ProvedorFavoritos>
    </ProvedorCenaAtual>
    </ProvedorProjetoAtual>
  );
}
