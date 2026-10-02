import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { projetosApi } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import { Seletor } from "./ui.tsx";

/**
 * Escolha de projeto para filtros: "Todos", "Sem projeto" (os soltos) ou um
 * projeto. Os valores são os que a API entende: "", "sem" ou o id.
 */
export function FiltroProjeto({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const { dados: projetos } = useCarregar(() => projetosApi.listar(), []);
  return (
    <Seletor value={valor} onChange={(e) => aoMudar(e.target.value)} className="w-56">
      <option value="">Todos os projetos</option>
      <option value="sem">Sem projeto</option>
      {projetos?.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </Seletor>
  );
}

/**
 * Escolha de projeto para formulários: um projeto ou nenhum. O valor é o id
 * ou "" (solto).
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
 * Busca por nome. Espera a pessoa parar de digitar (300 ms) antes de mudar
 * o filtro: sem isso cada letra seria uma ida ao servidor.
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
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={dica}
        className="h-9 w-64 rounded-lg border border-zinc-700 bg-zinc-900 pr-3 pl-9 text-sm placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none"
      />
    </div>
  );
}
