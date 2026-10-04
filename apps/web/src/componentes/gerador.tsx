import { LoaderCircle, Play, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { assistentesApi, geradorApi, outputsApi, type Dono } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import type { Execucao, OutputDetalhe, RascunhoGerador, TipoCatalogo } from "../tipos.ts";
import { BarraAssistente, limparTextoLlm, SeletorAssistente } from "./assistente-prompt.tsx";
import { CampoDinamico, SeletorQuantidade, valoresPara } from "./campos-workflow.tsx";
import { CartaoOutput, GRADE_OUTPUTS, VisorOutputs } from "./outputs.tsx";
import { Aviso, Botao, Campo, Carregando, Seletor, Vazio } from "./ui.tsx";

/*
 * O Gerador de um asset ou shot. Não é um cadastro: é o formulário do
 * catálogo (tipo de geração → workflow → campos) e o botão "Gerar". Cada
 * imagem que sai é um Output do dono, com tudo o que foi usado para gerá-la.
 *
 * O tipo e o workflow vêm escolhidos pelo dono (o catálogo só oferece o que
 * serve para ele — Cenário tem Placa de cenário...). O formulário não se
 * esvazia ao gerar: muda uma palavra do prompt e gera de novo.
 *
 * O formulário fica salvo no dono (o rascunho do Gerador): sai do asset,
 * volta amanhã, e está tudo como deixou — workflow, assistente, ideia e
 * campos. É também onde a skill de workflows deixa um exemplo pronto.
 */

/** O que está no formulário do Gerador. */
type Config = { tipo: string; workflow: string; valores: Record<string, unknown> };

/**
 * Acerta a configuração com o catálogo: tipo que não serve para o dono cai
 * para o primeiro, workflow que não é do tipo cai para o primeiro dele, e os
 * campos ganham os padrões que faltam.
 */
function ajustar(c: Config, catalogo: TipoCatalogo[]): Config {
  const tipo = catalogo.find((t) => t.chave === c.tipo) ?? catalogo[0];
  if (!tipo) return { tipo: "", workflow: "", valores: c.valores };
  const wf = tipo.workflows.find((w) => w.chave === c.workflow) ?? tipo.workflows[0]!;
  return { tipo: tipo.chave, workflow: wf.chave, valores: valoresPara(wf.campos, c.valores) };
}

const ATIVA = (e: Execucao) => e.status === "NA_FILA" || e.status === "EXECUTANDO";

export function PainelGerador({ dono }: { dono: Dono }) {
  const catalogo = useCarregar(() => geradorApi.catalogo(dono), [dono.assetId, dono.shotId]);
  const outputs = useCarregar(
    () => outputsApi.listar({ asset: dono.assetId ?? undefined, shot: dono.shotId ?? undefined }),
    [dono.assetId, dono.shotId],
  );
  const execucoes = useCarregar(() => geradorApi.execucoes(dono), [dono.assetId, dono.shotId]);
  const salvo = useCarregar(() => geradorApi.rascunho(dono), [dono.assetId, dono.shotId]);

  const [config, setConfig] = useState<Config | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const formulario = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  const tipos = catalogo.dados ?? [];
  const tipoAtual = tipos.find((t) => t.chave === config?.tipo);
  const wfAtual = tipoAtual?.workflows.find((w) => w.chave === config?.workflow);

  /*
   * O assistente de prompt: escolhido por workflow (só aparecem os que valem
   * para ele e para o projeto do dono). São dois textos: a `ideia`, que é da
   * pessoa (a caixa "Sua ideia", nunca apagada, salva no rascunho), e o
   * prompt, que o assistente escreve a partir dela e a pessoa ainda pode
   * ajustar. `ideiaDoPrompt` é a ideia de onde saiu o prompt atual — vai
   * junto para o output; null se quem escreveu o prompt foi a pessoa.
   */
  const campoAssistivel = wfAtual?.campos.find((c) => c.tipo === "texto" && c.assistivel);
  const disponiveis = useCarregar(
    () => (config?.workflow && campoAssistivel ? assistentesApi.disponiveis(dono, config.workflow) : Promise.resolve([])),
    [dono.assetId, dono.shotId, config?.workflow, !!campoAssistivel],
  );
  const estadoLlm = useCarregar(() => assistentesApi.estado(), []);
  const [assistenteId, setAssistenteId] = useState("");
  const [ideia, setIdeia] = useState("");
  const [ideiaDoPrompt, setIdeiaDoPrompt] = useState<string | null>(null);
  /** O prompt de antes da última expansão: para onde o "Desfazer" volta. */
  const [promptAnterior, setPromptAnterior] = useState<string | null>(null);
  const [expandindo, setExpandindo] = useState(false);
  const [avisoAssistente, setAvisoAssistente] = useState<string | null>(null);
  const [erroAssistente, setErroAssistente] = useState<string | null>(null);
  const parar = useRef<AbortController | null>(null);
  /** Ao aplicar um output, o assistente dele — escolhido pelo nome quando a lista do workflow chegar. */
  const assistenteDesejado = useRef<string | null>(null);

  useEffect(() => {
    const lista = disponiveis.dados;
    if (!lista) return;
    if (assistenteDesejado.current !== null) {
      const a = lista.find((x) => x.nome === assistenteDesejado.current);
      assistenteDesejado.current = null;
      if (a) return setAssistenteId(a.id);
    }
    if (assistenteId && lista.some((a) => a.id === assistenteId)) return;
    // Um só? Já vem escolhido.
    setAssistenteId(lista.length === 1 ? lista[0]!.id : "");
  }, [disponiveis.dados]);

  /** Escreve no campo do assistente sem perder o que mudou no resto do formulário enquanto a LLM escrevia. */
  const escreverPrompt = (chave: string, texto: string) =>
    setConfig((c) => c && { ...c, valores: { ...c.valores, [chave]: texto } });

  /** Escreve o prompt a partir da ideia. A ideia fica como está; o prompt anterior, guardado para o "Desfazer". */
  async function expandir() {
    if (!config || !campoAssistivel || !assistenteId) return;
    const chave = campoAssistivel.chave;
    const atual = String(config.valores[chave] ?? "");
    const base = ideia.trim();
    if (!base) return setErroAssistente("Escreva sua ideia antes de expandir.");
    const controle = new AbortController();
    parar.current = controle;
    setExpandindo(true);
    setErroAssistente(null);
    setAvisoAssistente(null);
    let texto = "";
    try {
      await assistentesApi.expandir(
        assistenteId,
        { ...dono, workflow: config.workflow, ideia: base },
        {
          aoComecar: (comfyOcupado) => {
            if (comfyOcupado) setAvisoAssistente("O ComfyUI está gerando: o assistente divide a placa com ele e vai mais devagar.");
          },
          aoPedaco: (pedaco) => {
            texto += pedaco;
            escreverPrompt(chave, texto);
          },
        },
        controle.signal,
      );
      const limpo = limparTextoLlm(texto);
      if (!limpo) throw new Error("A LLM não escreveu nada. Tente de novo.");
      escreverPrompt(chave, limpo);
      setPromptAnterior(atual);
      setIdeiaDoPrompt(base);
    } catch (e) {
      // Parou ou falhou no meio: volta o que estava escrito.
      escreverPrompt(chave, atual);
      if (!controle.signal.aborted) setErroAssistente((e as Error).message);
    } finally {
      setExpandindo(false);
      parar.current = null;
    }
  }

  /** Volta o prompt de antes da última expansão (a ideia não muda). */
  function desfazer() {
    if (!campoAssistivel || promptAnterior === null) return;
    escreverPrompt(campoAssistivel.chave, promptAnterior);
    setPromptAnterior(null);
    setIdeiaDoPrompt(null);
  }

  /*
   * O formulário começa do rascunho salvo: é continuar de onde parou. Sem
   * rascunho, das configurações do output mais recente do dono (seed
   * aleatória de novo); sem output, dos padrões do primeiro tipo do catálogo.
   * Com `?usar=<output>` na URL (vindo da galeria geral), as daquele output.
   */
  const iniciado = useRef<string | null>(null);
  const chaveDono = dono.assetId ?? dono.shotId ?? "";
  /** O último rascunho que está no banco, para não salvar o mesmo de novo. */
  const ultimoSalvo = useRef<string | null>(null);
  useEffect(() => {
    if (!catalogo.dados || !outputs.dados || (!salvo.dados && !salvo.erro) || iniciado.current === chaveDono) return;
    iniciado.current = chaveDono;
    const r = salvo.dados?.rascunho;
    ultimoSalvo.current = r ? JSON.stringify(r) : null;
    const usar = params.get("usar");
    if (usar) {
      outputsApi
        .ler(usar)
        .then((o) => aplicar(o, false))
        .catch(() => setConfig(ajustar({ tipo: "", workflow: "", valores: {} }, catalogo.dados!)));
      setParams((p) => {
        const novo = new URLSearchParams(p);
        novo.delete("usar");
        return novo;
      }, { replace: true, preventScrollReset: true, state: window.history.state?.usr });
      return;
    }
    if (r) {
      setConfig(ajustar({ tipo: r.tipo, workflow: r.workflow, valores: r.valores }, catalogo.dados));
      setIdeia(r.ideia ?? "");
      // Com ideia salva, o prompt provavelmente saiu dela (o rascunho não guarda se foi editado à mão depois).
      setIdeiaDoPrompt(r.ideia);
      assistenteDesejado.current = r.assistente;
      return;
    }
    const ultimo = outputs.dados[0];
    if (ultimo) {
      outputsApi
        .ler(ultimo.id)
        .then((o) => aplicar(o, false, true))
        .catch(() => setConfig(ajustar({ tipo: "", workflow: "", valores: {} }, catalogo.dados!)));
    } else {
      setConfig(ajustar({ tipo: "", workflow: "", valores: {} }, catalogo.dados));
    }
  }, [catalogo.dados, outputs.dados, salvo.dados, salvo.erro, chaveDono]);

  /*
   * Salva o rascunho sozinho, um pouco depois da última mudança. Não salva
   * enquanto a LLM escreve (o prompt muda a cada pedaço) nem enquanto a lista
   * de assistentes carrega (o assistente escolhido ainda não é conhecido, e
   * salvaria "nenhum" por cima do que estava).
   */
  const assistenteNome = disponiveis.dados?.find((a) => a.id === assistenteId)?.nome ?? null;
  useEffect(() => {
    if (!config || expandindo || iniciado.current !== chaveDono) return;
    if (disponiveis.carregando || assistenteDesejado.current !== null) return;
    const r: RascunhoGerador = {
      tipo: config.tipo,
      workflow: config.workflow,
      valores: config.valores,
      assistente: assistenteNome,
      ideia: ideia.trim() ? ideia : null,
    };
    const json = JSON.stringify(r);
    if (json === ultimoSalvo.current) return;
    const t = setTimeout(() => {
      geradorApi
        .salvarRascunho(dono, r)
        .then(() => (ultimoSalvo.current = json))
        .catch(() => {}); // Rascunho é conveniência: falhar não atrapalha gerar.
    }, 800);
    return () => clearTimeout(t);
  }, [config, assistenteNome, ideia, expandindo, disponiveis.carregando, chaveDono]);

  /** Leva as configurações de um output ao formulário. `seedAleatoria`: não repete a seed dele. */
  function aplicar(o: OutputDetalhe, rolar = true, seedAleatoria = false) {
    const valores = { ...o.parametros };
    if (seedAleatoria) {
      const campos = tipos.flatMap((t) => t.workflows).find((w) => w.chave === o.workflow)?.campos ?? [];
      for (const c of campos) if (c.tipo === "seed") valores[c.chave] = null;
    }
    setConfig(ajustar({ tipo: o.tipoGeracao, workflow: o.workflow, valores }, catalogo.dados ?? tipos));
    // O assistente e a ideia daquele output também voltam.
    setIdeia(o.ideia ?? "");
    setIdeiaDoPrompt(o.ideia);
    setPromptAnterior(null);
    const doOutput = o.assistente ? disponiveis.dados?.find((a) => a.nome === o.assistente) : undefined;
    if (doOutput) setAssistenteId(doOutput.id);
    else assistenteDesejado.current = o.assistente;
    if (rolar) formulario.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Enquanto há execução na fila ou rodando, acompanha; quando uma termina, a galeria recarrega.
  const ativas = (execucoes.dados ?? []).filter(ATIVA);
  const qtdAtivas = useRef(0);
  useEffect(() => {
    if (ativas.length < qtdAtivas.current) outputs.recarregar();
    qtdAtivas.current = ativas.length;
    if (!ativas.length) return;
    const t = setInterval(execucoes.recarregar, 1_500);
    return () => clearInterval(t);
  }, [ativas.length, execucoes.recarregar]);

  async function gerar() {
    if (!config || !wfAtual) return;
    setGerando(true);
    setErro(null);
    try {
      // O assistente só fica registrado se foi ele quem escreveu o prompt.
      const doAssistente = ideiaDoPrompt !== null && !!assistenteId;
      await geradorApi.executar({
        ...dono,
        tipo: config.tipo,
        workflow: config.workflow,
        parametros: config.valores,
        quantidade,
        assistenteId: doAssistente ? assistenteId : null,
        ideia: doAssistente ? ideiaDoPrompt : null,
      });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
      execucoes.recarregar();
    }
  }

  async function cancelar(id: string) {
    await geradorApi.cancelar(id).catch((e) => setErro((e as Error).message));
    execucoes.recarregar();
  }

  const falhas = (execucoes.dados ?? []).filter((e) => e.status === "FALHOU").reverse();
  const lista = outputs.dados ?? [];

  return (
    <div className="grid grid-cols-[minmax(30rem,5fr)_minmax(0,7fr)] items-start gap-8">
      {/* O formulário fica parado enquanto a galeria rola ao lado. */}
      <div ref={formulario} className="sticky top-6 scroll-mt-6 overflow-hidden rounded-xl border border-violet-500/30 bg-zinc-900/40">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3.5">
          <Sparkles className="size-4 text-violet-300" />
          <h2 className="font-semibold">Gerador</h2>
        </div>
        <div className="flex max-h-[calc(100vh-14rem)] flex-col gap-5 overflow-y-auto p-5">
          {catalogo.erro && <Aviso>{catalogo.erro}</Aviso>}
          {!catalogo.dados && !catalogo.erro && <Carregando />}
          {catalogo.dados && tipos.length === 0 && (
            <Vazio
              icone={<Sparkles />}
              titulo="Nada para gerar aqui ainda"
              texto="Nenhum tipo de geração aparece aqui, ou nenhum tem workflow. Cadastre em Tipos de geração (onde ele aparece) e em Workflows."
            />
          )}
          {config && tipos.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Campo rotulo="Tipo de geração" dica={tipoAtual?.descricao ?? undefined}>
                  <Seletor value={config.tipo} onChange={(e) => setConfig(ajustar({ ...config, tipo: e.target.value, workflow: "" }, tipos))}>
                    {tipos.map((t) => (
                      <option key={t.chave} value={t.chave}>
                        {t.nome}
                      </option>
                    ))}
                  </Seletor>
                </Campo>
                <Campo rotulo="Workflow" dica={wfAtual?.descricao ?? undefined}>
                  <Seletor value={config.workflow} onChange={(e) => setConfig(ajustar({ ...config, workflow: e.target.value }, tipos))}>
                    {tipoAtual?.workflows.map((w) => (
                      <option key={w.chave} value={w.chave}>
                        {w.nome}
                      </option>
                    ))}
                  </Seletor>
                </Campo>
              </div>
              {wfAtual && (
                <p className="-mt-2 text-xs text-zinc-500">
                  {wfAtual.ferramentaNome}
                  {wfAtual.modelo && (
                    <>
                      {" "}· modelo <span className="font-mono text-zinc-400">{wfAtual.modelo}</span>
                    </>
                  )}
                  {wfAtual.origem && <> · {wfAtual.origem}</>}
                </p>
              )}
              {campoAssistivel && (
                <SeletorAssistente lista={disponiveis.dados} valor={assistenteId} aoMudar={setAssistenteId} desabilitado={expandindo} />
              )}
              {wfAtual?.campos.map((c) => (
                <div key={c.chave} className="flex flex-col gap-2">
                  {/* A ideia vem antes do prompt: é dela que ele sai. */}
                  {c === campoAssistivel && assistenteId && (
                    <BarraAssistente
                      estado={estadoLlm.dados}
                      expandindo={expandindo}
                      ideia={ideia}
                      aoMudarIdeia={setIdeia}
                      deNovo={ideiaDoPrompt !== null && ideiaDoPrompt === ideia.trim()}
                      podeDesfazer={promptAnterior !== null}
                      aviso={avisoAssistente}
                      erro={erroAssistente}
                      aoExpandir={expandir}
                      aoParar={() => parar.current?.abort()}
                      aoDesfazer={desfazer}
                    />
                  )}
                  <CampoDinamico
                    campo={c}
                    valor={config.valores[c.chave]}
                    aoMudar={(v) => setConfig({ ...config, valores: { ...config.valores, [c.chave]: v } })}
                  />
                </div>
              ))}
            </>
          )}
        </div>
        {config && wfAtual && (
          <div className="flex flex-col gap-3 border-t border-zinc-800 px-5 py-4">
            {erro && <Aviso>{erro}</Aviso>}
            <div className="flex items-center justify-end gap-2">
              <SeletorQuantidade valor={quantidade} aoMudar={setQuantidade} />
              <Botao variante="primario" icone={<Play className="size-4" />} carregando={gerando} disabled={expandindo} onClick={gerar}>
                Gerar
              </Botao>
            </div>
          </div>
        )}
      </div>

      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
          Outputs{outputs.dados ? ` (${lista.length})` : ""}
        </h2>
        {outputs.erro && <Aviso>{outputs.erro}</Aviso>}
        {falhas.map((f) => (
          <Aviso key={f.id}>
            <b>Uma geração falhou</b>
            {f.seed !== null && <span className="font-mono"> (seed {f.seed})</span>}: {f.erro}
          </Aviso>
        ))}
        {!outputs.dados && !outputs.erro && <Carregando />}
        {outputs.dados && lista.length === 0 && ativas.length === 0 && (
          <Vazio icone={<Sparkles />} titulo="Nenhum output ainda" texto="Escreva o prompt no Gerador e clique em Gerar — as imagens aparecem aqui." />
        )}
        {(lista.length > 0 || ativas.length > 0) && (
          <div className={GRADE_OUTPUTS}>
            {ativas.map((e, n) => (
              <CartaoExecucao key={e.id} e={e} posicao={n + 1} aoCancelar={() => cancelar(e.id)} />
            ))}
            {lista.map((o) => (
              <CartaoOutput
                key={o.id}
                o={o}
                aoAbrir={() => setAbertoId(o.id)}
                aoFavoritar={async () => {
                  await outputsApi.favoritar(o.id, !o.favorito);
                  outputs.recarregar();
                }}
              />
            ))}
          </div>
        )}
      </section>

      <VisorOutputs
        outputs={lista}
        abertoId={abertoId}
        aoMudar={setAbertoId}
        aoFechar={() => setAbertoId(null)}
        aoAlterar={outputs.recarregar}
        aoUsar={(o) => {
          setAbertoId(null);
          aplicar(o);
        }}
      />
    </div>
  );
}

/** O lugar de uma imagem que ainda vai chegar: na fila ou executando, com o progresso. */
function CartaoExecucao({ e, posicao, aoCancelar }: { e: Execucao; posicao: number; aoCancelar: () => void }) {
  const [cancelando, setCancelando] = useState(false);
  const executando = e.status === "EXECUTANDO";
  const pct = executando && e.progresso?.max ? Math.round((e.progresso.valor / e.progresso.max) * 100) : null;
  return (
    <div className={`overflow-hidden rounded-xl border ${executando ? "border-sky-900/70" : "border-zinc-800"} bg-zinc-900`}>
      <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-zinc-950 text-sm">
        {executando ? (
          <>
            <LoaderCircle className="size-7 animate-spin text-sky-300" />
            <span className="text-sky-200">Gerando{pct !== null && ` · ${pct}%`}</span>
            <span className="h-1.5 w-1/2 overflow-hidden rounded-full bg-zinc-800">
              <span
                className={`block h-full bg-sky-400 transition-all ${pct === null ? "w-1/3 animate-pulse" : ""}`}
                style={pct === null ? undefined : { width: `${pct}%` }}
              />
            </span>
          </>
        ) : (
          <>
            <span className="size-7 rounded-full border-2 border-zinc-700" />
            <span className="text-zinc-400">Na fila · {posicao}º daqui</span>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-500">
        <span className="font-mono">{e.seed !== null ? `seed ${e.seed}` : ""}</span>
        <button
          type="button"
          disabled={cancelando}
          onClick={async () => {
            setCancelando(true);
            await aoCancelar();
          }}
          className="flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-red-950/60 hover:text-red-300 disabled:opacity-40"
          title={executando ? "Interromper" : "Tirar da fila"}
        >
          {executando ? <Square className="size-3" /> : <X className="size-3.5" />}
          {executando ? "Interromper" : "Tirar da fila"}
        </button>
      </div>
    </div>
  );
}
