import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

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

/**
 * Uma grade em que se arrasta para reordenar — os cartões de projeto.
 *
 * Grade e não lista: aqui os itens são cartões lado a lado, e setinhas ↑ ↓ não
 * diriam o que fazem. Usa o arrastar nativo do navegador, sem biblioteca.
 *
 * Quem usa guarda a ordem e chama a API em `aoSoltar` — de preferência
 * otimista, mexendo na tela antes da resposta.
 */
export function GradeArrastavel<T extends { id: string }>({
  itens,
  className,
  aoSoltar,
  cartao,
}: {
  itens: T[];
  /** As classes da grade (a mesma `GRADE` de sempre). */
  className?: string;
  /** A lista inteira na ordem nova. Só chamada quando a ordem muda de fato. */
  aoSoltar: (ordem: T[]) => void;
  /**
   * O cartão. Recebe a `alca` para pôr onde quiser — é por ela que se arrasta;
   * o resto do cartão continua clicável, com links e botões funcionando.
   */
  cartao: (item: T, i: number, alca: ReactNode) => ReactNode;
}) {
  // Quem está sendo arrastado vai num ref, não no estado: o dragover vem logo
  // depois do dragstart e precisa do valor JÁ atualizado para chamar
  // preventDefault() — sem isso o navegador recusa o "soltar". O estado fica
  // só para o visual, que pode esperar um render.
  const pegandoRef = useRef<string | null>(null);
  const [pegando, setPegando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  /*
   * O quadro inteiro é `draggable`, para o navegador arrastar a imagem do
   * cartão todo — mas o arrasto só vale se começou na alça. Sem isto, puxar o
   * cartão em qualquer ponto arrastava, e um clique na estrela virava arrasto.
   */
  const daAlca = useRef(false);

  function soltarEm(idDestino: string) {
    const de = itens.findIndex((x) => x.id === pegandoRef.current);
    const para = itens.findIndex((x) => x.id === idDestino);
    pegandoRef.current = null;
    daAlca.current = false;
    setPegando(null);
    setAlvo(null);
    if (de < 0 || para < 0 || de === para) return;
    const nova = [...itens];
    const [movido] = nova.splice(de, 1);
    nova.splice(para, 0, movido!);
    aoSoltar(nova);
  }

  const alcaDe = (id: string) => (
    <span
      onMouseDown={() => (daAlca.current = true)}
      onMouseUp={() => (daAlca.current = false)}
      title="Arraste para mudar a ordem"
      aria-label="Arrastar para reordenar"
      className={`cursor-grab text-zinc-600 transition-colors hover:text-zinc-300 active:cursor-grabbing ${
        pegando === id ? "text-zinc-300" : ""
      }`}
    >
      <GripVertical className="size-4" />
    </span>
  );

  return (
    <div className={className}>
      {itens.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={(e) => {
            if (!daAlca.current) {
              e.preventDefault(); // não começou na alça: não é para arrastar
              return;
            }
            pegandoRef.current = item.id;
            setPegando(item.id);
            e.dataTransfer.effectAllowed = "move";
            // Sem isto, o Firefox não começa o arrasto.
            e.dataTransfer.setData("text/plain", item.id);
          }}
          onDragEnd={() => {
            pegandoRef.current = null;
            daAlca.current = false;
            setPegando(null);
            setAlvo(null);
          }}
          onDragOver={(e) => {
            if (!pegandoRef.current || pegandoRef.current === item.id) return;
            e.preventDefault(); // sem isto o navegador recusa o "soltar"
            e.dataTransfer.dropEffect = "move";
            setAlvo(item.id);
          }}
          onDragLeave={() => setAlvo((a) => (a === item.id ? null : a))}
          onDrop={(e) => {
            e.preventDefault();
            soltarEm(item.id);
          }}
          className={`h-full rounded-xl transition-opacity ${pegando === item.id ? "opacity-40" : ""} ${
            alvo === item.id ? "outline-2 outline-offset-2 outline-violet-500" : ""
          }`}
        >
          {cartao(item, i, alcaDe(item.id))}
        </div>
      ))}
    </div>
  );
}
