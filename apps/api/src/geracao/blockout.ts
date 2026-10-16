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
  /**
   * Bola (achatável pela escala): a copa de uma árvore, um arbusto. Em cena
   * aberta, copa feita de cilindros empilhados vira "bolo de andares" no depth.
   */
  z.object({
    tipo: z.literal("esfera"),
    nome: z.string().max(80).optional(),
    pos: Vec3,
    raio: Medida,
    escala: z.tuple([Medida, Medida, Medida]).default([1, 1, 1]),
    material: Material.default("planta"),
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
  /**
   * O que se vê pelas janelas. Sem nada lá fora, a janela vira um buraco
   * preto e liso no depth, e o ControlNet forte transforma isso em mosaico.
   */
  exterior: z.enum(["misto", "arvores", "predios", "nada"]).default("misto"),
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

/**
 * O nome de uma cor (#rrggbb), para a LLM dizer qual manequim é quem:
 * "o manequim de cabeça vermelho-escura". Grosso de propósito — é a cor da
 * cabeça na colagem, e o modelo de imagem só precisa distinguir uma da outra.
 */
export function nomeDaCor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l < 0.13) return "preta";
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15) return l > 0.8 ? "branca" : "cinza";
  const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  const base =
    h >= 330 || h < 15 ? (l > 0.68 ? "rosa" : "vermelha") : h < 40 ? (l < 0.45 ? "castanha" : "laranja") : h < 70 ? "amarela" : h < 170 ? "verde" : h < 260 ? "azul" : h < 290 ? "roxa" : "rosa";
  return l < 0.38 && base !== "castanha" ? `${base}-escura` : base;
}

/** O que a câmera vê, sem as personagens: a fração do quadro de cada peça (o render.py mede). */
type NaVista = { nome: string; fracao: number; onde: string };

/** O pedido ao Blender da geometria escolhida do shot, com o relatório dele. null: nenhuma escolhida. */
type GeometriaEnviada = {
  relatorio?: { personagens?: NoQuadro[]; vista?: NaVista[]; camera?: { altura: number; inclinacao: number; lente: number } };
  personagens?: { nome: string; modelo?: { cabelo?: { cor?: string } } }[];
};

/**
 * A geometria de um shot (o output com prévia e relatório): a que está no
 * campo do workflow (`outputId`), se for deste shot; senão, a escolhida em
 * qualquer etapa. O campo vem primeiro porque é com ele que a imagem é
 * gerada: lendo só a escolhida, a pessoa que gerou uma geometria nova e a pôs
 * no campo sem escolhê-la recebia o prompt da câmera velha (2026-10-16).
 */
async function geometriaDoShot(shotId: string, outputId?: string | null): Promise<GeometriaEnviada | null> {
  const { prisma } = await import("../lib/prisma.ts");
  if (outputId) {
    const doCampo = await prisma.output.findFirst({ where: { id: outputId, shotId, previa: { not: null } }, select: { grafoEnviado: true } });
    if (doCampo) return doCampo.grafoEnviado as GeometriaEnviada | null;
  }
  const shot = await prisma.shot.findUnique({ where: { id: shotId }, select: { rascunhoGerador: true } });
  const etapas = (shot?.rascunhoGerador as { etapas?: Record<string, { escolhido?: string | null }> } | null)?.etapas ?? {};
  const ids = Object.values(etapas).map((e) => e.escolhido).filter((x): x is string => !!x);
  if (!ids.length) return null;
  const o = await prisma.output.findFirst({ where: { id: { in: ids }, previa: { not: null } }, orderBy: { criadoEm: "desc" }, select: { grafoEnviado: true } });
  return (o?.grafoEnviado as GeometriaEnviada | null) ?? null;
}

/**
 * O que a câmera da geometria escolhida vê, sem as personagens, para o
 * assistente da placa (e do primeiro quadro). A LLM não enxerga o depth: sem
 * isto ela descrevia a sala do exemplo do assistente — num pátio aberto,
 * escreveu janelas e carteiras (2026-10-15). Geometria de antes da medição
 * (sem `vista` no relatório): null — gere a geometria de novo.
 */
export async function vistaDoShot(shotId: string, geometria?: string | null): Promise<string | null> {
  const rel = (await geometriaDoShot(shotId, geometria))?.relatorio;
  if (!rel?.vista?.length) return null;
  const c = rel.camera;
  const angulo = !c
    ? null
    : c.inclinacao <= -35
      ? "bem de cima, olhando quase para o chão"
      : c.inclinacao <= -10
        ? "de cima, olhando para baixo"
        : c.inclinacao >= 10
          ? "de baixo, olhando para cima"
          : "na altura dos olhos";
  return [
    "O que esta câmera vê (medido na geometria do shot, sem as personagens). A geometria já está travada pelo depth: descreva o lugar como esta lista diz, e não ponha no quadro o que não está nela:",
    ...(c ? [`- Câmera ${angulo} (${Math.abs(Math.round(c.inclinacao))}°, a ${c.altura.toFixed(1).replace(".", ",")} m do chão), lente de ${c.lente} mm.`] : []),
    ...rel.vista.map((v) => `- ${v.nome}: ${Math.round(v.fracao * 100)}% do quadro, ${v.onde}.`),
  ].join("\n");
}

/** O que o render.py mede de cada personagem, no relatório que fica no output. */
type NoQuadro = { nome: string; alturaNoQuadro: number; lado: string; virada: string; cortada: boolean; dentro: boolean };

/**
 * O enquadramento que a geometria escolhida de um shot já travou, em texto,
 * para o assistente do primeiro quadro: o prompt tem de concordar com o
 * depth. Nos testes de 2026-10-15, o prompt pedindo rostos com o depth de
 * costas fez o modelo virar as duas, com gente a mais e imagem embaralhada;
 * com o prompt de acordo, 3 de 3 saíram certas.
 *
 * Vale a geometria escolhida em qualquer etapa do shot (o output com prévia
 * e relatório). Sem ela, null.
 *
 * `manequins`: o workflow parte da placa com os manequins colados ("placa
 * primeiro, personagens depois"). Aí o texto diz qual manequim — pela cor
 * da cabeça — vira cada personagem.
 */
export async function enquadramentoDoShot(shotId: string, manequins = false, geometria?: string | null): Promise<string | null> {
  const enviado = await geometriaDoShot(shotId, geometria);
  const rel = enviado?.relatorio;
  const corDe = (nome: string) => enviado?.personagens?.find((p) => p.nome === nome)?.modelo?.cabelo?.cor;
  const ps = (rel?.personagens ?? []).filter((p) => p.dentro);
  if (!ps.length) return null;
  const maior = Math.max(...ps.map((p) => p.alturaNoQuadro));
  const plano = maior >= 0.85 ? "close / plano próximo" : maior >= 0.55 ? "plano médio" : maior >= 0.3 ? "plano americano a inteiro" : "plano geral";
  // Como escrever com esse enquadramento. Saiu dos testes de 2026-10-15: com
  // "facing away" no meio da frase e "curious expression", o modelo virou as
  // duas de frente; abrindo com "seen from behind" e citando o cabelo de cada
  // uma, 3 de 3 saíram de costas e cada uma do seu lado.
  const costas = ps.some((p) => p.virada === "de costas");
  const perfil = ps.some((p) => p.virada.startsWith("de perfil"));
  const comoEscrever = [
    manequins
      ? `- No trecho de cada personagem, diga a orientação dela${costas ? ' ("seen from behind")' : ""} — o pedido começa pela edição, não pelo ponto de vista.`
      : `- Abra o prompt pelo ponto de vista${costas && ps.every((p) => p.virada === "de costas") ? ' ("seen from behind", "from the back")' : perfil ? ' (ex.: "in profile")' : ""}, antes de qualquer outra coisa.`,
    costas && "- Quem está de costas não mostra o rosto: não escreva expressão, olhar nem sorriso dela. A emoção vai pelo gesto e pela postura.",
    "- Diga de que lado do quadro cada personagem está e descreva o cabelo de cada uma (cor e corte), que é o que amarra quem é quem — principalmente de costas.",
  ].filter((l): l is string => !!l);
  return [
    "Enquadramento já travado pela geometria do shot (o depth do blockout). A imagem vai seguir esta posição e esta orientação; o prompt tem de concordar com elas, sem virar ninguém para outro lado:",
    `- Plano: ${plano}.`,
    ...ps.map((p) => {
      const cor = manequins ? corDe(p.nome) : undefined;
      const quem = cor ? `${p.nome} (no lugar do manequim de cabeça ${nomeDaCor(cor)})` : p.nome;
      return `- ${quem}: ${p.lado} do quadro, ${p.virada}${p.virada.startsWith("de perfil") ? "" : " para a câmera"}, ocupa ${Math.round(p.alturaNoQuadro * 100)}% da altura${p.cortada ? " (cortada embaixo)" : ""}.`;
    }),
    "Como escrever com este enquadramento:",
    ...(manequins
      ? ["- A imagem de partida é a placa com manequins coloridos no lugar das personagens. Peça para trocar cada manequim (pela cor da cabeça e pelo lado) pela personagem dele, mantendo a sala, a janela, a câmera e a luz exatamente como estão."]
      : []),
    ...comoEscrever,
  ].join("\n");
}

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
