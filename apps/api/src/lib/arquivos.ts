import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * Onde moram os arquivos do Creativa: referências enviadas e, depois, os
 * outputs do ComfyUI.
 *
 * Fora do projeto e no HDD por padrão (D:\Creativa): vídeo gerado cresce
 * rápido, e o NVMe fica para os modelos. O banco guarda só o caminho
 * relativo a esta pasta — mudá-la de lugar é mover a pasta e trocar o .env.
 */
export function pastaArquivos(): string {
  return path.resolve(process.env.ARQUIVOS_DIR ?? "D:\\Creativa");
}

/** O caminho absoluto de um arquivo guardado, a partir do relativo do banco. */
export function caminhoAbsoluto(relativo: string): string {
  const pasta = pastaArquivos();
  const absoluto = path.resolve(pasta, relativo);
  // Defesa contra `..` num caminho que veio do banco ou da URL: nada sai da pasta.
  if (!absoluto.startsWith(pasta + path.sep)) throw new Error(`Caminho fora da pasta de arquivos: ${relativo}`);
  return absoluto;
}

/**
 * Grava um stream em `<pasta>/<categoria>/<AAAA-MM>/<uuid>.<ext>` e devolve o
 * caminho relativo (com `/`, igual em qualquer sistema) e o tamanho.
 *
 * Nome por uuid, e não o original: dois "referencia.png" não se atropelam, e
 * o nome que o usuário deu fica no banco, onde pode ser editado.
 */
export async function gravar(
  categoria: "referencias" | "outputs",
  nomeOriginal: string,
  conteudo: NodeJS.ReadableStream,
): Promise<{ relativo: string; tamanho: number }> {
  const agora = new Date();
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  const ext = path.extname(nomeOriginal).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const relativo = `${categoria}/${mes}/${randomUUID()}${ext}`;
  const absoluto = caminhoAbsoluto(relativo);

  await mkdir(path.dirname(absoluto), { recursive: true });
  try {
    await pipeline(conteudo, createWriteStream(absoluto));
  } catch (erro) {
    // Upload interrompido no meio não deixa meio arquivo para trás.
    await rm(absoluto, { force: true });
    throw erro;
  }
  return { relativo, tamanho: (await stat(absoluto)).size };
}

/** Apaga um arquivo guardado. Já não existir não é erro. */
export async function apagar(relativo: string): Promise<void> {
  await rm(caminhoAbsoluto(relativo), { force: true });
}
