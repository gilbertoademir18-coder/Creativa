import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { caminhoAbsoluto } from "../lib/arquivos.ts";
import { configComfy } from "../lib/comfyui.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp } from "../lib/validacao.ts";
import type { DefWorkflow, RefImagem } from "./definicoes.ts";

/*
 * As imagens que entram num workflow pelos campos de imagem: referências e
 * outputs de imagem do projeto do dono. Num shot dá para usar a melhor
 * imagem da personagem (de um asset) e o cenário (de outro). Sem projeto,
 * só as do próprio dono.
 *
 * Na hora de gerar, cada imagem escolhida é enviada à pasta `input` do
 * ComfyUI (subpasta `creativa/`), com o nome pelo hash do conteúdo: enviar
 * de novo a mesma imagem não cria cópia.
 */

/** De quem é o Gerador. Os dois null: o "Testar" do cadastro, que vê todas. */
export type DonoImagens = { assetId: string | null; shotId: string | null };

export type ImagemDisponivel = RefImagem & {
  nome: string;
  arquivo: string;
  favorito: boolean;
  criadoEm: Date;
  /** De onde vem: o asset ou o shot (com a cena) dono da imagem. */
  dono: { tipo: "asset" | "shot"; id: string; nome: string };
  /** É do próprio dono do Gerador? Essas vêm primeiro na lista. */
  doDono: boolean;
};

/** Sem dono (o "Testar"), a lista para nas mais recentes. */
const LIMITE_SEM_DONO = 300;

/** O projeto do dono (null se ele não tem), ou 404 se o dono não existe. */
async function projetoDo(dono: DonoImagens): Promise<string | null> {
  if (dono.assetId) {
    const a = await prisma.asset.findUnique({ where: { id: dono.assetId }, select: { projetoId: true } });
    if (!a) throw new ErroHttp(404, "Asset não encontrado.");
    return a.projetoId;
  }
  const s = await prisma.shot.findUnique({ where: { id: dono.shotId! }, select: { cena: { select: { projetoId: true } } } });
  if (!s) throw new ErroHttp(404, "Shot não encontrado.");
  return s.cena.projetoId;
}

/**
 * O filtro de "pode usar": do projeto do dono, ou do próprio dono quando ele
 * não tem projeto. Sem dono, tudo. Serve igual para referências e outputs
 * (os dois têm asset e shot).
 */
async function filtroDono(dono: DonoImagens) {
  if (!dono.assetId && !dono.shotId) return {};
  const projetoId = await projetoDo(dono);
  if (!projetoId) return dono.assetId ? { assetId: dono.assetId } : { shotId: dono.shotId };
  return { OR: [{ asset: { projetoId } }, { shot: { cena: { projetoId } } }] };
}

const comDono = {
  asset: { select: { id: true, nome: true } },
  shot: { select: { id: true, nome: true, cena: { select: { nome: true } } } },
} as const;

type ComDono = {
  assetId: string | null;
  asset: { id: string; nome: string } | null;
  shot: { id: string; nome: string; cena: { nome: string } } | null;
};

function donoDa(x: ComDono, dono: DonoImagens) {
  const d = x.asset
    ? { tipo: "asset" as const, id: x.asset.id, nome: x.asset.nome }
    : { tipo: "shot" as const, id: x.shot!.id, nome: `${x.shot!.cena.nome} › ${x.shot!.nome}` };
  return { dono: d, doDono: d.id === (dono.assetId ?? dono.shotId) };
}

/** As imagens que o dono pode usar: as dele primeiro, depois os favoritos, depois as mais novas. */
export async function imagensDisponiveis(dono: DonoImagens): Promise<ImagemDisponivel[]> {
  const filtro = await filtroDono(dono);
  const take = dono.assetId || dono.shotId ? undefined : LIMITE_SEM_DONO;
  const [refs, outs] = await Promise.all([
    prisma.referencia.findMany({
      where: { ...filtro, tipo: "IMAGEM", arquivo: { not: null } },
      select: { id: true, nome: true, arquivo: true, criadoEm: true, assetId: true, ...comDono },
      orderBy: { criadoEm: "desc" },
      take,
    }),
    prisma.output.findMany({
      where: { ...filtro, tipo: "IMAGEM" },
      select: { id: true, arquivo: true, favorito: true, criadoEm: true, prompt: true, assetId: true, ...comDono },
      orderBy: { criadoEm: "desc" },
      take,
    }),
  ]);
  const lista: ImagemDisponivel[] = [
    ...refs.map((r) => ({ origem: "referencia" as const, id: r.id, nome: r.nome, arquivo: r.arquivo!, favorito: false, criadoEm: r.criadoEm, ...donoDa(r, dono) })),
    ...outs.map((o) => ({
      origem: "output" as const,
      id: o.id,
      nome: (o.prompt ?? "").slice(0, 80) || "Output",
      arquivo: o.arquivo,
      favorito: o.favorito,
      criadoEm: o.criadoEm,
      ...donoDa(o, dono),
    })),
  ];
  return lista.sort(
    (a, b) => Number(b.doDono) - Number(a.doDono) || Number(b.favorito) - Number(a.favorito) || b.criadoEm.getTime() - a.criadoEm.getTime(),
  );
}

/** O arquivo de uma imagem escolhida, conferindo que o dono pode usá-la. */
async function arquivoDa(ref: RefImagem, dono: DonoImagens): Promise<string> {
  const filtro = await filtroDono(dono);
  const achada =
    ref.origem === "referencia"
      ? await prisma.referencia.findFirst({ where: { ...filtro, id: ref.id, tipo: "IMAGEM" }, select: { arquivo: true } })
      : await prisma.output.findFirst({ where: { ...filtro, id: ref.id, tipo: "IMAGEM" }, select: { arquivo: true } });
  if (!achada?.arquivo) throw new ErroHttp(400, "A imagem escolhida não existe mais, ou não é deste projeto.");
  return achada.arquivo;
}

/** Envia um arquivo à pasta `input/creativa` do ComfyUI e devolve o nome que o LoadImage usa. */
async function enviarArquivo(relativo: string): Promise<string> {
  let conteudo: Buffer;
  try {
    conteudo = await readFile(caminhoAbsoluto(relativo));
  } catch {
    throw new ErroHttp(400, `O arquivo da imagem sumiu da pasta de arquivos: ${relativo}`);
  }
  const nome = `${createHash("sha256").update(conteudo).digest("hex").slice(0, 24)}${path.extname(relativo).toLowerCase() || ".png"}`;
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(conteudo)]), nome);
  form.append("subfolder", "creativa");
  form.append("type", "input");
  form.append("overwrite", "true");
  const r = await fetch(`${configComfy().url}/upload/image`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) }).catch(() => null);
  if (!r) throw new ErroHttp(409, "O ComfyUI está desconectado. Inicie pela barra do topo.");
  if (!r.ok) throw new ErroHttp(502, `O ComfyUI recusou a imagem (${r.status}).`);
  const j = (await r.json()) as { name: string; subfolder?: string };
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

/**
 * Envia ao ComfyUI as imagens dos campos de imagem e devolve o nome de cada
 * uma no ComfyUI, pela chave do campo — o que o \`montarGrafo\` escreve no
 * LoadImage.
 */
export async function enviarImagens(w: Pick<DefWorkflow, "campos">, valores: Record<string, unknown>, dono: DonoImagens): Promise<Record<string, string>> {
  const nomes: Record<string, string> = {};
  for (const c of w.campos) {
    if (c.tipo !== "imagem") continue;
    const ref = valores[c.chave] as RefImagem;
    nomes[c.chave] = await enviarArquivo(await arquivoDa(ref, dono));
  }
  return nomes;
}

/**
 * As imagens que aparecem nos parâmetros de um output, para a tela mostrar a
 * miniatura em vez do id. Imagem apagada depois volta null.
 */
export async function imagensDosParametros(parametros: Record<string, unknown>): Promise<Record<string, { arquivo: string; nome: string } | null>> {
  const r: Record<string, { arquivo: string; nome: string } | null> = {};
  for (const [chave, v] of Object.entries(parametros)) {
    const ref = v as Partial<RefImagem> | null;
    if (!ref || typeof ref !== "object" || !ref.id || (ref.origem !== "referencia" && ref.origem !== "output")) continue;
    const achada =
      ref.origem === "referencia"
        ? await prisma.referencia.findUnique({ where: { id: ref.id }, select: { arquivo: true, nome: true } })
        : await prisma.output.findUnique({ where: { id: ref.id }, select: { arquivo: true, prompt: true } });
    r[chave] = achada?.arquivo ? { arquivo: achada.arquivo, nome: "nome" in achada ? achada.nome : (achada.prompt.slice(0, 80) || "Output") } : null;
  }
  return r;
}
