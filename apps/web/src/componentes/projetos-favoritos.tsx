import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { projetosApi } from "../api.ts";
import { useIdDoProjetoAtual } from "./barra-projeto.tsx";
import { iconeDoProjeto } from "./icones-projeto.tsx";
import type { Projeto } from "../tipos.ts";

/*
 * Os projetos favoritos, para o menu lateral — um clique e você está dentro.
 *
 * Mora num contexto porque quem marca a estrela é a página de projetos, e quem
 * mostra é o menu: sem isto, favoritar só apareceria no menu depois de um F5.
 * A lista vem pronta da API (`?favoritos=1`), na mesma ordem da página.
 */

type Contexto = { favoritos: Projeto[]; recarregar: () => void };
const Favoritos = createContext<Contexto>({ favoritos: [], recarregar: () => {} });

export function ProvedorFavoritos({ children }: { children: ReactNode }) {
  const [favoritos, setFavoritos] = useState<Projeto[]>([]);
  const [recarga, setRecarga] = useState(0);
  const recarregar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;
    projetosApi
      .listar({ favoritos: "1" })
      .then((ps) => vivo && setFavoritos(ps))
      // Sem favoritos no menu a vida segue: não vale avisar de erro aqui.
      .catch(() => vivo && setFavoritos([]));
    return () => {
      vivo = false;
    };
  }, [recarga]);

  return <Favoritos.Provider value={{ favoritos, recarregar }}>{children}</Favoritos.Provider>;
}

/** Os favoritos, para o menu desenhar. */
export function useFavoritos() {
  return useContext(Favoritos).favoritos;
}

/** Para a página de projetos avisar que a estrela mudou. */
export function useAvisarFavoritos() {
  return useContext(Favoritos).recarregar;
}

/**
 * A primeira seção do menu lateral: os projetos favoritos, um clique para
 * entrar em qualquer um. Some quando não há nenhum — seção vazia só ocuparia
 * a lateral, e a estrela fica na página de projetos para quem quiser marcar.
 */
export function MenuProjetosFavoritos() {
  const favoritos = useFavoritos();
  /*
   * Aceso enquanto a página for de dentro do projeto, e não só na visão
   * geral dele: entrar em Assets ou Cenas pela barra é continuar no mesmo
   * projeto, e o menu apagar ali dava a impressão de ter saído. Quem sabe
   * disso é o mesmo contexto que acende a barra.
   */
  const atual = useIdDoProjetoAtual();
  if (!favoritos.length) return null;
  return (
    <div className="mb-5 flex flex-col gap-0.5">
      <div className="mb-1 px-3 text-xs font-medium tracking-wide text-zinc-600 uppercase">Projetos</div>
      {favoritos.map((p) => {
        const Icone = iconeDoProjeto(p.icone);
        return (
        <NavLink
          key={p.id}
          to={`/projetos/${p.id}`}
          title={p.nome}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive || p.id === atual
                ? "bg-violet-600/15 font-medium text-violet-200"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            }`
          }
        >
          {/* Sem cor própria: herda a do item, como todo ícone do menu. */}
          <Icone className="size-4.5 shrink-0" />
          <span className="truncate">{p.nome}</span>
        </NavLink>
        );
      })}
    </div>
  );
}
