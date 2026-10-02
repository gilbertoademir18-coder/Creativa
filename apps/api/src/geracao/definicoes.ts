import type { TipoAsset } from "../generated/prisma/enums.ts";

/*
 * Os formatos do registro de gerações.
 *
 * Um TIPO de geração ("Placa de cenário", "Character sheet", "First
 * frame"...) diz o que se quer produzir e para quem faz sentido. Um WORKFLOW
 * é um jeito concreto de produzir aquele tipo no ComfyUI: os campos que ele
 * expõe e o grafo que monta com eles. Um tipo pode ter vários workflows
 * (modelos diferentes para a mesma coisa).
 *
 * Tudo isso é programado — não dá para deduzir de um workflow do ComfyUI
 * quais campos importam e quais são fixos. Workflow novo é um arquivo novo
 * em `workflows/`, registrado em `registro.ts`.
 */

/** Para quem um tipo de geração aparece. */
export type Donos = {
  /** Assets destes tipos (ex.: só CENARIO). */
  assets?: TipoAsset[];
  /** Shots. */
  shot?: boolean;
  /** Geração solta, sem dono. */
  solta?: boolean;
};

export type DefTipo = {
  chave: string;
  nome: string;
  descricao: string;
  /** O que sai: define como os outputs são mostrados. */
  saida: "IMAGEM" | "VIDEO";
  donos: Donos;
};

/**
 * Um aviso que a tela mostra enquanto a pessoa escreve — não impede salvar.
 * `falta`: avisa se o texto NÃO casa com o padrão; `tem`: se casa.
 */
export type Aviso = { quando: "falta" | "tem"; padrao: string; mensagem: string };

/** Os campos que um workflow expõe. A tela monta o formulário a partir deles. */
export type Campo =
  | {
      tipo: "texto";
      chave: string;
      rotulo: string;
      linhas?: number;
      obrigatorio?: boolean;
      dica?: string;
      padrao?: string;
      /** Faixa recomendada de palavras: a tela mostra um contador. */
      palavras?: { min: number; max: number };
      avisos?: Aviso[];
    }
  | {
      tipo: "opcoes";
      chave: string;
      rotulo: string;
      opcoes: { valor: string; rotulo: string }[];
      padrao: string;
      dica?: string;
    }
  | {
      /** Seed: um número, ou "aleatória" (null), sorteada no envio. */
      tipo: "seed";
      chave: string;
      rotulo: string;
    };

/** O grafo no formato API do ComfyUI, o que o POST /prompt aceita. */
export type GrafoApi = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

/** Os valores já validados, prontos para montar o grafo. A seed já vem sorteada. */
export type Valores = Record<string, string | number>;

export type DefWorkflow = {
  chave: string;
  /** A que tipo este workflow serve. */
  tipo: string;
  nome: string;
  descricao: string;
  /** O arquivo de origem no ComfyUI (user/default/workflows), só como referência. */
  arquivoComfy: string;
  /** O modelo principal, gravado na geração no envio. */
  modelo: string;
  campos: Campo[];
  montar: (v: Valores) => GrafoApi;
  /** Os nós cujas saídas viram Outputs (SaveImage, SaveVideo...). */
  saidas: string[];
};
