import type {
  Asset,
  AssetDetalhe,
  Cena,
  Geracao,
  GeracaoDetalhe,
  Output,
  Projeto,
  Referencia,
  ShotDetalhe,
  ShotResumo,
  StatusGeracao,
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

/** Dono de uma referência ou geração: um asset, um shot, ou nenhum. */
export type Dono = { assetId: string | null; shotId: string | null };

export type ProjetoNovo = { nome: string; descricao: string | null };
export type AssetNovo = { nome: string; tipo: TipoAsset; projetoId: string | null; descricao: string | null };
export type CenaNova = { nome: string; projetoId: string | null; descricao: string | null; storyboard: string };
export type ShotNovo = { nome: string; descricao: string | null };
export type GeracaoNova = Dono & {
  nome: string | null;
  tipo: string;
  workflow: string;
  parametros: Record<string, unknown>;
};

type Filtro = Record<string, string | undefined>;

export const projetosApi = {
  listar: (f: Filtro = {}) => api<Projeto[]>(`/projetos${consulta(f)}`),
  ler: (id: string) => api<Projeto>(`/projetos/${id}`),
  criar: (p: ProjetoNovo) => api<Projeto>("/projetos", { method: "POST", corpo: p }),
  salvar: (id: string, p: ProjetoNovo) => api<Projeto>(`/projetos/${id}`, { method: "PUT", corpo: p }),
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
  listar: (f: Filtro = {}) => api<Cena[]>(`/cenas${consulta(f)}`),
  ler: (id: string) => api<Cena>(`/cenas/${id}`),
  criar: (c: CenaNova) => api<Cena>("/cenas", { method: "POST", corpo: c }),
  salvar: (id: string, c: CenaNova) => api<Cena>(`/cenas/${id}`, { method: "PUT", corpo: c }),
  apagar: (id: string) => api<void>(`/cenas/${id}`, { method: "DELETE" }),
  novoShot: (cenaId: string) => api<ShotResumo>(`/cenas/${cenaId}/shots`, { method: "POST", corpo: {} }),
  reordenar: (cenaId: string, shots: string[]) =>
    api<ShotResumo[]>(`/cenas/${cenaId}/ordem`, { method: "PUT", corpo: { shots } }),
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

export const geracoesApi = {
  listar: (
    f: {
      projeto?: string;
      status?: StatusGeracao | "";
      vinculo?: Vinculo | "";
      tipo?: string;
      asset?: string;
      shot?: string;
      busca?: string;
    } = {},
  ) => api<Geracao[]>(`/geracoes${consulta(f)}`),
  /** Os tipos de geração (com workflows e campos) que valem para um dono. */
  catalogo: (dono: Dono) =>
    api<TipoCatalogo[]>(`/geracoes/catalogo${consulta({ asset: dono.assetId, shot: dono.shotId })}`),
  ler: (id: string) => api<GeracaoDetalhe>(`/geracoes/${id}`),
  criar: (g: GeracaoNova) => api<Geracao>("/geracoes", { method: "POST", corpo: g }),
  salvar: (id: string, g: GeracaoNova) => api<Geracao>(`/geracoes/${id}`, { method: "PUT", corpo: g }),
  apagar: (id: string) => api<void>(`/geracoes/${id}`, { method: "DELETE" }),
  /** Manda `quantidade` rodadas ao ComfyUI. Depois da primeira, cada uma com seed nova. */
  gerar: (id: string, quantidade = 1) => api<{ ok: true }>(`/geracoes/${id}/gerar`, { method: "POST", corpo: { quantidade } }),
  cancelar: (id: string) => api<{ ok: true }>(`/geracoes/${id}/cancelar`, { method: "POST" }),
  duplicar: (id: string) => api<Geracao>(`/geracoes/${id}/duplicar`, { method: "POST" }),
};

export const outputsApi = {
  listar: (f: { projeto?: string } = {}) => api<Output[]>(`/outputs${consulta(f)}`),
};

