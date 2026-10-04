import { lazy, Suspense, useState } from "react";
import { Modal } from "./modal.tsx";
import { Aviso, Botao, Carregando } from "./ui.tsx";

/** O editor visual só carrega quando a janela abre (~1,4 MB). */
const EditorMarkdown = lazy(() => import("./editor-markdown.tsx"));

/**
 * Um documento longo em markdown numa janela só dele, com o editor visual:
 * a descrição do projeto, a sinopse de um vídeo.
 *
 * Fechar com alterações não salvas pergunta antes — texto longo perdido por
 * um clique no × dói.
 */
export function ModalDocumento({
  titulo,
  valor,
  placeholder,
  aberto,
  aoFechar,
  aoSalvar,
}: {
  titulo: string;
  valor: string | null;
  placeholder?: string;
  aberto: boolean;
  aoFechar: () => void;
  /** Recebe o texto (null se ficou vazio). Se lançar, a janela mostra o erro e continua aberta. */
  aoSalvar: (texto: string | null) => Promise<void>;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const alterado = texto.trim() !== (valor ?? "").trim();

  // Reabriu: começa do que está salvo.
  const [ultimoAberto, setUltimoAberto] = useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setTexto(valor ?? "");
      setErro(null);
    }
  }

  function fechar() {
    if (alterado && !window.confirm("O texto tem alterações não salvas. Fechar e descartar?")) return;
    aoFechar();
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar(texto.trim() || null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo={titulo} largura="enorme" aoFechar={fechar}>
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <Suspense fallback={<Carregando />}>
            <EditorMarkdown valor={texto} aoMudar={setTexto} placeholder={placeholder} />
          </Suspense>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">{alterado ? "Alterações não salvas" : "Tudo salvo"}</span>
          <div className="flex gap-2">
            <Botao variante="fantasma" onClick={fechar}>
              Fechar
            </Botao>
            <Botao variante="primario" carregando={salvando} disabled={!alterado} onClick={salvar}>
              Salvar
            </Botao>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * O começo da descrição em texto corrido, sem a marcação do markdown — para
 * cartões e cabeçalhos, onde "## Personagens" e "**Camila**" ficariam feios.
 */
export function resumoMarkdown(md: string | null, max = 220): string {
  if (!md) return "";
  const texto = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    // A linha de baixo do cabeçalho de tabela: | --- | :---: |
    .replace(/^[\s|:-]*-[\s|:-]*$/gm, " ")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}…` : texto;
}
