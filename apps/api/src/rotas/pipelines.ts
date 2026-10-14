import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lerCampos } from "../geracao/catalogo.ts";
import { CHAVE_UNICA, Etapas, lerEtapas } from "../geracao/pipelines.ts";
import { chaveLivre } from "../lib/chave.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp, naoEncontrado, Nome, TextoOpcional, Uuid, validar } from "../lib/validacao.ts";

/**
 * Pipelines (`/api/pipelines`): o roteiro de etapas de um shot ("First frame
 * + vídeo"). Cadastro do usuário; a chave nasce do nome e não muda mais,
 * porque shots e projetos guardam ela.
 */

const CorpoPipeline = z.object({
  nome: Nome,
  descricao: TextoOpcional(1000),
  etapas: Etapas,
});

/** Quem usa um pipeline: shots que o escolheram e projetos que o têm como padrão. */
async function emUso(chaves: string[]) {
  if (!chaves.length) return new Map<string, { shots: number; projetos: number }>();
  const [shots, projetos] = await Promise.all([
    prisma.shot.groupBy({ by: ["pipeline"], _count: true, where: { pipeline: { in: chaves } } }),
    prisma.projeto.groupBy({ by: ["pipelinePadrao"], _count: true, where: { pipelinePadrao: { in: chaves } } }),
  ]);
  const uso = new Map(chaves.map((c) => [c, { shots: 0, projetos: 0 }]));
  for (const s of shots) if (s.pipeline) uso.get(s.pipeline)!.shots = s._count;
  for (const p of projetos) if (p.pipelinePadrao) uso.get(p.pipelinePadrao)!.projetos = p._count;
  return uso;
}

/**
 * Os tipos de geração das etapas têm de existir e aparecer no Gerador dos
 * shots — etapa com tipo que não aparece lá é uma etapa onde não se gera
 * nada, e o erro só apareceria na cara de quem fosse usar.
 */
async function conferirTipos(etapas: z.infer<typeof Etapas>) {
  const chaves = [...new Set(etapas.map((e) => e.tipoGeracao).filter((t): t is string => !!t))];
  if (!chaves.length) return;
  const tipos = await prisma.tipoGeracao.findMany({ where: { chave: { in: chaves } }, select: { chave: true, nome: true, shot: true } });
  const faltando = chaves.filter((c) => !tipos.some((t) => t.chave === c));
  if (faltando.length) throw new ErroHttp(400, `Tipo de geração não encontrado: ${faltando.join(", ")}.`);
  const foraDoShot = tipos.filter((t) => !t.shot);
  if (foraDoShot.length) {
    throw new ErroHttp(
      400,
      `“${foraDoShot.map((t) => t.nome).join("”, “")}” não aparece no Gerador dos shots. Marque “Shots” nele, em Tipos de geração.`,
    );
  }
}

export async function rotasPipelines(app: FastifyInstance) {
  /**
   * Os campos de imagem de cada tipo de geração, para o cadastro oferecer o
   * que uma etapa pode receber da anterior. É a união dos campos dos
   * workflows do tipo: trocar de workflow dentro da etapa não deve apagar a
   * ligação, então o que vale é o nome do campo, não o workflow.
   */
  app.get("/campos-de-imagem", async () => {
    const workflows = await prisma.workflow.findMany({ select: { chave: true, campos: true, tipoGeracao: { select: { chave: true } } } });
    const porTipo: Record<string, { chave: string; rotulo: string }[]> = {};
    for (const w of workflows) {
      const lista = (porTipo[w.tipoGeracao.chave] ??= []);
      for (const c of lerCampos(w.campos, w.chave)) {
        if (c.tipo === "imagem" && !lista.some((x) => x.chave === c.chave)) lista.push({ chave: c.chave, rotulo: c.rotulo });
      }
    }
    return porTipo;
  });

  app.get("/", async () => {
    const lista = await prisma.pipeline.findMany({ orderBy: { nome: "asc" } });
    const uso = await emUso(lista.map((p) => p.chave));
    return lista.map((p) => ({ ...p, etapas: lerEtapas(p.etapas, p.chave), uso: uso.get(p.chave)! }));
  });

  app.post("/", async (req, reply) => {
    const dados = validar(CorpoPipeline, req.body);
    await conferirTipos(dados.etapas);
    // "unica" é o embutido: um cadastro com essa chave ficaria invisível.
    const chave = await chaveLivre(dados.nome, async (c) => c === CHAVE_UNICA || !!(await prisma.pipeline.findUnique({ where: { chave: c } })));
    return reply.code(201).send(await prisma.pipeline.create({ data: { ...dados, chave } }));
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoPipeline, req.body);
    await conferirTipos(dados.etapas);
    const antes = await prisma.pipeline.findUnique({ where: { id }, select: { chave: true, etapas: true } });
    if (!antes) throw naoEncontrado("Pipeline não encontrado.");
    /*
     * Tirar uma etapa não apaga nada: o rascunho dela fica guardado no shot e
     * os outputs continuam com a chave dela gravada. Mas eles somem da tela,
     * então vale avisar quem está salvando.
     */
    const sumiram = lerEtapas(antes.etapas, antes.chave)
      .filter((e) => !dados.etapas.some((n) => n.chave === e.chave))
      .map((e) => e.nome);
    const p = await prisma.pipeline.update({ where: { id }, data: dados });
    return { ...p, etapasRemovidas: sumiram };
  });

  /** Pipeline em uso não se apaga: os shots dele cairiam na geração única sem aviso. */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const p = await prisma.pipeline.findUnique({ where: { id } });
    if (!p) throw naoEncontrado("Pipeline não encontrado.");
    const uso = (await emUso([p.chave])).get(p.chave)!;
    if (uso.shots || uso.projetos) {
      const onde = [uso.shots && `${uso.shots} shot(s)`, uso.projetos && `${uso.projetos} projeto(s)`].filter(Boolean).join(" e ");
      throw new ErroHttp(409, `“${p.nome}” está em uso por ${onde}. Troque o pipeline deles antes.`);
    }
    await prisma.pipeline.delete({ where: { id } });
    return reply.code(204).send();
  });
}
