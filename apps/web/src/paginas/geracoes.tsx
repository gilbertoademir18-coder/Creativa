import { ArrowLeft, Check, ImagePlus, Plus, Sparkles, Trash, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { geracoesApi, outputsApi, referenciasApi, workflowsApi, type Dono, type GeracaoNova } from "../api.ts";
import { FiltroBusca, FiltroProjeto, FiltroSelecao } from "../componentes/filtros.tsx";
import { EtiquetaStatus, TabelaGeracoes } from "../componentes/geracoes.tsx";
import { Miniatura } from "../componentes/midia.tsx";
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
  GRADE,
  Pilulas,
  Secao,
  Seletor,
  Vazio,
} from "../componentes/ui.tsx";
import { useCarregar, useFiltros } from "../hooks.ts";
import { formatarData, STATUS_GERACAO, TIPOS_REFERENCIA, tituloGeracao } from "../rotulos.ts";
import type { GeracaoDetalhe, Output, Referencia, StatusGeracao, TipoReferencia, Vinculo } from "../tipos.ts";

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
        subtitulo="Prompt, referências, workflow e modelo de cada geração — e os outputs que ela produziu."
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

/** Uma entrada escolhida no formulário: a referência ou o output inteiro, para mostrar a miniatura. */
type EntradaEscolhida = { referencia: Referencia; output?: undefined } | { output: Output; referencia?: undefined };
const chaveEntrada = (e: EntradaEscolhida) => (e.referencia ? `r:${e.referencia.id}` : `o:${e.output!.id}`);

/** `/geracoes/nova` (com `?asset=` ou `?shot=` opcionais) e `/geracoes/:id`. */
export function PaginaGeracao() {
  const { id } = useParams();
  const nova = !id;
  const { dados, erro } = useCarregar(() => (id ? geracoesApi.ler(id) : Promise.resolve(null)), [id]);
  if (erro) return <div className="p-8"><Aviso>{erro}</Aviso></div>;
  if (!nova && !dados) return <Carregando />;
  // `key`: trocar de geração recria o formulário, em vez de herdar o estado da anterior.
  return <FormGeracao key={id ?? "nova"} geracao={dados} />;
}

function FormGeracao({ geracao: g }: { geracao: GeracaoDetalhe | null }) {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const editavel = !g || g.status === "RASCUNHO";

  const [nome, setNome] = useState(g?.nome ?? "");
  const [prompt, setPrompt] = useState(g?.prompt ?? "");
  const [promptNegativo, setPromptNegativo] = useState(g?.promptNegativo ?? "");
  const [modelo, setModelo] = useState(g?.modelo ?? "");
  const [workflowId, setWorkflowId] = useState(g?.workflowId ?? "");
  const [dono, setDono] = useState<Dono>(
    g ? { assetId: g.assetId, shotId: g.shotId } : { assetId: params.get("asset"), shotId: params.get("shot") },
  );
  const [entradas, setEntradas] = useState<EntradaEscolhida[]>(
    g?.entradas.map((e) => (e.referencia ? { referencia: e.referencia } : { output: e.output! })) ?? [],
  );
  const [escolhendo, setEscolhendo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { dados: workflows } = useCarregar(() => workflowsApi.listar(), []);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const dados: GeracaoNova = {
      ...dono,
      nome: nome || null,
      prompt,
      promptNegativo: promptNegativo || null,
      modelo: modelo || null,
      workflowId: workflowId || null,
      entradas: entradas.map((e) => (e.referencia ? { referenciaId: e.referencia.id } : { outputId: e.output!.id })),
    };
    try {
      if (g) {
        await geracoesApi.salvar(g.id, dados);
        setSalvando(false);
      } else {
        const criada = await geracoesApi.criar(dados);
        navegar(`/geracoes/${criada.id}`, { replace: true });
      }
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  const alternar = (e: EntradaEscolhida) =>
    setEntradas((atual) =>
      atual.some((x) => chaveEntrada(x) === chaveEntrada(e)) ? atual.filter((x) => chaveEntrada(x) !== chaveEntrada(e)) : [...atual, e],
    );

  return (
    <>
      <Cabecalho
        voltar={
          <Link to="/geracoes" className="inline-flex items-center gap-1.5 hover:text-zinc-100">
            <ArrowLeft className="size-4" /> Gerações
          </Link>
        }
        titulo={g ? tituloGeracao(g) : "Nova geração"}
        subtitulo={g && <DescricaoDono r={g} />}
        acoes={
          <>
            {g && (
              <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
                Excluir
              </Botao>
            )}
            {editavel && (
              <Botao variante="primario" carregando={salvando} onClick={salvar}>
                {g ? "Salvar" : "Criar geração"}
              </Botao>
            )}
          </>
        }
      />
      <div className="grid grid-cols-[1fr_24rem] gap-8 p-8">
        {/* `fieldset disabled` trava tudo de uma vez quando a geração já rodou. */}
        <fieldset disabled={!editavel} className="flex min-w-0 flex-col gap-8">
          {erro && <Aviso>{erro}</Aviso>}
          <Campo rotulo="Prompt">
            <AreaTexto value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} autoFocus={!g} placeholder="Descreva o que gerar..." />
          </Campo>
          <Campo rotulo="Prompt negativo">
            <AreaTexto value={promptNegativo} onChange={(e) => setPromptNegativo(e.target.value)} rows={3} placeholder="O que evitar (opcional)" />
          </Campo>

          <Secao
            titulo={`Entradas (${entradas.length})`}
            acoes={
              editavel && (
                <Botao icone={<ImagePlus className="size-4" />} onClick={() => setEscolhendo(true)}>
                  Escolher referências e outputs
                </Botao>
              )
            }
          >
            {entradas.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhuma entrada. Referências e outputs de outras gerações guiam esta geração.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {entradas.map((e) => (
                  <div key={chaveEntrada(e)} className="group relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                    <div className="aspect-square bg-black">
                      {e.referencia ? (
                        <Miniatura tipo={e.referencia.tipo} arquivo={e.referencia.arquivo} texto={e.referencia.texto} />
                      ) : (
                        <Miniatura tipo={e.output!.tipo} arquivo={e.output!.arquivo} />
                      )}
                    </div>
                    <div className="truncate px-2 py-1.5 text-xs text-zinc-400">
                      {e.referencia ? e.referencia.nome : `Output de ${tituloGeracao(e.output!.geracao ?? { nome: null, prompt: "" })}`}
                    </div>
                    {editavel && (
                      <button
                        type="button"
                        aria-label="Remover entrada"
                        onClick={() => alternar(e)}
                        className="absolute top-1.5 right-1.5 hidden size-7 items-center justify-center rounded-md bg-black/70 text-zinc-200 group-hover:flex hover:bg-red-600"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Secao>

          <Secao titulo={`Outputs (${g?.outputs.length ?? 0})`}>
            {g?.outputs.length ? (
              <div className={GRADE}>
                {g.outputs.map((o) => (
                  <div key={o.id} className="aspect-square overflow-hidden rounded-xl border border-zinc-800 bg-black">
                    <Miniatura tipo={o.tipo} arquivo={o.arquivo} ajuste="contain" />
                  </div>
                ))}
              </div>
            ) : (
              <Vazio icone={<Sparkles />} titulo="Nenhum output ainda" texto="Os outputs aparecem aqui quando a geração rodar no ComfyUI." />
            )}
          </Secao>
        </fieldset>

        <aside className="flex flex-col gap-5 self-start rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          {g && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Status</span>
              <EtiquetaStatus status={g.status} />
            </div>
          )}
          {!editavel && <p className="text-xs text-zinc-500">Esta geração já foi enviada ao ComfyUI: é o registro do que rodou e não se edita.</p>}
          <fieldset disabled={!editavel} className="flex flex-col gap-5">
            <Campo rotulo="Nome" dica="Opcional: sem nome, aparece o começo do prompt.">
              <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo rotulo="Pertence a">
              <SeletorDono valor={dono} aoMudar={setDono} />
            </Campo>
            <Campo rotulo="Workflow do ComfyUI" dica={workflows?.length === 0 ? "Os workflows chegam com a integração do ComfyUI." : undefined}>
              <Seletor value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
                <option value="">— Nenhum —</option>
                {workflows?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.nome}
                  </option>
                ))}
              </Seletor>
            </Campo>
            <Campo rotulo="Modelo de IA">
              <Entrada value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="flux1-dev-fp8.safetensors" />
            </Campo>
          </fieldset>
          {g && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-zinc-800 pt-4 text-xs text-zinc-400">
              <dt className="text-zinc-500">Criada</dt>
              <dd>{formatarData(g.criadoEm)}</dd>
              <dt className="text-zinc-500">Editada</dt>
              <dd>{formatarData(g.editadoEm)}</dd>
              {g.concluidaEm && (
                <>
                  <dt className="text-zinc-500">Concluída</dt>
                  <dd>{formatarData(g.concluidaEm)}</dd>
                </>
              )}
            </dl>
          )}
          {g?.erro && <Aviso>{g.erro}</Aviso>}
        </aside>
      </div>

      <Modal aberto={escolhendo} titulo="Escolher entradas" largura="enorme" aoFechar={() => setEscolhendo(false)}>
        <SeletorEntradas escolhidas={entradas.map(chaveEntrada)} aoAlternar={alternar} aoConcluir={() => setEscolhendo(false)} />
      </Modal>
      {g && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir geração"
          texto={
            <>
              A geração <b>{tituloGeracao(g)}</b> será excluída. Geração com outputs não pode ser excluída.
            </>
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await geracoesApi.apagar(g.id);
            navegar("/geracoes");
          }}
        />
      )}
    </>
  );
}

/**
 * Escolher referências e outputs como entrada. Clicar marca e desmarca na
 * hora; "Concluir" só fecha.
 */
function SeletorEntradas({
  escolhidas,
  aoAlternar,
  aoConcluir,
}: {
  escolhidas: string[];
  aoAlternar: (e: EntradaEscolhida) => void;
  aoConcluir: () => void;
}) {
  const [aba, setAba] = useState<"referencias" | "outputs">("referencias");
  const [projeto, setProjeto] = useState("");
  const [tipo, setTipo] = useState<TipoReferencia | "">("");
  const [busca, setBusca] = useState("");
  const refs = useCarregar(() => referenciasApi.listar({ projeto, tipo, busca }), [projeto, tipo, busca]);
  const outs = useCarregar(() => outputsApi.listar({ projeto }), [projeto]);


  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Pilulas
          valor={aba}
          aoMudar={setAba}
          opcoes={[
            { valor: "referencias", rotulo: "Referências" },
            { valor: "outputs", rotulo: "Outputs" },
          ]}
        />
        <FiltroProjeto valor={projeto} aoMudar={setProjeto} />
        {aba === "referencias" && (
          <>
            <Pilulas
              valor={tipo}
              aoMudar={setTipo}
              opcoes={[{ valor: "", rotulo: "Todos" }, ...TIPOS_REFERENCIA.map((t) => ({ valor: t.valor, rotulo: t.plural }))]}
            />
            <FiltroBusca valor={busca} aoMudar={setBusca} />
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-400">{escolhidas.length} escolhida(s)</span>
          <Botao variante="primario" onClick={aoConcluir}>
            Concluir
          </Botao>
        </div>
      </div>
      <div className="min-h-[50vh]">
        {aba === "referencias" &&
          (refs.dados?.length === 0 ? (
            <Vazio icone={<ImagePlus />} titulo="Nenhuma referência com esses filtros" />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {refs.dados?.map((r) => (
                <CartaoEscolha key={r.id} marcada={escolhidas.includes(`r:${r.id}`)} rotulo={r.nome} aoClicar={() => aoAlternar({ referencia: r })}>
                  <Miniatura tipo={r.tipo} arquivo={r.arquivo} texto={r.texto} />
                </CartaoEscolha>
              ))}
            </div>
          ))}
        {aba === "outputs" &&
          (outs.dados?.length === 0 ? (
            <Vazio icone={<Sparkles />} titulo="Nenhum output ainda" texto="Outputs chegam quando as gerações rodarem no ComfyUI." />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {outs.dados?.map((o) => (
                <CartaoEscolha
                  key={o.id}
                  marcada={escolhidas.includes(`o:${o.id}`)}
                  rotulo={tituloGeracao(o.geracao ?? { nome: null, prompt: "" })}
                  aoClicar={() => aoAlternar({ output: o })}
                >
                  <Miniatura tipo={o.tipo} arquivo={o.arquivo} />
                </CartaoEscolha>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

/** Um cartão do seletor de entradas, com a marca de escolhido. */
function CartaoEscolha({
  marcada,
  rotulo,
  children,
  aoClicar,
}: {
  marcada: boolean;
  rotulo: string;
  children: React.ReactNode;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className={`relative overflow-hidden rounded-lg border-2 text-left transition-colors ${marcada ? "border-violet-500" : "border-zinc-800 hover:border-zinc-600"}`}
    >
      <div className="aspect-square bg-black">{children}</div>
      <div className="truncate bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300">{rotulo}</div>
      {marcada && (
        <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-violet-600 text-white">
          <Check className="size-4" />
        </span>
      )}
    </button>
  );
}
