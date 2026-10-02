import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Referencia } from "../generated/prisma/client.ts";
import { TipoReferencia } from "../generated/prisma/enums.ts";
import { apagar, gravar } from "../lib/arquivos.ts";
import { doProjeto, doVinculo, incluirDono } from "../lib/filtros.ts";
import { prisma } from "../lib/prisma.ts";
import {
  Busca,
  contem,
  ErroHttp,
  FiltroProjeto,
  naoEncontrado,
  Nome,
  Uuid,
  UuidOpcional,
  validar,
} from "../lib/validacao.ts";

/**
 * Rotas de referências, montadas em `/api/referencias`.
 *
 * Referência é material externo: imagem, vídeo ou texto. Imagem e vídeo
 * chegam por upload e vão para a pasta de arquivos; texto mora no banco —
 * digitado, ou lido de um .txt/.md enviado.
 */

/** O tamanho em bytes vem do banco como BigInt, que o JSON não sabe escrever. */
export function referenciaParaJson<T extends Pick<Referencia, "tamanhoBytes">>(r: T) {
  return { ...r, tamanhoBytes: r.tamanhoBytes === null ? null : Number(r.tamanhoBytes) };
}

const Dono = z
  .object({ assetId: UuidOpcional, shotId: UuidOpcional })
  .refine((d) => !(d.assetId && d.shotId), "a referência pertence a um asset ou a um shot, não aos dois");

const CorpoTexto = z.object({
  nome: Nome,
  texto: z.string().trim().min(1, "o texto não pode ficar vazio").max(100_000, "texto longo demais"),
});

const CorpoEdicao = z.object({
  nome: Nome,
  /** Só vale para referência de texto; nas outras é ignorado. */
  texto: z.string().trim().max(100_000).optional(),
});

const FiltroReferencias = z.object({
  projeto: FiltroProjeto,
  tipo: z.enum(TipoReferencia, "tipo inválido").optional().or(z.literal("").transform(() => undefined)),
  vinculo: z.enum(["asset", "shot", "solta"], "vínculo inválido").optional().or(z.literal("").transform(() => undefined)),
  asset: Uuid.optional(),
  shot: Uuid.optional(),
  busca: Busca,
});

/** O que cada tipo de arquivo vira. Fora desta lista, o upload é recusado. */
function tipoDoArquivo(mime: string, nome: string): TipoReferencia | null {
  if (mime.startsWith("image/")) return "IMAGEM";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("text/") || /\.(txt|md)$/i.test(nome)) return "TEXTO";
  return null;
}

/** Nome padrão de uma referência enviada: o do arquivo, sem a extensão. */
const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, "") || nome;

const TEXTO_MAX_BYTES = 1024 * 1024;

export async function rotasReferencias(app: FastifyInstance) {
  app.get("/", async (req) => {
    const f = validar(FiltroReferencias, req.query);
    const referencias = await prisma.referencia.findMany({
      where: {
        AND: [
          doProjeto(f.projeto) ?? {},
          doVinculo(f.vinculo) ?? {},
          { tipo: f.tipo, assetId: f.asset, shotId: f.shot, nome: contem(f.busca) },
        ],
      },
      include: incluirDono,
      orderBy: { criadoEm: "desc" },
    });
    return referencias.map(referenciaParaJson);
  });

  app.get("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const r = await prisma.referencia.findUnique({
      where: { id },
      include: { ...incluirDono, _count: { select: { usadaEm: true } } },
    });
    if (!r) throw naoEncontrado("Referência não encontrada.");
    return referenciaParaJson(r);
  });

  /**
   * Upload de um ou mais arquivos (multipart). Cada arquivo vira uma
   * referência. Campos opcionais: `assetId` ou `shotId`.
   *
   * Os arquivos são gravados à medida que chegam — os campos podem vir antes
   * ou depois deles no formulário. Se algo falha depois, o que já foi gravado
   * é apagado: nada de arquivo órfão na pasta.
   */
  app.post("/upload", async (req, reply) => {
    const campos: Record<string, string> = {};
    const recebidos: {
      tipo: TipoReferencia;
      nomeOriginal: string;
      mime: string;
      arquivo?: string;
      tamanho?: number;
      texto?: string;
    }[] = [];

    try {
      for await (const parte of req.parts()) {
        if (parte.type === "field") {
          campos[parte.fieldname] = String(parte.value);
          continue;
        }
        const tipo = tipoDoArquivo(parte.mimetype, parte.filename);
        if (!tipo) {
          parte.file.resume();
          throw new ErroHttp(400, `"${parte.filename}" não é imagem, vídeo nem texto.`);
        }
        if (tipo === "TEXTO") {
          const conteudo = await parte.toBuffer();
          if (conteudo.length > TEXTO_MAX_BYTES) throw new ErroHttp(400, `"${parte.filename}" passa de 1 MB de texto.`);
          recebidos.push({ tipo, nomeOriginal: parte.filename, mime: parte.mimetype, texto: conteudo.toString("utf8") });
          continue;
        }
        const { relativo, tamanho } = await gravar("referencias", parte.filename, parte.file);
        if (parte.file.truncated) {
          await apagar(relativo);
          throw new ErroHttp(413, `"${parte.filename}" passa do tamanho máximo de upload.`);
        }
        recebidos.push({ tipo, nomeOriginal: parte.filename, mime: parte.mimetype, arquivo: relativo, tamanho });
      }

      if (recebidos.length === 0) throw new ErroHttp(400, "Nenhum arquivo enviado.");
      const dono = validar(Dono, campos);

      const criadas = await prisma.$transaction(
        recebidos.map((r) =>
          prisma.referencia.create({
            data: {
              ...dono,
              tipo: r.tipo,
              nome: semExtensao(r.nomeOriginal).slice(0, 120),
              nomeOriginal: r.nomeOriginal,
              mime: r.mime,
              arquivo: r.arquivo ?? null,
              tamanhoBytes: r.tamanho ?? null,
              texto: r.texto ?? null,
            },
            include: incluirDono,
          }),
        ),
      );
      return reply.code(201).send(criadas.map(referenciaParaJson));
    } catch (erro) {
      await Promise.all(recebidos.filter((r) => r.arquivo).map((r) => apagar(r.arquivo!)));
      throw erro;
    }
  });

  /** Referência de texto digitada na hora. */
  app.post("/texto", async (req, reply) => {
    const dados = validar(CorpoTexto.and(Dono), req.body);
    const r = await prisma.referencia.create({ data: { ...dados, tipo: "TEXTO" }, include: incluirDono });
    return reply.code(201).send(referenciaParaJson(r));
  });

  app.put("/:id", async (req) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const dados = validar(CorpoEdicao.and(Dono), req.body);
    const atual = await prisma.referencia.findUnique({ where: { id }, select: { tipo: true } });
    if (!atual) throw naoEncontrado("Referência não encontrada.");
    if (atual.tipo === "TEXTO" && dados.texto === "") throw new ErroHttp(400, "texto: não pode ficar vazio");
    const r = await prisma.referencia.update({
      where: { id },
      data: {
        nome: dados.nome,
        assetId: dados.assetId,
        shotId: dados.shotId,
        ...(atual.tipo === "TEXTO" && dados.texto !== undefined ? { texto: dados.texto } : {}),
      },
      include: incluirDono,
    });
    return referenciaParaJson(r);
  });

  /**
   * Apaga a referência e o arquivo dela. Recusado (409) se ela foi usada em
   * alguma geração. O arquivo só sai depois do banco: se o banco recusa, o
   * arquivo continua lá.
   */
  app.delete("/:id", async (req, reply) => {
    const { id } = validar(z.object({ id: Uuid }), req.params);
    const r = await prisma.referencia.delete({ where: { id } });
    if (r.arquivo) await apagar(r.arquivo);
    return reply.code(204).send();
  });
}
