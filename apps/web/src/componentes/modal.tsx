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
  rodape,
}: {
  aberto: boolean;
  titulo: string;
  largura?: "normal" | "larga" | "enorme";
  aoFechar: () => void;
  children: React.ReactNode;
  /**
   * Barra fixa no pé da janela, fora do que rola — para as ações de uma
   * janela comprida (Salvar, Fechar) ficarem à vista em qualquer ponto do
   * conteúdo. Janela curta não precisa: os botões vão no próprio conteúdo.
   */
  rodape?: React.ReactNode;
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
      // Só o fechamento DESTA janela: o React repassa o "close" de uma janela
      // aberta dentro dela (o "Excluir?" do visor de outputs) para as de
      // cima, e a de fora fechava junto.
      onClose={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
      aria-label={titulo}
      // `open:flex`, nunca `flex` solto: o navegador esconde diálogo fechado
      // com `display: none`, e um `display` nosso ganha dele — todas as
      // janelas fechadas da página apareceriam de uma vez.
      className={`m-auto max-h-[90vh] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-0 text-zinc-100 backdrop:bg-black/70 open:flex ${larguras[largura]}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
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
        O respiro é do conteúdo, não de quem rola: padding no container que
        rola encolhe a área onde um filho `sticky` pode encostar (20px de
        cada lado), e o texto passava por essas duas faixas — por cima da
        barra do editor e por baixo do rodapé.

        O conteúdo só existe enquanto a janela está aberta: toda abertura
        começa limpa, sem o estado da edição anterior.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto">{aberto && <div className="p-5">{children}</div>}</div>
      {/*
        O rodapé fica FORA do que rola: assim ele está sempre à vista sem
        depender de `sticky`, e nada do texto pode aparecer embaixo dele.
      */}
      {rodape && <div className="shrink-0 border-t border-zinc-800 px-5 py-3">{aberto && rodape}</div>}
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
  // Maiúsculas ou minúsculas tanto faz: o que conta é digitar a palavra de
  // propósito, não acertar o Caps Lock.
  const liberado = !exigirDigitar || digitado.trim().toLowerCase() === exigirDigitar.toLowerCase();

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
