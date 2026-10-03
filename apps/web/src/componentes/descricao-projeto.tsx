import { lazy, Suspense, useState } from "react";
import { projetosApi } from "../api.ts";
import type { Projeto } from "../tipos.ts";
import { Modal } from "./modal.tsx";
import { Aviso, Botao, Carregando } from "./ui.tsx";

/** O editor visual só carrega quando a janela abre (~1 MB). */
const EditorMarkdown = lazy(() => import("./editor-markdown.tsx"));

/**
 * A descrição do projeto, numa janela só dela: um documento longo em
 * markdown (roteiro, personagens, tom, referências), com editor visual.
 *
 * Fechar com alterações não salvas pergunta antes — texto longo perdido por
 * um clique no × dói.
 */
export function ModalDescricaoProjeto({
  projeto,
  aberto,
  aoFechar,
  aoSalvar,
}: {
  projeto: Projeto;
  aberto: boolean;
  aoFechar: () => void;
  aoSalvar: (p: Projeto) => void;
}) {
  const [texto, setTexto] = useState(projeto.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const alterado = texto.trim() !== (projeto.descricao ?? "").trim();

  // Reabriu: começa do que está salvo.
  const [ultimoAberto, setUltimoAberto] = useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setTexto(projeto.descricao ?? "");
      setErro(null);
    }
  }

  function fechar() {
    if (alterado && !window.confirm("A descrição tem alterações não salvas. Fechar e descartar?")) return;
    aoFechar();
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      aoSalvar(await projetosApi.salvarDescricao(projeto.id, texto.trim() || null));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo={`Descrição — ${projeto.nome}`} largura="enorme" aoFechar={fechar}>
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <Suspense fallback={<Carregando />}>
            <EditorMarkdown
              valor={texto}
              aoMudar={setTexto}
              placeholder="Escreva sobre o projeto: história, personagens, tom, estética, referências... Use # para títulos e - para listas."
            />
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
