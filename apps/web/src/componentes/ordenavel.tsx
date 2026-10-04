import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Uma lista numerada com ↑ ↓ em cada linha: shots de uma cena, vídeos de
 * uma lista, cenas de um vídeo. Só desenha — quem usa guarda a ordem e
 * chama a API em `aoMover` (de preferência otimista: mexe na tela antes).
 */
export function ListaOrdenavel<T extends { id: string }>({
  itens,
  aoMover,
  linha,
}: {
  itens: T[];
  aoMover: (i: number, delta: -1 | 1) => void;
  /** O conteúdo de cada linha (normalmente um Link), entre o número e as setas. */
  linha: (item: T, i: number) => ReactNode;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {itens.map((item, i) => (
        <li key={item.id} className="flex items-stretch overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600">
          <span className="flex w-10 shrink-0 items-center justify-center bg-zinc-950 text-sm text-zinc-500 tabular-nums">{i + 1}</span>
          <div className="min-w-0 flex-1">{linha(item, i)}</div>
          <div className="flex flex-col border-l border-zinc-800">
            <button
              type="button"
              aria-label="Subir"
              disabled={i === 0}
              onClick={() => aoMover(i, -1)}
              className="flex flex-1 items-center px-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-20"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Descer"
              disabled={i === itens.length - 1}
              onClick={() => aoMover(i, 1)}
              className="flex flex-1 items-center px-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-20"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A lista com um item trocado de posição — para a reordenação otimista. */
export function movido<T>(lista: T[], i: number, delta: -1 | 1): T[] {
  const nova = [...lista];
  const [x] = nova.splice(i, 1);
  nova.splice(i + delta, 0, x!);
  return nova;
}
