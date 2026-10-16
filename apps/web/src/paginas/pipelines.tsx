import { ArrowDown, ArrowRight, ArrowUp, GitBranch, Plus, Trash, X } from "lucide-react";
import { useState } from "react";
import { pipelinesApi, tiposGeracaoApi, workflowsApi, type PipelineNovo } from "../api.ts";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { AreaTexto, Aviso, Botao, Cabecalho, Campo, Carregando, Entrada, Etiqueta, Seletor, Vazio } from "../componentes/ui.tsx";
import { useCarregar } from "../hooks.ts";
import type { EtapaPipeline, Pipeline, TipoGeracao } from "../tipos.ts";

/*
 * Pipelines: o roteiro de etapas para gerar um shot.
 *
 * Um shot costuma precisar de mais de uma geração — o primeiro quadro e, dele,
 * o vídeo. Quem não escolhe pipeline fica na "Geração única" (uma etapa, sem
 * tipo fixo), que é embutida e não precisa de cadastro nenhum.
 *
 * O pipeline vale por projeto (o padrão) e por shot (que pode trocar o seu).
 */

/** A chave de uma etapa nasce do nome e não muda mais: os outputs guardam ela. */
function chaveDaEtapa(nome: string, usadas: string[]): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "etapa";
  for (let n = 1; ; n++) {
    const chave = n === 1 ? base : `${base}-${n}`;
    if (!usadas.includes(chave)) return chave;
  }
}

export function PaginaPipelines() {
  const { dados, erro, carregando, recarregar } = useCarregar(() => pipelinesApi.listar(), []);
  const tipos = useCarregar(() => tiposGeracaoApi.listar(), []);
  const [aberto, setAberto] = useState<Pipeline | "novo" | null>(null);
  /** O modelo pronto só preenche o formulário: quem cria é quem clica em "Criar". */
  const [modelo, setModelo] = useState<EtapaPipeline[] | null>(null);

  const doShot = (tipos.dados ?? []).filter((t) => t.shot);

  /** "First frame + vídeo" com os tipos que este Creativa tem: imagem, depois vídeo. */
  function sugerir() {
    const imagem = doShot.find((t) => t.saida === "IMAGEM");
    const video = doShot.find((t) => t.saida === "VIDEO");
    setModelo([
      { chave: "primeiro-quadro", nome: "Primeiro quadro", tipoGeracao: imagem?.chave ?? null, entradas: [] },
      { chave: "video", nome: "Vídeo", tipoGeracao: video?.chave ?? null, entradas: [] },
    ]);
    setAberto("novo");
  }

  return (
    <>
      <Cabecalho
        titulo="Pipelines"
        subtitulo="As etapas de um shot. Quem não escolhe nenhum gera numa etapa só."
        acoes={
          <Botao
            variante="primario"
            icone={<Plus className="size-4" />}
            onClick={() => {
              setModelo(null);
              setAberto("novo");
            }}
          >
            Novo pipeline
          </Botao>
        }
      />
      <div className="flex flex-col gap-4 p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && (
          <Vazio
            icone={<GitBranch />}
            titulo="Nenhum pipeline ainda"
            texto="Sem pipeline, todo shot gera numa etapa só — como sempre foi. Crie um para separar o primeiro quadro do vídeo."
            acao={
              <Botao variante="primario" icone={<Plus className="size-4" />} onClick={sugerir} disabled={!tipos.dados}>
                Começar com “First frame + vídeo”
              </Botao>
            }
          />
        )}
        {!!dados?.length && (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs tracking-wide text-zinc-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Pipeline</th>
                  <th className="px-4 py-2.5 font-medium">Etapas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Em uso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {dados.map((p) => (
                  <tr key={p.id} onClick={() => setAberto(p)} className="cursor-pointer hover:bg-zinc-900/60">
                    <td className="max-w-md px-4 py-2.5">
                      <div className="font-medium">{p.nome}</div>
                      {p.descricao && <div className="truncate text-xs text-zinc-500">{p.descricao}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.etapas.map((e, n) => (
                          <span key={e.chave} className="flex items-center gap-1.5">
                            {n > 0 && <ArrowRight className="size-3.5 text-zinc-600" />}
                            <Etiqueta>{e.nome}</Etiqueta>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-zinc-500 tabular-nums">
                      {p.uso.shots || p.uso.projetos
                        ? [p.uso.projetos && `${p.uso.projetos} projeto(s)`, p.uso.shots && `${p.uso.shots} shot(s)`].filter(Boolean).join(" · ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal
        aberto={!!aberto}
        titulo={aberto === "novo" ? "Novo pipeline" : "Editar pipeline"}
        largura="larga"
        aoFechar={() => setAberto(null)}
      >
        {aberto && (
          <FormPipeline
            pipeline={aberto === "novo" ? undefined : aberto}
            etapasIniciais={aberto === "novo" ? (modelo ?? undefined) : undefined}
            tipos={doShot}
            aoSalvar={() => {
              setAberto(null);
              setModelo(null);
              recarregar();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function FormPipeline({
  pipeline,
  etapasIniciais,
  tipos,
  aoSalvar,
}: {
  pipeline?: Pipeline;
  etapasIniciais?: EtapaPipeline[];
  tipos: TipoGeracao[];
  aoSalvar: () => void;
}) {
  const [nome, setNome] = useState(pipeline?.nome ?? (etapasIniciais ? "First frame + vídeo" : ""));
  const [descricao, setDescricao] = useState(pipeline?.descricao ?? "");
  const [etapas, setEtapas] = useState<EtapaPipeline[]>(pipeline?.etapas ?? etapasIniciais ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const campos = useCarregar(() => pipelinesApi.camposDeImagem(), []);
  const workflows = useCarregar(() => workflowsApi.listar(), []);

  const mexer = (n: number, f: (e: EtapaPipeline) => EtapaPipeline) => setEtapas((l) => l.map((e, i) => (i === n ? f(e) : e)));

  function acrescentar() {
    setEtapas((l) => [
      ...l,
      { chave: chaveDaEtapa(`etapa ${l.length + 1}`, l.map((e) => e.chave)), nome: "", tipoGeracao: tipos[0]?.chave ?? null, entradas: [] },
    ]);
  }

  /** Mover uma etapa leva as ligações: entrada só pode vir de etapa anterior. */
  function mover(n: number, para: number) {
    setEtapas((l) => {
      const nova = [...l];
      const [e] = nova.splice(n, 1);
      nova.splice(para, 0, e!);
      return nova.map((x, i) => ({ ...x, entradas: x.entradas.filter((en) => nova.slice(0, i).some((a) => a.chave === en.daEtapa)) }));
    });
  }

  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSalvando(true);
          setErro(null);
          const dados: PipelineNovo = { nome, descricao: descricao || null, etapas };
          try {
            if (pipeline) {
              const r = await pipelinesApi.salvar(pipeline.id, dados);
              if (r.etapasRemovidas.length) {
                // Nada se perde: só sai da tela. Vale dizer antes de fechar.
                setAviso(`Saíram do pipeline: ${r.etapasRemovidas.join(", ")}. Os outputs delas continuam, fora das etapas.`);
                setSalvando(false);
                return;
              }
            } else await pipelinesApi.criar(dados);
            aoSalvar();
          } catch (er) {
            setErro((er as Error).message);
            setSalvando(false);
          }
        }}
      >
        <Campo rotulo="Nome" dica={pipeline ? `Chave: ${pipeline.chave} — não muda, shots e projetos guardam ela.` : undefined}>
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required placeholder="First frame + vídeo" />
        </Campo>
        <Campo rotulo="Descrição" dica="Aparece na escolha do pipeline, no shot e no projeto.">
          <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
        </Campo>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Etapas</span>
          {etapas.length === 0 && <p className="text-sm text-zinc-500">Sem etapa nenhuma, o pipeline não serve para nada. Acrescente a primeira.</p>}
          {etapas.map((e, n) => (
            <div key={e.chave} className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-end gap-2">
                <span className="pb-2 font-mono text-xs text-zinc-600 tabular-nums">{n + 1}</span>
                <div className="flex-1">
                  <Campo rotulo="Nome da etapa">
                    <Entrada
                      value={e.nome}
                      required
                      placeholder="Primeiro quadro"
                      onChange={(ev) =>
                        mexer(n, (x) => ({
                          ...x,
                          nome: ev.target.value,
                          // A chave só nasce agora, enquanto ninguém gerou nada nela.
                          ...(pipeline?.etapas.some((o) => o.chave === x.chave)
                            ? {}
                            : { chave: chaveDaEtapa(ev.target.value, etapas.filter((_, i) => i !== n).map((o) => o.chave)) }),
                        }))
                      }
                    />
                  </Campo>
                </div>
                <div className="flex-1">
                  <Campo rotulo="Tipo de geração" dica={etapas.length > 1 ? undefined : "Vazio: a etapa oferece todos os tipos."}>
                    <Seletor value={e.tipoGeracao ?? ""} onChange={(ev) => mexer(n, (x) => ({ ...x, tipoGeracao: ev.target.value || null, workflowPadrao: null }))}>
                      {etapas.length === 1 && <option value="">Todos</option>}
                      {tipos.map((t) => (
                        <option key={t.chave} value={t.chave}>
                          {t.nome}
                        </option>
                      ))}
                    </Seletor>
                  </Campo>
                </div>
                {e.tipoGeracao && (
                  <div className="flex-1">
                    <Campo rotulo="Workflow padrão" dica="Com que a etapa abre. Dá para trocar no Gerador.">
                      <Seletor value={e.workflowPadrao ?? ""} onChange={(ev) => mexer(n, (x) => ({ ...x, workflowPadrao: ev.target.value || null }))}>
                        <option value="">O primeiro do tipo</option>
                        {(workflows.dados ?? [])
                          .filter((w) => w.tipoGeracao.chave === e.tipoGeracao)
                          .map((w) => (
                            <option key={w.chave} value={w.chave}>
                              {w.nome}
                            </option>
                          ))}
                      </Seletor>
                    </Campo>
                  </div>
                )}
                <div className="flex pb-1.5">
                  <BotaoIcone titulo="Subir" disabled={n === 0} onClick={() => mover(n, n - 1)}>
                    <ArrowUp className="size-4" />
                  </BotaoIcone>
                  <BotaoIcone titulo="Descer" disabled={n === etapas.length - 1} onClick={() => mover(n, n + 1)}>
                    <ArrowDown className="size-4" />
                  </BotaoIcone>
                  <BotaoIcone titulo="Remover a etapa" onClick={() => setEtapas((l) => semAEtapa(l, n))}>
                    <Trash className="size-4" />
                  </BotaoIcone>
                </div>
              </div>

              {/* As ligações: que campo desta etapa recebe a imagem escolhida de uma anterior. */}
              {n > 0 && (
                <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
                  {e.entradas.map((en, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500">Recebe em</span>
                      <Seletor
                        className="w-48"
                        value={en.campo}
                        onChange={(ev) =>
                          mexer(n, (x) => ({ ...x, entradas: x.entradas.map((o, j) => (j === i ? { ...o, campo: ev.target.value } : o)) }))
                        }
                      >
                        <option value="">escolha o campo</option>
                        {(e.tipoGeracao ? (campos.dados?.[e.tipoGeracao] ?? []) : []).map((c) => (
                          <option key={c.chave} value={c.chave}>
                            {c.rotulo}
                          </option>
                        ))}
                      </Seletor>
                      <span className="text-zinc-500">a imagem escolhida em</span>
                      <Seletor
                        className="w-48"
                        value={en.daEtapa}
                        onChange={(ev) =>
                          mexer(n, (x) => ({ ...x, entradas: x.entradas.map((o, j) => (j === i ? { ...o, daEtapa: ev.target.value } : o)) }))
                        }
                      >
                        {etapas.slice(0, n).map((a) => (
                          <option key={a.chave} value={a.chave}>
                            {a.nome || a.chave}
                          </option>
                        ))}
                      </Seletor>
                      <BotaoIcone titulo="Tirar a ligação" onClick={() => mexer(n, (x) => ({ ...x, entradas: x.entradas.filter((_, j) => j !== i) }))}>
                        <X className="size-4" />
                      </BotaoIcone>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => mexer(n, (x) => ({ ...x, entradas: [...x.entradas, { campo: "", daEtapa: etapas[n - 1]!.chave }] }))}
                    className="self-start text-xs text-zinc-400 underline decoration-dotted hover:text-violet-300"
                  >
                    + Receber uma imagem de outra etapa
                  </button>
                </div>
              )}
            </div>
          ))}
          <Botao icone={<Plus className="size-4" />} onClick={acrescentar}>
            Nova etapa
          </Botao>
        </div>

        {aviso && <Aviso>{aviso}</Aviso>}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-between gap-2">
          {pipeline ? (
            <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
              Excluir
            </Botao>
          ) : (
            <span />
          )}
          <Botao type="submit" variante="primario" carregando={salvando}>
            {pipeline ? (aviso ? "Fechar" : "Salvar") : "Criar pipeline"}
          </Botao>
        </div>
      </form>

      {/* Fora do <form>: a confirmação tem o form dela, e form dentro de form enviaria o de fora. */}
      {pipeline && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir pipeline"
          texto={
            <>
              O pipeline <b>{pipeline.nome}</b> será excluído. Shots e projetos que o usam têm de trocar antes — o banco recusa.
            </>
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await pipelinesApi.apagar(pipeline.id);
            aoSalvar();
          }}
        />
      )}
    </>
  );
}

/** Tira a etapa e, com ela, as ligações que vinham dela. */
function semAEtapa(l: EtapaPipeline[], n: number): EtapaPipeline[] {
  const fora = l[n]!.chave;
  return l.filter((_, i) => i !== n).map((e) => ({ ...e, entradas: e.entradas.filter((en) => en.daEtapa !== fora) }));
}

function BotaoIcone({ titulo, onClick, disabled, children }: { titulo: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
