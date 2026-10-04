import type {
  Asset,
  AssetDetalhe,
  Assistente,
  AssistenteDisponivel,
  EstadoLlm,
  EstadoTeste,
  TipoGeracao,
  WorkflowDetalhe,
  WorkflowResumo,
  Cena,
  Execucao,
  ListaVideos,
  VideoDetalhe,
  VideoResumo,
  Output,
  OutputDetalhe,
  Projeto,
  VersaoDescricao,
  Referencia,
  ShotDetalhe,
  ShotResumo,
  TipoAsset,
  TipoReferencia,
  TipoCatalogo,
  Vinculo,
} from "./tipos.ts";

/**
 * `fetch` para a nossa API, que devolve o JSON ou lança um Error com a
 * mensagem que o servidor mandou em `{ erro }` — é ela que aparece na tela.
 */
export async function api<T>(caminho: string, init?: { method?: string; corpo?: unknown }): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: init?.method ?? "GET",
      headers: init?.corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.corpo === undefined ? undefined : JSON.stringify(init.corpo),
    });
  } catch {
    throw new Error("Sem conexão com o servidor. O Creativa está rodando?");
  }
  return lerResposta<T>(resposta);
}

async function lerResposta<T>(resposta: Response): Promise<T> {
  if (resposta.status === 204) return undefined as T;
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new Error(dados?.erro ?? `O servidor respondeu ${resposta.status}.`);
  return dados as T;
}

/** Monta `?a=1&b=2` sem as chaves vazias — filtro em branco é filtro ausente. */
export function consulta(params: Record<string, string | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** O endereço de um arquivo guardado (referência ou output). */
export const urlArquivo = (relativo: string) => `/api/arquivos/${relativo}`;

/** Dono de uma referência ou output: um asset, um shot, ou nenhum. */
export type Dono = { assetId: string | null; shotId: string | null };

/** A descrição do projeto tem rota própria (`salvarDescricao`): nome e descrição se salvam separados. */
export type ProjetoNovo = { nome: string };
export type AssetNovo = { nome: string; tipo: TipoAsset; projetoId: string | null; descricao: string | null };
/** Com vídeo, o projeto da cena é o da lista do vídeo (a API acerta). */
export type CenaNova = { nome: string; projetoId: string | null; videoId: string | null; descricao: string | null; storyboard: string };
export type ListaNova = { nome: string; descricao: string | null };
export type VideoNovo = { nome: string; descricao: string | null };
export type ShotNovo = { nome: string; descricao: string | null };
/** O que o Gerador manda ao clicar em "Gerar". */
export type Pedido = Dono & {
  tipo: string;
  workflow: string;
  parametros: Record<string, unknown>;
  quantidade: number;
  /** O assistente que expandiu o prompt, e a ideia de origem — ficam gravados em cada output. */
  assistenteId: string | null;
  ideia: string | null;
};

export type AssistenteNovo = {
  nome: string;
  descricao: string | null;
  projetoId: string | null;
  workflows: string[];
  instrucoes: string;
};

type Filtro = Record<string, string | undefined>;

export const projetosApi = {
  listar: (f: Filtro = {}) => api<Projeto[]>(`/projetos${consulta(f)}`),
  ler: (id: string) => api<Projeto>(`/projetos/${id}`),
  criar: (p: ProjetoNovo) => api<Projeto>("/projetos", { method: "POST", corpo: p }),
  salvar: (id: string, p: ProjetoNovo) => api<Projeto>(`/projetos/${id}`, { method: "PUT", corpo: p }),
  /** `base`: a versão de onde a edição partiu — se outra entrou no meio, a API recusa (409). */
  salvarDescricao: (id: string, descricao: string | null, base: number, nota: string | null) =>
    api<Projeto>(`/projetos/${id}/descricao`, { method: "PUT", corpo: { descricao, base, nota } }),
  versoesDescricao: (id: string) => api<VersaoDescricao[]>(`/projetos/${id}/descricao/versoes`),
  versaoDescricao: (id: string, numero: number) =>
    api<VersaoDescricao & { texto: string | null }>(`/projetos/${id}/descricao/versoes/${numero}`),
  apagar: (id: string) => api<void>(`/projetos/${id}`, { method: "DELETE" }),
};

export const assetsApi = {
  listar: (f: { projeto?: string; tipo?: TipoAsset | ""; busca?: string } = {}) =>
    api<Asset[]>(`/assets${consulta(f)}`),
  ler: (id: string) => api<AssetDetalhe>(`/assets/${id}`),
  criar: (a: AssetNovo) => api<Asset>("/assets", { method: "POST", corpo: a }),
  salvar: (id: string, a: AssetNovo) => api<Asset>(`/assets/${id}`, { method: "PUT", corpo: a }),
  apagar: (id: string) => api<void>(`/assets/${id}`, { method: "DELETE" }),
};

export const cenasApi = {
  /** `video: "sem"`: só as cenas fora de vídeo. */
  listar: (f: Filtro & { video?: string } = {}) => api<Cena[]>(`/cenas${consulta(f)}`),
  ler: (id: string) => api<Cena>(`/cenas/${id}`),
  criar: (c: CenaNova) => api<Cena>("/cenas", { method: "POST", corpo: c }),
  salvar: (id: string, c: CenaNova) => api<Cena>(`/cenas/${id}`, { method: "PUT", corpo: c }),
  apagar: (id: string) => api<void>(`/cenas/${id}`, { method: "DELETE" }),
  novoShot: (cenaId: string) => api<ShotResumo>(`/cenas/${cenaId}/shots`, { method: "POST", corpo: {} }),
  reordenar: (cenaId: string, shots: string[]) =>
    api<ShotResumo[]>(`/cenas/${cenaId}/ordem`, { method: "PUT", corpo: { shots } }),
};

export const listasApi = {
  listar: (projetoId: string) => api<ListaVideos[]>(`/listas${consulta({ projeto: projetoId })}`),
  criar: (projetoId: string, l: ListaNova) => api<ListaVideos>("/listas", { method: "POST", corpo: { ...l, projetoId } }),
  salvar: (id: string, l: ListaNova) => api<ListaVideos>(`/listas/${id}`, { method: "PUT", corpo: l }),
  apagar: (id: string) => api<void>(`/listas/${id}`, { method: "DELETE" }),
  reordenar: (projetoId: string, listas: string[]) => api<ListaVideos[]>("/listas/ordem", { method: "PUT", corpo: { projetoId, listas } }),
  novoVideo: (listaId: string, v: VideoNovo) => api<VideoResumo>(`/listas/${listaId}/videos`, { method: "POST", corpo: v }),
  reordenarVideos: (listaId: string, videos: string[]) =>
    api<VideoResumo[]>(`/listas/${listaId}/videos/ordem`, { method: "PUT", corpo: { videos } }),
};

export const videosApi = {
  ler: (id: string) => api<VideoDetalhe>(`/videos/${id}`),
  salvar: (id: string, v: VideoNovo) => api<VideoDetalhe>(`/videos/${id}`, { method: "PUT", corpo: v }),
  apagar: (id: string) => api<void>(`/videos/${id}`, { method: "DELETE" }),
  reordenarCenas: (id: string, cenas: string[]) => api<Cena[]>(`/videos/${id}/cenas/ordem`, { method: "PUT", corpo: { cenas } }),
};

export const shotsApi = {
  ler: (id: string) => api<ShotDetalhe>(`/shots/${id}`),
  salvar: (id: string, s: ShotNovo) => api<ShotResumo>(`/shots/${id}`, { method: "PUT", corpo: s }),
  apagar: (id: string) => api<void>(`/shots/${id}`, { method: "DELETE" }),
};

export const referenciasApi = {
  listar: (
    f: {
      projeto?: string;
      tipo?: TipoReferencia | "";
      vinculo?: Vinculo | "";
      asset?: string;
      shot?: string;
      busca?: string;
    } = {},
  ) => api<Referencia[]>(`/referencias${consulta(f)}`),
  ler: (id: string) => api<Referencia>(`/referencias/${id}`),
  /** Upload de arquivos (multipart). Cada arquivo vira uma referência. */
  enviar: async (arquivos: File[], dono: Dono): Promise<Referencia[]> => {
    const form = new FormData();
    if (dono.assetId) form.set("assetId", dono.assetId);
    if (dono.shotId) form.set("shotId", dono.shotId);
    for (const a of arquivos) form.append("arquivos", a, a.name);
    let resposta: Response;
    try {
      resposta = await fetch("/api/referencias/upload", { method: "POST", body: form });
    } catch {
      throw new Error("Sem conexão com o servidor. O Creativa está rodando?");
    }
    return lerResposta<Referencia[]>(resposta);
  },
  criarTexto: (r: Dono & { nome: string; texto: string }) =>
    api<Referencia>("/referencias/texto", { method: "POST", corpo: r }),
  salvar: (id: string, r: Dono & { nome: string; texto?: string }) =>
    api<Referencia>(`/referencias/${id}`, { method: "PUT", corpo: r }),
  apagar: (id: string) => api<void>(`/referencias/${id}`, { method: "DELETE" }),
};

/** O Gerador de um asset ou shot: o catálogo, o "Gerar" e o que está na fila. */
export const geradorApi = {
  /** Os tipos de geração (com workflows e campos) que valem para o dono, o primeiro já escolhido. */
  catalogo: (dono: Dono) =>
    api<TipoCatalogo[]>(`/gerador/catalogo${consulta({ asset: dono.assetId, shot: dono.shotId })}`),
  /** Manda `quantidade` execuções ao ComfyUI. A primeira usa a seed do formulário; as outras, seed nova. */
  executar: (p: Pedido) => api<{ ok: true }>("/gerador/executar", { method: "POST", corpo: p }),
  execucoes: (dono: Dono) =>
    api<Execucao[]>(`/gerador/execucoes${consulta({ asset: dono.assetId, shot: dono.shotId })}`),
  cancelar: (id: string) => api<{ ok: true }>(`/gerador/execucoes/${id}/cancelar`, { method: "POST" }),
};

export type TipoGeracaoNovo = Pick<TipoGeracao, "nome" | "descricao" | "saida" | "tiposAsset" | "shot">;

export const tiposGeracaoApi = {
  listar: () => api<TipoGeracao[]>("/tipos-geracao"),
  criar: (t: TipoGeracaoNovo) => api<TipoGeracao>("/tipos-geracao", { method: "POST", corpo: t }),
  salvar: (id: string, t: TipoGeracaoNovo) => api<TipoGeracao>(`/tipos-geracao/${id}`, { method: "PUT", corpo: t }),
  apagar: (id: string) => api<void>(`/tipos-geracao/${id}`, { method: "DELETE" }),
};

/** A definição de um workflow: o que se testa sem salvar. */
export type DefinicaoWorkflow = Pick<WorkflowDetalhe, "ferramenta" | "grafo" | "campos" | "saidas">;

export type WorkflowNovo = DefinicaoWorkflow & {
  nome: string;
  tipoGeracaoId: string;
  descricao: string | null;
  notas: string | null;
  origem: string | null;
  modelo: string | null;
};

export const workflowsApi = {
  listar: (f: { tipo?: string; busca?: string } = {}) => api<WorkflowResumo[]>(`/workflows${consulta(f)}`),
  ler: (id: string) => api<WorkflowDetalhe>(`/workflows/${id}`),
  criar: (w: WorkflowNovo) => api<WorkflowDetalhe>("/workflows", { method: "POST", corpo: w }),
  salvar: (id: string, w: WorkflowNovo) => api<WorkflowDetalhe>(`/workflows/${id}`, { method: "PUT", corpo: w }),
  apagar: (id: string) => api<void>(`/workflows/${id}`, { method: "DELETE" }),
  /** Roda a definição (salva ou não) uma vez, sem gravar nada. Acompanhe com `teste`. */
  testar: (d: DefinicaoWorkflow & { valores: Record<string, unknown> }) =>
    api<{ promptId: string; valores: Record<string, unknown> }>("/workflows/testar", { method: "POST", corpo: d }),
  teste: (promptId: string, saidas: string[]) => api<EstadoTeste>(`/workflows/teste/${promptId}${consulta({ saidas: saidas.join(",") })}`),
  urlImagemTeste: (i: EstadoTeste["imagens"][number]) => `/api/workflows/teste-imagem${consulta(i)}`,
};

export const assistentesApi = {
  listar: (f: { projeto?: string; workflow?: string; busca?: string } = {}) => api<Assistente[]>(`/assistentes${consulta(f)}`),
  ler: (id: string) => api<Assistente>(`/assistentes/${id}`),
  criar: (a: AssistenteNovo) => api<Assistente>("/assistentes", { method: "POST", corpo: a }),
  salvar: (id: string, a: AssistenteNovo) => api<Assistente>(`/assistentes/${id}`, { method: "PUT", corpo: a }),
  apagar: (id: string) => api<void>(`/assistentes/${id}`, { method: "DELETE" }),
  /** Os que valem no Gerador de um dono, para um workflow. */
  disponiveis: (dono: Dono, workflow: string) =>
    api<AssistenteDisponivel[]>(`/assistentes/disponiveis${consulta({ asset: dono.assetId, shot: dono.shotId, workflow })}`),
  /** A LLM local (Ollama) está no ar, com o modelo baixado? */
  estado: () => api<EstadoLlm>("/assistentes/estado"),
  /**
   * Expande a ideia no prompt completo. O texto chega em pedaços
   * (`aoPedaco`), conforme a LLM escreve; `aoComecar` diz se o ComfyUI estava
   * ocupado (aí a LLM vai mais devagar). Devolve o texto inteiro.
   */
  expandir: async (
    id: string,
    pedido: Dono & { workflow: string; ideia: string },
    eventos: { aoComecar?: (comfyOcupado: boolean) => void; aoPedaco: (texto: string) => void },
    sinal?: AbortSignal,
  ): Promise<string> => {
    let resposta: Response;
    try {
      resposta = await fetch(`/api/assistentes/${id}/expandir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedido),
        signal: sinal,
      });
    } catch (e) {
      if (sinal?.aborted) throw e;
      throw new Error("Sem conexão com o servidor. O Creativa está rodando?");
    }
    if (!resposta.ok) await lerResposta(resposta);
    if (!resposta.body) throw new Error("O servidor respondeu sem texto.");
    eventos.aoComecar?.(resposta.headers.get("X-Comfy-Ocupado") === "1");
    const leitor = resposta.body.pipeThrough(new TextDecoderStream()).getReader();
    let tudo = "";
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      tudo += value;
      eventos.aoPedaco(value);
    }
    return tudo;
  },
};

export const outputsApi = {
  listar: (
    f: {
      projeto?: string;
      vinculo?: Vinculo | "";
      tipo?: string;
      asset?: string;
      shot?: string;
      favoritos?: string;
      busca?: string;
    } = {},
  ) => api<Output[]>(`/outputs${consulta(f)}`),
  /** Os tipos de geração que existem nos outputs, para o filtro. */
  tipos: () => api<{ chave: string; nome: string }[]>("/outputs/tipos"),
  ler: (id: string) => api<OutputDetalhe>(`/outputs/${id}`),
  favoritar: (id: string, favorito: boolean) => api<{ ok: true }>(`/outputs/${id}/favorito`, { method: "PUT", corpo: { favorito } }),
  apagar: (id: string) => api<void>(`/outputs/${id}`, { method: "DELETE" }),
};
