import { ArrowDownToLine, LoaderCircle, Play, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { assistentesApi, geradorApi, outputsApi, type Dono } from "../api.ts";
import { useCarregar } from "../hooks.ts";
import type { Execucao, Output, OutputDetalhe, PipelineResolvido, RascunhoGerador, TipoCatalogo } from "../tipos.ts";
import { BarraAssistente, limparTextoLlm, SeletorAssistente } from "./assistente-prompt.tsx";
import { CampoDinamico, SeletorQuantidade, valoresPara } from "./campos-workflow.tsx";
import { AbasEtapas, alimentaOutra, CHAVE_UNICA, entradasDe, etapaDaVez, etapaDe, PIPELINE_UNICO, temEtapas } from "./etapas.tsx";
import { CartaoOutput, GruposDeOutputs, VisorOutputs, type Escolha } from "./outputs.tsx";
import { ideiaComEscolhas, separarIdeia } from "../opcoes-ideia.ts";
import { Aviso, Botao, Campo, Carregando, Seletor, Vazio } from "./ui.tsx";

/*
 * O Gerador de um asset ou shot. Não é um cadastro: é o formulário do
 * catálogo (tipo de geração → workflow → campos) e o botão "Gerar". Cada
 * imagem que sai é um Output do dono, com tudo o que foi usado para gerá-la.
 *
 * O shot pode ter ETAPAS (o pipeline dele, ex.: "First frame + vídeo"): aí o
 * Gerador é um por etapa — formulário, galeria e imagem escolhida de cada
 * uma —, e a aba de cima troca entre elas. Com uma etapa só (a geração
 * única, de quem não escolheu pipeline) nada disso aparece: é a tela de
 * sempre. Ver `componentes/etapas.tsx`.
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
/** JSON com as chaves em ordem: o banco (jsonb) devolve o rascunho com outra ordem, e o mesmo rascunho parecia mudado. */
function jsonEstavel(v: unknown): string {
  return JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x,
  );
}

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
  const salvo = useCarregar(() => geradorApi.etapas(dono), [dono.assetId, dono.shotId]);

  /*
   * O pipeline e os rascunhos (um por etapa) viram estado: o rascunho da
   * etapa em que não se está precisa ficar guardado aqui, senão trocar de
   * aba e voltar perderia o que estava no formulário.
   */
  const [pipeline, setPipeline] = useState<PipelineResolvido | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoGerador> | null>(null);
  const [etapaAtual, setEtapaAtual] = useState(CHAVE_UNICA);
  useEffect(() => {
    // Falhar ao ler as etapas não tranca o Gerador: cai na geração única.
    const r = salvo.dados ?? (salvo.erro ? { pipeline: PIPELINE_UNICO, rascunhos: {} } : null);
    if (!r) return;
    setPipeline(r.pipeline);
    setRascunhos(r.rascunhos);
    // Ao entrar no shot (ou no F5), abre a etapa em que ele está; depois, a aba é de quem clica.
    setEtapaAtual((a) => (r.pipeline.etapas.some((e) => e.chave === a) ? a : etapaDaVez(r.pipeline, r.rascunhos)));
  }, [salvo.dados, salvo.erro]);

  const [config, setConfig] = useState<Config | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  /** O output aberto no "Ver pipeline" (null: fechado). */
  const [vendoPipeline, setVendoPipeline] = useState<string | null>(null);
  const formulario = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  const tipos = catalogo.dados ?? [];
  const etapa = pipeline?.etapas.find((e) => e.chave === etapaAtual) ?? null;
  /** O que esta etapa gera: o tipo dela, ou qualquer um (na geração única). */
  const tiposDaEtapa = etapa?.tipoGeracao ? tipos.filter((t) => t.chave === etapa.tipoGeracao) : tipos;
  const tipoAtual = tipos.find((t) => t.chave === config?.tipo);
  const wfAtual = tipoAtual?.workflows.find((w) => w.chave === config?.workflow);

  /** A etapa de um output ou execução deste dono. Sem pipeline ainda, a única. */
  const etapaDisto = (x: { etapa: string | null; tipoGeracao: string }) => (pipeline ? etapaDe(x, pipeline) : CHAVE_UNICA);
  /** O tipo de geração de uma execução, que guarda só o workflow. */
  const tipoDoWorkflow = (w: string) => tipos.find((t) => t.workflows.some((x) => x.chave === w))?.chave ?? "";
  /** O output aprovado desta etapa: o que as seguintes recebem, ou, na última, a versão final do shot. */
  const escolhido = rascunhos?.[etapaAtual]?.escolhido ?? null;
  // Toda etapa de um pipeline de verdade escolhe — até a última, que não alimenta ninguém.
  const podeEscolher = !!pipeline && temEtapas(pipeline);
  const alimenta = !!pipeline && alimentaOutra(pipeline, etapaAtual);
  // O "Escolher" de um output, no cartão e no visor.
  const escolhaDe = (o: Output): Escolha | undefined =>
    podeEscolher
      ? {
          escolhida: escolhido === o.id,
          rotulo: alimenta ? "Escolher — é esta que a próxima etapa recebe" : "Escolher — a versão final deste shot",
          aoEscolher: () => escolher(escolhido === o.id ? null : o.id),
        }
      : undefined;

  /*
   * As imagens que vêm de outra etapa (o `entradas` do pipeline): o campo
   * abre com o output escolhido lá. Só preenche campo vazio — trocar a
   * imagem à mão continua valendo, e quem muda a escolha da etapa anterior
   * limpa este campo para ele pegar a nova (ver `escolher`).
   */
  function comEntradas(c: Config): Config {
    if (!pipeline || !rascunhos) return c;
    const valores = { ...c.valores };
    let mudou = false;
    for (const en of entradasDe(pipeline, etapaAtual)) {
      const fonte = rascunhos[en.daEtapa]?.escolhido;
      if (fonte && en.campo in valores && valores[en.campo] == null) {
        valores[en.campo] = { origem: "output", id: fonte };
        mudou = true;
      }
    }
    return mudou ? { ...c, valores } : c;
  }

  /** Põe um formulário na tela, já com as imagens que vêm de outra etapa. */
  const porNaTela = (c: Config) => setConfig(comEntradas(c));

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
  /** As opções da ideia escolhidas (grupo → rótulo), entre as do assistente. */
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
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
    if (!ideia.trim()) return setErroAssistente("Escreva sua ideia antes de expandir.");
    // A ideia com as escolhas anexadas: é o que a LLM lê e o que o output guarda.
    const base = ideiaCompleta;
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
   * rascunho, das configurações do output mais recente da etapa (seed
   * aleatória de novo); sem output, dos padrões do primeiro tipo do catálogo.
   * Com `?usar=<output>` na URL (vindo da galeria geral), as daquele output.
   *
   * Vale por etapa: entrar numa etapa é como abrir outro Gerador.
   */
  const iniciado = useRef<string | null>(null);
  const chaveDono = `${dono.assetId ?? dono.shotId ?? ""}|${etapaAtual}`;
  /** O último rascunho que está no banco, para não salvar o mesmo de novo. */
  const ultimoSalvo = useRef<string | null>(null);
  /** O rascunho esperando os 800 ms: sair do dono antes disso salva na hora (no dono certo). */
  const pendente = useRef<(() => void) | null>(null);
  useEffect(() => () => pendente.current?.(), []);
  const vazio = () => porNaTela(ajustar({ tipo: "", workflow: "", valores: {} }, tiposDaEtapa));
  useEffect(() => {
    if (!catalogo.dados || !outputs.dados || !pipeline || !rascunhos || iniciado.current === chaveDono) return;
    const r = rascunhos[etapaAtual];
    const usar = params.get("usar");
    /*
     * Um output de outro tipo vindo da galeria geral pertence a outra etapa:
     * vai para ela, em vez de trocar o tipo (que a etapa fixa) na marra.
     */
    if (usar && !r) {
      const daOutra = outputs.dados.find((o) => o.id === usar);
      const outra = daOutra && etapaDisto(daOutra);
      if (outra && outra !== etapaAtual) return setEtapaAtual(outra);
    }
    iniciado.current = chaveDono;
    ultimoSalvo.current = r ? jsonEstavel(r) : null;
    if (usar) {
      outputsApi
        .ler(usar)
        .then((o) => aplicar(o, false))
        .catch(vazio);
      setParams((p) => {
        const novo = new URLSearchParams(p);
        novo.delete("usar");
        return novo;
      }, { replace: true, preventScrollReset: true, state: window.history.state?.usr });
      return;
    }
    if (r) {
      porNaTela(ajustar({ tipo: r.tipo, workflow: r.workflow, valores: r.valores }, tiposDaEtapa));
      setIdeia(r.ideia ?? "");
      setEscolhas(r.escolhas ?? {});
      // O rascunho guarda de que ideia saiu o prompt; nos antigos, que não
      // guardavam, supõe que saiu da ideia salva (sem aviso em tudo de uma vez).
      setIdeiaDoPrompt(r.ideiaDoPrompt !== undefined ? r.ideiaDoPrompt : (r.ideia?.trim() ?? null));
      assistenteDesejado.current = r.assistente;
      return;
    }
    // O mais recente desta etapa, pela data: a lista vem com os favoritos na frente.
    const ultimo = outputs.dados
      .filter((o) => etapaDisto(o) === etapaAtual)
      .reduce<(typeof outputs.dados)[number] | undefined>((mais, o) => (!mais || o.criadoEm > mais.criadoEm ? o : mais), undefined);
    if (ultimo) {
      outputsApi
        .ler(ultimo.id)
        .then((o) => aplicar(o, false, true))
        .catch(vazio);
    } else {
      vazio();
    }
  }, [catalogo.dados, outputs.dados, pipeline, rascunhos, chaveDono]);

  /*
   * Salva o rascunho sozinho, um pouco depois da última mudança. Não salva
   * enquanto a LLM escreve (o prompt muda a cada pedaço) nem enquanto a lista
   * de assistentes carrega (o assistente escolhido ainda não é conhecido, e
   * salvaria "nenhum" por cima do que estava).
   */
  const assistenteNome = disponiveis.dados?.find((a) => a.id === assistenteId)?.nome ?? null;
  const opcoesDoAssistente = disponiveis.dados?.find((a) => a.id === assistenteId)?.opcoes ?? null;
  /** A ideia com as escolhas anexadas — o que vai à LLM e o que o aviso compara. */
  const ideiaCompleta = ideiaComEscolhas(ideia.trim(), escolhas, opcoesDoAssistente);
  useEffect(() => {
    if (!config || expandindo || iniciado.current !== chaveDono) return;
    if (disponiveis.carregando || assistenteDesejado.current !== null) return;
    const r: RascunhoGerador = {
      tipo: config.tipo,
      workflow: config.workflow,
      valores: config.valores,
      assistente: assistenteNome,
      ideia: ideia.trim() ? ideia : null,
      escolhas,
      // A escolha é de quem clica no cartão, não do formulário: só passa adiante.
      escolhido,
      // Para o aviso de "a ideia mudou e não foi expandida" sobreviver a um F5.
      ideiaDoPrompt,
    };
    const json = jsonEstavel(r);
    if (json === ultimoSalvo.current) return;
    const salvar = () => {
      pendente.current = null;
      // Guarda aqui também: trocar de aba e voltar mostra o que estava escrito.
      setRascunhos((m) => ({ ...(m ?? {}), [etapaAtual]: r }));
      geradorApi
        .salvarRascunho(dono, etapaAtual, r)
        .then(() => (ultimoSalvo.current = json))
        .catch(() => {}); // Rascunho é conveniência: falhar não atrapalha gerar.
    };
    pendente.current = salvar;
    const t = setTimeout(salvar, 800);
    return () => {
      clearTimeout(t);
      if (pendente.current === salvar) pendente.current = null;
    };
  }, [config, assistenteNome, ideia, escolhas, ideiaDoPrompt, expandindo, disponiveis.carregando, chaveDono, escolhido]);

  /**
   * A imagem aprovada desta etapa — a que as etapas seguintes recebem.
   *
   * Quem muda a escolha limpa o campo ligado nas etapas que comem esta: no
   * próximo acesso elas pegam a imagem nova sozinhas, em vez de ficar com a
   * antiga grudada no rascunho.
   */
  async function escolher(id: string | null) {
    if (!pipeline || !rascunhos || !config) return;
    const atual: RascunhoGerador = rascunhos[etapaAtual] ?? {
      tipo: config.tipo,
      workflow: config.workflow,
      valores: config.valores,
      assistente: assistenteNome,
      ideia: ideia.trim() ? ideia : null,
      escolhido: null,
    };
    const novos: Record<string, RascunhoGerador> = { [etapaAtual]: { ...atual, escolhido: id } };
    for (const e of pipeline.etapas) {
      const dele = rascunhos[e.chave];
      const ligados = e.entradas.filter((en) => en.daEtapa === etapaAtual);
      if (!dele || !ligados.length) continue;
      const valores = { ...dele.valores };
      for (const en of ligados) if (en.campo in valores) valores[en.campo] = null;
      novos[e.chave] = { ...dele, valores };
    }
    setRascunhos((m) => ({ ...(m ?? {}), ...novos }));
    // O formulário que está na tela não precisa gravar de novo o que já vai aqui.
    ultimoSalvo.current = jsonEstavel(novos[etapaAtual]);
    setErro(null);
    await Promise.all(Object.entries(novos).map(([chave, r]) => geradorApi.salvarRascunho(dono, chave, r))).catch((e) =>
      setErro(`Não consegui guardar a escolha: ${(e as Error).message}`),
    );
  }

  /** Leva as configurações de um output ao formulário. `seedAleatoria`: não repete a seed dele. */
  function aplicar(o: OutputDetalhe, rolar = true, seedAleatoria = false) {
    const valores = { ...o.parametros };
    if (seedAleatoria) {
      const campos = tipos.flatMap((t) => t.workflows).find((w) => w.chave === o.workflow)?.campos ?? [];
      for (const c of campos) if (c.tipo === "seed") valores[c.chave] = null;
    }
    porNaTela(ajustar({ tipo: o.tipoGeracao, workflow: o.workflow, valores }, tiposDaEtapa));
    // O assistente e a ideia daquele output também voltam.
    // O output guarda a ideia com as escolhas anexadas: separa as duas de volta.
    const separada = separarIdeia(o.ideia ?? "");
    setIdeia(separada.ideia);
    setEscolhas(separada.escolhas);
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
        etapa: etapaAtual,
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

  /** A galeria é da etapa: cada compartimento mostra só o que saiu dele. */
  const todos = outputs.dados ?? [];
  // O "Ver pipeline": o escolhido de cada etapa, na ordem das etapas.
  const doPipeline = (pipeline?.etapas ?? []).flatMap((e, n) => {
    const o = todos.find((x) => x.id === rascunhos?.[e.chave]?.escolhido);
    return o ? [{ o, titulo: `${n + 1} · ${e.nome}` }] : [];
  });
  const lista = pipeline ? todos.filter((o) => etapaDisto(o) === etapaAtual) : todos;
  /** Outputs do shot que não são de etapa nenhuma deste pipeline (o tipo saiu dele). */
  const foraDasEtapas = pipeline && temEtapas(pipeline) ? todos.filter((o) => etapaDisto(o) === null).length : 0;
  const daEtapa = (e: Execucao) => etapaDisto({ etapa: e.etapa, tipoGeracao: tipoDoWorkflow(e.workflow) }) === etapaAtual;
  const falhas = (execucoes.dados ?? []).filter((e) => e.status === "FALHOU" && daEtapa(e)).reverse();
  /*
   * O que falta escolher antes desta etapa poder gerar: a etapa anterior não
   * tem imagem escolhida **e** o campo está vazio. Com o campo preenchido (à
   * mão, ou pelas configurações do último output) não falta nada — avisar ali
   * seria reclamar de um formulário que já está pronto.
   */
  const faltaEscolher = pipeline
    ? entradasDe(pipeline, etapaAtual).filter((en) => !rascunhos?.[en.daEtapa]?.escolhido && config?.valores[en.campo] == null)
    : [];
  /** Na galeria, só a fila desta etapa; o acompanhamento segue olhando todas. */
  const naFila = ativas.filter(daEtapa);

  return (
    <div className="grid grid-cols-[minmax(30rem,5fr)_minmax(0,7fr)] items-start gap-8">
      {/* O formulário fica parado enquanto a galeria rola ao lado. */}
      <div ref={formulario} className="sticky top-6 scroll-mt-6 overflow-hidden rounded-xl border border-violet-500/30 bg-zinc-900/40">
        {/* O "Gerar" mora no título: à vista em qualquer ponto do formulário, que rola embaixo. */}
        <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-2.5">
          <Sparkles className="size-4 text-violet-300" />
          <h2 className="font-semibold">Gerador</h2>
          {config && wfAtual && (
            <div className="ml-auto flex items-center gap-2">
              <SeletorQuantidade valor={quantidade} aoMudar={setQuantidade} />
              <Botao variante="primario" icone={<Play className="size-4" />} carregando={gerando} disabled={expandindo} onClick={gerar}>
                Gerar
              </Botao>
            </div>
          )}
        </div>
        {pipeline && (
          <AbasEtapas
            pipeline={pipeline}
            atual={etapaAtual}
            aoTrocar={(c) => {
              // Grava agora o que estava esperando os 800 ms: a aba muda o formulário.
              pendente.current?.();
              setEtapaAtual(c);
            }}
            estado={(c) => ({
              outputs: todos.filter((o) => etapaDisto(o) === c).length,
              escolhida: !!rascunhos?.[c]?.escolhido,
              miniatura: (() => {
                const o = todos.find((x) => x.id === rascunhos?.[c]?.escolhido);
                return o ? { tipo: o.tipo, arquivo: o.previa ?? o.arquivo } : undefined;
              })(),
            })}
            aoVerPipeline={
              doPipeline.length
                ? (chave) => setVendoPipeline((chave && rascunhos?.[chave]?.escolhido) || doPipeline[0]!.o.id)
                : undefined
            }
          />
        )}
        <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-5 overflow-y-auto p-5">
          {erro && <Aviso>{erro}</Aviso>}
          {catalogo.erro && <Aviso>{catalogo.erro}</Aviso>}
          {!catalogo.dados && !catalogo.erro && <Carregando />}
          {catalogo.dados && tiposDaEtapa.length === 0 && (
            <Vazio
              icone={<Sparkles />}
              titulo="Nada para gerar nesta etapa"
              texto={
                etapa?.tipoGeracao
                  ? `A etapa “${etapa.nome}” gera “${etapa.tipoGeracao}”, que não aparece no Gerador dos shots ou não tem workflow. Confira em Tipos de geração e em Workflows.`
                  : "Nenhum tipo de geração aparece aqui, ou nenhum tem workflow. Cadastre em Tipos de geração (onde ele aparece) e em Workflows."
              }
            />
          )}
          {faltaEscolher.map((en) => (
            <Aviso key={en.campo}>
              Escolha a imagem da etapa <b>{en.nomeDaEtapa}</b> (o “Escolher” no canto do cartão) — é ela que entra aqui.
            </Aviso>
          ))}
          {config && tiposDaEtapa.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {/* Com o tipo fixado pela etapa, o seletor dele só teria uma opção. */}
                {!etapa?.tipoGeracao && (
                  <Campo rotulo="Tipo de geração" dica={tipoAtual?.descricao ?? undefined}>
                    <Seletor value={config.tipo} onChange={(e) => porNaTela(ajustar({ ...config, tipo: e.target.value, workflow: "" }, tiposDaEtapa))}>
                      {tiposDaEtapa.map((t) => (
                        <option key={t.chave} value={t.chave}>
                          {t.nome}
                        </option>
                      ))}
                    </Seletor>
                  </Campo>
                )}
                <Campo rotulo="Workflow" dica={wfAtual?.descricao ?? undefined}>
                  <Seletor value={config.workflow} onChange={(e) => porNaTela(ajustar({ ...config, workflow: e.target.value }, tiposDaEtapa))}>
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
                      deNovo={ideiaDoPrompt !== null && ideiaDoPrompt === ideiaCompleta}
                      pendente={!ideia.trim() || ideiaDoPrompt === ideiaCompleta ? null : ideiaDoPrompt === null ? "nova" : "mudou"}
                      opcoes={opcoesDoAssistente}
                      escolhas={escolhas}
                      aoMudarEscolhas={setEscolhas}
                      podeDesfazer={promptAnterior !== null}
                      aviso={avisoAssistente}
                      erro={erroAssistente}
                      aoExpandir={expandir}
                      aoParar={() => parar.current?.abort()}
                      aoDesfazer={desfazer}
                      aoPrevia={() => assistentesApi.previa(assistenteId, { ...dono, workflow: config!.workflow, ideia: ideiaCompleta })}
                    />
                  )}
                  {/* Campo que o pipeline alimenta: dá para trocar, mas já vem certo. */}
                  {entradasDe(pipeline ?? PIPELINE_UNICO, etapaAtual)
                    .filter((en) => en.campo === c.chave)
                    .map((en) => (
                      <p key={en.daEtapa} className="flex items-center gap-1.5 text-xs text-violet-300/80">
                        <ArrowDownToLine className="size-3.5" />
                        Vem da etapa <b className="font-medium">{en.nomeDaEtapa}</b> — a imagem escolhida lá
                      </p>
                    ))}
                  <CampoDinamico
                    campo={c}
                    dono={dono}
                    irmaos={wfAtual?.campos.filter((x) => x.tipo === "imagem").map((x) => ({ campo: x, valor: config.valores[x.chave] }))}
                    valor={config.valores[c.chave]}
                    aoMudar={(v) => setConfig({ ...config, valores: { ...config.valores, [c.chave]: v } })}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">
          {pipeline && temEtapas(pipeline) ? etapa?.nome : "Outputs"}
          {outputs.dados ? ` (${lista.length})` : ""}
        </h2>
        {outputs.erro && <Aviso>{outputs.erro}</Aviso>}
        {falhas.map((f) => (
          <Aviso key={f.id}>
            <b>Uma geração falhou</b>
            {f.seed !== null && <span className="font-mono"> (seed {f.seed})</span>}: {f.erro}
          </Aviso>
        ))}
        {!outputs.dados && !outputs.erro && <Carregando />}
        {outputs.dados && lista.length === 0 && naFila.length === 0 && (
          <Vazio icone={<Sparkles />} titulo="Nenhum output ainda" texto="Escreva o prompt no Gerador e clique em Gerar — as imagens aparecem aqui." />
        )}
        {(lista.length > 0 || naFila.length > 0) && (
          <GruposDeOutputs
            outputs={lista}
            antesDosOutros={
              naFila.length > 0 && naFila.map((e, n) => <CartaoExecucao key={e.id} e={e} posicao={n + 1} aoCancelar={() => cancelar(e.id)} />)
            }
            cartao={(o) => (
              <CartaoOutput
                key={o.id}
                o={o}
                aoAbrir={() => setAbertoId(o.id)}
                aoFavoritar={async () => {
                  await outputsApi.favoritar(o.id, !o.favorito);
                  outputs.recarregar();
                }}
                escolha={escolhaDe(o)}
                aoExcluir={async () => {
                  await outputsApi.apagar(o.id);
                  // Era a escolhida desta etapa: a seguinte não pode ficar apontando para o nada.
                  if (escolhido === o.id) await escolher(null);
                  outputs.recarregar();
                }}
              />
            )}
          />
        )}
        {/* Histórico de um tipo que saiu do pipeline: não está em etapa nenhuma, mas existe. */}
        {foraDasEtapas > 0 && (
          <p className="text-xs text-zinc-500">
            {foraDasEtapas} output(s) deste shot não são de nenhuma etapa deste pipeline.{" "}
            <Link to={`/outputs?shot=${dono.shotId}`} className="text-zinc-400 underline decoration-dotted hover:text-violet-300">
              Ver todos
            </Link>
          </p>
        )}
      </section>

      <VisorOutputs
        outputs={doPipeline.map((x) => x.o)}
        abertoId={vendoPipeline}
        aoMudar={setVendoPipeline}
        aoFechar={() => setVendoPipeline(null)}
        aoAlterar={outputs.recarregar}
        titulo={(o) => doPipeline.find((x) => x.o.id === o.id)?.titulo ?? "Output"}
      />
      <VisorOutputs
        outputs={lista}
        abertoId={abertoId}
        aoMudar={setAbertoId}
        aoFechar={() => setAbertoId(null)}
        aoAlterar={outputs.recarregar}
        escolha={escolhaDe}
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
