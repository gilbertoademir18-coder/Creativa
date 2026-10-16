import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { catalogoPara, conferir, type DonoGeracao, lerCampos, seedDe } from "../geracao/catalogo.ts";
import { cancelarExecucao, executar, MAX_POR_ENVIO, progressoDe } from "../geracao/execucao.ts";
import { imagensDisponiveis } from "../geracao/imagens.ts";
import { CHAVE_UNICA, encaixarNoPipeline, pipelineDe, RascunhoEtapa, type PipelineResolvido } from "../geracao/pipelines.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp, Uuid, UuidOpcional, validar } from "../lib/validacao.ts";

/**
 * O Gerador (`/api/gerador`): o que um asset ou shot pode gerar, e o botão
 * "Gerar". Não há cadastro de geração — o pedido vai direto para a fila do
 * ComfyUI como Execuções, e cada imagem volta como um Output do dono, com
 * tudo o que foi usado para gerá-la.
 */

/** Um asset ou um shot — exatamente um. */
const Dono = z
  .object({ asset: UuidOpcional, shot: UuidOpcional })
  .refine((d) => !!d.asset !== !!d.shot, "o Gerador é de um asset ou de um shot");

const Pedido = z
  .object({
    assetId: UuidOpcional,
    shotId: UuidOpcional,
    tipo: z.string().min(1, "escolha o tipo de geração"),
    workflow: z.string().min(1, "escolha o workflow"),
    parametros: z.record(z.string(), z.unknown()).default({}),
    /** Em que etapa do pipeline isto está sendo gerado. Ausente: a etapa única. */
    etapa: z.string().max(80).default(CHAVE_UNICA),
    quantidade: z.number().int().min(1).max(MAX_POR_ENVIO, `no máximo ${MAX_POR_ENVIO} de uma vez`).default(1),
    /** O assistente que expandiu o prompt, e a ideia de origem — vão para cada output. */
    assistenteId: UuidOpcional,
    ideia: z.string().trim().max(10_000).nullish().transform((t) => t || null),
  })
  .refine((d) => !!d.assetId !== !!d.shotId, "o Gerador é de um asset ou de um shot");

/**
 * O rascunho de uma etapa. O assistente vai pelo nome (como nos outputs): id
 * muda se ele for recriado, o nome é o que a pessoa reconhece. Nada aqui é
 * conferido contra o catálogo — a tela acerta ao abrir (tipo ou workflow que
 * sumiu cai para o primeiro).
 */
const PedidoRascunho = z
  .object({
    assetId: UuidOpcional,
    shotId: UuidOpcional,
    /** Qual etapa do pipeline. Ausente: a etapa única. */
    etapa: z.string().max(80).default(CHAVE_UNICA),
    rascunho: RascunhoEtapa.nullable(),
  })
  .refine((d) => !!d.assetId !== !!d.shotId, "o Gerador é de um asset ou de um shot");

/** O dono como o catálogo enxerga: o tipo do asset importa (só Cenário tem Placa...). */
async function donoDe(assetId: string | null, shotId: string | null): Promise<DonoGeracao> {
  if (assetId) {
    const a = await prisma.asset.findUnique({ where: { id: assetId }, select: { tipo: true } });
    if (!a) throw new ErroHttp(400, "Asset não encontrado.");
    return { asset: a.tipo };
  }
  if (!(await prisma.shot.findUnique({ where: { id: shotId! }, select: { id: true } }))) throw new ErroHttp(400, "Shot não encontrado.");
  return { shot: true };
}

/** O rascunho como está no banco, sem interpretar o formato. */
async function rascunhoCru(assetId: string | null, shotId: string | null): Promise<unknown> {
  const d = assetId
    ? await prisma.asset.findUnique({ where: { id: assetId }, select: { rascunhoGerador: true } })
    : await prisma.shot.findUnique({ where: { id: shotId! }, select: { rascunhoGerador: true } });
  if (!d) throw new ErroHttp(404, assetId ? "Asset não encontrado." : "Shot não encontrado.");
  return d.rascunhoGerador ?? null;
}

/**
 * A etapa existe no pipeline do dono, e o tipo pedido é o dela. Sem isso,
 * uma tela desatualizada gravaria outputs numa etapa que não existe (e eles
 * desapareceriam da galeria) ou numa etapa que não é daquele tipo.
 */
function conferirEtapa(pipeline: PipelineResolvido, chave: string, tipo: string) {
  const etapa = pipeline.etapas.find((e) => e.chave === chave);
  if (!etapa) throw new ErroHttp(400, `A etapa “${chave}” não é do pipeline ${pipeline.nome}. Recarregue a página.`);
  if (etapa.tipoGeracao && etapa.tipoGeracao !== tipo) {
    throw new ErroHttp(400, `A etapa “${etapa.nome}” gera ${etapa.tipoGeracao}, não ${tipo}. Recarregue a página.`);
  }
}

/** Quanto tempo uma execução que falhou continua aparecendo no Gerador. */
const FALHA_RECENTE_MS = 30 * 60_000;

export async function rotasGerador(app: FastifyInstance) {
  /** Os tipos (e workflows, com os campos) do Gerador de um asset ou shot. */
  app.get("/catalogo", async (req) => {
    const { asset, shot } = validar(Dono, req.query);
    return catalogoPara(await donoDe(asset, shot));
  });

  /**
   * As imagens que os campos de imagem podem usar: referências e outputs de
   * imagem do projeto do dono. Sem dono (o "Testar" do cadastro), todas.
   */
  app.get("/imagens", async (req) => {
    const { asset, shot } = validar(
      z.object({ asset: UuidOpcional, shot: UuidOpcional }).refine((d) => !(d.asset && d.shot), "um asset ou um shot, não os dois"),
      req.query,
    );
    return imagensDisponiveis({ assetId: asset, shotId: shot });
  });

  /**
   * As etapas do Gerador do dono e onde cada uma parou. Vêm juntas de
   * propósito: o rascunho só se encaixa nas etapas do pipeline que vale
   * agora, e em dois pedidos a tela teria de esperar os dois para decidir.
   */
  app.get("/etapas", async (req) => {
    const { asset, shot } = validar(Dono, req.query);
    const pipeline = await pipelineDe({ assetId: asset, shotId: shot });
    return { pipeline, rascunhos: encaixarNoPipeline(await rascunhoCru(asset, shot), pipeline) };
  });

  /**
   * Guarda onde o Gerador de uma etapa parou. A tela chama sozinha, enquanto
   * se mexe no formulário. Grava só a etapa pedida: as outras ficam como
   * estão, sem a tela precisar devolver o conjunto inteiro.
   */
  app.put("/rascunho", { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const { assetId, shotId, etapa, rascunho } = validar(PedidoRascunho, req.body);
    const pipeline = await pipelineDe({ assetId, shotId });
    /*
     * Ler, trocar uma etapa e gravar tudo de volta — com a linha travada
     * (FOR UPDATE) até o fim. Escolher numa etapa grava duas de uma vez (a
     * escolha e o campo limpo na etapa que a come); sem a trava, as duas liam
     * o rascunho antes de qualquer uma gravar, e a última devolvia a escolha
     * antiga: o "Escolher" não durava um F5 (2026-10-16).
     */
    const etapas = await prisma.$transaction(async (tx) => {
      const linhas = assetId
        ? await tx.$queryRaw<{ r: unknown }[]>`SELECT rascunho_gerador AS r FROM asset WHERE id = ${assetId}::uuid FOR UPDATE`
        : await tx.$queryRaw<{ r: unknown }[]>`SELECT rascunho_gerador AS r FROM shot WHERE id = ${shotId}::uuid FOR UPDATE`;
      if (!linhas.length) throw new ErroHttp(404, assetId ? "Asset não encontrado." : "Shot não encontrado.");
      const etapas = encaixarNoPipeline(linhas[0]!.r ?? null, pipeline);
      if (rascunho) etapas[etapa] = rascunho;
      else delete etapas[etapa];
      const vazio = Object.keys(etapas).length === 0;
      const data = { rascunhoGerador: vazio ? Prisma.DbNull : ({ etapas } as Prisma.InputJsonObject) };
      if (assetId) await tx.asset.update({ where: { id: assetId }, data, select: { id: true } });
      else await tx.shot.update({ where: { id: shotId! }, data, select: { id: true } });
      return etapas;
    });
    return { rascunhos: etapas };
  });

  /** "Gerar": confere o pedido contra o catálogo e manda `quantidade` execuções ao ComfyUI. */
  app.post("/executar", async (req) => {
    const { assistenteId, ...p } = validar(Pedido, req.body);
    const w = await conferir(p.tipo, p.workflow, await donoDe(p.assetId, p.shotId));
    conferirEtapa(await pipelineDe(p), p.etapa, p.tipo);
    // O nome, copiado: o assistente pode mudar ou sumir depois.
    const assistente = assistenteId
      ? ((await prisma.assistente.findUnique({ where: { id: assistenteId }, select: { nome: true } }))?.nome ?? null)
      : null;
    await executar(w, { ...p, assistente, ideia: assistente ? p.ideia : null });
    return { ok: true };
  });

  /**
   * O que o Gerador de um dono mostra além dos outputs prontos: o que está
   * na fila ou executando (com o progresso) e as falhas recentes, para a
   * pessoa saber por que uma imagem não veio.
   */
  app.get("/execucoes", async (req) => {
    const { asset, shot } = validar(Dono, req.query);
    const execucoes = await prisma.execucao.findMany({
      where: {
        assetId: asset ?? undefined,
        shotId: shot ?? undefined,
        OR: [
          { status: { in: ["NA_FILA", "EXECUTANDO"] } },
          { status: "FALHOU", concluidaEm: { gte: new Date(Date.now() - FALHA_RECENTE_MS) } },
        ],
      },
      select: {
        id: true,
        status: true,
        workflow: true,
        etapa: true,
        parametros: true,
        promptIdComfy: true,
        erro: true,
        criadoEm: true,
        iniciadaEm: true,
        concluidaEm: true,
      },
      orderBy: { criadoEm: "asc" },
    });
    // A seed de cada uma, pelo campo de seed do workflow dela.
    const workflows = await prisma.workflow.findMany({
      where: { chave: { in: [...new Set(execucoes.map((e) => e.workflow))] } },
      select: { chave: true, campos: true },
    });
    const campos = new Map(workflows.map((w) => [w.chave, lerCampos(w.campos, w.chave)]));
    return execucoes.map(({ promptIdComfy, parametros, ...e }) => ({
      ...e,
      seed: seedDe(campos.get(e.workflow) ?? [], parametros as Record<string, unknown>),
      progresso: progressoDe(promptIdComfy),
    }));
  });

  app.post("/execucoes/:id/cancelar", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    await cancelarExecucao(id);
    return { ok: true };
  });
}
