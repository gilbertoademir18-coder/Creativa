#!/usr/bin/env node
/**
 * Lê e grava a descrição de um projeto do Creativa pela API do app (porta
 * 3400; outra com CREATIVA_URL=http://127.0.0.1:3401). Grava sempre como
 * versão nova, de origem "Claude" — o histórico fica na tela do projeto.
 *
 *   node descricao.mjs ler <id ou parte do nome> <arquivo.md>
 *     Salva a descrição atual no arquivo e mostra id, nome e versão.
 *
 *   node descricao.mjs salvar <id> <arquivo.md> <versão base> "<nota>"
 *     Grava o arquivo como versão nova. A versão base é a que `ler` mostrou:
 *     se outra entrou no meio, a API recusa (409) e nada é gravado.
 */
import { readFileSync, writeFileSync } from "node:fs";

const URL_API = (process.env.CREATIVA_URL ?? "http://127.0.0.1:3400").replace(/\/$/, "");

async function api(caminho, init) {
  let r;
  try {
    r = await fetch(`${URL_API}/api${caminho}`, init);
  } catch {
    sair(`O Creativa não respondeu em ${URL_API}. Ele está rodando?`);
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok) sair(`A API respondeu ${r.status}: ${corpo?.erro ?? "sem mensagem"}`);
  return corpo;
}

function sair(mensagem) {
  console.error(mensagem);
  process.exit(1);
}

/** A API antiga não conhece versões: gravar por ela apagaria a descrição sem histórico. */
function exigirVersoes(p) {
  if (typeof p.descricaoVersao !== "number")
    sair('O app está rodando a API antiga, sem versões. Peça ao usuário para usar "Reiniciar o servidor" no ícone da bandeja.');
}

const [comando, ...args] = process.argv.slice(2);

if (comando === "ler") {
  const [busca, arquivo] = args;
  if (!busca || !arquivo) sair("Uso: ler <id ou parte do nome> <arquivo.md>");
  const projetos = await api("/projetos");
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const achados = projetos.filter((p) => p.id === busca || norm(p.nome).includes(norm(busca)));
  if (achados.length !== 1)
    sair(
      achados.length
        ? `Mais de um projeto com "${busca}": ${achados.map((p) => `${p.nome} (${p.id})`).join(", ")}`
        : `Nenhum projeto com "${busca}". Projetos: ${projetos.map((p) => p.nome).join(", ")}`,
    );
  const p = achados[0];
  exigirVersoes(p);
  writeFileSync(arquivo, p.descricao ?? "", "utf8");
  console.log(JSON.stringify({ id: p.id, nome: p.nome, versao: p.descricaoVersao, caracteres: p.descricao?.length ?? 0, arquivo }));
} else if (comando === "salvar") {
  const [id, arquivo, base, nota] = args;
  if (!id || !arquivo || base === undefined || !nota) sair('Uso: salvar <id> <arquivo.md> <versão base> "<nota>"');
  const antes = await api(`/projetos/${id}`);
  exigirVersoes(antes);
  const descricao = readFileSync(arquivo, "utf8").replace(/\r\n?/g, "\n");
  const p = await api(`/projetos/${id}/descricao`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ descricao, base: Number(base), origem: "CLAUDE", nota }),
  });
  console.log(
    p.descricaoVersao === antes.descricaoVersao
      ? `Nada mudou: o texto é igual ao da versão ${p.descricaoVersao}.`
      : `Gravada a versão ${p.descricaoVersao} de "${p.nome}".`,
  );
} else {
  sair("Comandos: ler, salvar. Veja o começo do arquivo.");
}
