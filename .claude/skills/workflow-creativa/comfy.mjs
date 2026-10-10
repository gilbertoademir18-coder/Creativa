#!/usr/bin/env node
/**
 * O lado do ComfyUI da skill workflow-creativa. Só lê, e salva um arquivo de
 * workflow na lista do ComfyUI (nunca roda nada na GPU).
 *
 *   node comfy.mjs modelos [pasta]
 *     Os modelos baixados, por pasta (diffusion_models, text_encoders, vae...).
 *
 *   node comfy.mjs templates [busca]
 *     Os templates oficiais que rodam aqui (sem os api_*, que são pagos), com
 *     os modelos que cada um pede: ✓ baixado, ✗ falta (com o link).
 *
 *   node comfy.mjs template <id>
 *     Um template legível: cada nó com os widgets pelo nome, as ligações, as
 *     notas e os modelos com link. É a fonte dos números certos.
 *
 *   node comfy.mjs no <Classe> [Classe...]
 *     As entradas (tipo, padrão, faixa, opções) e saídas de um nó.
 *
 *   node comfy.mjs validar <grafo-api.json>
 *     Confere o grafo (formato API) contra o /object_info: nós que existem,
 *     entradas obrigatórias, ligações e tipos, opções válidas — inclusive se
 *     os modelos estão baixados. Não roda nada.
 *
 *   node comfy.mjs salvar-tela <grafo-api.json> "<Nome>.json" [--nota notas.md] [--substituir]
 *     Converte para o formato de tela (o que o ComfyUI abre na lista de
 *     workflows), com a nota em markdown, e salva em user/default/workflows.
 *     Sem --substituir, não sobrescreve arquivo que já existe. Com
 *     --arquivo <caminho>, só escreve a prévia nesse arquivo local.
 *
 * COMFY_URL muda o endereço (padrão http://127.0.0.1:8188).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COMFY = (process.env.COMFY_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const RAIZ = process.env.COMFY_RAIZ ?? "C:/IA/ComfyUI";
const TEMPLATES = join(RAIZ, "python_embeded/Lib/site-packages/comfyui_workflow_templates_json/templates");
const MODELOS = join(RAIZ, "ComfyUI/models");
const PASTAS = ["diffusion_models", "checkpoints", "text_encoders", "vae", "loras", "clip_vision", "controlnet", "model_patches", "upscale_models"];

function sair(msg) {
  console.error(msg);
  process.exit(1);
}

async function get(caminho) {
  let r;
  try {
    r = await fetch(`${COMFY}${caminho}`, { signal: AbortSignal.timeout(30_000) });
  } catch {
    sair(`O ComfyUI não respondeu em ${COMFY}. Ele está rodando?`);
  }
  if (!r.ok) sair(`O ComfyUI respondeu ${r.status} em ${caminho}.`);
  return r.json();
}

let _info;
const objectInfo = async () => (_info ??= await get("/object_info"));

/** As entradas de um nó na ordem da tela: obrigatórias, depois opcionais. */
function entradas(info) {
  const lista = [];
  for (const grupo of ["required", "optional"]) {
    const specs = info.input?.[grupo] ?? {};
    const ordem = info.input_order?.[grupo] ?? Object.keys(specs);
    for (const nome of ordem) if (specs[nome]) lista.push({ nome, spec: specs[nome], obrigatoria: grupo === "required" });
  }
  return lista;
}

/**
 * Combo dinâmico (nós V3, ex.: o `format` do SaveVideo): um combo cuja
 * escolha abre sub-entradas. No formato API, elas vão em chaves com ponto:
 * `"format": "mp4", "format.codec": "h264"`.
 */
const DINAMICO = "COMFY_DYNAMICCOMBO_V3";
/** Opções de um combo, nos formatos do ComfyUI: [[...], {}], ["COMBO", {options}] e o dinâmico. */
const opcoesDe = (spec) =>
  Array.isArray(spec[0]) ? spec[0] : spec[0] === "COMBO" ? (spec[1]?.options ?? []) : spec[0] === DINAMICO ? (spec[1]?.options ?? []).map((o) => o.key) : null;
const WIDGETS = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO", DINAMICO]);
/** Widget (valor na tela) ou encaixe (ligação vinda de outro nó)? */
const ehWidget = (spec) => (Array.isArray(spec[0]) || WIDGETS.has(spec[0])) && !spec[1]?.forceInput;
const tipoDe = (spec) => (Array.isArray(spec[0]) ? "COMBO" : spec[0]);
/** Os valores extras que a tela guarda depois de um widget: o "randomize" da seed, o "image" do upload. */
function extrasDe(e) {
  if (e.spec[1]?.control_after_generate || (tipoDe(e.spec) === "INT" && /^(noise_)?seed$/.test(e.nome))) return ["randomize"];
  if (e.spec[1]?.image_upload) return ["image"];
  return [];
}

const ehLigacao = (v) => Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && Number.isInteger(v[1]);

async function modelosBaixados() {
  const pastas = await get("/models");
  const mapa = {};
  for (const p of pastas) if (!["configs", "custom_nodes"].includes(p)) mapa[p] = new Set(await get(`/models/${p}`));
  return mapa;
}

function tamanho(pasta, arquivo) {
  try {
    return `${(statSync(join(MODELOS, pasta, arquivo)).size / 1e9).toFixed(1)} GB`;
  } catch {
    return "?";
  }
}

/** Todos os nós de um workflow de tela, inclusive os de dentro dos subgrafos. */
function todosOsNos(wf) {
  const nos = (wf.nodes ?? []).map((n) => ({ ...n, _links: wf.links ?? [], _nos: wf.nodes ?? [] }));
  for (const sg of wf.definitions?.subgraphs ?? [])
    nos.push(...(sg.nodes ?? []).map((n) => ({ ...n, _subgrafo: sg.name ?? sg.id, _links: sg.links ?? [], _nos: sg.nodes ?? [], _entradasSg: sg.inputs ?? [] })));
  return nos;
}

/** De onde vem uma entrada ligada: "#12 VAELoader[0]", ou uma entrada do subgrafo. Os links vêm em array (raiz) ou objeto (subgrafo). */
function origemDo(n, linkId) {
  const l = n._links.find((x) => (Array.isArray(x) ? x[0] : x.id) === linkId);
  if (!l) return "?";
  const [origem, slot] = Array.isArray(l) ? [l[1], l[2]] : [l.origin_id, l.origin_slot];
  if (origem === -10) return `entrada do subgrafo "${n._entradasSg?.[slot]?.name ?? slot}"`;
  const o = n._nos.find((x) => x.id === origem);
  return `#${origem} ${o?.type ?? "?"}[${slot}]`;
}

function modelosDoTemplate(wf) {
  const vistos = new Map();
  for (const n of todosOsNos(wf)) for (const m of n.properties?.models ?? []) vistos.set(`${m.directory}/${m.name}`, m);
  return [...vistos.values()];
}

const [comando, ...args] = process.argv.slice(2);

if (comando === "modelos") {
  const mapa = await modelosBaixados();
  for (const pasta of args[0] ? [args[0]] : PASTAS) {
    const lista = [...(mapa[pasta] ?? [])];
    console.log(`[${pasta}]${lista.length ? "" : " (vazia)"}`);
    for (const m of lista) console.log(`  ${m}  ${tamanho(pasta, m)}`);
  }
} else if (comando === "templates") {
  const busca = (args[0] ?? "").toLowerCase();
  const mapa = await modelosBaixados();
  const arquivos = readdirSync(TEMPLATES).filter((f) => f.endsWith(".json") && !f.startsWith("api_") && f.toLowerCase().includes(busca));
  for (const f of arquivos.sort()) {
    let wf;
    try {
      wf = JSON.parse(readFileSync(join(TEMPLATES, f), "utf8"));
    } catch {
      continue;
    }
    const ms = modelosDoTemplate(wf);
    const falta = ms.filter((m) => !mapa[m.directory]?.has(m.name));
    console.log(`${f.replace(/\.json$/, "")}  ${falta.length ? `faltam ${falta.length} de ${ms.length}` : ms.length ? "✓ tudo baixado" : "(sem modelos listados)"}`);
    for (const m of ms) console.log(`   ${mapa[m.directory]?.has(m.name) ? "✓" : "✗"} ${m.directory}/${m.name}${mapa[m.directory]?.has(m.name) ? "" : `  ← ${m.url}`}`);
  }
  if (!arquivos.length) console.log(`Nenhum template com "${busca}".`);
} else if (comando === "template") {
  const id = args[0]?.replace(/\.json$/, "");
  if (!id) sair("Uso: template <id>");
  const wf = JSON.parse(readFileSync(join(TEMPLATES, `${id}.json`), "utf8"));
  const info = await objectInfo();
  const mapa = await modelosBaixados();
  for (const n of todosOsNos(wf)) {
    const onde = n._subgrafo ? ` (subgrafo ${n._subgrafo})` : "";
    if (/Note$/.test(n.type)) {
      console.log(`\n#${n.id} ${n.type}${onde}:\n${String(n.widgets_values?.[0] ?? "").trim()}\n`);
      continue;
    }
    const i = info[n.type];
    if (!i) {
      console.log(`#${n.id} ${n.type}${onde} — subgrafo ou nó que não está instalado`);
      continue;
    }
    const vals = [...(n.widgets_values ?? [])];
    const pares = [];
    for (const e of entradas(i).filter((e) => ehWidget(e.spec))) {
      if (!vals.length) break;
      pares.push(`${e.nome}=${JSON.stringify(vals.shift())}`);
      for (let k = 0; k < extrasDe(e).length; k++) vals.shift();
    }
    const ligadas = (n.inputs ?? []).filter((x) => x.link != null).map((x) => `${x.name} ← ${origemDo(n, x.link)}`);
    console.log(`#${n.id} ${n.type}${onde}${n.title ? ` "${n.title}"` : ""}\n   ${pares.join("  ") || "(sem widgets)"}${ligadas.map((l) => `\n   ${l}`).join("")}`);
  }
  const ms = modelosDoTemplate(wf);
  if (ms.length) {
    console.log("\nModelos:");
    for (const m of ms) console.log(`  ${mapa[m.directory]?.has(m.name) ? "✓" : "✗"} ${m.directory}/${m.name}  ${m.url}`);
  }
} else if (comando === "no") {
  if (!args.length) sair("Uso: no <Classe> [Classe...]");
  const info = await objectInfo();
  for (const c of args) {
    const i = info[c];
    if (!i) {
      const parecidos = Object.keys(info).filter((k) => k.toLowerCase().includes(c.toLowerCase())).slice(0, 15);
      console.log(`${c}: não existe.${parecidos.length ? ` Parecidos: ${parecidos.join(", ")}` : ""}`);
      continue;
    }
    console.log(`${c}${i.output_node ? " (nó de saída)" : ""} — ${i.display_name ?? ""} [${i.category ?? ""}]`);
    for (const e of entradas(i)) {
      const o = e.spec[1] ?? {};
      const ops = opcoesDe(e.spec);
      const extra = [
        o.default !== undefined && `padrão ${JSON.stringify(o.default)}`,
        (o.min !== undefined || o.max !== undefined) && `${o.min ?? ""}…${o.max ?? ""}`,
        ops && `opções: ${ops.slice(0, 20).join(", ")}${ops.length > 20 ? ` (+${ops.length - 20})` : ""}`,
      ].filter(Boolean);
      console.log(`  ${e.obrigatoria ? "•" : "○"} ${e.nome}: ${tipoDe(e.spec)}${ehWidget(e.spec) ? "" : " (ligação)"}${extra.length ? ` — ${extra.join("; ")}` : ""}`);
    }
    (i.output ?? []).forEach((t, k) => console.log(`  → [${k}] ${i.output_name?.[k] ?? t}: ${t}`));
  }
} else if (comando === "validar") {
  const grafo = JSON.parse(readFileSync(args[0] ?? sair("Uso: validar <grafo-api.json>"), "utf8"));
  const info = await objectInfo();
  const erros = [];
  const avisos = [];
  let temSaida = false;
  for (const [id, n] of Object.entries(grafo)) {
    const i = info[n?.class_type];
    if (!i) {
      erros.push(`#${id}: o nó "${n?.class_type}" não existe neste ComfyUI.`);
      continue;
    }
    if (i.output_node) temSaida = true;
    const es = entradas(i);
    const subDeDinamico = (nome) => nome.includes(".") && es.some((e) => e.nome === nome.split(".")[0] && tipoDe(e.spec) === DINAMICO);
    for (const nome of Object.keys(n.inputs ?? {})) if (!es.some((e) => e.nome === nome) && !subDeDinamico(nome)) avisos.push(`#${id} ${n.class_type}: entrada "${nome}" não existe (vai ser ignorada).`);
    for (const e of es) {
      const v = n.inputs?.[e.nome];
      if (v === undefined) {
        if (e.obrigatoria) erros.push(`#${id} ${n.class_type}: falta a entrada obrigatória "${e.nome}".`);
        continue;
      }
      if (ehLigacao(v)) {
        const origem = grafo[v[0]];
        const io = origem && info[origem.class_type];
        if (!origem) erros.push(`#${id} ${n.class_type}.${e.nome}: liga no nó ${v[0]}, que não existe.`);
        else if (io && v[1] >= (io.output?.length ?? 0)) erros.push(`#${id} ${n.class_type}.${e.nome}: o nó ${v[0]} (${origem.class_type}) não tem a saída ${v[1]}.`);
        else if (io) {
          const t = io.output[v[1]];
          const esperado = tipoDe(e.spec);
          const aceita = t === "*" || esperado === "*" || String(esperado).split(",").includes(t) || String(t).split(",").includes(esperado) || (esperado === "COMBO" && t === "COMBO");
          if (!aceita) erros.push(`#${id} ${n.class_type}.${e.nome}: espera ${esperado} e recebe ${t} do nó ${v[0]} (${origem.class_type}).`);
        }
        continue;
      }
      if (!ehWidget(e.spec)) {
        erros.push(`#${id} ${n.class_type}.${e.nome}: é uma ligação (${tipoDe(e.spec)}) e recebeu um valor.`);
        continue;
      }
      const ops = opcoesDe(e.spec);
      // A imagem de um LoadImage vem do campo de imagem do Creativa, enviada na hora de gerar.
      if (e.spec[1]?.image_upload && ops && !ops.includes(v)) {
        avisos.push(`#${id} ${n.class_type}.${e.nome}: "${v}" não está na pasta input — tudo bem se um campo de imagem do Creativa aponta para cá.`);
        continue;
      }
      if (ops && ops.length && !ops.includes(v)) {
        const ehModelo = /\.(safetensors|gguf|ckpt|pt|pth|bin|sft)$/i.test(String(v));
        erros.push(`#${id} ${n.class_type}.${e.nome}: "${v}" não está entre as opções${ehModelo ? " — o modelo não está baixado (ou está em outra pasta)" : `: ${ops.slice(0, 12).join(", ")}`}.`);
      }
      const o = e.spec[1] ?? {};
      if (typeof v === "number" && ((o.min !== undefined && v < o.min) || (o.max !== undefined && v > o.max)))
        erros.push(`#${id} ${n.class_type}.${e.nome}: ${v} fora da faixa ${o.min}…${o.max}.`);
    }
  }
  if (!temSaida) erros.push("Nenhum nó de saída (SaveImage, SaveVideo...): o ComfyUI recusa o grafo.");
  for (const a of avisos) console.log(`aviso: ${a}`);
  if (erros.length) sair(erros.map((e) => `ERRO: ${e}`).join("\n"));
  console.log(`OK: ${Object.keys(grafo).length} nós, ligações e opções conferidos.`);
} else if (comando === "salvar-tela") {
  const [arqGrafo, nome] = args;
  if (!arqGrafo || !nome?.endsWith(".json")) sair('Uso: salvar-tela <grafo-api.json> "<Nome>.json" [--nota notas.md] [--substituir]');
  const iNota = args.indexOf("--nota");
  const nota = iNota >= 0 ? readFileSync(args[iNota + 1], "utf8") : null;
  const substituir = args.includes("--substituir");
  const grafo = JSON.parse(readFileSync(arqGrafo, "utf8"));
  const tela = paraTela(grafo, await objectInfo(), nota);
  const iArq = args.indexOf("--arquivo");
  if (iArq >= 0) {
    writeFileSync(args[iArq + 1], JSON.stringify(tela, null, 2), "utf8");
    console.log(`Prévia escrita em ${args[iArq + 1]} (nada foi salvo no ComfyUI).`);
    process.exit(0);
  }
  const r = await fetch(`${COMFY}/userdata/${encodeURIComponent(`workflows/${nome}`)}?overwrite=${substituir}`, {
    method: "POST",
    body: JSON.stringify(tela, null, 2),
  }).catch(() => sair(`O ComfyUI não respondeu em ${COMFY}.`));
  if (r.status === 409) sair(`Já existe "${nome}" nos workflows do ComfyUI. Escolha outro nome, ou passe --substituir se o usuário pediu.`);
  if (!r.ok) sair(`O ComfyUI recusou salvar (${r.status}): ${await r.text()}`);
  console.log(`Salvo nos workflows do ComfyUI: ${nome} (${tela.nodes.length} nós, ${tela.links.length} ligações).`);
} else {
  sair("Comandos: modelos, templates, template, no, validar, salvar-tela. Veja o começo do arquivo.");
}

/**
 * Formato API → formato de tela (litegraph 0.4). Os widgets vão na ordem do
 * /object_info, com os extras (o "randomize" da seed); as ligações viram
 * links; os nós se arrumam em colunas pela distância até a origem.
 */
function paraTela(grafo, info, nota) {
  const ids = Object.keys(grafo);
  const numerico = ids.every((k) => /^\d+$/.test(k));
  const novoId = new Map(ids.map((k, i) => [k, numerico ? Number(k) : i + 1]));

  // Coluna = maior distância até um nó sem entradas ligadas.
  const coluna = new Map();
  const colunaDe = (k, pilha = new Set()) => {
    if (coluna.has(k)) return coluna.get(k);
    if (pilha.has(k)) return 0;
    pilha.add(k);
    const origens = Object.values(grafo[k].inputs ?? {}).filter(ehLigacao).map((v) => String(v[0]));
    const c = origens.length ? 1 + Math.max(...origens.map((o) => colunaDe(o, pilha))) : 0;
    coluna.set(k, c);
    return c;
  };
  ids.forEach((k) => colunaDe(k));

  const links = [];
  const nos = [];
  const saidasDe = new Map(); // id → outputs (para pendurar os links)
  for (const k of ids) {
    const n = grafo[k];
    const i = info[n.class_type];
    const no = {
      id: novoId.get(k),
      type: n.class_type,
      pos: [0, 0],
      size: [320, 100],
      flags: {},
      order: 0,
      mode: 0,
      inputs: [],
      outputs: (i?.output ?? []).map((t, s) => ({ name: i.output_name?.[s] ?? t, type: t, links: [], slot_index: s })),
      properties: { "Node name for S&R": n.class_type },
      widgets_values: [],
    };
    if (n._meta?.title && n._meta.title !== i?.display_name) no.title = n._meta.title;
    for (const e of i ? entradas(i) : []) {
      const v = n.inputs?.[e.nome];
      if (ehWidget(e.spec)) {
        if (ehLigacao(v)) no.inputs.push({ name: e.nome, type: tipoDe(e.spec), widget: { name: e.nome }, link: null, _de: v });
        no.widgets_values.push(ehLigacao(v) || v === undefined ? (e.spec[1]?.default ?? null) : v, ...extrasDe(e));
        // As sub-escolhas de um combo dinâmico vêm logo depois dele, na ordem das chaves.
        if (tipoDe(e.spec) === DINAMICO)
          for (const [nome, sub] of Object.entries(n.inputs ?? {})) if (nome.startsWith(`${e.nome}.`)) no.widgets_values.push(sub);
      } else if (ehLigacao(v) || e.obrigatoria) {
        no.inputs.push({ name: e.nome, type: tipoDe(e.spec), link: null, ...(ehLigacao(v) ? { _de: v } : {}) });
      }
    }
    no.size = [340, 46 + 24 * (no.widgets_values.length + Math.max(no.inputs.length, no.outputs.length))];
    saidasDe.set(no.id, no.outputs);
    nos.push(no);
  }
  let ultimoLink = 0;
  for (const no of nos) {
    no.inputs.forEach((entrada) => {
      if (!entrada._de) return;
      const [de, slot] = entrada._de;
      delete entrada._de;
      const origem = novoId.get(String(de));
      const saida = saidasDe.get(origem)?.[slot];
      const id = ++ultimoLink;
      entrada.link = id;
      saida?.links.push(id);
      links.push([id, origem, slot, no.id, no.inputs.indexOf(entrada), saida?.type ?? entrada.type]);
    });
  }

  // Colunas da esquerda para a direita; a ordem de execução segue as colunas.
  const porColuna = new Map();
  ids.forEach((k, idx) => {
    const c = coluna.get(k);
    if (!porColuna.has(c)) porColuna.set(c, []);
    porColuna.get(c).push(nos[idx]);
  });
  let ordem = 0;
  for (const c of [...porColuna.keys()].sort((a, b) => a - b)) {
    let y = 60;
    for (const no of porColuna.get(c)) {
      no.pos = [60 + c * 400, y];
      no.order = ordem++;
      y += no.size[1] + 50;
    }
  }

  let ultimoNo = Math.max(0, ...nos.map((n) => n.id));
  if (nota) {
    const linhas = nota.split("\n").length;
    for (const no of nos) no.pos[0] += 480;
    nos.unshift({
      id: ++ultimoNo,
      type: "MarkdownNote",
      pos: [40, 60],
      size: [420, Math.min(1400, 60 + linhas * 20)],
      flags: {},
      order: ordem++,
      mode: 0,
      inputs: [],
      outputs: [],
      properties: {},
      widgets_values: [nota],
    });
  }
  return {
    id: crypto.randomUUID(),
    revision: 0,
    last_node_id: ultimoNo,
    last_link_id: ultimoLink,
    nodes: nos,
    links,
    groups: [],
    config: {},
    extra: { ds: { scale: 0.75, offset: [0, 0] } },
    version: 0.4,
  };
}
