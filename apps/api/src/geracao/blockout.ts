import { z } from "zod";

/*
 * O blockout: a geometria simples que o Blender monta para guiar o primeiro
 * quadro (o depth vai ao ControlNet). Três níveis, como na previs de
 * animação:
 *
 *   asset de cenário    → a planta (`asset.blockout`, formato "cenario")
 *   asset de personagem → o manequim (`asset.blockout`, formato "personagem")
 *   cena                → a marcação: quem fica onde (`cena.marcacao`)
 *   shot                → a câmera, que é campo do workflow Blender (etapa Geometria)
 *
 * São dados, não arquivo .blend: quem monta a cena é `blender/creativa/render.py`,
 * que lê o pedido montado por `pedidoDoBlender`. Mudou o formato aqui? Mude o
 * script junto.
 *
 * Coordenadas em metros. Origem no centro do piso da sala; +y aponta para a
 * parede "frente" (a da lousa, num cenário de sala de aula), +x para a
 * "direita" de quem olha para a frente, +z para cima. Ângulos em graus,
 * girando em torno de z (0 = virado para +y).
 */

const Numero = z.number().finite();
const Medida = z.number().finite().positive("a medida tem de ser maior que zero").max(500, "no máximo 500 m");
const Vec2 = z.tuple([Numero, Numero]);
const Vec3 = z.tuple([Numero, Numero, Numero]);
const Cor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor no formato #rrggbb");

/** O material só decide o cinza (ou a cor) do render de prévia; o depth não vê material. */
export const MATERIAIS = ["parede", "piso", "teto", "movel", "metal", "lousa", "porta", "vidro", "tecido", "planta", "pedra"] as const;
const Material = z.enum(MATERIAIS, "material desconhecido");

const Parede = z.enum(["frente", "fundo", "esquerda", "direita"], "parede: frente, fundo, esquerda ou direita");

/** Uma peça solta. `pos` é o centro no chão (x, y) e a altura da base (z). */
const Peca = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("caixa"),
    nome: z.string().max(80).optional(),
    pos: Vec3,
    tam: z.tuple([Medida, Medida, Medida]),
    rot: Numero.default(0),
    material: Material.default("movel"),
    cor: Cor.optional(),
  }),
  z.object({
    tipo: z.literal("cilindro"),
    nome: z.string().max(80).optional(),
    pos: Vec3,
    raio: Medida,
    altura: Medida,
    material: Material.default("movel"),
    cor: Cor.optional(),
  }),
  /** Carteira escolar: tampo com pés e a cadeira atrás (−y), virada para +y. */
  z.object({ tipo: z.literal("carteira"), nome: z.string().max(80).optional(), pos: Vec2, rot: Numero.default(0) }),
  /** Mesa: tampo na altura dada, com quatro pés. */
  z.object({
    tipo: z.literal("mesa"),
    nome: z.string().max(80).optional(),
    pos: Vec2,
    tam: z.tuple([Medida, Medida, Medida]),
    rot: Numero.default(0),
  }),
  z.object({ tipo: z.literal("cadeira"), nome: z.string().max(80).optional(), pos: Vec2, rot: Numero.default(0) }),
]);
export type Peca = z.infer<typeof Peca>;

/** Um vão na parede da sala: janela (com peitoril), porta ou passagem. */
const Abertura = z.object({
  parede: Parede,
  tipo: z.enum(["janela", "porta", "vao"], "tipo: janela, porta ou vao"),
  /** Onde fica o centro, ao longo da parede: x nas paredes frente/fundo, y nas laterais. */
  centro: Numero,
  largura: Medida,
  /** A altura do chão até a base do vão (o peitoril da janela; 0 na porta). */
  base: z.number().finite().min(0).default(0),
  altura: Medida,
});

/** Um painel preso à parede: lousa, quadro de avisos, televisão. */
const Painel = z.object({
  parede: Parede,
  nome: z.string().max(80).optional(),
  centro: Numero,
  largura: Medida,
  base: z.number().finite().min(0),
  altura: Medida,
  material: Material.default("lousa"),
  cor: Cor.optional(),
});

/** Uma grade de peças iguais: as fileiras de carteiras. */
const Fileira = z.object({
  peca: z.enum(["carteira", "cadeira"]),
  /** A posição da primeira peça (coluna 0, linha 0). */
  origem: Vec2,
  colunas: z.number().int().min(1).max(30),
  linhas: z.number().int().min(1).max(30),
  /** O passo entre colunas (x) e entre linhas (y). Linha nova anda em −y (para o fundo). */
  passo: z.tuple([Numero, Numero]),
  rot: Numero.default(0),
});

export const BlockoutCenario = z.object({
  formato: z.literal("cenario"),
  versao: z.literal(1).default(1),
  /** A sala fechada. Sem ela (cena externa), só o piso e as peças. */
  sala: z
    .object({ largura: Medida, profundidade: Medida, altura: Medida, teto: z.boolean().default(true) })
    .optional(),
  aberturas: z.array(Abertura).max(40).default([]),
  paineis: z.array(Painel).max(40).default([]),
  pecas: z.array(Peca).max(300).default([]),
  fileiras: z.array(Fileira).max(20).default([]),
  /** O que está do lado de fora das janelas, só para a prévia: o depth vê infinito. */
  notas: z.string().max(2000).optional(),
});

export const BlockoutPersonagem = z.object({
  formato: z.literal("personagem"),
  versao: z.literal(1).default(1),
  /** Em metros, do chão ao alto da cabeça. Sai da ficha do personagem. */
  altura: z.number().finite().min(0.3).max(4),
  /** A silhueta da cintura para baixo — o depth carrega a silhueta. */
  corpo: z.enum(["saia", "calca", "vestido"]).default("calca"),
  cabelo: z
    .object({
      comprimento: z.enum(["curto", "medio", "longo"]).default("curto"),
      /** Volume em volta da cabeça: cabelo armado aparece no depth. */
      volume: z.number().min(0.8).max(2).default(1.18),
      cor: Cor.default("#4a3a30"),
    })
    .default({ comprimento: "curto", volume: 1.18, cor: "#4a3a30" }),
  /** Cores da prévia (o depth não vê cor). Ajudam a reconhecer quem é quem. */
  cores: z.object({ pele: Cor.default("#ccb39e"), cima: Cor.default("#d9d9e0"), baixo: Cor.default("#2a2e4c") }).default({ pele: "#ccb39e", cima: "#d9d9e0", baixo: "#2a2e4c" }),
});

export const Blockout = z.discriminatedUnion("formato", [BlockoutCenario, BlockoutPersonagem]);
export type BlockoutCenario = z.infer<typeof BlockoutCenario>;
export type BlockoutPersonagem = z.infer<typeof BlockoutPersonagem>;

export const POSES = ["em_pe", "sentada"] as const;

export const Marcacao = z.object({
  versao: z.literal(1).default(1),
  /** O asset de cenário onde a cena se passa. */
  cenario: z.uuid("cenário inválido"),
  personagens: z
    .array(
      z.object({
        asset: z.uuid("personagem inválida"),
        pos: Vec2,
        /** Para onde ela olha (um ponto no chão). Sem isso, vale `rot`. */
        olhaPara: Vec2.optional(),
        rot: Numero.default(0),
        pose: z.enum(POSES).default("em_pe"),
      }),
    )
    .max(12)
    .default([]),
  /** Peças só desta cena (uma mochila no chão, uma cadeira fora do lugar). */
  pecas: z.array(Peca).max(100).default([]),
});
export type Marcacao = z.infer<typeof Marcacao>;

/**
 * O que vai ao Blender: tudo já resolvido (os assets lidos), mais a câmera e
 * o render que vêm dos campos do workflow. É o JSON que `render.py` lê.
 */
export type PedidoBlender = {
  cenario: BlockoutCenario;
  personagens: (Marcacao["personagens"][number] & { nome: string; modelo: BlockoutPersonagem })[];
  pecas: Peca[];
  camera: { pos: [number, number, number]; alvo: [number, number, number]; lente: number };
  render: { largura: number; altura: number };
  saida: { depth: string; previa: string; relatorio: string };
};
