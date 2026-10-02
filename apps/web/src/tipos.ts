/**
 * Os formatos que a API devolve. Datas chegam como texto ISO.
 */

export type TipoAsset = "PERSONAGEM" | "CENARIO" | "OBJETO" | "OUTRO";
export type TipoReferencia = "IMAGEM" | "TEXTO" | "VIDEO";
export type TipoOutput = "IMAGEM" | "VIDEO" | "AUDIO" | "OUTRO";
export type StatusGeracao = "RASCUNHO" | "NA_FILA" | "EXECUTANDO" | "CONCLUIDA" | "FALHOU" | "CANCELADA";
/** A quem uma referência ou geração pertence. */
export type Vinculo = "asset" | "shot" | "solta";

export type ProjetoRef = { id: string; nome: string };

export type Projeto = {
  id: string;
  nome: string;
  descricao: string | null;
  criadoEm: string;
  editadoEm: string;
  _count: { assets: number; cenas: number };
};

export type Asset = {
  id: string;
  projetoId: string | null;
  tipo: TipoAsset;
  nome: string;
  descricao: string | null;
  criadoEm: string;
  editadoEm: string;
  projeto: ProjetoRef | null;
  _count: { referencias: number; geracoes: number };
  /** A primeira imagem de referência: a capa do cartão. */
  capa: string | null;
};

export type AssetDetalhe = Asset & { referencias: Referencia[]; geracoes: GeracaoResumo[] };

export type ShotResumo = {
  id: string;
  cenaId: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  _count: { referencias: number; geracoes: number };
};

export type Cena = {
  id: string;
  projetoId: string | null;
  nome: string;
  descricao: string | null;
  storyboard: string;
  criadoEm: string;
  editadoEm: string;
  projeto: ProjetoRef | null;
  shots: ShotResumo[];
};

export type ShotDetalhe = Omit<ShotResumo, "_count"> & {
  cena: { id: string; nome: string; projeto: ProjetoRef | null; shots: { id: string; nome: string; ordem: number }[] };
  referencias: Referencia[];
  geracoes: GeracaoResumo[];
};

/** O dono de uma referência ou geração, com o caminho até o projeto. */
export type DonoDetalhado = {
  asset: { id: string; nome: string; tipo: TipoAsset; projeto: ProjetoRef | null } | null;
  shot: { id: string; nome: string; cena: { id: string; nome: string; projeto: ProjetoRef | null } } | null;
};

export type Referencia = {
  id: string;
  assetId: string | null;
  shotId: string | null;
  tipo: TipoReferencia;
  nome: string;
  texto: string | null;
  arquivo: string | null;
  nomeOriginal: string | null;
  mime: string | null;
  tamanhoBytes: number | null;
  criadoEm: string;
  editadoEm: string;
} & Partial<DonoDetalhado> & { _count?: { usadaEm: number } };

export type GeracaoResumo = {
  id: string;
  assetId: string | null;
  shotId: string | null;
  nome: string | null;
  prompt: string;
  status: StatusGeracao;
  criadoEm: string;
  _count: { outputs: number };
};

export type WorkflowResumo = { id: string; nome: string; categoria: string | null };

export type Geracao = Omit<GeracaoResumo, "_count"> &
  DonoDetalhado & {
    promptNegativo: string | null;
    modelo: string | null;
    workflowId: string | null;
    workflow: { id: string; nome: string } | null;
    editadoEm: string;
    iniciadaEm: string | null;
    concluidaEm: string | null;
    erro: string | null;
    _count: { outputs: number; entradas: number };
  };

export type Output = {
  id: string;
  geracaoId: string;
  tipo: TipoOutput;
  arquivo: string;
  mime: string | null;
  tamanhoBytes: number | null;
  largura: number | null;
  altura: number | null;
  duracaoSeg: number | null;
  favorito: boolean;
  criadoEm: string;
  geracao?: { id: string; nome: string | null; prompt: string };
};

export type GeracaoEntrada = {
  id: string;
  ordem: number;
  referenciaId: string | null;
  outputId: string | null;
  referencia: Referencia | null;
  output: Output | null;
};

export type GeracaoDetalhe = Geracao & { entradas: GeracaoEntrada[]; outputs: Output[] };
