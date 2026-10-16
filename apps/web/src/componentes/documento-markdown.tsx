import { lazy, Suspense, useEffect, useState } from "react";
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
 * Com `historico`, a lista de versões fica sempre à vista, à esquerda do
 * editor, com rolagem própria. Abrir uma versão antiga põe o texto dela no
 * editor; salvar a restaura como versão nova (nada do histórico se reescreve).
 */
export function ModalDocumento({
  titulo,
  valor,
  placeholder,
  aberto,
  historico,
  avisos,
  aoFechar,
  aoSalvar,
  aoAutosalvar,
}: {
  titulo: string;
  valor: string | null;
  placeholder?: string;
  aberto: boolean;
  historico?: Historico;
  /** Avisos sobre o texto, recalculados enquanto se escreve (ex.: seção fora do modelo). */
  avisos?: (texto: string) => string[];
  aoFechar: () => void;
  /**
   * Recebe o texto (null se ficou vazio) e uma nota do que foi feito ("Restaurada
   * da versão 3"), ou null. Se lançar, a janela mostra o erro e continua aberta.
   */
  aoSalvar?: (texto: string | null, nota: string | null) => Promise<void>;
  /**
   * Salvar sozinho enquanto se escreve (1 s depois de parar), sem fechar a
   * janela — a sinopse. Ignorado com `historico`: cada gravação da descrição
   * do projeto vira uma versão, e salvar a cada pausa encheria o histórico.
   */
  aoAutosalvar?: (texto: string | null) => Promise<void>;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // A versão antiga aberta no editor (null: o texto atual) e o texto dela.
  const [vendo, setVendo] = useState<{ versao: VersaoDescricao; texto: string } | null>(null);
  const [versoes, setVersoes] = useState<VersaoDescricao[] | null>(null);
  const [carregandoVersao, setCarregandoVersao] = useState<number | null>(null);
  // O MDXEditor só lê o texto ao montar: trocar de versão monta outro.
  const [chaveEditor, setChaveEditor] = useState(0);

  // O texto que entrou no editor (a atual ou a versão aberta), do jeito que o
  // editor o reescreveu ao carregar: é com ele que se compara o que a pessoa
  // mexeu. Comparar com o texto do banco acusaria mudança sem ninguém tocar.
  const [base, setBase] = useState(valor ?? "");
  const automatico = !!aoAutosalvar && !historico;
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  /** O texto cuja gravação falhou: não tenta de novo sozinho até a pessoa mexer. */
  const [falhou, setFalhou] = useState<string | null>(null);

  /** Mexeu no que está no editor (a atual ou a versão antiga aberta)? */
  const editado = texto.trim() !== base.trim();
  /** Tem algo a salvar: uma edição, ou uma versão antiga aberta para restaurar. */
  const alterado = vendo ? texto.trim() !== (valor ?? "").trim() : editado;

  function mudou(md: string, normalizacao: boolean) {
    setTexto(md);
    if (normalizacao) setBase(md);
  }

  // Reabriu: começa do que está salvo.
  const [ultimoAberto, setUltimoAberto] = useState(aberto);
  if (aberto !== ultimoAberto) {
    setUltimoAberto(aberto);
    if (aberto) {
      setTexto(valor ?? "");
      setBase(valor ?? "");
      setErro(null);
      setVendo(null);
      setVersoes(null);
      setSalvoEm(null);
      setFalhou(null);
    }
  }

  /** Grava o texto de agora; o que se digitar enquanto isso sai na próxima pausa. */
  async function autosalvar(): Promise<boolean> {
    const enviado = texto;
    setSalvando(true);
    try {
      await aoAutosalvar!(enviado.trim() || null);
      setBase(enviado);
      setSalvoEm(new Date());
      setErro(null);
      setFalhou(null);
      return true;
    } catch (e) {
      setErro((e as Error).message);
      setFalhou(enviado);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // Salva sozinho 1 s depois da última mudança.
  useEffect(() => {
    if (!automatico || !aberto || !editado || salvando || texto === falhou) return;
    const t = setTimeout(autosalvar, 1000);
    return () => clearTimeout(t);
  });

  // A lista de versões carrega a cada abertura: a skill pode ter gravado uma nova.
  const temHistorico = !!historico;
  useEffect(() => {
    if (!aberto || !temHistorico) return;
    let vivo = true;
    historico!.listar().then(
      (v) => vivo && setVersoes(v),
      (e: Error) => vivo && setErro(e.message),
    );
    return () => {
      vivo = false;
    };
    // `historico` é um objeto novo a cada render; o que importa é abrir.
  }, [aberto, temHistorico]);

  async function fechar() {
    // No automático, o que falta salvar vai agora — fechar não perde nada.
    if (automatico) {
      if (editado && !(await autosalvar()) && !window.confirm("Não consegui salvar a última alteração. Fechar e descartá-la?")) return;
      return aoFechar();
    }
    if (alterado && !window.confirm("O texto tem alterações não salvas. Fechar e descartar?")) return;
    aoFechar();
  }

  function trocarTexto(novo: string, versao: VersaoDescricao | null) {
    setTexto(novo);
    setBase(novo);
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
      await aoSalvar!(texto.trim() || null, nota);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const situacao = automatico
    ? salvando
      ? "Salvando…"
      : falhou !== null && texto === falhou
        ? "Não salvou — mexa no texto para tentar de novo"
        : editado
        ? "Alterações — salvando em instantes"
        : salvoEm
          ? `Salvo automaticamente às ${salvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
          : "Tudo salvo · salva sozinho enquanto você escreve"
    : vendo
    ? `Versão ${vendo.versao.numero} no editor: salvar a restaura como versão nova`
    : alterado
      ? "Alterações não salvas"
      : historico?.atual
        ? `Tudo salvo · versão ${historico.atual}`
        : "Tudo salvo";

  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      largura="enorme"
      aoFechar={fechar}
      rodape={
        <div className="flex flex-col gap-3">
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">{situacao}</span>
            <div className="flex gap-2">
              <Botao variante="fantasma" onClick={fechar}>
                Fechar
              </Botao>
              {!automatico && (
                <Botao variante="primario" carregando={salvando} disabled={!alterado} onClick={salvar}>
                  Salvar
                </Botao>
              )}
            </div>
          </div>
        </div>
      }
      lateral={
        historico && (
          // Fora do que rola (a `lateral` da Modal): fica parada enquanto o
          // editor passa, e rola por dentro quando as versões não cabem.
          <aside className="flex h-full w-80 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
            <h3 className="border-b border-zinc-800 px-4 py-2.5 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Versões
            </h3>
            <div className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2">
              {!versoes && <Carregando />}
              {versoes?.length === 0 && <p className="px-2 py-3 text-sm text-zinc-500">Nenhuma versão salva ainda.</p>}
              {versoes?.map((v) => {
                const ativa = vendo ? vendo.versao.numero === v.numero : v.numero === historico.atual;
                return (
                  <button
                    key={v.numero}
                    type="button"
                    onClick={() => abrirVersao(v.numero)}
                    disabled={carregandoVersao !== null}
                    className={`flex shrink-0 flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors ${ativa ? "bg-violet-950/60 ring-1 ring-violet-700" : "hover:bg-zinc-800"}`}
                  >
                    <span className="flex items-center gap-2">
                      <b className="text-zinc-100">v{v.numero}</b>
                      <Etiqueta className={v.origem === "CLAUDE" ? "bg-orange-950/60 text-orange-300" : "bg-zinc-800 text-zinc-300"}>
                        {v.origem === "CLAUDE" ? "Claude" : "Tela"}
                      </Etiqueta>
                      {v.numero === historico.atual && <Etiqueta className="bg-emerald-950/60 text-emerald-300">atual</Etiqueta>}
                      <span className="ml-auto text-xs text-zinc-500">
                        {carregandoVersao === v.numero ? "abrindo..." : formatarData(v.criadoEm)}
                      </span>
                    </span>
                    {v.nota && <span className="text-xs text-zinc-400">{v.nota}</span>}
                  </button>
                );
              })}
            </div>
          </aside>
        )
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        {avisos?.(texto).map((a) => (
          <p key={a} className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            {a}
          </p>
        ))}
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
        {/* Sem overflow-hidden: ele prenderia a barra de ferramentas (sticky) aqui dentro, e ela rolaria junto com o texto. */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900">
          <Suspense fallback={<Carregando />}>
            <EditorMarkdown key={chaveEditor} valor={texto} aoMudar={mudou} placeholder={placeholder} />
          </Suspense>
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
