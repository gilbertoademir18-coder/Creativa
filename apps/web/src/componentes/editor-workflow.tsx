import { ArrowDown, ArrowUp, FileJson, FlaskConical, LoaderCircle, Plus, Trash, TriangleAlert, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { workflowsApi, type WorkflowNovo } from "../api.ts";
import type { Alvo, CampoWorkflow, EstadoTeste, GrafoApi, TipoCampo, TipoGeracao, WorkflowDetalhe } from "../tipos.ts";
import { CampoDinamico, padraoDe, valoresPara } from "./campos-workflow.tsx";
import { ConfirmarExclusao } from "./modal.tsx";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Pilulas, Seletor } from "./ui.tsx";

/*
 * O editor de um workflow: importar o grafo (o "Export (API)" do ComfyUI),
 * dizer quais entradas viram campos no Gerador, quais nós são a saída, e
 * testar — tudo antes de salvar.
 *
 * Sem <form>: a confirmação de exclusão tem o form dela, e form dentro de
 * form enviaria o de fora.
 */

type Aba = "dados" | "campos" | "saidas" | "testar";

const TIPOS_CAMPO: { valor: TipoCampo; rotulo: string }[] = [
  { valor: "texto", rotulo: "Texto" },
  { valor: "numero", rotulo: "Número" },
  { valor: "opcoes", rotulo: "Opções" },
  { valor: "seed", rotulo: "Seed" },
  { valor: "tamanho", rotulo: "Tamanho (largura × altura)" },
];

/** Os nós que costumam ser a saída de um workflow. */
const ehSaida = (classe: string) => /^Save|VideoCombine|SaveAnimated/i.test(classe);

/** Os nós que carregam o modelo principal, e a entrada com o nome do arquivo. */
const LOADERS: [RegExp, string[]][] = [
  [/UNETLoader|UnetLoaderGGUF|DiffusionModelLoader/i, ["unet_name", "model_name"]],
  [/CheckpointLoader/i, ["ckpt_name"]],
];

/** Uma entrada do grafo que dá para preencher (não vem de um fio). */
type EntradaGrafo = { no: string; entrada: string; valor: unknown; classe: string; titulo: string };

const ehLigacao = (v: unknown) => Array.isArray(v) && v.length === 2 && typeof v[0] === "string" && typeof v[1] === "number";
const ordemNo = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function entradasLiterais(grafo: GrafoApi | null): EntradaGrafo[] {
  if (!grafo) return [];
  return Object.keys(grafo)
    .sort(ordemNo)
    .flatMap((no) => {
      const n = grafo[no]!;
      return Object.entries(n.inputs)
        .filter(([, v]) => !ehLigacao(v))
        .map(([entrada, valor]) => ({ no, entrada, valor, classe: n.class_type, titulo: n._meta?.title ?? n.class_type }));
    });
}

/** "Prompt positivo" → "prompt_positivo": minúscula, sem acento, começa com letra. */
function chaveDoRotulo(rotulo: string): string {
  const c = rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(c) ? c : `c_${c || "campo"}`;
}

const resumoValor = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
};

/**
 * Campos sugeridos para um grafo recém-importado: a seed, o tamanho (um nó
 * com width e height) e os textos (prompts). É um ponto de partida — a
 * pessoa apaga o que não quer expor.
 */
function sugerirCampos(grafo: GrafoApi): CampoWorkflow[] {
  const ent = entradasLiterais(grafo);
  const campos: CampoWorkflow[] = [];
  const usadas = new Set<string>();
  const chave = (base: string) => {
    let c = base;
    for (let n = 2; usadas.has(c); n++) c = `${base}_${n}`;
    usadas.add(c);
    return c;
  };
  for (const e of ent.filter((e) => typeof e.valor === "string" && /^(text|prompt|positive|text_g)$/i.test(e.entrada))) {
    const rotulo = e.titulo !== e.classe ? e.titulo : "Prompt";
    campos.push({ tipo: "texto", chave: chave(chaveDoRotulo(rotulo)), rotulo, alvos: [{ no: e.no, entrada: e.entrada }], linhas: 8, padrao: String(e.valor) });
  }
  const tam = ent.find((e) => e.entrada === "width" && typeof e.valor === "number" && grafo[e.no]!.inputs.height !== undefined);
  if (tam) {
    const l = tam.valor as number;
    const a = grafo[tam.no]!.inputs.height as number;
    campos.push({
      tipo: "tamanho",
      chave: chave("tamanho"),
      rotulo: "Tamanho",
      largura: [{ no: tam.no, entrada: "width" }],
      altura: [{ no: tam.no, entrada: "height" }],
      opcoes: [{ valor: `${l}x${a}`, rotulo: `${l} × ${a}`, largura: l, altura: a }],
      padrao: `${l}x${a}`,
    });
  }
  const seeds = ent.filter((e) => /^(seed|noise_seed)$/.test(e.entrada) && typeof e.valor === "number");
  if (seeds.length) campos.push({ tipo: "seed", chave: chave("seed"), rotulo: "Seed", alvos: seeds.map((e) => ({ no: e.no, entrada: e.entrada })) });
  return campos;
}

function detectarModelo(grafo: GrafoApi): string | null {
  for (const no of Object.keys(grafo).sort(ordemNo)) {
    const n = grafo[no]!;
    for (const [classe, entradas] of LOADERS) {
      if (!classe.test(n.class_type)) continue;
      for (const e of entradas) if (typeof n.inputs[e] === "string") return n.inputs[e] as string;
    }
  }
  return null;
}

/** O texto das notas (MarkdownNote/Note) de um workflow no formato de tela. */
function notasDaTela(tela: { nodes?: { type?: string; widgets_values?: unknown[] }[] }): string {
  return (tela.nodes ?? [])
    .filter((n) => /Note/i.test(n.type ?? ""))
    .map((n) => (n.widgets_values ?? []).filter((v) => typeof v === "string").join("\n"))
    .join("\n\n")
    .trim();
}

async function lerJson(f: File): Promise<unknown> {
  try {
    return JSON.parse(await f.text());
  } catch {
    throw new Error(`${f.name} não é um JSON válido.`);
  }
}

export function EditorWorkflow({
  workflow,
  tipos,
  aoSalvar,
}: {
  workflow?: WorkflowDetalhe;
  tipos: TipoGeracao[];
  aoSalvar: () => void;
}) {
  const [aba, setAba] = useState<Aba>("dados");
  const [nome, setNome] = useState(workflow?.nome ?? "");
  const [tipoGeracaoId, setTipoGeracaoId] = useState(workflow?.tipoGeracao.id ?? (tipos.length === 1 ? tipos[0]!.id : ""));
  const [descricao, setDescricao] = useState(workflow?.descricao ?? "");
  const [notas, setNotas] = useState(workflow?.notas ?? "");
  const [origem, setOrigem] = useState(workflow?.origem ?? "");
  const [modelo, setModelo] = useState(workflow?.modelo ?? "");
  const [grafo, setGrafo] = useState<GrafoApi | null>(workflow?.grafo ?? null);
  const [campos, setCampos] = useState<CampoWorkflow[]>(workflow?.campos ?? []);
  const [saidas, setSaidas] = useState<string[]>(workflow?.saidas ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const arquivoApi = useRef<HTMLInputElement>(null);
  const arquivoTela = useRef<HTMLInputElement>(null);

  const entradas = entradasLiterais(grafo);

  async function importarApi(f: File) {
    setErro(null);
    setAviso(null);
    try {
      const j = (await lerJson(f)) as Record<string, unknown>;
      if (Array.isArray(j.nodes)) throw new Error("Esse é o formato de tela do ComfyUI. Exporte no formato API: menu Workflow → Export (API).");
      const g = j as GrafoApi;
      if (!Object.values(g).every((n) => typeof n?.class_type === "string" && n.inputs && typeof n.inputs === "object")) {
        throw new Error("O arquivo não parece um Export (API) do ComfyUI: falta class_type/inputs em algum nó.");
      }
      setGrafo(g);
      const arquivo = f.name.replace(/\.json$/i, "");
      setOrigem(f.name);
      if (!nome.trim()) setNome(arquivo.replace(/[\s_-]*\(?api\)?$/i, ""));
      if (!modelo.trim()) setModelo(detectarModelo(g) ?? "");
      const novasSaidas = Object.keys(g).filter((no) => ehSaida(g[no]!.class_type));
      // Reimportando: guarda as saídas que ainda existem; senão, as detectadas.
      setSaidas((s) => {
        const ainda = s.filter((no) => g[no]);
        return ainda.length ? ainda : novasSaidas;
      });
      if (campos.length === 0) {
        const sugeridos = sugerirCampos(g);
        setCampos(sugeridos);
        setAviso(
          `Grafo importado: ${Object.keys(g).length} nós. Sugeri ${sugeridos.length} campo(s) e ${novasSaidas.length} saída(s) — confira nas abas Campos e Saídas.`,
        );
      } else {
        setAviso(`Grafo trocado: ${Object.keys(g).length} nós. Os campos ficaram como estavam — confira se os alvos ainda existem.`);
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function importarNotas(f: File) {
    setErro(null);
    try {
      const n = notasDaTela((await lerJson(f)) as Parameters<typeof notasDaTela>[0]);
      if (!n) throw new Error("Esse arquivo não tem notas (nós Note ou MarkdownNote).");
      setNotas(n);
      setAviso("Notas importadas do workflow de tela.");
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const dados = (): WorkflowNovo => ({
    nome,
    tipoGeracaoId,
    ferramenta: "comfyui",
    descricao: descricao || null,
    notas: notas || null,
    origem: origem || null,
    modelo: modelo || null,
    grafo: grafo ?? {},
    campos,
    saidas,
  });

  async function salvar() {
    setErro(null);
    if (!grafo) return setErro("Importe o grafo (Export API do ComfyUI) antes de salvar.");
    if (!tipoGeracaoId) return setErro("Escolha o tipo de geração.");
    setSalvando(true);
    try {
      if (workflow) await workflowsApi.salvar(workflow.id, dados());
      else await workflowsApi.criar(dados());
      aoSalvar();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <Pilulas
          valor={aba}
          aoMudar={(v) => setAba(v as Aba)}
          opcoes={[
            { valor: "dados", rotulo: "Dados" },
            { valor: "campos", rotulo: `Campos (${campos.length})` },
            { valor: "saidas", rotulo: `Saídas (${saidas.length})` },
            { valor: "testar", rotulo: "Testar" },
          ]}
        />
        {workflow && <span className="font-mono text-xs text-zinc-500">chave: {workflow.chave}</span>}
      </div>

      {aviso && <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">{aviso}</p>}

      <div className="min-h-[55vh]">
        {aba === "dados" && (
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-700 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileJson className="size-4 text-violet-300" /> O grafo
                </div>
                <p className="text-xs text-zinc-400">
                  No ComfyUI, com o workflow aberto: menu <b>Workflow → Export (API)</b>. É o grafo exatamente como roda.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={arquivoApi} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importarApi(f);
                    e.target.value = "";
                  }} />
                  <Botao variante={grafo ? "secundario" : "primario"} icone={<FileJson className="size-4" />} onClick={() => arquivoApi.current?.click()}>
                    {grafo ? "Trocar o grafo" : "Importar Export (API)"}
                  </Botao>
                  {grafo && <span className="text-xs text-zinc-500">{Object.keys(grafo).length} nós{origem && ` · ${origem}`}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
                  <input ref={arquivoTela} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importarNotas(f);
                    e.target.value = "";
                  }} />
                  <Botao variante="fantasma" onClick={() => arquivoTela.current?.click()}>
                    Trazer as notas do .json de tela
                  </Botao>
                  <span className="text-xs text-zinc-500">opcional: o LEIA-ME do workflow vira as notas</span>
                </div>
              </div>
              <Campo rotulo="Nome">
                <Entrada value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Character sheet (Qwen Image)" />
              </Campo>
              <div className="grid grid-cols-2 gap-4">
                <Campo rotulo="Tipo de geração">
                  <Seletor value={tipoGeracaoId} onChange={(e) => setTipoGeracaoId(e.target.value)}>
                    <option value="">— Escolha —</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </Seletor>
                </Campo>
                <Campo rotulo="Ferramenta" dica="Por enquanto só o ComfyUI.">
                  <Seletor value="comfyui" disabled>
                    <option value="comfyui">ComfyUI</option>
                  </Seletor>
                </Campo>
              </div>
              <Campo rotulo="Modelo principal" dica="Gravado em cada output. Detectado do grafo; pode ajustar.">
                <Entrada value={modelo} onChange={(e) => setModelo(e.target.value)} className="font-mono" />
              </Campo>
              <Campo rotulo="Descrição" dica="Uma linha: aparece no Gerador, embaixo da escolha do workflow.">
                <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
              </Campo>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Notas (markdown)</span>
              <AreaTexto
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={26}
                spellCheck={false}
                className="font-mono text-xs leading-relaxed"
                placeholder="O que é fixo neste workflow e por quê, de onde vieram os números, as armadilhas..."
              />
            </div>
          </div>
        )}

        {aba === "campos" && (
          <EditorCampos grafo={grafo} entradas={entradas} campos={campos} aoMudar={setCampos} aoSugerir={() => grafo && setCampos(sugerirCampos(grafo))} />
        )}

        {aba === "saidas" && <EditorSaidas grafo={grafo} saidas={saidas} aoMudar={setSaidas} />}

        {aba === "testar" && <PainelTeste grafo={grafo} campos={campos} saidas={saidas} />}
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-between gap-2 border-t border-zinc-800 pt-4">
        {workflow ? (
          <Botao variante="perigo" icone={<Trash className="size-4" />} onClick={() => setExcluindo(true)}>
            Excluir
          </Botao>
        ) : (
          <span />
        )}
        <Botao variante="primario" carregando={salvando} onClick={salvar}>
          {workflow ? "Salvar" : "Criar workflow"}
        </Botao>
      </div>

      {workflow && (
        <ConfirmarExclusao
          aberto={excluindo}
          titulo="Excluir workflow"
          texto={
            <>
              O workflow <b>{workflow.nome}</b> será excluído e some do Gerador. Os outputs já gerados com ele continuam, com tudo o que foi usado
              gravado neles.
            </>
          }
          aoFechar={() => setExcluindo(false)}
          aoConfirmar={async () => {
            await workflowsApi.apagar(workflow.id);
            aoSalvar();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campos                                                               */
/* ------------------------------------------------------------------ */

const codigoAlvo = (a: Alvo) => `${a.no}::${a.entrada}`;

/** Escolhe uma entrada do grafo: "nó · título → entrada (valor atual)". */
function SeletorAlvo({ entradas, valor, aoMudar, filtro }: { entradas: EntradaGrafo[]; valor: Alvo; aoMudar: (a: Alvo) => void; filtro?: (e: EntradaGrafo) => boolean }) {
  const lista = filtro ? entradas.filter((e) => filtro(e) || codigoAlvo(e) === codigoAlvo(valor)) : entradas;
  const existe = entradas.some((e) => codigoAlvo(e) === codigoAlvo(valor));
  return (
    <Seletor
      value={codigoAlvo(valor)}
      onChange={(e) => {
        const [no, entrada] = e.target.value.split("::");
        aoMudar({ no: no!, entrada: entrada! });
      }}
      className={`font-mono text-xs ${existe || !valor.no ? "" : "border-red-800 text-red-300"}`}
    >
      {!valor.no && <option value="::">— Escolha onde entra —</option>}
      {valor.no && !existe && <option value={codigoAlvo(valor)}>nó {valor.no} → {valor.entrada} (não existe no grafo)</option>}
      {lista.map((e) => (
        <option key={codigoAlvo(e)} value={codigoAlvo(e)}>
          {e.no} · {e.titulo} → {e.entrada} = {resumoValor(e.valor)}
        </option>
      ))}
    </Seletor>
  );
}

/** Uma lista de alvos: o primeiro e, se precisar, outros ("também escreve em"). */
function ListaAlvos({ entradas, alvos, aoMudar, filtro }: { entradas: EntradaGrafo[]; alvos: Alvo[]; aoMudar: (a: Alvo[]) => void; filtro?: (e: EntradaGrafo) => boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {alvos.map((a, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <SeletorAlvo entradas={entradas} valor={a} filtro={filtro} aoMudar={(n) => aoMudar(alvos.map((x, j) => (j === i ? n : x)))} />
          </div>
          {alvos.length > 1 && (
            <button type="button" title="Tirar este alvo" onClick={() => aoMudar(alvos.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-300">
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => aoMudar([...alvos, { no: "", entrada: "" }])} className="self-start text-xs text-violet-300 hover:underline">
        + também escrever em outra entrada
      </button>
    </div>
  );
}

/** Um campo novo do tipo pedido, aproveitando rótulo, chave e alvos do anterior. */
function trocarTipo(c: CampoWorkflow, tipo: TipoCampo, entradas: EntradaGrafo[]): CampoWorkflow {
  const base = { chave: c.chave, rotulo: c.rotulo, dica: c.dica };
  const alvos = c.tipo === "tamanho" ? c.largura : c.alvos;
  const atual = entradas.find((e) => alvos[0] && codigoAlvo(e) === codigoAlvo(alvos[0]))?.valor;
  switch (tipo) {
    case "texto":
      return { ...base, tipo, alvos, linhas: 4, padrao: typeof atual === "string" ? atual : "" };
    case "numero":
      return { ...base, tipo, alvos, padrao: typeof atual === "number" ? atual : 0 };
    case "opcoes": {
      const v = typeof atual === "number" || typeof atual === "string" ? atual : "";
      return { ...base, tipo, alvos, opcoes: [{ valor: v, rotulo: String(v) }], padrao: v };
    }
    case "seed":
      return { ...base, tipo, alvos };
    case "tamanho":
      return { ...base, tipo, largura: alvos, altura: [{ no: alvos[0]?.no ?? "", entrada: "height" }], opcoes: [{ valor: "1024x1024", rotulo: "1024 × 1024", largura: 1024, altura: 1024 }], padrao: "1024x1024" };
  }
}

function EditorCampos({
  grafo,
  entradas,
  campos,
  aoMudar,
  aoSugerir,
}: {
  grafo: GrafoApi | null;
  entradas: EntradaGrafo[];
  campos: CampoWorkflow[];
  aoMudar: (c: CampoWorkflow[]) => void;
  aoSugerir: () => void;
}) {
  if (!grafo) return <Aviso>Importe o grafo na aba Dados primeiro: os campos apontam para entradas dele.</Aviso>;
  const mudar = (i: number, c: CampoWorkflow) => aoMudar(campos.map((x, j) => (j === i ? c : x)));
  const mover = (i: number, d: number) => {
    const n = [...campos];
    const [c] = n.splice(i, 1);
    n.splice(i + d, 0, c!);
    aoMudar(n);
  };
  const novo = (): CampoWorkflow => {
    const usadas = new Set(campos.map((c) => c.chave));
    let chave = "campo";
    for (let n = 2; usadas.has(chave); n++) chave = `campo_${n}`;
    return { tipo: "texto", chave, rotulo: "Novo campo", alvos: [{ no: "", entrada: "" }], linhas: 4 };
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Cada campo aparece no Gerador e escreve o valor numa entrada do grafo. O que não virar campo fica fixo, como está no grafo.
        </p>
        <div className="flex shrink-0 gap-2">
          <Botao variante="fantasma" icone={<Wand2 className="size-4" />} onClick={aoSugerir} title="Troca os campos pelos sugeridos (prompts, tamanho, seed)">
            Sugerir de novo
          </Botao>
          <Botao icone={<Plus className="size-4" />} onClick={() => aoMudar([...campos, novo()])}>
            Campo
          </Botao>
        </div>
      </div>
      {campos.length === 0 && <p className="text-sm text-zinc-500">Nenhum campo: o workflow roda sempre igual. Raro, mas vale.</p>}
      {campos.map((c, i) => (
        <EditorCampo
          key={i}
          campo={c}
          entradas={entradas}
          aoMudar={(n) => mudar(i, n)}
          aoRemover={() => aoMudar(campos.filter((_, j) => j !== i))}
          aoSubir={i > 0 ? () => mover(i, -1) : undefined}
          aoDescer={i < campos.length - 1 ? () => mover(i, 1) : undefined}
        />
      ))}
    </div>
  );
}

function EditorCampo({
  campo: c,
  entradas,
  aoMudar,
  aoRemover,
  aoSubir,
  aoDescer,
}: {
  campo: CampoWorkflow;
  entradas: EntradaGrafo[];
  aoMudar: (c: CampoWorkflow) => void;
  aoRemover: () => void;
  aoSubir?: () => void;
  aoDescer?: () => void;
}) {
  // A chave acompanha o rótulo até alguém mexer nela.
  const [chaveManual, setChaveManual] = useState(c.chave !== chaveDoRotulo(c.rotulo));
  const ehNumero = (e: EntradaGrafo) => typeof e.valor === "number";
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3">
        <Campo rotulo="Rótulo">
          <Entrada
            value={c.rotulo}
            onChange={(e) => aoMudar({ ...c, rotulo: e.target.value, chave: chaveManual ? c.chave : chaveDoRotulo(e.target.value) })}
          />
        </Campo>
        <Campo rotulo="Chave">
          <Entrada
            value={c.chave}
            onChange={(e) => {
              setChaveManual(true);
              aoMudar({ ...c, chave: e.target.value });
            }}
            className="font-mono"
          />
        </Campo>
        <Campo rotulo="Tipo">
          <Seletor value={c.tipo} onChange={(e) => aoMudar(trocarTipo(c, e.target.value as TipoCampo, entradas))}>
            {TIPOS_CAMPO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </Seletor>
        </Campo>
        <div className="flex gap-1 pb-1">
          <BotaoIcone titulo="Subir" onClick={aoSubir} icone={<ArrowUp className="size-4" />} />
          <BotaoIcone titulo="Descer" onClick={aoDescer} icone={<ArrowDown className="size-4" />} />
          <BotaoIcone titulo="Tirar este campo" onClick={aoRemover} icone={<Trash className="size-4" />} perigo />
        </div>
      </div>

      {c.tipo === "tamanho" ? (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Largura entra em">
            <ListaAlvos entradas={entradas} alvos={c.largura} filtro={ehNumero} aoMudar={(largura) => aoMudar({ ...c, largura })} />
          </Campo>
          <Campo rotulo="Altura entra em">
            <ListaAlvos entradas={entradas} alvos={c.altura} filtro={ehNumero} aoMudar={(altura) => aoMudar({ ...c, altura })} />
          </Campo>
        </div>
      ) : (
        <Campo rotulo="Entra em">
          <ListaAlvos entradas={entradas} alvos={c.alvos} aoMudar={(alvos) => aoMudar({ ...c, alvos })} filtro={c.tipo === "seed" || c.tipo === "numero" ? ehNumero : undefined} />
        </Campo>
      )}

      {c.tipo === "texto" && <OpcoesTexto c={c} aoMudar={aoMudar} />}
      {c.tipo === "numero" && (
        <div className="grid grid-cols-4 gap-3">
          {(["padrao", "min", "max", "passo"] as const).map((k) => (
            <Campo key={k} rotulo={{ padrao: "Padrão", min: "Mínimo", max: "Máximo", passo: "Passo" }[k]}>
              <Entrada
                type="number"
                step="any"
                value={c[k] ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                  aoMudar({ ...c, [k]: k === "padrao" ? (v ?? 0) : v });
                }}
                className="font-mono"
              />
            </Campo>
          ))}
        </div>
      )}
      {c.tipo === "opcoes" && <OpcoesLista c={c} entradas={entradas} aoMudar={aoMudar} />}
      {c.tipo === "tamanho" && <OpcoesTamanho c={c} aoMudar={aoMudar} />}

      <Campo rotulo="Dica" dica="Aparece embaixo do campo, no Gerador.">
        <AreaTexto value={c.dica ?? ""} onChange={(e) => aoMudar({ ...c, dica: e.target.value || undefined })} rows={2} />
      </Campo>
    </div>
  );
}

function BotaoIcone({ titulo, onClick, icone, perigo }: { titulo: string; onClick?: () => void; icone: React.ReactNode; perigo?: boolean }) {
  return (
    <button
      type="button"
      title={titulo}
      disabled={!onClick}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-lg text-zinc-400 disabled:opacity-25 ${perigo ? "hover:bg-red-950/60 hover:text-red-300" : "hover:bg-zinc-800 hover:text-zinc-100"}`}
    >
      {icone}
    </button>
  );
}

type CampoTipo<T extends TipoCampo> = Extract<CampoWorkflow, { tipo: T }>;

function OpcoesTexto({ c, aoMudar }: { c: CampoTipo<"texto">; aoMudar: (c: CampoWorkflow) => void }) {
  const avisos = c.avisos ?? [];
  const mudarAviso = (i: number, a: Partial<(typeof avisos)[number]>) => aoMudar({ ...c, avisos: avisos.map((x, j) => (j === i ? { ...x, ...a } : x)) });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Caixa rotulo="Obrigatório" valor={!!c.obrigatorio} aoMudar={(v) => aoMudar({ ...c, obrigatorio: v || undefined })} />
        <Caixa rotulo="O assistente de prompt escreve aqui" valor={!!c.assistivel} aoMudar={(v) => aoMudar({ ...c, assistivel: v || undefined })} />
        <Campo rotulo="Linhas">
          <Entrada type="number" min={1} max={40} value={c.linhas ?? 4} onChange={(e) => aoMudar({ ...c, linhas: Number(e.target.value) || 4 })} className="w-20" />
        </Campo>
        <Campo rotulo="Palavras (mín–máx)" dica="Vazio: sem contador.">
          <div className="flex items-center gap-2">
            {(["min", "max"] as const).map((k) => (
              <Entrada
                key={k}
                type="number"
                min={0}
                value={c.palavras?.[k] ?? ""}
                onChange={(e) => {
                  const p = { min: c.palavras?.min ?? 0, max: c.palavras?.max ?? 0, [k]: Number(e.target.value) };
                  aoMudar({ ...c, palavras: p.min || p.max ? p : undefined });
                }}
                className="w-24"
              />
            ))}
          </div>
        </Campo>
      </div>
      <Campo rotulo="Padrão">
        <AreaTexto value={c.padrao ?? ""} onChange={(e) => aoMudar({ ...c, padrao: e.target.value })} rows={2} />
      </Campo>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Avisos enquanto escreve</span>
        {avisos.map((a, i) => (
          <div key={i} className="grid grid-cols-[9rem_minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-2">
            <Seletor value={a.quando} onChange={(e) => mudarAviso(i, { quando: e.target.value as "falta" | "tem" })}>
              <option value="tem">se tiver</option>
              <option value="falta">se faltar</option>
            </Seletor>
            <Entrada value={a.padrao} onChange={(e) => mudarAviso(i, { padrao: e.target.value })} placeholder="padrão (regex)" className="font-mono text-xs" />
            <Entrada value={a.mensagem} onChange={(e) => mudarAviso(i, { mensagem: e.target.value })} placeholder="o que a tela diz" />
            <BotaoIcone titulo="Tirar este aviso" onClick={() => aoMudar({ ...c, avisos: avisos.filter((_, j) => j !== i) })} icone={<X className="size-4" />} perigo />
          </div>
        ))}
        <button
          type="button"
          onClick={() => aoMudar({ ...c, avisos: [...avisos, { quando: "tem", padrao: "", mensagem: "" }] })}
          className="self-start text-xs text-violet-300 hover:underline"
        >
          + aviso
        </button>
      </div>
    </div>
  );
}

function OpcoesLista({ c, entradas, aoMudar }: { c: CampoTipo<"opcoes">; entradas: EntradaGrafo[]; aoMudar: (c: CampoWorkflow) => void }) {
  // A entrada do grafo é numérica? Então o valor das opções vai como número.
  const numerico = typeof entradas.find((e) => c.alvos[0] && codigoAlvo(e) === codigoAlvo(c.alvos[0]))?.valor === "number";
  const converter = (v: string): string | number => (numerico && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v);
  const mudar = (i: number, o: Partial<CampoTipo<"opcoes">["opcoes"][number]>) => {
    const opcoes = c.opcoes.map((x, j) => (j === i ? { ...x, ...o } : x));
    const eraPadrao = c.opcoes[i]?.valor === c.padrao;
    aoMudar({ ...c, opcoes, padrao: eraPadrao ? opcoes[i]!.valor : c.padrao });
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Opções {numerico && <span className="normal-case text-zinc-500">(números)</span>}</span>
      {c.opcoes.map((o, i) => (
        <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-2">
          <input type="radio" title="Padrão" checked={o.valor === c.padrao} onChange={() => aoMudar({ ...c, padrao: o.valor })} className="size-4 accent-violet-500" />
          <Entrada value={String(o.valor)} onChange={(e) => mudar(i, { valor: converter(e.target.value) })} placeholder="valor no grafo" className="font-mono text-xs" />
          <Entrada value={o.rotulo} onChange={(e) => mudar(i, { rotulo: e.target.value })} placeholder="como aparece" />
          <BotaoIcone titulo="Tirar esta opção" onClick={c.opcoes.length > 1 ? () => aoMudar({ ...c, opcoes: c.opcoes.filter((_, j) => j !== i) }) : undefined} icone={<X className="size-4" />} perigo />
        </div>
      ))}
      <button type="button" onClick={() => aoMudar({ ...c, opcoes: [...c.opcoes, { valor: "", rotulo: "" }] })} className="self-start text-xs text-violet-300 hover:underline">
        + opção
      </button>
      <p className="text-xs text-zinc-500">A bolinha marca o padrão.</p>
    </div>
  );
}

function OpcoesTamanho({ c, aoMudar }: { c: CampoTipo<"tamanho">; aoMudar: (c: CampoWorkflow) => void }) {
  const mudar = (i: number, o: { largura?: number; altura?: number; rotulo?: string }) => {
    const opcoes = c.opcoes.map((x, j) => {
      if (j !== i) return x;
      const n = { ...x, ...o };
      return { ...n, valor: `${n.largura}x${n.altura}` };
    });
    const eraPadrao = c.opcoes[i]?.valor === c.padrao;
    aoMudar({ ...c, opcoes, padrao: eraPadrao ? opcoes[i]!.valor : c.padrao });
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Tamanhos</span>
      {c.opcoes.map((o, i) => (
        <div key={i} className="grid grid-cols-[auto_7rem_auto_7rem_minmax(0,1fr)_auto] items-center gap-2">
          <input type="radio" title="Padrão" checked={o.valor === c.padrao} onChange={() => aoMudar({ ...c, padrao: o.valor })} className="size-4 accent-violet-500" />
          <Entrada type="number" min={16} value={o.largura} onChange={(e) => mudar(i, { largura: Number(e.target.value) })} className="font-mono" />
          <span className="text-zinc-500">×</span>
          <Entrada type="number" min={16} value={o.altura} onChange={(e) => mudar(i, { altura: Number(e.target.value) })} className="font-mono" />
          <Entrada value={o.rotulo} onChange={(e) => mudar(i, { rotulo: e.target.value })} placeholder="como aparece (ex.: 16:9 Full HD)" />
          <BotaoIcone titulo="Tirar este tamanho" onClick={c.opcoes.length > 1 ? () => aoMudar({ ...c, opcoes: c.opcoes.filter((_, j) => j !== i) }) : undefined} icone={<X className="size-4" />} perigo />
        </div>
      ))}
      <button
        type="button"
        onClick={() => aoMudar({ ...c, opcoes: [...c.opcoes, { valor: "1024x1024", rotulo: "1024 × 1024", largura: 1024, altura: 1024 }] })}
        className="self-start text-xs text-violet-300 hover:underline"
      >
        + tamanho
      </button>
      <p className="text-xs text-zinc-500">A bolinha marca o padrão.</p>
    </div>
  );
}

function Caixa({ rotulo, valor, aoMudar }: { rotulo: string; valor: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-zinc-300">
      <input type="checkbox" checked={valor} onChange={(e) => aoMudar(e.target.checked)} className="size-4 accent-violet-500" />
      {rotulo}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Saídas                                                               */
/* ------------------------------------------------------------------ */

function EditorSaidas({ grafo, saidas, aoMudar }: { grafo: GrafoApi | null; saidas: string[]; aoMudar: (s: string[]) => void }) {
  if (!grafo) return <Aviso>Importe o grafo na aba Dados primeiro.</Aviso>;
  // Os que parecem saída primeiro; o resto embaixo, para casos raros.
  const nos = Object.keys(grafo).sort((a, b) => Number(ehSaida(grafo[b]!.class_type)) - Number(ehSaida(grafo[a]!.class_type)) || ordemNo(a, b));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-400">O que estes nós produzirem vira Output do asset ou shot. Normalmente é o SaveImage (ou SaveVideo).</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-2">
        {nos.map((no) => {
          const n = grafo[no]!;
          const marcado = saidas.includes(no);
          return (
            <label
              key={no}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${marcado ? "border-violet-500/50 bg-violet-950/20" : "border-zinc-800"} ${ehSaida(n.class_type) ? "" : "opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={marcado}
                onChange={() => aoMudar(marcado ? saidas.filter((s) => s !== no) : [...saidas, no])}
                className="size-4 accent-violet-500"
              />
              <span className="font-mono text-xs text-zinc-500">{no}</span>
              <span className="truncate">{n._meta?.title ?? n.class_type}</span>
              {n._meta?.title && n._meta.title !== n.class_type && <span className="truncate text-xs text-zinc-500">{n.class_type}</span>}
            </label>
          );
        })}
      </div>
      {saidas.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-amber-300">
          <TriangleAlert className="size-3.5" /> Sem saída marcada, o Creativa pega tudo o que o ComfyUI devolver.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Testar                                                               */
/* ------------------------------------------------------------------ */

/**
 * Roda a definição como está na tela (salva ou não) uma vez e mostra o que
 * saiu, sem gravar nada no Creativa — a imagem fica só no ComfyUI.
 */
function PainelTeste({ grafo, campos, saidas }: { grafo: GrafoApi | null; campos: CampoWorkflow[]; saidas: string[] }) {
  const [valores, setValores] = useState<Record<string, unknown>>(() => valoresPara(campos));
  const [teste, setTeste] = useState<{ promptId: string; seed: string | null } | null>(null);
  const [estado, setEstado] = useState<EstadoTeste | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Campos mudaram na outra aba: completa os valores que faltam.
  useEffect(() => setValores((v) => valoresPara(campos, v)), [campos]);

  // Acompanha até terminar.
  useEffect(() => {
    if (!teste) return;
    let vivo = true;
    const olhar = async () => {
      try {
        const e = await workflowsApi.teste(teste.promptId, saidas);
        if (!vivo) return;
        setEstado(e);
        if (e.status === "NA_FILA" || e.status === "EXECUTANDO") setTimeout(olhar, 1_500);
      } catch (er) {
        if (vivo) setErro((er as Error).message);
      }
    };
    olhar();
    return () => {
      vivo = false;
    };
  }, [teste]);

  if (!grafo) return <Aviso>Importe o grafo na aba Dados primeiro.</Aviso>;
  const rodando = estado?.status === "NA_FILA" || estado?.status === "EXECUTANDO";
  const pct = estado?.progresso?.max ? Math.round((estado.progresso.valor / estado.progresso.max) * 100) : null;

  async function testar() {
    setErro(null);
    setEstado(null);
    setEnviando(true);
    try {
      const r = await workflowsApi.testar({ ferramenta: "comfyui", grafo: grafo!, campos, saidas, valores });
      const seed = campos.find((c) => c.tipo === "seed");
      setTeste({ promptId: r.promptId, seed: seed ? String(r.valores[seed.chave]) : null });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-6">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-400">
          Roda o workflow como está nesta tela — mesmo sem salvar — com os valores abaixo. Nada é gravado no Creativa: a imagem fica só no ComfyUI.
        </p>
        {campos.map((c) => (
          <CampoDinamico key={c.chave} campo={c} valor={valores[c.chave] ?? padraoDe(c)} aoMudar={(v) => setValores((x) => ({ ...x, [c.chave]: v }))} />
        ))}
        <Botao variante="primario" icone={<FlaskConical className="size-4" />} carregando={enviando} disabled={rodando} onClick={testar} className="self-start">
          Testar
        </Botao>
      </div>
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-black/40 p-4">
        {erro && <Aviso>{erro}</Aviso>}
        {!estado && !erro && <span className="text-sm text-zinc-500">O resultado aparece aqui.</span>}
        {rodando && (
          <div className="flex flex-col items-center gap-3 text-sm text-sky-200">
            <LoaderCircle className="size-8 animate-spin text-sky-300" />
            {estado!.status === "NA_FILA" ? "Na fila do ComfyUI..." : `Gerando${pct !== null ? ` · ${pct}%` : "..."}`}
          </div>
        )}
        {estado?.status === "FALHOU" && <Aviso>{estado.erro}</Aviso>}
        {estado?.status === "CONCLUIDA" && (
          <>
            {estado.erro && <Aviso>{estado.erro}</Aviso>}
            <div className="grid w-full gap-3">
              {estado.imagens.map((i) => (
                <a key={`${i.subfolder}/${i.filename}`} href={workflowsApi.urlImagemTeste(i)} target="_blank" rel="noreferrer">
                  <img src={workflowsApi.urlImagemTeste(i)} alt="" className="max-h-[60vh] w-full rounded-lg object-contain" />
                </a>
              ))}
            </div>
            {teste?.seed && <span className="font-mono text-xs text-zinc-500">seed {teste.seed}</span>}
          </>
        )}
      </div>
    </div>
  );
}
