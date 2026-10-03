import { Clapperboard, FolderKanban, Images, Shapes, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { BarraComfy } from "./barra-comfy.tsx";
import { BarraFila } from "./barra-fila.tsx";

/*
 * Tela cheia, feita para Full HD e QHD: menu fixo à esquerda, a barra do
 * ComfyUI fixa no topo, e a página ocupando todo o resto, com rolagem
 * própria. Não há versão de celular — o Creativa roda em monitor.
 */

const MENU = [
  { para: "/projetos", rotulo: "Projetos", icone: FolderKanban },
  { para: "/assets", rotulo: "Assets", icone: Shapes },
  { para: "/referencias", rotulo: "Referências", icone: Images },
  { para: "/cenas", rotulo: "Cenas", icone: Clapperboard },
  { para: "/outputs", rotulo: "Outputs", icone: Sparkles },
];

export function Layout() {
  return (
    <div className="grid h-screen grid-cols-[15rem_1fr] overflow-hidden">
      <aside className="flex flex-col border-r border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/favicon.svg" alt="" className="size-8 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">Creativa</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {MENU.map(({ para, rotulo, icone: Icone }) => (
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
        </nav>
        <div className="mt-auto border-t border-zinc-800 px-5 py-4">
          <SeloBanco />
        </div>
      </aside>
      <div className="grid min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden">
        <BarraComfy />
        <main className="min-w-0 overflow-y-auto bg-zinc-925">
          <Outlet />
        </main>
        <BarraFila />
      </div>
    </div>
  );
}

type Estado = { noAr: boolean };

/**
 * Pergunta à API, de tempos em tempos, se uma dependência está no ar.
 * `null` enquanto a primeira resposta não chega.
 */
function useEstado(rota: string, intervaloMs: number): Estado | null {
  const [estado, setEstado] = useState<Estado | null>(null);
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await fetch(rota);
        const j = (await r.json()) as Estado;
        if (vivo) setEstado(j);
      } catch {
        // Sem resposta da nossa API: daqui não dá para saber do ComfyUI.
        if (vivo) setEstado({ noAr: false });
      }
    };
    consultar();
    const id = setInterval(consultar, intervaloMs);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [rota, intervaloMs]);
  return estado;
}

function SeloBanco() {
  const banco = useEstado("/api/banco/estado", 10_000);
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span className={`size-2 rounded-full ${banco === null ? "bg-zinc-600" : banco.noAr ? "bg-emerald-500" : "bg-red-500"}`} />
      Banco {banco === null ? "..." : banco.noAr ? "no ar" : "fora do ar"}
    </div>
  );
}
