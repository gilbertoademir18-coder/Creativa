import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Aviso, Botao, Entrada } from "./ui.tsx";

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

/**
 * Pergunta antes de apagar. Mostra o erro do servidor (ex.: 409) sem fechar.
 *
 * Com `exigirDigitar`, o botão só acende depois que a pessoa digita a
 * palavra (ex.: "EXCLUIR") — para o que é caro de desfazer, um clique
 * distraído não basta.
 */
export function ConfirmarExclusao({
  aberto,
  titulo,
  texto,
  exigirDigitar,
  rotuloConfirmar = "Excluir",
  aoConfirmar,
  aoFechar,
}: {
  aberto: boolean;
  titulo: string;
  texto: React.ReactNode;
  exigirDigitar?: string;
  /** O texto do botão vermelho. */
  rotuloConfirmar?: string;
  aoConfirmar: () => Promise<void>;
  aoFechar: () => void;
}) {
  return (
    <Modal aberto={aberto} titulo={titulo} aoFechar={aoFechar}>
      <CorpoConfirmar texto={texto} exigirDigitar={exigirDigitar} rotuloConfirmar={rotuloConfirmar} aoConfirmar={aoConfirmar} aoFechar={aoFechar} />
    </Modal>
  );
}

function CorpoConfirmar({
  texto,
  exigirDigitar,
  rotuloConfirmar = "Excluir",
  aoConfirmar,
  aoFechar,
}: {
  texto: React.ReactNode;
  exigirDigitar?: string;
  /** O texto do botão vermelho. */
  rotuloConfirmar?: string;
  aoConfirmar: () => Promise<void>;
  aoFechar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const [digitado, setDigitado] = useState("");
  // Exata, em maiúsculas: digitar a palavra de propósito é o ponto.
  const liberado = !exigirDigitar || digitado.trim() === exigirDigitar;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!liberado) return;
        setApagando(true);
        setErro(null);
        try {
          await aoConfirmar();
        } catch (er) {
          setErro((er as Error).message);
          setApagando(false);
        }
      }}
    >
      <div className="text-sm text-zinc-300">{texto}</div>
      {exigirDigitar && (
        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          <span>
            Para confirmar, digite <b className="font-mono text-red-300">{exigirDigitar}</b>:
          </span>
          <Entrada value={digitado} onChange={(e) => setDigitado(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
        </label>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="perigo" carregando={apagando} disabled={!liberado}>
          {rotuloConfirmar}
        </Botao>
      </div>
    </form>
  );
}
