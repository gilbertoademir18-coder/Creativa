import { Download, Plus, Trash, Upload, WandSparkles } from "lucide-react";
import { useRef, useState } from "react";
import { assistentesApi, workflowsApi, type AssistenteNovo } from "../api.ts";
import { EscolhaProjeto, FiltroBusca, FiltroProjeto, FiltroSelecao } from "../componentes/filtros.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { AreaTexto, Aviso, BarraFiltros, Botao, Cabecalho, Campo, Carregando, Entrada, Etiqueta, Vazio } from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import { formatarData } from "../rotulos.ts";
import type { Assistente, WorkflowResumo } from "../tipos.ts";

/**
 * Assistentes de prompt: instruções em markdown — como uma skill — que a LLM
 * local segue para transformar uma ideia curta no prompt completo de um
 * workflow. Cada um aparece no Gerador dos workflows marcados e, se tiver
 * projeto, só nos assets e shots daquele projeto.
 */
export function PaginaAssistentes() {
  const [f, mudar] = useFiltros(["projeto", "workflow", "busca"] as const);
  const { dados, erro, carregando, recarregar } = useCarregar(
    () => assistentesApi.listar({ projeto: f.projeto, workflow: f.workflow, busca: f.busca }),
    [f.projeto, f.workflow, f.busca],
  );
  const workflows = useCarregar(() => workflowsApi.listar(), []);
  const [aberto, setAberto] = useState<Assistente | "novo" | null>(null);
  const filtrando = !!(f.projeto || f.workflow || f.busca);
  const nomeWorkflow = (chave: string) => workflows.dados?.find((w) => w.chave === chave)?.nome ?? chave;

  return (
    <>
      <Cabecalho
        titulo="Assistentes"
        subtitulo="Instruções em markdown que a LLM local segue para expandir uma ideia no prompt de um workflow — como uma skill."
        acoes={
          <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setAberto("novo")}>
            Novo assistente
          </Botao>
        }
      />
      <BarraFiltros>
        <FiltroProjeto valor={f.projeto} aoMudar={(v) => mudar("projeto", v)} />
        <FiltroSelecao valor={f.workflow} aoMudar={(v) => mudar("workflow", v)} todos="Qualquer workflow" largura="w-80">
          {workflows.dados?.map((w) => (
            <option key={w.chave} value={w.chave}>
              {w.nome}
            </option>
          ))}
        </FiltroSelecao>
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<WandSparkles />}
            titulo={filtrando ? "Nenhum assistente com esses filtros" : "Nenhum assistente ainda"}
            texto={filtrando ? undefined : "Crie um do zero ou importe um .md — o docs/assistentes do projeto tem um pronto para a Placa de cenário."}
            acao={
              !filtrando && (
                <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setAberto("novo")}>
                  Criar o primeiro
                </Botao>
              )
            }
          />
        )}
        {!!dados?.length && (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Assistente</th>
                  <th className="px-4 py-2.5 font-medium">Projeto</th>
                  <th className="px-4 py-2.5 font-medium">Workflows</th>
                  <th className="px-4 py-2.5 text-right font-medium">Editado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {dados.map((a) => (
                  <tr key={a.id} onClick={() => setAberto(a)} className="cursor-pointer hover:bg-zinc-900/60">
                    <td className="max-w-xl px-4 py-2.5">
                      <div className="font-medium">{a.nome}</div>
                      {a.descricao && <div className="truncate text-xs text-zinc-500">{a.descricao}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{a.projeto?.nome ?? <span className="text-zinc-600">Todos</span>}</td>
                    <td className="px-4 py-2.5">
                      {a.workflows.length === 0 ? (
                        <span className="text-zinc-600">Todos</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {a.workflows.map((w) => (
                            <Etiqueta key={w}>{nomeWorkflow(w)}</Etiqueta>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 tabular-nums">{formatarData(a.editadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal aberto={!!aberto} titulo={aberto === "novo" ? "Novo assistente" : "Editar assistente"} largura="enorme" aoFechar={() => setAberto(null)}>
        {aberto && (
          <FormAssistente
            assistente={aberto === "novo" ? undefined : aberto}
            projetoInicial={f.projeto && f.projeto !== "sem" ? f.projeto : ""}
            workflows={workflows.dados ?? []}
            aoSalvar={() => {
              setAberto(null);
              recarregar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

/**
 * Lê um .md de assistente. Aceita o cabeçalho de skill do Claude
 * (`---\nname: ...\ndescription: ...\n---`): o nome e a descrição vêm dele,
 * e as instruções são o resto.
 */
function lerMarkdown(texto: string, nomeArquivo: string): { nome: string; descricao: string; instrucoes: string } {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const cabecalho = m?.[1] ?? "";
  const campo = (k: string) => cabecalho.match(new RegExp(`^${k}\\s*:\\s*(.+)$`, "mi"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
  return {
    nome: campo("name") || campo("nome") || nomeArquivo.replace(/\.(md|txt)$/i, ""),
    descricao: campo("description") || campo("descricao"),
    instrucoes: (m ? m[2]! : texto).trim(),
  };
}

/** O .md para baixar, no mesmo formato que a importação entende. */
function escreverMarkdown(a: { nome: string; descricao: string; instrucoes: string }): string {
  const linha = (t: string) => t.replace(/\r?\n/g, " ");
  return `---\nname: ${linha(a.nome)}\ndescription: ${linha(a.descricao)}\n---\n\n${a.instrucoes.trim()}\n`;
}

function FormAssistente({
  assistente,
  projetoInicial,
  workflows,
  aoSalvar,
}: {
  assistente?: Assistente;
  projetoInicial: string;
  workflows: WorkflowResumo[];
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState(assistente?.nome ?? "");
  const [descricao, setDescricao] = useState(assistente?.descricao ?? "");
  const [projetoId, setProjetoId] = useState(assistente ? (assistente.projetoId ?? "") : projetoInicial);
  const [marcados, setMarcados] = useState<string[]>(assistente?.workflows ?? []);
  const [instrucoes, setInstrucoes] = useState(assistente?.instrucoes ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const alternar = (chave: string) => setMarcados((m) => (m.includes(chave) ? m.filter((x) => x !== chave) : [...m, chave]));

  async function importar(f: File) {
    const lido = lerMarkdown(await f.text(), f.name);
    setInstrucoes(lido.instrucoes);
    // Nome e descrição só se ainda estiverem vazios: não atropela o que foi digitado.
    if (!nome.trim()) setNome(lido.nome);
    if (!descricao.trim() && lido.descricao) setDescricao(lido.descricao);
  }

  function exportar() {
    const blob = new Blob([escreverMarkdown({ nome, descricao, instrucoes })], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome.trim().replace(/[\\/:*?"<>|]+/g, "-") || "assistente"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Agrupados pelo tipo de geração: é como o Gerador apresenta.
  const porTipo = Object.entries(
    workflows.reduce<Record<string, WorkflowResumo[]>>((g, w) => ({ ...g, [w.tipoGeracao.nome]: [...(g[w.tipoGeracao.nome] ?? []), w] }), {}),
  );

  return (
    <>
      <form
        className="grid grid-cols-[22rem_minmax(0,1fr)] gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvando(true);
          setErro(null);
          const dados: AssistenteNovo = { nome, descricao: descricao || null, projetoId: projetoId || null, workflows: marcados, instrucoes };
          try {
            if (assistente) await assistentesApi.salvar(assistente.id, dados);
            else await assistentesApi.criar(dados);
            aoSalvar();
          } catch (er) {
            setErro((er as Error).message);
            setSalvando(false);
          }
        }}
      >
        <div className="flex flex-col gap-4">
          <Campo rotulo="Nome">
            <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="Placa de cenário cinematográfica" />
          </Campo>
          <Campo rotulo="Descrição" dica="Aparece no Gerador, embaixo da escolha do assistente.">
            <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </Campo>
          <Campo rotulo="Projeto" dica="Sem projeto, vale para todos. Com projeto, só aparece nos assets e shots dele.">
            <EscolhaProjeto valor={projetoId} aoMudar={setProjetoId} />
          </Campo>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Workflows</span>
            {porTipo.map(([tipo, ws]) => (
              <div key={tipo} className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">{tipo}</span>
                {ws.map((w) => (
                  <label key={w.chave} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                    <input type="checkbox" checked={marcados.includes(w.chave)} onChange={() => alternar(w.chave)} className="size-4 accent-violet-500" />
                    {w.nome}
                  </label>
                ))}
              </div>
            ))}
            <p className="text-xs text-zinc-500">Nenhum marcado: aparece em todos os workflows que têm assistente.</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Instruções (markdown)</span>
            <div className="flex gap-2">
              <input
                ref={arquivo}
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importar(f);
                  e.target.value = "";
                }}
              />
              <Botao variante="fantasma" icone={<Upload className="size-4" />} onClick={() => arquivo.current?.click()}>
                Importar .md
              </Botao>
              <Botao variante="fantasma" icone={<Download className="size-4" />} onClick={exportar} disabled={!instrucoes.trim()}>
                Exportar .md
              </Botao>
            </div>
          </div>
          <AreaTexto
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            rows={26}
            spellCheck={false}
            className="font-mono text-xs leading-relaxed"
            placeholder={"# Como escrever o prompt\n\nVocê recebe uma ideia curta e escreve o prompt completo...\n\n## Estrutura\n1. ...\n\n## Exemplos\n..."}
          />
          <p className="text-xs text-zinc-500">
            A LLM recebe estas instruções e, junto, o que o código sabe do workflow: a dica do campo, a faixa de palavras e as regras que o
            Gerador confere — e a descrição do asset ou shot. Não precisa repetir isso aqui.
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="mt-2 flex justify-between gap-2">
            {assistente ? (
              <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
                Excluir
              </Botao>
            ) : (
              <span />
            )}
            <Botao type="submit" variante="primario" carregando={salvando}>
              {assistente ? "Salvar" : "Criar assistente"}
            </Botao>
          </div>
        </div>
      </form>

      {/* Fora do <form>: a confirmação tem o form dela, e form dentro de form enviaria o de fora. */}
      {assistente && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir assistente"
          texto={
            <>
              O assistente <b>{assistente.nome}</b> será excluído. Os outputs que ele ajudou a gerar continuam com o nome dele gravado. Se quiser
              guardar as instruções, use “Exportar .md” antes.
            </>
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await assistentesApi.apagar(assistente.id);
            aoSalvar();
          }}
        />
      )}
    </>
  );
}
