#!/usr/bin/env node
/**
 * O lado de script da skill /blockout. Fala com a API do Creativa (porta 3400;
 * outra com CREATIVA_URL) e roda o Blender local para as prévias. Nunca apaga.
 *
 * Leitura:
 *   node blockout.mjs ver <projeto: id ou parte do nome>
 *     Cenários e personagens (com ou sem blockout), cenas (com ou sem
 *     marcação) e os shots de cada cena.
 *   node blockout.mjs ler <asset|cena> <id> [arquivo.json]
 *     O blockout do asset ou a marcação da cena; com arquivo, salva nele.
 *
 * Escrita (pela API, que valida o formato):
 *   node blockout.mjs salvar-asset <id> <blockout.json> [--substituir]
 *   node blockout.mjs salvar-cena <id> <marcacao.json> [--substituir]
 *     Sem --substituir, não passa por cima do que já existe.
 *
 * Câmera (camera.json: {"pos":[x,y,z], "alvo":[x,y,z], "lente":35, "tamanho":"1344x768"}):
 *   node blockout.mjs previa <shotId> <camera.json> <pasta>
 *     Monta e renderiza AQUI, sem gravar nada no Creativa: previa.png,
 *     depth.png, relatorio.json e cena.blend na pasta. Avisa quando uma
 *     personagem fica pequena demais no quadro para o depth segurar.
 *   node blockout.mjs previa-asset <assetId> <camera.json> <pasta>
 *     O mesmo, só com um asset: a planta vazia (cenário) ou o manequim no
 *     centro de uma sala neutra (personagem). Para comparar com a placa ou a capa.
 *   node blockout.mjs camera <shotId> <camera.json> [--substituir]
 *     Deixa a câmera no rascunho da etapa de geometria do shot: a pessoa só
 *     clica em Gerar. Sem --substituir, não passa por cima de rascunho.
 *   node blockout.mjs gerar <shotId> <camera.json>
 *     Gera a geometria no Creativa (vira output do shot) e espera terminar.
 *   node blockout.mjs escolher <shotId> <outputId>
 *     Marca o output como o escolhido da etapa de geometria: é ele que vai
 *     para o campo "Geometria" do primeiro quadro.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const URL_API = (process.env.CREATIVA_URL ?? "http://127.0.0.1:3400").replace(/\/$/, "");
const RAIZ = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join(RAIZ, "blender/creativa/render.py");
const TIPO = "geometria-do-shot";
const WORKFLOW = "geometria-do-shot-blender";
const LINHAS = /\r?\n/;
const LINHA_DE_ERRO = /error|traceback|exception/i;

function sair(msg) {
  console.error(msg);
  process.exit(1);
}

async function api(caminho, metodo = "GET", corpo) {
  let r;
  try {
    r = await fetch(`${URL_API}/api${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    sair(`O Creativa não respondeu em ${URL_API}. Ele está rodando?`);
  }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (r.status === 404 && /\/(blockout|marcacao)$/.test(caminho))
    sair('O app está rodando a API antiga, sem o blockout. Peça ao usuário para usar "Reiniciar o servidor" no ícone da bandeja.');
  if (!r.ok) sair(`A API respondeu ${r.status} em ${metodo} ${caminho}: ${j?.erro ?? "sem mensagem"}`);
  return j;
}

const lerJson = (arquivo) => JSON.parse(readFileSync(arquivo, "utf8"));
const opcao = (args, nome) => args.includes(nome);

function exeDoBlender() {
  try {
    const linha = readFileSync(path.join(RAIZ, ".env"), "utf8").split(LINHAS).find((l) => /^\s*BLENDER_EXE\s*=/.test(l));
    const v = linha?.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  } catch {
    // sem .env: procura em Program Files
  }
  const raiz = process.env.ProgramFiles ?? "C:\\Program Files";
  const achados = [];
  for (const p of [raiz, path.join(raiz, "Blender Foundation")]) {
    let nomes = [];
    try {
      nomes = readdirSync(p);
    } catch {
      continue;
    }
    for (const n of nomes) if (/^blender/i.test(n) && existsSync(path.join(p, n, "blender.exe"))) achados.push(path.join(p, n, "blender.exe"));
  }
  achados.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return achados.at(-1) ?? null;
}

async function acharProjeto(busca) {
  const lista = await api("/projetos");
  const p = lista.find((x) => x.id === busca) ?? lista.find((x) => x.nome.toLowerCase().includes(busca.toLowerCase()));
  if (!p) sair(`Nenhum projeto com "${busca}". Projetos: ${lista.map((x) => x.nome).join(", ")}`);
  return p;
}

/** A câmera do arquivo, nos valores dos campos do workflow de geometria. */
function valoresDaCamera(c) {
  if (!Array.isArray(c.pos) || !Array.isArray(c.alvo) || typeof c.lente !== "number") sair('camera.json: {"pos":[x,y,z], "alvo":[x,y,z], "lente":35}');
  return {
    cam_x: c.pos[0],
    cam_y: c.pos[1],
    cam_z: c.pos[2],
    alvo_x: c.alvo[0],
    alvo_y: c.alvo[1],
    alvo_z: c.alvo[2],
    lente: c.lente,
    tamanho: c.tamanho ?? "1344x768",
  };
}

/** A etapa do pipeline do shot que gera geometria, e o rascunho dela. */
async function etapaDeGeometria(shotId) {
  const { pipeline, rascunhos } = await api(`/gerador/etapas?shot=${shotId}`);
  const etapa = pipeline.etapas.find((e) => e.tipoGeracao === TIPO);
  if (!etapa) sair(`O pipeline do shot ("${pipeline.nome}") não tem etapa de "Geometria do shot". Ajuste o pipeline em Pipelines, ou escolha outro para o shot.`);
  return { etapa: etapa.chave, rascunho: rascunhos[etapa.chave] ?? null };
}

async function assetComBlockout(id) {
  const a = await api(`/assets/${id}`);
  if (!a.blockout) sair(`"${a.nome}" não tem blockout. Grave com salvar-asset primeiro.`);
  return a;
}

/** Roda o render.py aqui, sem passar pelo Creativa, e conta o que o relatório diz. */
function renderizar(cena, cam, pasta) {
  const exe = exeDoBlender() ?? sair("Não achei o Blender. Instale, ou ponha BLENDER_EXE no .env.");
  const v = valoresDaCamera(cam);
  const [largura, altura] = v.tamanho.split("x").map(Number);
  mkdirSync(pasta, { recursive: true });
  const abs = (n) => path.resolve(pasta, n);
  const pedido = {
    ...cena,
    camera: { pos: cam.pos, alvo: cam.alvo, lente: cam.lente },
    render: { largura, altura },
    saida: { previa: abs("previa.png"), depth: abs("depth.png"), relatorio: abs("relatorio.json"), blend: abs("cena.blend") },
  };
  writeFileSync(abs("pedido.json"), JSON.stringify(pedido, null, 1));
  const r = spawnSync(exe, ["--background", "--factory-startup", "--python", SCRIPT, "--", abs("pedido.json")], { encoding: "utf8", windowsHide: true });
  if (!String(r.stdout).includes("[creativa] pronto")) {
    const erros = `${r.stdout}${r.stderr}`.split(LINHAS).filter((l) => LINHA_DE_ERRO.test(l)).slice(-6);
    sair(`O Blender falhou:\n${erros.join("\n") || "(sem mensagem)"}`);
  }
  const rel = lerJson(abs("relatorio.json"));
  console.log(`Prévia em ${abs("previa.png")} (depth em depth.png, cena em cena.blend).`);
  console.log(`Depth em disparidade: branco a ${rel.depth.perto} m, preto além de ${rel.depth.longe} m.`);
  for (const p of rel.personagens) {
    const pct = Math.round(p.alturaNoQuadro * 100);
    const nota = !p.dentro
      ? "⚠ fora do quadro"
      : p.alturaNoQuadro < 0.45
        ? "⚠ pequena demais: o depth não deve segurá-la (o plano geral falhou com ~30%)"
        : p.alturaNoQuadro < 0.6
          ? "· entre o que falhou e o que funcionou: não testado"
          : "✓ tamanho que funcionou nos testes (~70%)";
    console.log(`  ${p.nome}: ${p.lado}, ${p.virada}, ${pct}% da altura do quadro${p.cortada ? " (cortada embaixo)" : ""}  ${nota}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "ver") {
  const p = await acharProjeto(args[0] ?? sair("Uso: ver <projeto>"));
  const assets = await api(`/assets?projeto=${p.id}`);
  console.log(`PROJETO "${p.nome}"  id ${p.id}\n\nCENÁRIOS E PERSONAGENS`);
  for (const a of assets.filter((x) => x.tipo === "CENARIO" || x.tipo === "PERSONAGEM"))
    console.log(`  ${a.blockout ? "✓" : "✗"} ${a.tipo.padEnd(10)} "${a.nome}"  id ${a.id}${a.capa ? `  capa ${a.capa}` : ""}`);
  console.log("\nCENAS");
  for (const c of await api(`/cenas?projeto=${p.id}`)) {
    const cena = await api(`/cenas/${c.id}`);
    console.log(`  ${cena.marcacao ? "✓" : "✗"} "${cena.nome ?? "(sem nome)"}"  id ${cena.id}${cena.video ? `  vídeo "${cena.video.nome}"` : ""}`);
    for (const s of cena.shots ?? []) console.log(`      shot ${s.ordem + 1}${s.nome ? ` "${s.nome}"` : ""}  id ${s.id}`);
    if (cena.storyboard) console.log(`      storyboard: ${cena.storyboard.slice(0, 160).replace(/\s+/g, " ")}${cena.storyboard.length > 160 ? "…" : ""}`);
  }
} else if (cmd === "ler") {
  const [qual, id, arquivo] = args;
  if (!["asset", "cena"].includes(qual) || !id) sair("Uso: ler <asset|cena> <id> [arquivo.json]");
  const r = await api(`/${qual === "asset" ? "assets" : "cenas"}/${id}`);
  const dado = qual === "asset" ? r.blockout : r.marcacao;
  if (arquivo && dado) writeFileSync(arquivo, JSON.stringify(dado, null, 1));
  console.log(`"${r.nome ?? "(sem nome)"}": ${dado ? (arquivo ? `salvo em ${arquivo}` : JSON.stringify(dado, null, 1)) : "ainda não tem"}`);
} else if (cmd === "salvar-asset" || cmd === "salvar-cena") {
  const [id, arquivo] = args;
  if (!id || !arquivo) sair(`Uso: ${cmd} <id> <arquivo.json> [--substituir]`);
  const asset = cmd === "salvar-asset";
  const atual = await api(`/${asset ? "assets" : "cenas"}/${id}`);
  if ((asset ? atual.blockout : atual.marcacao) && !opcao(args, "--substituir"))
    sair(`"${atual.nome ?? "a cena"}" já tem ${asset ? "blockout" : "marcação"}. Leia com "ler", e só substitua com --substituir se o usuário pediu.`);
  const corpo = asset ? { blockout: lerJson(arquivo) } : { marcacao: lerJson(arquivo) };
  await api(`/${asset ? "assets" : "cenas"}/${id}/${asset ? "blockout" : "marcacao"}`, "PUT", corpo);
  console.log(`${asset ? "Gravado o blockout de" : "Gravada a marcação de"} "${atual.nome ?? "(sem nome)"}".`);
} else if (cmd === "previa") {
  const [shotId, arquivoCam, pasta] = args;
  if (!shotId || !arquivoCam || !pasta) sair("Uso: previa <shotId> <camera.json> <pasta>");
  const shot = await api(`/shots/${shotId}`);
  const cena = await api(`/cenas/${shot.cena.id}`);
  if (!cena.marcacao) sair(`A cena "${cena.nome ?? ""}" não tem marcação. Grave com salvar-cena primeiro.`);
  const m = cena.marcacao;
  const cenario = await assetComBlockout(m.cenario);
  const personagens = [];
  for (const p of m.personagens) {
    const a = await assetComBlockout(p.asset);
    personagens.push({ ...p, nome: a.nome, modelo: a.blockout });
  }
  renderizar({ cenario: cenario.blockout, personagens, pecas: m.pecas ?? [] }, lerJson(arquivoCam), pasta);
} else if (cmd === "previa-asset") {
  const [assetId, arquivoCam, pasta] = args;
  if (!assetId || !arquivoCam || !pasta) sair("Uso: previa-asset <assetId> <camera.json> <pasta>");
  const a = await assetComBlockout(assetId);
  const neutra = { formato: "cenario", sala: { largura: 6, profundidade: 6, altura: 3, teto: false }, aberturas: [], paineis: [], pecas: [], fileiras: [] };
  const cena =
    a.blockout.formato === "cenario"
      ? { cenario: a.blockout, personagens: [], pecas: [] }
      : { cenario: neutra, personagens: [{ asset: a.id, nome: a.nome, pos: [0, 0], rot: 180, pose: "em_pe", modelo: a.blockout }], pecas: [] };
  renderizar(cena, lerJson(arquivoCam), pasta);
} else if (cmd === "camera") {
  const [shotId, arquivoCam] = args;
  if (!shotId || !arquivoCam) sair("Uso: camera <shotId> <camera.json> [--substituir]");
  const { etapa, rascunho } = await etapaDeGeometria(shotId);
  if (rascunho && !opcao(args, "--substituir")) sair(`A etapa "${etapa}" já tem rascunho (é do usuário). Só substitua com --substituir se ele pediu.`);
  const valores = valoresDaCamera(lerJson(arquivoCam));
  await api("/gerador/rascunho", "PUT", {
    shotId,
    etapa,
    rascunho: { tipo: TIPO, workflow: WORKFLOW, valores, assistente: null, ideia: null, escolhido: rascunho?.escolhido ?? null },
  });
  console.log(`Câmera no rascunho da etapa "${etapa}": é só abrir o shot e clicar em Gerar.`);
} else if (cmd === "gerar") {
  const [shotId, arquivoCam] = args;
  if (!shotId || !arquivoCam) sair("Uso: gerar <shotId> <camera.json>");
  const { etapa } = await etapaDeGeometria(shotId);
  const antes = new Set((await api(`/outputs?shot=${shotId}`)).map((o) => o.id));
  await api("/gerador/executar", "POST", { shotId, tipo: TIPO, workflow: WORKFLOW, etapa, parametros: valoresDaCamera(lerJson(arquivoCam)), quantidade: 1 });
  for (let i = 0; i < 150; i++) {
    await new Promise((ok) => setTimeout(ok, 2000));
    const minhas = (await api(`/gerador/execucoes?shot=${shotId}`)).filter((e) => e.workflow === WORKFLOW);
    const falha = minhas.find((e) => e.status === "FALHOU");
    if (falha) sair(`Falhou: ${falha.erro}`);
    if (minhas.some((e) => e.status === "NA_FILA" || e.status === "EXECUTANDO")) continue;
    const novo = (await api(`/outputs?shot=${shotId}`)).find((o) => !antes.has(o.id) && o.workflow === WORKFLOW);
    if (novo) {
      console.log(`Pronto: output ${novo.id}  prévia ${novo.previa}  depth ${novo.arquivo}`);
      process.exit(0);
    }
  }
  sair("Passou de 5 minutos sem terminar. Veja a fila no Creativa.");
} else if (cmd === "escolher") {
  const [shotId, outputId] = args;
  if (!shotId || !outputId) sair("Uso: escolher <shotId> <outputId>");
  const { etapa, rascunho } = await etapaDeGeometria(shotId);
  const base = rascunho ?? { tipo: TIPO, workflow: WORKFLOW, valores: {}, assistente: null, ideia: null };
  await api("/gerador/rascunho", "PUT", { shotId, etapa, rascunho: { ...base, escolhido: outputId } });
  console.log(`Output ${outputId} escolhido na etapa "${etapa}": o primeiro quadro recebe o depth dele.`);
} else {
  sair("Comandos: ver, ler, salvar-asset, salvar-cena, previa, previa-asset, camera, gerar, escolher. Veja o começo do arquivo.");
}
