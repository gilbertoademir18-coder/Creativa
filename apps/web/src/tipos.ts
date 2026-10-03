/**
 * Os formatos que a API devolve. Datas chegam como texto ISO.
 */

export type TipoAsset = "PERSONAGEM" | "CENARIO" | "OBJETO" | "OUTRO";
export type TipoReferencia = "IMAGEM" | "TEXTO" | "VIDEO";
export type TipoOutput = "IMAGEM" | "VIDEO" | "AUDIO" | "OUTRO";
export type StatusExecucao = "NA_FILA" | "EXECUTANDO" | "CONCLUIDA" | "FALHOU" | "CANCELADA";
/** A quem uma referência ou output pertence. */
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
  _count: { referencias: number; outputs: number };
  /** Um output (o favorito, senão o mais recente) ou a primeira imagem de referência. */
  capa: string | null;
};

export type AssetDetalhe = Asset & { referencias: Referencia[] };

export type ShotResumo = {
  id: string;
  cenaId: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  _count: { referencias: number; outputs: number };
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
};

/** O dono de uma referência ou output, com o caminho até o projeto. */
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
} & Partial<DonoDetalhado>;

/** Um arquivo gerado, como a galeria mostra. */
export type Output = {
  id: string;
  assetId: string | null;
  shotId: string | null;
  tipo: TipoOutput;
  arquivo: string;
  largura: number | null;
  altura: number | null;
  tamanhoBytes: number | null;
  duracaoSeg: number | null;
  favorito: boolean;
  tipoGeracao: string;
  tipoGeracaoNome: string;
  workflow: string;
  workflowNome: string;
  modelo: string | null;
  prompt: string;
  seed: number | null;
  criadoEm: string;
} & DonoDetalhado;

/** Tudo o que foi usado para gerar o output. */
export type OutputDetalhe = Output & {
  mime: string | null;
  parametros: Record<string, unknown>;
  grafoEnviado: Record<string, unknown>;
  /** Segundos no ComfyUI, sem a espera na fila. */
  duracaoComfySeg: number | null;
  /** O rótulo de cada parâmetro, enquanto o workflow existir no código. */
  rotulos: Record<string, string>;
  /** O assistente de prompt usado (o nome) e a ideia que ele expandiu. */
  assistente: string | null;
  ideia: string | null;
};

/** Um assistente de prompt: instruções em markdown que a LLM local segue. */
export type Assistente = {
  id: string;
  nome: string;
  descricao: string | null;
  projetoId: string | null;
  /** Chaves dos workflows em que aparece. Vazio: em todos. */
  workflows: string[];
  instrucoes: string;
  criadoEm: string;
  editadoEm: string;
  projeto: ProjetoRef | null;
};

/** O que o Gerador lista: os assistentes que valem para o workflow e o projeto do dono. */
export type AssistenteDisponivel = Pick<Assistente, "id" | "nome" | "descricao" | "projetoId" | "projeto">;

export type EstadoLlm = { noAr: boolean; modelo: string; modeloBaixado: boolean };

/** Um workflow do código, para marcar em quais um assistente aparece. */
export type WorkflowResumo = { chave: string; nome: string; tipo: string; tipoNome: string };

/** Uma execução do Gerador ainda sem output: na fila, executando, ou que falhou há pouco. */
export type Execucao = {
  id: string;
  status: StatusExecucao;
  workflow: string;
  seed: number | null;
  erro: string | null;
  criadoEm: string;
  iniciadaEm: string | null;
  concluidaEm: string | null;
  /** Passo atual no ComfyUI (do WebSocket), enquanto executa. */
  progresso: { valor: number; max: number } | null;
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
      /** O assistente de prompt escreve neste campo. */
      assistivel?: boolean;
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
