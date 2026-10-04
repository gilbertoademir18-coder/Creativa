#!/usr/bin/env node
/**
 * O lado do Creativa da skill workflow-creativa: lê o catálogo e cadastra
 * pela API do app (porta 3400; outra com CREATIVA_URL). A API valida tudo
 * (grafo, campos, alvos), e nada aqui apaga registro.
 *
 * Leitura:
 *   node creativa.mjs catalogo
 *     Tipos de geração, workflows e assistentes, com ids e chaves.
 *   node creativa.mjs projeto <id ou parte do nome> [descricao.md]
 *     O projeto, os assets e as cenas com shots (e o rascunho de cada um).
 *     Com o arquivo, salva nele a descrição atual.
 *   node creativa.mjs ler-workflow <chave> <def.json>
 *     A definição inteira (com id, grafo, campos), para alterar.
 *   node creativa.mjs ler-assistente <id ou nome> <arquivo.md>
 *     O assistente como .md de skill (name/description + instruções).
 *
 * Escrita (cria ou altera; nunca apaga):
 *   node creativa.mjs tipo-salvar <tipo.json>
 *     {nome, descricao, saida, tiposAsset, shot} — com "id", altera.
 *   node creativa.mjs workflow-salvar <def.json>
 *     {nome, tipoGeracaoId, ferramenta, grafo, campos, saidas, descricao,
 *     notas, origem, modelo} — com "id", altera (e guarda a anterior em
 *     <def>.antes.json).
 *   node creativa.mjs assistente-salvar <arquivo.md> --workflows a,b [--projeto <id>] [--id <id>]
 *     O .md no formato de skill. Com --id, altera.
 *   node creativa.mjs asset-criar <asset.json>        {projetoId, tipo, nome, descricao}
 *   node creativa.mjs cena-criar <cena.json>          {projetoId, nome, descricao, storyboard}
 *   node creativa.mjs shot-criar <cenaId> <shot.json> {nome, descricao}
 *   node creativa.mjs rascunho <asset|shot> <id> <rascunho.json> [--substituir]
 *     {tipo, workflow, valores, assistente (nome), ideia} — o Gerador abre
 *     assim. Sem --substituir, não passa por cima de rascunho que existe.
 */
import { readFileSync, writeFileSync } from "node:fs";

const URL_API = (process.env.CREATIVA_URL ?? "http://127.0.0.1:3400").replace(/\/$/, "");

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
  if (r.status === 404 && /^\/gerador\/rascunho/.test(caminho) && !j?.erro?.includes("não encontrado"))
    sair('O app está rodando a API antiga, sem o rascunho do Gerador. Peça ao usuário para usar "Reiniciar o servidor" no ícone da bandeja.');
  if (!r.ok) sair(`A API respondeu ${r.status} em ${metodo} ${caminho}: ${j?.erro ?? "sem mensagem"}`);
  return j;
}

const lerJson = (arq) => JSON.parse(readFileSync(arq ?? sair("Falta o arquivo .json."), "utf8"));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O .md de assistente: cabeçalho de skill (name, description) e o corpo são as instruções. */
function lerMd(arq) {
  const texto = readFileSync(arq, "utf8").replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(texto);
  if (!m) sair(`${arq}: falta o cabeçalho com name e description entre linhas ---.`);
  const campo = (k) => new RegExp(`^${k}:\\s*(.*)$`, "m").exec(m[1])?.[1].trim().replace(/^["']|["']$/g, "");
  const nome = campo("name");
  if (!nome) sair(`${arq}: o cabeçalho não tem "name".`);
  return { nome, descricao: campo("description") ?? null, instrucoes: m[2].trim() };
}

function opcao(args, nome) {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

const [comando, ...args] = process.argv.slice(2);

if (comando === "catalogo") {
  const [tipos, workflows, assistentes] = await Promise.all([api("/tipos-geracao"), api("/workflows"), api("/assistentes")]);
  console.log("TIPOS DE GERAÇÃO");
  for (const t of tipos)
    console.log(`  ${t.chave}  "${t.nome}"  saída ${t.saida}  assets [${t.tiposAsset.join(", ")}]${t.shot ? " + shots" : ""}  id ${t.id}`);
  console.log("WORKFLOWS");
  for (const w of workflows) console.log(`  ${w.chave}  "${w.nome}"  tipo ${w.tipoGeracao.chave}  modelo ${w.modelo ?? "-"}  ${w.outputs} outputs  id ${w.id}`);
  console.log("ASSISTENTES");
  for (const a of assistentes)
    console.log(`  "${a.nome}"  ${a.projeto ? `projeto "${a.projeto.nome}"` : "todos os projetos"}  workflows [${a.workflows.join(", ") || "todos"}]  id ${a.id}`);
} else if (comando === "projeto") {
  const [busca, arquivo] = args;
  if (!busca) sair("Uso: projeto <id ou parte do nome> [descricao.md]");
  const projetos = await api("/projetos");
  const achados = projetos.filter((p) => p.id === busca || norm(p.nome).includes(norm(busca)));
  if (achados.length !== 1)
    sair(achados.length ? `Mais de um projeto: ${achados.map((p) => p.nome).join(", ")}` : `Nenhum projeto com "${busca}". Projetos: ${projetos.map((p) => p.nome).join(", ")}`);
  const p = achados[0];
  const [assets, cenas] = await Promise.all([api(`/assets?projeto=${p.id}`), api(`/cenas?projeto=${p.id}`)]);
  if (arquivo) writeFileSync(arquivo, p.descricao ?? "", "utf8");
  console.log(`PROJETO "${p.nome}"  id ${p.id}  descrição v${p.descricaoVersao ?? "?"} (${p.descricao?.length ?? 0} caracteres)${arquivo ? ` → ${arquivo}` : ""}`);
  console.log("ASSETS");
  for (const a of assets) {
    const r = (await api(`/gerador/rascunho?asset=${a.id}`)).rascunho;
    console.log(`  ${a.tipo}  "${a.nome}"  id ${a.id}${r ? `  rascunho: ${r.workflow}` : ""}`);
  }
  console.log("CENAS");
  for (const c of cenas) {
    console.log(`  "${c.nome}"  id ${c.id}`);
    for (const s of c.shots ?? []) console.log(`    shot "${s.nome}"  id ${s.id}`);
  }
} else if (comando === "ler-workflow") {
  const [chave, arquivo] = args;
  if (!chave || !arquivo) sair("Uso: ler-workflow <chave> <def.json>");
  const w = (await api("/workflows")).find((x) => x.chave === chave);
  if (!w) sair(`Não existe workflow com a chave "${chave}".`);
  const d = await api(`/workflows/${w.id}`);
  const def = (({ id, nome, tipoGeracaoId, ferramenta, grafo, campos, saidas, descricao, notas, origem, modelo }) => ({ id, nome, tipoGeracaoId, ferramenta, grafo, campos, saidas, descricao, notas, origem, modelo }))(d);
  writeFileSync(arquivo, JSON.stringify(def, null, 2), "utf8");
  console.log(`"${d.nome}" (${d.chave}) → ${arquivo}`);
} else if (comando === "ler-assistente") {
  const [busca, arquivo] = args;
  if (!busca || !arquivo) sair("Uso: ler-assistente <id ou nome> <arquivo.md>");
  const lista = await api("/assistentes");
  const a = lista.find((x) => x.id === busca) ?? lista.find((x) => norm(x.nome) === norm(busca));
  if (!a) sair(`Nenhum assistente "${busca}".`);
  writeFileSync(arquivo, `---\nname: ${a.nome}\ndescription: ${a.descricao ?? ""}\n---\n\n${a.instrucoes}\n`, "utf8");
  console.log(`"${a.nome}" id ${a.id}  projeto ${a.projeto?.nome ?? "todos"}  workflows [${a.workflows.join(", ")}] → ${arquivo}`);
} else if (comando === "tipo-salvar") {
  const { id, ...t } = lerJson(args[0]);
  const r = id ? await api(`/tipos-geracao/${id}`, "PUT", t) : await api("/tipos-geracao", "POST", t);
  console.log(`${id ? "Alterado" : "Criado"} o tipo "${r.nome}" (${r.chave})  id ${r.id}`);
} else if (comando === "workflow-salvar") {
  const { id, ...d } = lerJson(args[0]);
  if (id) {
    const antes = await api(`/workflows/${id}`);
    writeFileSync(args[0].replace(/\.json$/, "") + ".antes.json", JSON.stringify(antes, null, 2), "utf8");
  }
  const r = id ? await api(`/workflows/${id}`, "PUT", d) : await api("/workflows", "POST", d);
  console.log(`${id ? "Alterado" : "Criado"} o workflow "${r.nome}" (${r.chave})  id ${r.id}${id ? `  (a versão anterior ficou em ${args[0].replace(/\.json$/, "")}.antes.json)` : ""}`);
} else if (comando === "assistente-salvar") {
  const arquivo = args[0] ?? sair("Uso: assistente-salvar <arquivo.md> --workflows a,b [--projeto <id>] [--id <id>]");
  const md = lerMd(arquivo);
  const workflows = (opcao(args, "--workflows") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const corpo = { ...md, projetoId: opcao(args, "--projeto") ?? null, workflows };
  const id = opcao(args, "--id");
  const r = id ? await api(`/assistentes/${id}`, "PUT", corpo) : await api("/assistentes", "POST", corpo);
  console.log(`${id ? "Alterado" : "Criado"} o assistente "${r.nome}"  ${r.projeto ? `projeto "${r.projeto.nome}"` : "todos os projetos"}  workflows [${r.workflows.join(", ") || "todos"}]  id ${r.id}`);
} else if (comando === "asset-criar") {
  const r = await api("/assets", "POST", lerJson(args[0]));
  console.log(`Criado o asset ${r.tipo} "${r.nome}"  id ${r.id}`);
} else if (comando === "cena-criar") {
  const r = await api("/cenas", "POST", lerJson(args[0]));
  console.log(`Criada a cena "${r.nome}"  id ${r.id}`);
} else if (comando === "shot-criar") {
  const [cenaId, arquivo] = args;
  const r = await api(`/cenas/${cenaId ?? sair("Uso: shot-criar <cenaId> <shot.json>")}/shots`, "POST", lerJson(arquivo));
  console.log(`Criado o shot "${r.nome}"  id ${r.id}`);
} else if (comando === "rascunho") {
  const [qual, id, arquivo] = args;
  if (!["asset", "shot"].includes(qual) || !id) sair("Uso: rascunho <asset|shot> <id> <rascunho.json> [--substituir]");
  const atual = (await api(`/gerador/rascunho?${qual}=${id}`)).rascunho;
  if (atual && !args.includes("--substituir"))
    sair(`Esse ${qual} já tem um rascunho no Gerador (workflow ${atual.workflow}). É do usuário: só passe --substituir se ele pedir.`);
  const r = lerJson(arquivo);
  await api("/gerador/rascunho", "PUT", { [qual === "asset" ? "assetId" : "shotId"]: id, rascunho: r });
  console.log(`Rascunho do Gerador gravado no ${qual} ${id}: workflow ${r.workflow}, assistente ${r.assistente ?? "nenhum"}.`);
} else {
  sair("Comandos: catalogo, projeto, ler-workflow, ler-assistente, tipo-salvar, workflow-salvar, assistente-salvar, asset-criar, cena-criar, shot-criar, rascunho.");
}
