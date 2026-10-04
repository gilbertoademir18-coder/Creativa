import { History } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { formatarData } from "../rotulos.ts";
import type { VersaoDescricao } from "../tipos.ts";
import { Modal } from "./modal.tsx";
import { Aviso, Botao, Carregando, Etiqueta } from "./ui.tsx";

/** O editor visual só carrega quando a janela abre (~1,4 MB). */
const EditorMarkdown = lazy(() => import("./editor-markdown.tsx"));

/** O histórico de versões de um documento (hoje, só a descrição do projeto). */
export type Historico = {
  /** O número da versão que está em `valor`. */
  atual: number;
  listar: () => Promise<VersaoDescricao[]>;
  ler: (numero: number) => Promise<string | null>;
};

/**
 * Um documento longo em markdown numa janela só dele, com o editor visual:
 * a descrição do projeto, a sinopse de um vídeo.
 *
 * Fechar com alterações não salvas pergunta antes — texto longo perdido por
 * um clique no × dói.
 *
 * Com `historico`, o botão "Versões" abre a lista ao lado do editor. Abrir
 * uma versão antiga põe o texto dela no editor; salvar a restaura como
 * versão nova (nada do histórico se reescreve).
 */
export function ModalDocumento({
  titulo,
  valor,
  placeholder,
  aberto,
  historico,
  aoFechar,
  aoSalvar,
}: {
  titulo: string;
  valor: string | null;
  placeholder?: string;
  aberto: boolean;
  historico?: Historico;
  aoFechar: () => void;
  /**
   * Recebe o texto (null se ficou vazio) e uma nota do que foi feito ("Restaurada
   * da versão 3"), ou null. Se lançar, a janela mostra o erro e continua aberta.
   */
  aoSalvar: (texto: string | null, nota: string | null) => Promise<void>;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // A versão antiga aberta no editor (null: o texto atual) e o texto dela.
  const [vendo, setVendo] = useState<{ versao: VersaoDescricao; texto: string } | null>(null);
  const [versoes, setVersoes] = useState<VersaoDescricao[] | null>(null);
  const [painel, setPainel] = useState(false);
  const [carregandoVersao, setCarregandoVersao] = useState<number | null>(null);
  // O MDXEditor só lê o texto ao montar: trocar de versão monta outro.
  const [chaveEditor, setChaveEditor] = useState(0);

  const alterado = texto.trim() !== (valor ?? "").trim();
  /** Mexeu no que está no editor (a atual ou a versão antiga aberta)? */
  const editado = texto.trim() !== (vendo ? vendo.texto : (valor ?? "")).trim();

  // Reabriu: começa do que está salvo.
  const [ultimoAberto, setUltimoAberto] = useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setTexto(valor ?? "");
      setErro(null);
      setVendo(null);
      setPainel(false);
    }
  }

  function fechar() {
    if (alterado && !window.confirm("O texto tem alterações não salvas. Fechar e descartar?")) return;
    aoFechar();
  }

  async function alternarPainel() {
    if (painel) return setPainel(false);
    setPainel(true);
    setVersoes(null);
    try {
      setVersoes(await historico!.listar());
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function trocarTexto(novo: string, versao: VersaoDescricao | null) {
    setTexto(novo);
    setVendo(versao && { versao, texto: novo });
    setChaveEditor((k) => k + 1);
  }

  async function abrirVersao(numero: number) {
    if (editado && !window.confirm(`O texto tem alterações não salvas. Abrir a versão ${numero} e descartar?`)) return;
    if (numero === historico!.atual) return trocarTexto(valor ?? "", null);
    const versao = versoes?.find((v) => v.numero === numero);
    if (!versao) return;
    setCarregandoVersao(numero);
    setErro(null);
    try {
      trocarTexto((await historico!.ler(numero)) ?? "", versao);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregandoVersao(null);
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const nota = vendo ? `Restaurada da versão ${vendo.versao.numero}${editado ? ", com mudanças" : ""}` : null;
      await aoSalvar(texto.trim() || null, nota);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const situacao = vendo
    ? `Versão ${vendo.versao.numero} no editor: salvar a restaura como versão nova`
    : alterado
      ? "Alterações não salvas"
      : historico?.atual
        ? `Tudo salvo · versão ${historico.atual}`
        : "Tudo salvo";

  return (
    <Modal aberto={aberto} titulo={titulo} largura="enorme" aoFechar={fechar}>
      <div className="flex flex-col gap-4">
        <div className={painel ? "grid grid-cols-[minmax(0,1fr)_20rem] gap-4" : ""}>
          <div className="flex min-w-0 flex-col gap-3">
            {vendo && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-2.5 text-sm text-amber-200">
                <span>
                  Você está vendo a <b>versão {vendo.versao.numero}</b>, de {formatarData(vendo.versao.criadoEm)}. Salvar a
                  restaura como versão nova; a atual continua no histórico.
                </span>
                <Botao variante="fantasma" onClick={() => abrirVersao(historico!.atual)}>
                  Voltar para a atual
                </Botao>
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <Suspense fallback={<Carregando />}>
                <EditorMarkdown key={chaveEditor} valor={texto} aoMudar={setTexto} placeholder={placeholder} />
              </Suspense>
            </div>
          </div>
          {painel && (
            <aside className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-2">
              {!versoes && <Carregando />}
              {versoes?.length === 0 && <p className="px-2 py-3 text-sm text-zinc-500">Nenhuma versão salva ainda.</p>}
              {versoes?.map((v) => {
                const ativa = vendo ? vendo.versao.numero === v.numero : v.numero === historico!.atual;
                return (
                  <button
                    key={v.numero}
                    type="button"
                    onClick={() => abrirVersao(v.numero)}
                    disabled={carregandoVersao !== null}
                    className={`flex flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors ${ativa ? "bg-violet-950/60 ring-1 ring-violet-700" : "hover:bg-zinc-800"}`}
                  >
                    <span className="flex items-center gap-2">
                      <b className="text-zinc-100">v{v.numero}</b>
                      <Etiqueta className={v.origem === "CLAUDE" ? "bg-orange-950/60 text-orange-300" : "bg-zinc-800 text-zinc-300"}>
                        {v.origem === "CLAUDE" ? "Claude" : "Tela"}
                      </Etiqueta>
                      {v.numero === historico!.atual && <Etiqueta className="bg-emerald-950/60 text-emerald-300">atual</Etiqueta>}
                      <span className="ml-auto text-xs text-zinc-500">
                        {carregandoVersao === v.numero ? "abrindo..." : formatarData(v.criadoEm)}
                      </span>
                    </span>
                    {v.nota && <span className="text-xs text-zinc-400">{v.nota}</span>}
                  </button>
                );
              })}
            </aside>
          )}
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">{situacao}</span>
          <div className="flex gap-2">
            {historico && (
              <Botao variante={painel ? "secundario" : "fantasma"} icone={<History className="size-4" />} onClick={alternarPainel}>
                Versões
              </Botao>
            )}
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
