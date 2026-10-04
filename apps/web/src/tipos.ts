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
  /** O número da versão atual da descrição (0: nunca foi salva). */
  descricaoVersao: number;
  criadoEm: string;
  editadoEm: string;
  _count: { assets: number; cenas: number };
};

/** Uma versão do histórico da descrição do projeto. */
export type VersaoDescricao = {
  numero: number;
  origem: "TELA" | "CLAUDE";
  nota: string | null;
  criadoEm: string;
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

/** O vídeo em que uma cena entra, com a lista dele — para o caminho na tela. */
export type VideoDaCena = { id: string; nome: string; lista: { id: string; nome: string } };

export type Cena = {
  id: string;
  projetoId: string | null;
  videoId: string | null;
  /** Posição dentro do vídeo. */
  ordem: number;
  video: VideoDaCena | null;
  nome: string;
  descricao: string | null;
  storyboard: string;
  criadoEm: string;
  editadoEm: string;
  projeto: ProjetoRef | null;
  shots: ShotResumo[];
};

export type ShotDetalhe = Omit<ShotResumo, "_count"> & {
  cena: {
    id: string;
    nome: string;
    projeto: ProjetoRef | null;
    video: VideoDaCena | null;
    shots: { id: string; nome: string; ordem: number }[];
  };
  referencias: Referencia[];
};

/** Um vídeo na lista: o nome, a posição e quantas cenas tem. */
export type VideoResumo = {
  id: string;
  listaId: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  _count: { cenas: number };
};

/** Uma lista de vídeos de um projeto ("Temporada 1", "Trailers"), com os vídeos em ordem. */
export type ListaVideos = {
  id: string;
  projetoId: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  videos: VideoResumo[];
};

/** O vídeo aberto: a lista e o projeto, e as cenas em ordem. */
export type VideoDetalhe = Omit<VideoResumo, "_count"> & {
  lista: { id: string; nome: string; projeto: ProjetoRef };
  cenas: Cena[];
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
 * Espelha apps/api/src/geracao/definicoes.ts.
 */

export type AvisoCampo = { quando: "falta" | "tem"; padrao: string; mensagem: string };

/** Onde um valor entra no grafo: o id do nó e o nome da entrada. */
export type Alvo = { no: string; entrada: string };

type BaseCampo = { chave: string; rotulo: string; dica?: string };

export type CampoWorkflow =
  | (BaseCampo & {
      tipo: "texto";
      alvos: Alvo[];
      linhas?: number;
      obrigatorio?: boolean;
      padrao?: string;
      palavras?: { min: number; max: number };
      avisos?: AvisoCampo[];
      /** O assistente de prompt escreve neste campo. */
      assistivel?: boolean;
    })
  | (BaseCampo & { tipo: "numero"; alvos: Alvo[]; padrao: number; min?: number; max?: number; passo?: number })
  | (BaseCampo & { tipo: "opcoes"; alvos: Alvo[]; opcoes: { valor: string | number; rotulo: string }[]; padrao: string | number })
  | (BaseCampo & { tipo: "seed"; alvos: Alvo[] })
  | (BaseCampo & {
      tipo: "tamanho";
      largura: Alvo[];
      altura: Alvo[];
      opcoes: { valor: string; rotulo: string; largura: number; altura: number }[];
      padrao: string;
    });

export type TipoCampo = CampoWorkflow["tipo"];

export type WorkflowCatalogo = {
  chave: string;
  tipo: string;
  ferramenta: string;
  ferramentaNome: string;
  nome: string;
  descricao: string | null;
  notas: string | null;
  origem: string | null;
  modelo: string | null;
  campos: CampoWorkflow[];
};

export type SaidaGeracao = "IMAGEM" | "VIDEO" | "AUDIO";

/** Onde o Gerador de um asset ou shot parou. O assistente vai pelo nome. */
export type RascunhoGerador = {
  tipo: string;
  workflow: string;
  valores: Record<string, unknown>;
  assistente: string | null;
  ideia: string | null;
};

export type TipoCatalogo = {
  chave: string;
  nome: string;
  descricao: string | null;
  saida: SaidaGeracao;
  workflows: WorkflowCatalogo[];
};

/** Um tipo de geração, como o cadastro mostra. */
export type TipoGeracao = {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  saida: SaidaGeracao;
  tiposAsset: TipoAsset[];
  shot: boolean;
  criadoEm: string;
  editadoEm: string;
  _count: { workflows: number };
};

/** Um workflow na lista do cadastro (sem o grafo). */
export type WorkflowResumo = {
  id: string;
  chave: string;
  ferramenta: string;
  ferramentaNome: string;
  nome: string;
  descricao: string | null;
  modelo: string | null;
  editadoEm: string;
  tipoGeracao: { id: string; chave: string; nome: string };
  qtdCampos: number;
  /** Quantos outputs já saíram dele. */
  outputs: number;
};

/** O grafo no formato API do ComfyUI. */
export type GrafoApi = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }>;

/** Um workflow inteiro, para editar. */
export type WorkflowDetalhe = Omit<WorkflowResumo, "qtdCampos" | "outputs"> & {
  notas: string | null;
  origem: string | null;
  grafo: GrafoApi;
  campos: CampoWorkflow[];
  saidas: string[];
};

/** Em que pé está um teste de workflow no ComfyUI. */
export type EstadoTeste = {
  status: "NA_FILA" | "EXECUTANDO" | "CONCLUIDA" | "FALHOU";
  progresso: { valor: number; max: number } | null;
  imagens: { filename: string; subfolder: string; type: string }[];
  erro: string | null;
};
