import { z } from "zod";

/*
 * Os formatos do Gerador.
 *
 * Um TIPO de geração ("Placa de cenário", "Character sheet") diz o que se quer
 * produzir e em que Gerador aparece. Um WORKFLOW é um jeito concreto de
 * produzir aquele tipo numa ferramenta (hoje, o ComfyUI): o grafo, os campos
 * que o Gerador mostra e o ALVO de cada campo — em que nó e entrada do grafo o
 * valor entra. Os dois são cadastros do usuário (tabelas `tipo_geracao` e
 * `workflow`); aqui ficam só os formatos e a validação deles.
 */

/** Onde um valor entra no grafo: o id do nó e o nome da entrada. */
export const Alvo = z.object({
  no: z.string().min(1, "escolha o nó"),
  entrada: z.string().min(1, "escolha a entrada"),
});
export type Alvo = z.infer<typeof Alvo>;

/**
 * Um aviso que a tela mostra enquanto a pessoa escreve — não impede gerar.
 * `falta`: avisa se o texto NÃO casa com o padrão; `tem`: se casa.
 */
export const Aviso = z.object({
  quando: z.enum(["falta", "tem"]),
  padrao: z
    .string()
    .min(1, "o padrão do aviso não pode ficar vazio")
    // Caractere de controle (um "\b" que virou backspace) é barra invertida
    // que se perdeu no caminho: o aviso nunca dispararia.
    .refine((p) => !/[\x00-\x1f]/.test(p), "o padrão do aviso tem caractere de controle — perdeu uma barra invertida (\\b, \\d)?")
    .refine((p) => {
      try {
        new RegExp(p, "i");
        return true;
      } catch {
        return false;
      }
    }, "o padrão do aviso não é uma expressão regular válida"),
  mensagem: z.string().min(1, "a mensagem do aviso não pode ficar vazia"),
});
export type Aviso = z.infer<typeof Aviso>;

const base = {
  chave: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "a chave do campo é minúscula, sem espaço nem acento (ex.: prompt, passos)"),
  rotulo: z.string().trim().min(1, "o campo precisa de um rótulo"),
  dica: z.string().optional(),
};

/** Os campos que um workflow expõe. A tela monta o formulário a partir deles. */
export const Campo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("texto"),
    ...base,
    alvos: z.array(Alvo).min(1, "o campo precisa entrar em algum lugar do grafo"),
    linhas: z.number().int().min(1).max(40).optional(),
    obrigatorio: z.boolean().optional(),
    padrao: z.string().optional(),
    /** Faixa recomendada de palavras: a tela mostra um contador. */
    palavras: z.object({ min: z.number().int().min(0), max: z.number().int().min(1) }).optional(),
    avisos: z.array(Aviso).optional(),
    /**
     * O assistente de prompt escreve neste campo: a pessoa digita a ideia e
     * ele expande. A dica, as palavras e os avisos vão junto para a LLM.
     */
    assistivel: z.boolean().optional(),
  }),
  z.object({
    tipo: z.literal("numero"),
    ...base,
    alvos: z.array(Alvo).min(1, "o campo precisa entrar em algum lugar do grafo"),
    padrao: z.number(),
    min: z.number().optional(),
    max: z.number().optional(),
    /** 1 para inteiros; 0.1, 0.05... para decimais. */
    passo: z.number().positive().optional(),
  }),
  z.object({
    tipo: z.literal("opcoes"),
    ...base,
    alvos: z.array(Alvo).min(1, "o campo precisa entrar em algum lugar do grafo"),
    /** O valor vai como está para o grafo (texto ou número). */
    opcoes: z.array(z.object({ valor: z.union([z.string(), z.number()]), rotulo: z.string().min(1) })).min(1, "dê pelo menos uma opção"),
    padrao: z.union([z.string(), z.number()]),
  }),
  z.object({
    /** Seed: um número, ou "aleatória" (null), sorteada no envio. */
    tipo: z.literal("seed"),
    ...base,
    alvos: z.array(Alvo).min(1, "o campo precisa entrar em algum lugar do grafo"),
  }),
  z.object({
    /**
     * Uma imagem do projeto — referência ou output — que o Creativa envia ao
     * ComfyUI na hora de gerar. O alvo é a entrada `image` de um LoadImage.
     * Sempre obrigatória: o LoadImage não roda sem arquivo.
     */
    tipo: z.literal("imagem"),
    ...base,
    alvos: z.array(Alvo).min(1, "o campo precisa entrar em algum lugar do grafo"),
  }),
  z.object({
    /** Um tamanho escolhido numa lista, que preenche largura E altura. */
    tipo: z.literal("tamanho"),
    ...base,
    largura: z.array(Alvo).min(1, "diga onde entra a largura"),
    altura: z.array(Alvo).min(1, "diga onde entra a altura"),
    opcoes: z
      .array(z.object({ valor: z.string().min(1), rotulo: z.string().min(1), largura: z.number().int().min(16), altura: z.number().int().min(16) }))
      .min(1, "dê pelo menos um tamanho"),
    padrao: z.string(),
  }),
]);
export type Campo = z.infer<typeof Campo>;
export type CampoDe<T extends Campo["tipo"]> = Extract<Campo, { tipo: T }>;

/** O grafo no formato API do ComfyUI, o que o POST /prompt aceita. */
export type GrafoApi = Record<string, { class_type: string; inputs: Record<string, unknown>; _meta?: { title: string } }>;

/**
 * O valor de um campo de imagem: qual referência ou output do projeto. É o
 * que fica nos parâmetros do output ("Usar estas configurações" traz de
 * volta); o nome do arquivo no ComfyUI só existe no grafo enviado.
 */
export const RefImagem = z.object({ origem: z.enum(["referencia", "output"]), id: z.uuid("imagem inválida") }, "escolha uma imagem");
export type RefImagem = z.infer<typeof RefImagem>;

/** Os valores já validados, prontos para montar o grafo. A seed já vem sorteada. */
export type Valores = Record<string, string | number | RefImagem>;

/** O que o Gerador precisa de um workflow para montar e enviar. */
export type DefWorkflow = {
  chave: string;
  /** A chave do tipo de geração. */
  tipo: string;
  ferramenta: string;
  nome: string;
  modelo: string | null;
  grafo: GrafoApi;
  campos: Campo[];
  /** Os nós cujas saídas viram Outputs (SaveImage, SaveVideo...). */
  saidas: string[];
};

/** As ferramentas que sabem rodar um workflow. Ferramenta nova = um adaptador em `execucao.ts`. */
export const FERRAMENTAS = [{ chave: "comfyui", nome: "ComfyUI" }] as const;
export const nomeFerramenta = (chave: string) => FERRAMENTAS.find((f) => f.chave === chave)?.nome ?? chave;

/** Os alvos de um campo, para conferir e para montar. */
export const alvosDe = (c: Campo): Alvo[] => (c.tipo === "tamanho" ? [...c.largura, ...c.altura] : c.alvos);
