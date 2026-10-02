import { ChevronLeft, ChevronRight, Copy, Play, Plus, Sparkles, Square, Trash, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { geracoesApi, urlArquivo, type Dono, type GeracaoNova } from "../api.ts";
import { FiltroBusca, FiltroProjeto, FiltroSelecao } from "../componentes/filtros.tsx";
import { EtiquetaStatus, TabelaGeracoes } from "../componentes/geracoes.tsx";
import { ConfirmarExclusao, Modal } from "../componentes/modal.tsx";
import { DescricaoDono } from "../componentes/referencias.tsx";
import { SeletorDono } from "../componentes/seletor-dono.tsx";
import {
  AreaTexto,
  Aviso,
  BarraFiltros,
  Botao,
  BotaoLink,
  Cabecalho,
  Campo,
  Carregando,
  Entrada,
  LinkVoltar,
  Pilulas,
  Secao,
  Seletor,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import { formatarData, STATUS_GERACAO, tituloGeracao } from "../rotulos.ts";
import type { CampoWorkflow, GeracaoDetalhe, Output, StatusGeracao, TipoCatalogo, Vinculo } from "../tipos.ts";

export function PaginaGeracoes() {
  const [f, mudar] = useFiltros(["projeto", "status", "vinculo", "busca"] as const);
  const { dados, erro, carregando } = useCarregar(
    () =>
      geracoesApi.listar({
        projeto: f.projeto,
        status: f.status as StatusGeracao | "",
        vinculo: f.vinculo as Vinculo | "",
        busca: f.busca,
      }),
    [f.projeto, f.status, f.vinculo, f.busca],
  );

  return (
    <>
      <Cabecalho
        titulo="Gerações"
        subtitulo="Cada geração tem um tipo e um workflow do ComfyUI — e os outputs que produziu."
        acoes={
          <BotaoLink para="/geracoes/nova" variante="primario" icone={<Plus className="size-4" />}>
            Nova geração
          </BotaoLink>
        }
      />
      <BarraFiltros>
        <FiltroProjeto valor={f.projeto} aoMudar={(v) => mudar("projeto", v)} />
        <FiltroSelecao valor={f.status} aoMudar={(v) => mudar("status", v)} todos="Qualquer status" largura="w-48">
          {STATUS_GERACAO.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </FiltroSelecao>
        <Pilulas
          valor={f.vinculo}
          aoMudar={(v) => mudar("vinculo", v)}
          opcoes={[
            { valor: "", rotulo: "Qualquer vínculo" },
            { valor: "asset", rotulo: "De assets" },
            { valor: "shot", rotulo: "De shots" },
            { valor: "solta", rotulo: "Soltas" },
          ]}
        />
        <FiltroBusca valor={f.busca} aoMudar={(v) => mudar("busca", v)} dica="Buscar no nome ou no prompt" />
      </BarraFiltros>
      <div className="p-8">
        {erro && <Aviso>{erro}</Aviso>}
        {carregando && !dados && <Carregando />}
        {dados?.length === 0 && <Vazio icone={<Sparkles />} titulo="Nenhuma geração com esses filtros" />}
        {!!dados?.length && <TabelaGeracoes geracoes={dados} mostrarDono />}
      </div>
    </>
  );
}

/** `/geracoes/nova` (com `?asset=` ou `?shot=` opcionais) e `/geracoes/:id`. */
export function PaginaGeracao() {
  const { id } = useParams();
  const navegar = useNavigate();
  return (
    <GeracaoCarregada
      id={id ?? null}
      abrir={(novo, substituir) => navegar(`/geracoes/${novo}`, { replace: substituir })}
      aoExcluir={() => navegar("/geracoes")}
    />
  );
}

/** Quando a geração aparece dentro de outra página (a do asset, a do shot). */
export type Embutida = {
  /** Algo mudou (salvou, gerou, terminou): quem embute atualiza a lista dele. */
  aoAlterar?: () => void;
};

/**
 * Carrega a geração (ou nenhuma, para "nova") e a mantém atualizada
 * enquanto está no ComfyUI. É o que a página `/geracoes/:id` mostra, e o
 * que as páginas do asset e do shot embutem acima das referências.
 *
 * `abrir` e `aoExcluir` dizem para onde ir: na página é navegar; embutida,
 * é trocar a geração aberta no bloco.
 */
export function GeracaoCarregada({
  id,
  donoInicial,
  abrir,
  aoExcluir,
  embutida,
}: {
  id: string | null;
  donoInicial?: Dono;
  abrir: (id: string, substituir?: boolean) => void;
  aoExcluir: () => void;
  embutida?: Embutida;
}) {
  const { dados, erro, recarregar } = useCarregar(() => (id ? geracoesApi.ler(id) : Promise.resolve(null)), [id]);
  const ativa = dados?.status === "NA_FILA" || dados?.status === "EXECUTANDO";

  // Enquanto está no ComfyUI, atualiza sozinha (progresso, outputs).
  useEffect(() => {
    if (!ativa) return;
    const t = setInterval(recarregar, 1_000);
    return () => clearInterval(t);
  }, [ativa, recarregar]);

  // Mudou o status ou chegou output: a lista de quem embute fica sabendo.
  const assinatura = dados ? `${dados.id}:${dados.status}:${dados.outputs.length}` : "";
  useEffect(() => {
    if (assinatura) embutida?.aoAlterar?.();
  }, [assinatura]);

  if (erro) return <div className={embutida ? "" : "p-8"}><Aviso>{erro}</Aviso></div>;
  if (id && !dados) return <Carregando />;
  // `key` com o status: ao sair do rascunho o formulário recomeça com o que
  // foi de fato enviado.
  return (
    <FormGeracao
      key={`${id ?? "nova"}:${dados?.status === "RASCUNHO"}`}
      geracao={dados}
      recarregar={recarregar}
      donoInicial={donoInicial}
      abrir={abrir}
      aoExcluir={aoExcluir}
      embutida={embutida}
    />
  );
}

/**
 * O topo da geração. Na página, o cabeçalho de sempre (com "← Gerações");
 * embutida, uma faixa compacta — trocar de geração é clicar em outra na lista.
 */
function TopoGeracao({
  embutida,
  titulo,
  subtitulo,
  acoes,
}: {
  embutida?: Embutida;
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  acoes: React.ReactNode;
}) {
  if (!embutida) return <Cabecalho voltar={<LinkVoltar para="/geracoes" rotulo="Gerações" />} titulo={titulo} subtitulo={subtitulo} acoes={acoes} />;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-6 py-4">
      <div className="min-w-0">
        <div className="text-xs font-medium tracking-wide text-violet-300/80 uppercase">Geração</div>
        <h2 className="truncate text-lg font-semibold">{titulo}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">{acoes}</div>
    </div>
  );
}

function valoresPadrao(campos: CampoWorkflow[], atuais: Record<string, unknown>): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  for (const c of campos) {
    // Trocar de workflow guarda o que já foi escrito nos campos de mesmo nome.
    if (c.chave in atuais) v[c.chave] = atuais[c.chave];
    else v[c.chave] = c.tipo === "texto" ? (c.padrao ?? "") : c.tipo === "opcoes" ? c.padrao : null;
  }
  return v;
}

function FormGeracao({
  geracao: g,
  recarregar,
  donoInicial,
  abrir,
  aoExcluir,
  embutida,
}: {
  geracao: GeracaoDetalhe | null;
  recarregar: () => Promise<void>;
  donoInicial?: Dono;
  abrir: (id: string, substituir?: boolean) => void;
  aoExcluir: () => void;
  embutida?: Embutida;
}) {
  const [params] = useSearchParams();
  const rascunho = !g || g.status === "RASCUNHO";
  const ativa = g?.status === "NA_FILA" || g?.status === "EXECUTANDO";

  const [dono, setDono] = useState<Dono>(
    g ? { assetId: g.assetId, shotId: g.shotId } : (donoInicial ?? { assetId: params.get("asset"), shotId: params.get("shot") }),
  );
  const [nome, setNome] = useState(g?.nome ?? "");
  const [tipo, setTipo] = useState(g?.tipo ?? "");
  const [workflow, setWorkflow] = useState(g?.workflow ?? "");
  const [valores, setValores] = useState<Record<string, unknown>>(g?.parametros ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | "salvar" | "gerar" | "mais" | "cancelar" | "duplicar">(null);
  /** Quantas rodadas o próximo "Gerar" / "Gerar mais" manda. */
  const [quantidade, setQuantidade] = useState(1);
  const [excluindo, setExcluindo] = useState(false);
  /** O output aberto no visor, pelo id: outputs novos entram no topo e mudariam as posições. */
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const catalogo = useCarregar(() => geracoesApi.catalogo(dono), [dono.assetId, dono.shotId]);
  const tipos: TipoCatalogo[] = catalogo.dados ?? [];
  const tipoAtual = tipos.find((t) => t.chave === tipo);
  const wfAtual = tipoAtual?.workflows.find((w) => w.chave === workflow);

  // Só um tipo, ou só um workflow? Já vem escolhido. Tipo que não vale para o dono novo sai.
  useEffect(() => {
    if (!rascunho || !catalogo.dados) return;
    if (tipo && !tipos.some((t) => t.chave === tipo)) {
      setTipo("");
      setWorkflow("");
    } else if (!tipo && tipos.length === 1) setTipo(tipos[0]!.chave);
  }, [catalogo.dados]);
  useEffect(() => {
    if (!rascunho || !tipoAtual) return;
    if (!tipoAtual.workflows.some((w) => w.chave === workflow)) setWorkflow(tipoAtual.workflows.length === 1 ? tipoAtual.workflows[0]!.chave : "");
  }, [tipoAtual?.chave]);
  useEffect(() => {
    if (rascunho && wfAtual) setValores((v) => valoresPadrao(wfAtual.campos, v));
  }, [wfAtual?.chave]);

  const dados = (): GeracaoNova => ({ ...dono, nome: nome || null, tipo, workflow, parametros: valores });

  /** Salva o rascunho (cria se for novo) e devolve o id. */
  async function salvar(): Promise<string> {
    if (g) {
      await geracoesApi.salvar(g.id, dados());
      return g.id;
    }
    return (await geracoesApi.criar(dados())).id;
  }

  async function acao(qual: NonNullable<typeof ocupado>, f: () => Promise<void>) {
    setOcupado(qual);
    setErro(null);
    try {
      await f();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  const ultimaConcluida = g?.rodadas.find((r) => r.status === "CONCLUIDA" && r.iniciadaEm && r.concluidaEm);
  const duracao = ultimaConcluida ? Math.round((+new Date(ultimaConcluida.concluidaEm!) - +new Date(ultimaConcluida.iniciadaEm!)) / 1000) : null;
  const rodadasAtivas = g?.rodadas.filter((r) => r.status === "NA_FILA" || r.status === "EXECUTANDO").reverse() ?? [];
  // Falha só aparece enquanto é a notícia mais recente: depois de uma rodada boa, sai da frente.
  const ultimaEncerrada = g?.rodadas.find((r) => r.status !== "NA_FILA" && r.status !== "EXECUTANDO");
  const ultimaFalha = ultimaEncerrada?.status === "FALHOU" ? ultimaEncerrada : undefined;

  return (
    <div className={embutida ? "overflow-hidden rounded-xl border border-violet-500/30 bg-zinc-900/40" : ""}>
      <TopoGeracao
        embutida={embutida}
        titulo={g ? tituloGeracao(g) : "Nova geração"}
        subtitulo={g && !embutida && <DescricaoDono r={g} />}
        acoes={
          <>
            {g && !ativa && (
              <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
                Excluir
              </Botao>
            )}
            {g && !rascunho && !ativa && (
              <Botao
                icone={<Copy className="size-4" />}
                carregando={ocupado === "duplicar"}
                onClick={() => acao("duplicar", async () => abrir((await geracoesApi.duplicar(g.id)).id))}
              >
                Nova variação
              </Botao>
            )}
            {g && !rascunho && (
              <>
                <SeletorQuantidade valor={quantidade} aoMudar={setQuantidade} />
                <Botao
                  variante="primario"
                  icone={<Play className="size-4" />}
                  carregando={ocupado === "mais"}
                  disabled={!!ocupado}
                  title="Mesmas configurações, seed nova — os outputs entram nesta geração"
                  onClick={() => acao("mais", async () => {
                    await geracoesApi.gerar(g.id, quantidade);
                    await recarregar();
                  })}
                >
                  Gerar mais
                </Botao>
              </>
            )}
            {ativa && (
              <Botao
                variante="perigo"
                icone={<Square className="size-4" />}
                carregando={ocupado === "cancelar"}
                onClick={() => acao("cancelar", async () => {
                  await geracoesApi.cancelar(g!.id);
                  await recarregar();
                })}
              >
                Cancelar{rodadasAtivas.length > 1 ? ` (${rodadasAtivas.length})` : ""}
              </Botao>
            )}
            {rascunho && (
              <>
                <Botao
                  carregando={ocupado === "salvar"}
                  disabled={!workflow || !!ocupado}
                  onClick={() => acao("salvar", async () => {
                    const id = await salvar();
                    if (!g) abrir(id, true);
                    else embutida?.aoAlterar?.();
                  })}
                >
                  Salvar rascunho
                </Botao>
                <SeletorQuantidade valor={quantidade} aoMudar={setQuantidade} />
                <Botao
                  variante="primario"
                  icone={<Play className="size-4" />}
                  carregando={ocupado === "gerar"}
                  disabled={!workflow || !!ocupado}
                  onClick={() => acao("gerar", async () => {
                    const id = await salvar();
                    try {
                      await geracoesApi.gerar(id, quantidade);
                    } finally {
                      // Mesmo se o ComfyUI recusar, o rascunho já foi salvo: abre ele.
                      if (!g) abrir(id, true);
                    }
                    if (g) await recarregar();
                  })}
                >
                  Gerar
                </Botao>
              </>
            )}
          </>
        }
      />

      {/*
        Os dados da geração numa faixa sob o título: quem, o quê, com qual
        workflow. Embaixo, a largura toda fica para os campos e os outputs.
      */}
      <section className={`border-b border-zinc-800 bg-zinc-950/40 py-5 ${embutida ? "px-6" : "px-8"}`}>
        {/* Embutida (no asset ou no shot), o dono é a própria página: sem "Pertence a". */}
        <fieldset
          disabled={!rascunho}
          className={`grid items-start gap-6 ${
            embutida
              ? "grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]"
              : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]"
          }`}
        >
          {!embutida && (
            <Campo rotulo="Pertence a">
              <SeletorDono valor={dono} aoMudar={setDono} />
            </Campo>
          )}
          <Campo rotulo="Tipo de geração" dica={tipoAtual?.descricao}>
            <Seletor value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">{tipos.length ? "— Escolha —" : "— Nenhum para este dono —"}</option>
              {tipos.map((t) => (
                <option key={t.chave} value={t.chave}>
                  {t.nome}
                </option>
              ))}
              {/* Geração antiga de um tipo que não vale mais para o dono: ainda aparece. */}
              {g && !tipos.some((t) => t.chave === g.tipo) && <option value={g.tipo}>{g.tipoNome}</option>}
            </Seletor>
          </Campo>
          <Campo rotulo="Workflow do ComfyUI" dica={wfAtual?.descricao}>
            <Seletor value={workflow} onChange={(e) => setWorkflow(e.target.value)} disabled={!tipoAtual}>
              <option value="">— Escolha —</option>
              {tipoAtual?.workflows.map((w) => (
                <option key={w.chave} value={w.chave}>
                  {w.nome}
                </option>
              ))}
              {g && !tipoAtual?.workflows.some((w) => w.chave === g.workflow) && <option value={g.workflow}>{g.workflowNome}</option>}
            </Seletor>
          </Campo>
          <Campo rotulo="Nome" dica="Opcional: sem nome, aparece o começo do prompt.">
            <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
        </fieldset>
        {(g || wfAtual) && (
          <dl className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-zinc-800/70 pt-4 text-xs">
            {g && (
              <div className="flex items-center gap-2">
                <dt className="text-zinc-500">Status</dt>
                <dd>
                  <EtiquetaStatus status={g.status} />
                </dd>
              </div>
            )}
            {(g?.modelo ?? wfAtual?.modelo) && <Info rotulo="Modelo">{g?.modelo ?? wfAtual?.modelo}</Info>}
            {wfAtual && <Info rotulo="No ComfyUI">{wfAtual.arquivoComfy}</Info>}
            {g && <Info rotulo="Criada">{formatarData(g.criadoEm)}</Info>}
            {g && g.rodadas.length > 0 && <Info rotulo="Rodadas">{g.rodadas.length}</Info>}
            {duracao !== null && <Info rotulo="Última levou">{duracao}s no ComfyUI</Info>}
          </dl>
        )}
      </section>

      <div className={`flex flex-col gap-8 ${embutida ? "p-6" : "p-8"}`}>
          {erro && <Aviso>{erro}</Aviso>}
          {ultimaFalha && (
            <Aviso>
              <b>A última rodada falhou:</b> {ultimaFalha.erro}
            </Aviso>
          )}

          {g && !rascunho && (
            <Secao titulo={`Outputs (${g.outputs.length})`}>
              {g.outputs.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
                  {g.outputs.map((o) => (
                    <button key={o.id} type="button" onClick={() => setAbertoId(o.id)} className="overflow-hidden rounded-xl border border-zinc-800 bg-black hover:border-violet-500/60">
                      <img src={urlArquivo(o.arquivo)} alt="" className="w-full object-contain" />
                      <div className="flex justify-between gap-3 bg-zinc-900 px-3 py-1.5 text-left text-xs text-zinc-500">
                        <span>{o.largura ? `${o.largura} × ${o.altura}` : ""}</span>
                        {o.seed != null && <span className="font-mono">seed {o.seed}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                !ativa && <Vazio icone={<Sparkles />} titulo="Sem outputs" />
              )}
            </Secao>
          )}

          {!wfAtual && rascunho && (
            <Vazio
              icone={<Sparkles />}
              titulo={catalogo.dados && tipos.length === 0 ? "Nenhum tipo de geração para este dono ainda" : "Escolha o tipo de geração e o workflow"}
              texto={
                catalogo.dados && tipos.length === 0
                  ? "Os tipos de geração são programados por workflow do ComfyUI. Hoje existe a Placa de cenário, para assets do tipo Cenário."
                  : "Os campos aparecem conforme o workflow escolhido, acima."
              }
            />
          )}
          {wfAtual && (
            <fieldset disabled={!rascunho} className="flex flex-col gap-6">
              {wfAtual.campos.map((c) => (
                <CampoDinamico key={c.chave} campo={c} valor={valores[c.chave]} aoMudar={(v) => setValores((x) => ({ ...x, [c.chave]: v }))} somenteLeitura={!rascunho} />
              ))}
            </fieldset>
          )}
      </div>

      <Modal aberto={!!abertoId} titulo="Outputs" largura="enorme" aoFechar={() => setAbertoId(null)}>
        {g && abertoId && <VisorOutputs outputs={g.outputs} abertoId={abertoId} aoMudar={setAbertoId} />}
      </Modal>
      {g && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir geração"
          // Com outputs, as imagens vão junto: aí não basta um clique.
          exigirDigitar={g.outputs.length ? "EXCLUIR" : undefined}
          texto={
            g.outputs.length ? (
              <>
                A geração <b>{tituloGeracao(g)}</b> será excluída <b>junto com {g.outputs.length === 1 ? "o output" : `os ${g.outputs.length} outputs`}</b>{" "}
                — as imagens são apagadas de <span className="font-mono">D:\Creativa</span> e não dá para desfazer.
              </>
            ) : (
              <>
                A geração <b>{tituloGeracao(g)}</b> será excluída.
              </>
            )
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await geracoesApi.apagar(g.id);
            aoExcluir();
          }}
        />
      )}
    </div>
  );
}

/**
 * O visor de outputs: a imagem grande, com setas para passar de uma para
 * outra (e as setas do teclado). Dá a volta: depois da última vem a primeira.
 */
function VisorOutputs({ outputs, abertoId, aoMudar }: { outputs: Output[]; abertoId: string; aoMudar: (id: string) => void }) {
  const i = Math.max(0, outputs.findIndex((o) => o.id === abertoId));
  const o = outputs[i];
  const varios = outputs.length > 1;
  const ir = (delta: number) => {
    const proximo = outputs[(i + delta + outputs.length) % outputs.length];
    if (proximo) aoMudar(proximo.id);
  };

  useEffect(() => {
    if (!varios) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") ir(-1);
      if (e.key === "ArrowRight") ir(1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (!o) return null;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex w-full items-center justify-center">
        <img src={urlArquivo(o.arquivo)} alt="" className="max-h-[75vh] object-contain" />
        {varios && (
          <>
            <BotaoSeta lado="esquerda" onClick={() => ir(-1)} />
            <BotaoSeta lado="direita" onClick={() => ir(1)} />
          </>
        )}
      </div>
      <div className="flex w-full items-center justify-between gap-4 text-sm text-zinc-400">
        <span className="tabular-nums">
          {varios && <b className="text-zinc-200">{i + 1} de {outputs.length}</b>}
          {varios && " · "}
          {o.largura && `${o.largura} × ${o.altura}`}
          {o.seed != null && <span className="font-mono"> · seed {o.seed}</span>}
        </span>
        {varios && <span className="text-xs text-zinc-500">← → para navegar</span>}
        <a href={urlArquivo(o.arquivo)} target="_blank" rel="noreferrer" className="text-violet-300 hover:underline">
          Abrir em tamanho real numa aba nova
        </a>
      </div>
    </div>
  );
}

function BotaoSeta({ lado, onClick }: { lado: "esquerda" | "direita"; onClick: () => void }) {
  const Icone = lado === "esquerda" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "esquerda" ? "Output anterior" : "Próximo output"}
      className={`absolute top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-zinc-100 backdrop-blur hover:bg-black/85 ${lado === "esquerda" ? "left-3" : "right-3"}`}
    >
      <Icone className="size-7" />
    </button>
  );
}

/** Quantas rodadas mandar de uma vez (1 a 4). A GPU é uma só: elas entram na fila. */
function SeletorQuantidade({ valor, aoMudar }: { valor: number; aoMudar: (n: number) => void }) {
  return (
    <Seletor value={valor} onChange={(e) => aoMudar(Number(e.target.value))} className="w-20" title="Quantas de uma vez">
      {[1, 2, 3, 4].map((n) => (
        <option key={n} value={n}>
          {n}×
        </option>
      ))}
    </Seletor>
  );
}

/** Um campo do workflow, montado a partir da descrição que a API manda. */
function CampoDinamico({
  campo: c,
  valor,
  aoMudar,
  somenteLeitura,
}: {
  campo: CampoWorkflow;
  valor: unknown;
  aoMudar: (v: unknown) => void;
  somenteLeitura: boolean;
}) {
  if (c.tipo === "texto") return <CampoTexto campo={c} valor={String(valor ?? "")} aoMudar={aoMudar} somenteLeitura={somenteLeitura} />;
  if (c.tipo === "opcoes") {
    return (
      <Campo rotulo={c.rotulo} dica={c.dica}>
        <Seletor value={String(valor ?? c.padrao)} onChange={(e) => aoMudar(e.target.value)} className="w-96">
          {c.opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </Seletor>
      </Campo>
    );
  }
  // Seed: aleatória (null) ou um número fixo. Depois de enviada, mostra a que foi usada.
  const fixa = typeof valor === "number";
  if (somenteLeitura && !fixa) {
    return (
      <Campo rotulo={c.rotulo}>
        <span className="text-sm text-zinc-400">Aleatória — a seed de cada imagem aparece embaixo dela.</span>
      </Campo>
    );
  }
  return (
    <Campo rotulo={c.rotulo} dica={somenteLeitura ? "A seed do formulário. “Gerar mais” sorteia uma nova a cada rodada." : "Aleatória é sorteada no envio; a de cada imagem fica gravada embaixo dela."}>
      <div className="flex items-center gap-3">
        {!somenteLeitura && (
          <Pilulas
            valor={fixa ? "fixa" : "aleatoria"}
            aoMudar={(m) => aoMudar(m === "fixa" ? Math.floor(Math.random() * 2 ** 48) : null)}
            opcoes={[
              { valor: "aleatoria", rotulo: "Aleatória" },
              { valor: "fixa", rotulo: "Fixa" },
            ]}
          />
        )}
        {fixa && (
          <Entrada
            type="number"
            min={0}
            value={valor}
            onChange={(e) => aoMudar(e.target.value === "" ? null : Number(e.target.value))}
            className="w-64 font-mono"
          />
        )}
      </div>
    </Campo>
  );
}

function CampoTexto({
  campo: c,
  valor,
  aoMudar,
  somenteLeitura,
}: {
  campo: Extract<CampoWorkflow, { tipo: "texto" }>;
  valor: string;
  aoMudar: (v: string) => void;
  somenteLeitura: boolean;
}) {
  const palavras = valor.trim() ? valor.trim().split(/\s+/).length : 0;
  const naFaixa = c.palavras ? palavras >= c.palavras.min && palavras <= c.palavras.max : true;
  // Avisos só com texto escrito: campo vazio não precisa de sermão.
  const avisos = useMemo(
    () =>
      valor.trim() && !somenteLeitura
        ? (c.avisos ?? []).filter((a) => {
            const casa = new RegExp(a.padrao, "i").test(valor);
            return a.quando === "falta" ? !casa : casa;
          })
        : [],
    [valor, c.avisos, somenteLeitura],
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-4">
        <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
          {c.rotulo}
          {c.obrigatorio && <span className="text-violet-400"> *</span>}
        </span>
        {c.palavras && (
          <span className={`text-xs tabular-nums ${palavras === 0 ? "text-zinc-500" : naFaixa ? "text-emerald-400" : "text-amber-400"}`}>
            {palavras} palavras · meta {c.palavras.min}–{c.palavras.max}
          </span>
        )}
      </div>
      <AreaTexto value={valor} onChange={(e) => aoMudar(e.target.value)} rows={c.linhas ?? 4} spellCheck={false} />
      {c.dica && !somenteLeitura && <p className="text-xs leading-relaxed text-zinc-500">{c.dica}</p>}
      {avisos.map((a) => (
        <p key={a.padrao} className="flex gap-2 text-xs leading-relaxed text-amber-300">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {a.mensagem}
        </p>
      ))}
    </div>
  );
}

/** Um par rótulo/valor da faixa de informações da geração. */
function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className="truncate text-zinc-300">{children}</dd>
    </div>
  );
}
