import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { apagar, caminhoAbsoluto, gravar, tamanhoPng } from "../lib/arquivos.ts";
import { lerEnv } from "../lib/comfyui.ts";
import { prisma } from "../lib/prisma.ts";
import { ErroHttp } from "../lib/validacao.ts";
import { BlockoutCenario, BlockoutPersonagem, Marcacao, type PedidoBlender } from "./blockout.ts";
import { prepararParaEnvio, validarValores } from "./catalogo.ts";
import type { DefWorkflow, GrafoApi } from "./definicoes.ts";
import type { Pedido } from "./execucao.ts";
import { montarGrafo } from "./grafo.ts";

/*
 * O Blender como ferramenta do Gerador: a etapa Geometria de um shot.
 *
 * O workflow Blender tem um "grafo" no mesmo formato do ComfyUI (nós com
 * class_type e inputs), para os campos e os alvos funcionarem iguais:
 *
 *   "camera": { class_type: "Camera", inputs: { x, y, z, alvo_x, alvo_y, alvo_z, lente } }
 *   "render": { class_type: "Render", inputs: { largura, altura } }
 *
 * No "Gerar", o resto do pedido sai do banco — a marcação da cena do shot e
 * o blockout de cada asset dela — e o pedido inteiro, já resolvido, fica em
 * `grafoEnviado`: o output guarda o que foi montado de fato, mesmo que o
 * blockout mude depois.
 *
 * Roda aqui mesmo, num processo do Blender (`blender/creativa/render.py`),
 * um de cada vez. O resultado é um Output só: o arquivo é o depth (o que o
 * workflow seguinte usa) e a prévia é o render colorido (o que a tela mostra).
 */

const SCRIPT = path.resolve(import.meta.dirname, "../../../../blender/creativa/render.py");
/** Um render de blockout leva segundos; passou disso, travou. */
const LIMITE_MS = 5 * 60_000;

/**
 * O blender.exe: o do .env (BLENDER_EXE) ou o mais novo instalado em
 * Program Files ("Blender 5.2" ou "Blender Foundation\Blender 5.2").
 */
export function exeDoBlender(): string | null {
  const doEnv = lerEnv("BLENDER_EXE", "");
  if (doEnv) return existsSync(doEnv) ? doEnv : null;
  const raizes = [process.env.ProgramFiles ?? "C:\\Program Files"];
  const achados: string[] = [];
  for (const raiz of raizes) {
    const pastas = [raiz, path.join(raiz, "Blender Foundation")];
    for (const p of pastas) {
      let nomes: string[] = [];
      try {
        nomes = readdirSync(p);
      } catch {
        continue;
      }
      for (const n of nomes) if (/^blender/i.test(n) && existsSync(path.join(p, n, "blender.exe"))) achados.push(path.join(p, n, "blender.exe"));
    }
  }
  // "Blender 5.2" depois de "Blender 4.5": a ordem numérica do nome.
  achados.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return achados.at(-1) ?? null;
}

const numero = (v: unknown, nome: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ErroHttp(400, `O workflow do Blender precisa de um número em ${nome}.`);
  return v;
};

/** O pedido ao Blender, sem as saídas: a marcação da cena e os blockouts, lidos agora, mais a câmera. */
async function montarPedido(shotId: string, g: GrafoApi): Promise<Omit<PedidoBlender, "saida">> {
  const cam = g.camera?.inputs, ren = g.render?.inputs;
  if (!cam || !ren) throw new ErroHttp(400, 'O grafo do Blender precisa dos nós "camera" e "render".');

  const shot = await prisma.shot.findUnique({ where: { id: shotId }, select: { cena: { select: { marcacao: true, projetoId: true } } } });
  if (!shot) throw new ErroHttp(404, "Shot não encontrado.");
  if (!shot.cena.marcacao) throw new ErroHttp(400, "A cena deste shot ainda não tem marcação (o cenário e quem fica onde). Faça com a skill /blockout.");
  const m = Marcacao.safeParse(shot.cena.marcacao);
  if (!m.success) throw new ErroHttp(400, "A marcação da cena está num formato que não reconheço. Refaça com a skill /blockout.");

  const ids = [m.data.cenario, ...m.data.personagens.map((p) => p.asset)];
  const assets = new Map(
    (await prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, blockout: true } })).map((a) => [a.id, a]),
  );
  const ler = <T>(id: string, esquema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): { nome: string; modelo: T } => {
    const a = assets.get(id);
    if (!a) throw new ErroHttp(400, "A marcação aponta para um asset que não existe mais.");
    if (!a.blockout) throw new ErroHttp(400, `"${a.nome}" ainda não tem blockout. Faça com a skill /blockout.`);
    const r = esquema.safeParse(a.blockout);
    if (!r.success) throw new ErroHttp(400, `O blockout de "${a.nome}" está num formato que não reconheço.`);
    return { nome: a.nome, modelo: r.data };
  };

  return {
    cenario: ler(m.data.cenario, BlockoutCenario).modelo,
    personagens: m.data.personagens.map((p) => ({ ...p, ...ler(p.asset, BlockoutPersonagem) })),
    pecas: m.data.pecas,
    camera: {
      pos: [numero(cam.x, "camera.x"), numero(cam.y, "camera.y"), numero(cam.z, "camera.z")],
      alvo: [numero(cam.alvo_x, "camera.alvo_x"), numero(cam.alvo_y, "camera.alvo_y"), numero(cam.alvo_z, "camera.alvo_z")],
      lente: numero(cam.lente, "camera.lente"),
    },
    render: { largura: numero(ren.largura, "render.largura"), altura: numero(ren.altura, "render.altura") },
  };
}

let log: FastifyBaseLogger | null = null;
let fila: Promise<void> = Promise.resolve();
/** O processo do Blender de cada execução em andamento — para o cancelar. */
const processos = new Map<string, ChildProcess>();

/** "Gerar" num workflow Blender: confere tudo agora e põe uma execução na fila. */
export async function executarBlender(w: DefWorkflow, pedido: Pedido): Promise<void> {
  if (!pedido.shotId) throw new ErroHttp(400, "A geometria é de um shot: a marcação mora na cena dele.");
  if (!exeDoBlender()) throw new ErroHttp(409, "Não achei o Blender nesta máquina. Instale, ou ponha o caminho do blender.exe em BLENDER_EXE no .env.");
  const valores = prepararParaEnvio(w, validarValores(w, pedido.parametros));
  const montado = await montarPedido(pedido.shotId, montarGrafo(w.grafo, w.campos, valores));
  // Uma só, mesmo que peçam mais: o mesmo blockout dá sempre a mesma imagem.
  const e = await prisma.execucao.create({
    data: {
      assetId: pedido.assetId,
      shotId: pedido.shotId,
      tipo: pedido.tipo,
      workflow: w.chave,
      etapa: pedido.etapa,
      modelo: w.modelo,
      status: "NA_FILA",
      parametros: valores,
      grafoEnviado: montado as object,
      assistente: pedido.assistente,
      ideia: pedido.ideia,
    },
  });
  fila = fila.then(() => rodar(e.id)).catch(() => {});
}

/** Cancela uma execução do Blender: tira da fila ou mata o processo. */
export async function cancelarBlender(id: string): Promise<void> {
  await prisma.execucao.update({ where: { id }, data: { status: "CANCELADA", concluidaEm: new Date() } });
  processos.get(id)?.kill();
}

const falhar = (id: string, erro: string) =>
  prisma.execucao.update({ where: { id }, data: { status: "FALHOU", erro, concluidaEm: new Date() } });

/** Roda o render.py e espera. Recusa com o fim da saída do Blender, que é onde o erro aparece. */
function chamarBlender(exe: string, pedidoJson: string, id: string): Promise<void> {
  return new Promise((ok, falha) => {
    const p = spawn(exe, ["--background", "--factory-startup", "--python", SCRIPT, "--", pedidoJson], { windowsHide: true });
    processos.set(id, p);
    let saida = "";
    const juntar = (b: Buffer) => {
      saida = (saida + b.toString()).slice(-4000);
    };
    p.stdout.on("data", juntar);
    p.stderr.on("data", juntar);
    const relogio = setTimeout(() => p.kill(), LIMITE_MS);
    p.on("error", (e) => falha(e));
    p.on("close", (codigo) => {
      clearTimeout(relogio);
      processos.delete(id);
      if (codigo === 0 && saida.includes("[creativa] pronto")) return ok();
      const erro = saida.split(/\r?\n/).filter((l) => /error|exception|traceback/i.test(l)).slice(-3).join(" | ");
      falha(new Error(erro || `o Blender saiu com o código ${codigo}`));
    });
  });
}

async function rodar(id: string): Promise<void> {
  const e = await prisma.execucao.findUnique({ where: { id } });
  if (!e || e.status !== "NA_FILA") return; // cancelada enquanto esperava
  const exe = exeDoBlender();
  if (!exe) return void (await falhar(id, "O Blender sumiu desta máquina."));
  await prisma.execucao.update({ where: { id }, data: { status: "EXECUTANDO", iniciadaEm: new Date() } });

  const pasta = await mkdtemp(path.join(os.tmpdir(), "creativa-blender-"));
  const copiados: string[] = [];
  try {
    const saida = {
      depth: path.join(pasta, "depth.png"),
      previa: path.join(pasta, "previa.png"),
      relatorio: path.join(pasta, "relatorio.json"),
      // As partes de "placa primeiro, personagens depois": a sala vazia e os bonecos.
      depthVazio: path.join(pasta, "depth_vazio.png"),
      manequins: path.join(pasta, "manequins.png"),
    };
    const pedidoJson = path.join(pasta, "pedido.json");
    await writeFile(pedidoJson, JSON.stringify({ ...(e.grafoEnviado as object), saida }), "utf8");
    await chamarBlender(exe, pedidoJson, id);

    const depth = await gravar("outputs", "depth.png", createReadStream(saida.depth));
    copiados.push(depth.relativo);
    const previa = await gravar("outputs", "previa.png", createReadStream(saida.previa));
    copiados.push(previa.relativo);
    // Sem personagens na marcação, o render não grava as partes.
    const partes: Record<string, string> = {};
    for (const nome of ["depthVazio", "manequins"] as const) {
      if (!existsSync(saida[nome])) continue;
      const g = await gravar("outputs", `${nome}.png`, createReadStream(saida[nome]));
      copiados.push(g.relativo);
      partes[nome] = g.relativo;
    }
    const dims = await tamanhoPng(caminhoAbsoluto(depth.relativo));
    // O relatório (quanto do quadro, de que lado, virada para onde) fica com o
    // pedido: é dele que o assistente do primeiro quadro tira o enquadramento.
    const relatorio = JSON.parse(await readFile(saida.relatorio, "utf8")) as unknown;

    const agora = await prisma.execucao.findUnique({ where: { id }, select: { status: true } });
    if (agora?.status !== "EXECUTANDO") throw new Error("cancelada");
    await prisma.$transaction([
      prisma.output.create({
        data: {
          assetId: e.assetId,
          shotId: e.shotId,
          execucaoId: e.id,
          tipoGeracao: e.tipo,
          workflow: e.workflow,
          etapa: e.etapa,
          modelo: e.modelo,
          prompt: "",
          parametros: e.parametros as object,
          grafoEnviado: { ...(e.grafoEnviado as object), relatorio } as object,
          assistente: e.assistente,
          ideia: e.ideia,
          tipo: "IMAGEM",
          arquivo: depth.relativo,
          previa: previa.relativo,
          partes: Object.keys(partes).length ? partes : undefined,
          mime: "image/png",
          tamanhoBytes: depth.tamanho,
          largura: dims?.largura ?? null,
          altura: dims?.altura ?? null,
        },
      }),
      prisma.execucao.update({ where: { id }, data: { status: "CONCLUIDA", concluidaEm: new Date() } }),
    ]);
  } catch (erro) {
    await Promise.all(copiados.map((c) => apagar(c)));
    const agora = await prisma.execucao.findUnique({ where: { id }, select: { status: true } });
    if (agora?.status === "CANCELADA") return;
    log?.error({ err: erro }, "o render do Blender falhou");
    await falhar(id, `Blender: ${(erro as Error).message}`);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

/**
 * Chamado quando o servidor sobe: execução do Blender que estava na fila ou
 * rodando morreu com o processo antigo — a fila do Blender é só memória.
 */
export async function iniciarBlender(logger: FastifyBaseLogger): Promise<void> {
  log = logger;
  const chaves = (await prisma.workflow.findMany({ where: { ferramenta: "blender" }, select: { chave: true } })).map((w) => w.chave);
  if (!chaves.length) return;
  await prisma.execucao.updateMany({
    where: { workflow: { in: chaves }, status: { in: ["NA_FILA", "EXECUTANDO"] }, promptIdComfy: null },
    data: { status: "FALHOU", erro: "O servidor reiniciou antes de o Blender terminar. Gere de novo.", concluidaEm: new Date() },
  });
}
