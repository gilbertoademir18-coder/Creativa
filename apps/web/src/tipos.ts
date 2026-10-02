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
  tipo: string;
  workflow: string;
  prompt: string;
  status: StatusGeracao;
  criadoEm: string;
  _count: { outputs: number };
};

/** Como a listagem devolve: com os nomes do tipo e do workflow e a miniatura. */
export type Geracao = GeracaoResumo &
  DonoDetalhado & {
    tipoNome: string;
    workflowNome: string;
    modelo: string | null;
    parametros: Record<string, unknown>;
    editadoEm: string;
    capa?: string | null;
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
  /** A seed da rodada que gerou este output (no detalhe da geração). */
  seed?: number | null;
};

/** Um envio da geração ao ComfyUI. */
export type Rodada = {
  id: string;
  status: Exclude<StatusGeracao, "RASCUNHO">;
  parametros: Record<string, unknown>;
  seed: number | null;
  erro: string | null;
  criadoEm: string;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  /** Passo atual no ComfyUI (do WebSocket), enquanto executa. */
  progresso: { valor: number; max: number } | null;
};

export type GeracaoEntrada = {
  id: string;
  ordem: number;
  referenciaId: string | null;
  outputId: string | null;
  referencia: Referencia | null;
  output: Output | null;
};

export type GeracaoDetalhe = Geracao & {
  entradas: GeracaoEntrada[];
  outputs: Output[];
  /** Da mais recente para a mais antiga. */
  rodadas: Rodada[];
};

/*
 * O catálogo de tipos de geração e workflows, como a API descreve.
 * Espelha apps/api/src/geracao/definicoes.ts (sem a função que monta o grafo).
 */

export type AvisoCampo = { quando: "falta" | "tem"; padrao: string; mensagem: string };

export type CampoWorkflow =
  | {
      tipo: "texto";
      chave: string;
      rotulo: string;
      linhas?: number;
      obrigatorio?: boolean;
      dica?: string;
      padrao?: string;
      palavras?: { min: number; max: number };
      avisos?: AvisoCampo[];
    }
  | { tipo: "opcoes"; chave: string; rotulo: string; opcoes: { valor: string; rotulo: string }[]; padrao: string; dica?: string }
  | { tipo: "seed"; chave: string; rotulo: string };

export type WorkflowCatalogo = {
  chave: string;
  tipo: string;
  nome: string;
  descricao: string;
  arquivoComfy: string;
  modelo: string;
  campos: CampoWorkflow[];
};

export type TipoCatalogo = {
  chave: string;
  nome: string;
  descricao: string;
  saida: "IMAGEM" | "VIDEO";
  workflows: WorkflowCatalogo[];
};
