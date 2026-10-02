import { Clapperboard, FolderKanban, Images, Shapes, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";

/*
 * Tela cheia, feita para Full HD e QHD: menu fixo à esquerda e a página
 * ocupando todo o resto, com rolagem própria. Não há versão de celular —
 * o Creativa roda em monitor.
 */

const MENU = [
  { para: "/projetos", rotulo: "Projetos", icone: FolderKanban },
  { para: "/assets", rotulo: "Assets", icone: Shapes },
  { para: "/referencias", rotulo: "Referências", icone: Images },
  { para: "/cenas", rotulo: "Cenas", icone: Clapperboard },
  { para: "/geracoes", rotulo: "Gerações", icone: Sparkles },
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
        <div className="mt-auto flex flex-col gap-1.5 border-t border-zinc-800 px-5 py-4">
          <Selo rota="/api/comfyui/estado" nome="ComfyUI" />
          <Selo rota="/api/banco/estado" nome="Banco" />
        </div>
      </aside>
      <main className="min-w-0 overflow-y-auto bg-zinc-925">
        <Outlet />
      </main>
    </div>
  );
}

/** Pergunta à API, a cada 10 segundos, se uma dependência está no ar. */
function Selo({ rota, nome }: { rota: string; nome: string }) {
  const [noAr, setNoAr] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await fetch(rota);
        const j = (await r.json()) as { noAr: boolean };
        if (vivo) setNoAr(j.noAr);
      } catch {
        if (vivo) setNoAr(false);
      }
    };
    consultar();
    const id = setInterval(consultar, 10_000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [rota]);
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span className={`size-2 rounded-full ${noAr === null ? "bg-zinc-600" : noAr ? "bg-emerald-500" : "bg-red-500"}`} />
      {nome} {noAr === null ? "..." : noAr ? "no ar" : "fora do ar"}
    </div>
  );
}
