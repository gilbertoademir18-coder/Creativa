import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Ligar e desligar o ComfyUI pela API — o mesmo que o submenu do tray faz,
 * mas alcançável de qualquer PC do tailnet.
 *
 * Tray e API leem a mesma configuração (COMFYUI_DIR, COMFYUI_URL,
 * COMFYUI_ARGS do .env) e escrevem no mesmo log, para que um enxergue o que
 * o outro fez: o tray segue a porta, então adota um ComfyUI ligado pelo site,
 * e o "Ver o log do ComfyUI" dele mostra o log desta partida também.
 */

const exec = promisify(execFile);
const RAIZ = path.resolve(import.meta.dirname, "../../../..");

/**
 * Uma chave do .env, lida do arquivo na hora — e não do process.env, que é
 * o do momento em que o servidor subiu. É o que permite trocar o
 * COMFYUI_ARGS e só reiniciar o ComfyUI, como no tray.
 */
function lerEnv(chave: string, padrao: string): string {
  try {
    const linha = readFileSync(path.join(RAIZ, ".env"), "utf8")
      .split(/\r?\n/)
      .find((l) => new RegExp(`^\\s*${chave}\\s*=`).test(l));
    if (linha) return linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  } catch {
    // Sem .env: vale o padrão.
  }
  return padrao;
}

export function configComfy() {
  const url = lerEnv("COMFYUI_URL", "http://127.0.0.1:8188").replace(/\/$/, "");
  const dir = lerEnv("COMFYUI_DIR", "C:\\AI\\ComfyUI");
  return {
    url,
    porta: Number(new URL(url).port || 80),
    dir,
    python: path.join(dir, "python_embeded", "python.exe"),
    args: lerEnv("COMFYUI_ARGS", ""),
    // O mesmo arquivo do tray (scripts\tray.ps1).
    log: path.join(process.env.LOCALAPPDATA ?? RAIZ, "Creativa", "comfyui.log"),
  };
}

/*
 * O endereço do ComfyUI no tailnet (scriptspublicar-no-tailnet.ps1), para o
 * botão "Abrir o ComfyUI" de quem acessa o Creativa de outro PC — lá,
 * 127.0.0.1 seria o próprio PC. Vem do nome da máquina no Tailscale, lido
 * uma vez e guardado; sem Tailscale, fica null.
 */
let tailnet: { url: string | null } | null = null;

async function urlTailnetComfy(): Promise<string | null> {
  if (tailnet) return tailnet.url;
  try {
    const { stdout } = await exec("tailscale", ["status", "--json"], { windowsHide: true, timeout: 5_000 });
    const nome = (JSON.parse(stdout) as { Self?: { DNSName?: string } }).Self?.DNSName?.replace(/\.$/, "");
    tailnet = { url: nome ? `https://${nome}:${lerEnv("COMFYUI_PORTA_TAILNET", "8445")}` : null };
  } catch {
    tailnet = { url: null };
  }
  return tailnet.url;
}

/** Pergunta ao próprio ComfyUI se ele está no ar, e qual a versão. */
export async function consultarComfy(): Promise<{ noAr: boolean; versao: string | null }> {
  try {
    const r = await fetch(`${configComfy().url}/system_stats`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { noAr: false, versao: null };
    const stats = (await r.json()) as { system?: { comfyui_version?: string } };
    return { noAr: true, versao: stats.system?.comfyui_version ?? null };
  } catch {
    return { noAr: false, versao: null };
  }
}

/*
 * Partida em andamento, iniciada por esta API. Some quando o ComfyUI
 * responde. Depois de 5 minutos sem resposta vira "não respondeu" — o mesmo
 * prazo do tray: carregar os nós customizados leva tempo, travar não.
 */
const PRAZO_MS = 5 * 60_000;
let partida: { desde: number } | null = null;

export async function estadoComfy() {
  const { noAr, versao } = await consultarComfy();
  if (noAr) partida = null;
  const decorrido = partida ? Date.now() - partida.desde : 0;
  return {
    noAr,
    versao,
    /** Para o link "Abrir o ComfyUI" da barra do topo: o local e o do tailnet. */
    url: configComfy().url,
    urlTailnet: await urlTailnetComfy(),
    iniciando: !!partida && decorrido < PRAZO_MS,
    naoRespondeu: !!partida && decorrido >= PRAZO_MS,
    segundos: partida ? Math.round(decorrido / 1000) : null,
  };
}

/** Quem ouve na porta (o PID), ou null. Pelo netstat, que vem com o Windows. */
async function pidNaPorta(porta: number): Promise<number | null> {
  const { stdout } = await exec("netstat", ["-ano", "-p", "TCP"], { windowsHide: true });
  for (const linha of stdout.split(/\r?\n/)) {
    const [, local, , estado, pid] = linha.trim().split(/\s+/);
    if (estado === "LISTENING" && local?.endsWith(`:${porta}`)) return Number(pid);
  }
  return null;
}

export class ErroComfy extends Error {}

/**
 * Sobe o ComfyUI oculto, com os argumentos do run_nvidia_gpu.bat mais o
 * COMFYUI_ARGS, e a saída no log.
 *
 * Por um `cmd /c start /b` que sai na hora, e não como filho direto deste
 * servidor: o "Reiniciar o servidor" do tray derruba a árvore de processos
 * inteira do servidor (taskkill /T), e um ComfyUI filho cairia junto, no
 * meio de uma geração. Com o intermediário fora do caminho, o ComfyUI fica
 * órfão — independente, como se tivesse sido aberto pelo .bat.
 */
export async function iniciarComfy(): Promise<void> {
  const c = configComfy();
  if ((await consultarComfy()).noAr || (await pidNaPorta(c.porta))) throw new ErroComfy("O ComfyUI já está no ar.");
  if (partida && Date.now() - partida.desde < PRAZO_MS) throw new ErroComfy("O ComfyUI já está iniciando.");
  if (!existsSync(c.python)) throw new ErroComfy(`Não encontrei o ComfyUI em ${c.dir}. Ajuste COMFYUI_DIR no .env.`);

  mkdirSync(path.dirname(c.log), { recursive: true });
  const comando = `"${c.python}" -s ComfyUI\\main.py --windows-standalone-build --port ${c.porta} ${c.args}`.trim();
  // `/s` + aspas em volta da linha inteira: o cmd tira só o par de fora e
  // mantém as aspas dos caminhos (a mesma armadilha que o tray já pisou).
  const filho = spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"start "" /b ${comando} 1>"${c.log}" 2>&1"`], {
    cwd: c.dir,
    detached: true,
    windowsHide: true,
    windowsVerbatimArguments: true,
    stdio: "ignore",
  });
  filho.unref();
  partida = { desde: Date.now() };
}

/** Derruba quem ouve na porta do ComfyUI — iniciado pelo site, pelo tray ou pelo .bat — e espera a porta vagar. */
export async function pararComfy(): Promise<void> {
  const porta = configComfy().porta;
  const pid = await pidNaPorta(porta);
  if (!pid) throw new ErroComfy("O ComfyUI não está no ar.");
  await exec("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  partida = null;
  for (let i = 0; i < 50 && (await pidNaPorta(porta)); i++) await new Promise((r) => setTimeout(r, 200));
}

/**
 * As últimas linhas do log, sem as cores do terminal. Lê só o fim do arquivo:
 * o log de uma sessão longa do ComfyUI cresce bastante.
 */
export async function logComfy(linhas = 200): Promise<string[]> {
  const arquivo = configComfy().log;
  try {
    const { size } = await stat(arquivo);
    const tamanho = Math.min(size, 256 * 1024);
    const f = await open(arquivo, "r");
    try {
      const buf = Buffer.alloc(tamanho);
      await f.read(buf, 0, tamanho, size - tamanho);
      return buf
        .toString("utf8")
        .replace(/\x1b\[[0-9;]*m/g, "")
        .split(/\r?\n/)
        .slice(-linhas);
    } finally {
      await f.close();
    }
  } catch {
    return [];
  }
}
