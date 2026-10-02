import { Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { projetosApi } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { Seletor } from "./ui.tsx";

/*
 * Os campos de filtro do app. Regra de todos eles (está no CLAUDE.md): com
 * valor, aparece um × à direita que limpa o filtro com um clique — dá para
 * desfazer qualquer filtro só com o mouse, sem apagar texto nem abrir lista
 * atrás do "Todos".
 *
 * Filtro novo usa estes componentes, e não `Entrada`/`Seletor` direto.
 */

/** O × que limpa um filtro. Fica dentro do campo, encostado à direita. */
function BotaoLimpar({ aoLimpar, className = "right-2" }: { aoLimpar: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Limpar filtro"
      title="Limpar filtro"
      onClick={aoLimpar}
      className={`absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 ${className}`}
    >
      <X className="size-3.5" />
    </button>
  );
}

/**
 * Uma lista de escolha para filtro. A primeira opção é sempre a de "sem
 * filtro" (valor ""), com o rótulo de `todos`. O × fica antes da seta da
 * lista, que continua sendo do navegador.
 */
export function FiltroSelecao({
  valor,
  aoMudar,
  todos,
  largura = "w-56",
  children,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  todos: string;
  largura?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${largura}`}>
      <Seletor value={valor} onChange={(e) => aoMudar(e.target.value)} className={`w-full ${valor ? "pr-14" : ""}`}>
        <option value="">{todos}</option>
        {children}
      </Seletor>
      {valor && <BotaoLimpar aoLimpar={() => aoMudar("")} className="right-7" />}
    </div>
  );
}

/**
 * Filtro de projeto: "Todos", "Sem projeto" (os soltos) ou um projeto. Os
 * valores são os que a API entende: "", "sem" ou o id.
 */
export function FiltroProjeto({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const { dados: projetos } = useCarregar(() => projetosApi.listar(), []);
  return (
    <FiltroSelecao valor={valor} aoMudar={aoMudar} todos="Todos os projetos">
      <option value="sem">Sem projeto</option>
      {projetos?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </FiltroSelecao>
  );
}

/**
 * Escolha de projeto para formulários (não é filtro): um projeto ou nenhum.
 * O valor é o id ou "" (solto).
 */
export function EscolhaProjeto({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const { dados: projetos } = useCarregar(() => projetosApi.listar(), []);
  return (
    <Seletor value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">— Sem projeto —</option>
      {projetos?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </Seletor>
  );
}

/**
 * Busca por texto. Espera a pessoa parar de digitar (300 ms) antes de mudar
 * o filtro: sem isso cada letra seria uma ida ao servidor. O ×, ao
 * contrário, limpa na hora — é um clique, não uma digitação em andamento.
 */
export function FiltroBusca({ valor, aoMudar, dica = "Buscar por nome" }: { valor: string; aoMudar: (v: string) => void; dica?: string }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  useEffect(() => {
    if (texto === valor) return;
    const id = setTimeout(() => aoMudar(texto), 300);
    return () => clearTimeout(id);
  }, [texto]);
  return (
    <div className="relative w-72">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={dica}
        className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 pr-9 pl-9 text-sm placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none"
      />
      {texto && (
        <BotaoLimpar
          aoLimpar={() => {
            setTexto("");
            aoMudar("");
          }}
        />
      )}
    </div>
  );
}
