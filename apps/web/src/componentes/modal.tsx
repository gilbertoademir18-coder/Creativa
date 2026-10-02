import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Aviso, Botao } from "./ui.tsx";

/**
 * A janela modal do app, sobre o `<dialog>` nativo (veio do Trimly).
 *
 * Nativo e não uma div com `position: fixed`: o `showModal()` já entrega foco
 * preso dentro da janela, o resto da página inerte e o `::backdrop`.
 *
 * Só o × fecha. Clique fora e Esc estão desligados de propósito: fechar sem
 * querer no meio de um cadastro perde o que estava digitado.
 */
export function Modal({
  aberto,
  titulo,
  largura = "normal",
  aoFechar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  largura?: "normal" | "larga" | "enorme";
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    // `open` evita chamar showModal() num diálogo já aberto, que lança.
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  const larguras = { normal: "w-[32rem]", larga: "w-[56rem]", enorme: "w-[min(90rem,92vw)]" };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => e.preventDefault()}
      onClose={aoFechar}
      aria-label={titulo}
      className={`m-auto max-h-[90vh] max-w-[95vw] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/70 ${larguras[largura]}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
        <h2 className="font-semibold">{titulo}</h2>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="flex size-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="size-4" />
        </button>
      </div>
      {/*
        O conteúdo só existe enquanto a janela está aberta: toda abertura
        começa limpa, sem o estado da edição anterior.
      */}
      <div className="max-h-[calc(90vh-3.5rem)] overflow-y-auto p-5">{aberto && children}</div>
    </dialog>
  );
}

/** Pergunta antes de apagar. Mostra o erro do servidor (ex.: 409) sem fechar. */
export function ConfirmarExclusao({
  aberto,
  titulo,
  texto,
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  texto: React.ReactNode;
  aoConfirmar: () => Promise<void>;
  aoFechar: () => void;
}) {
  return (
    <Modal aberto={aberto} titulo={titulo} aoFechar={aoFechar}>
      <CorpoConfirmar texto={texto} aoConfirmar={aoConfirmar} aoFechar={aoFechar} />
    </Modal>
  );
}


function CorpoConfirmar({
  texto,
  aoConfirmar,
  aoFechar,
}: {
  texto: React.ReactNode;
  aoConfirmar: () => Promise<void>;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-zinc-300">{texto}</div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao
          variante="perigo"
          carregando={apagando}
          onClick={async () => {
            setApagando(true);
            setErro(null);
            try {
              await aoConfirmar();
            } catch (e) {
              setErro((e as Error).message);
              setApagando(false);
            }
          }}
        >
          Excluir
        </Botao>
      </div>
    </div>
  );
}
