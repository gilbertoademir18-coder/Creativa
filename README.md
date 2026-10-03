# Creativa

Plataforma web para criar projetos de vídeos, imagens, sons e assets com IA,
chamando workflows já prontos do **ComfyUI** pela interface do Creativa.

Front em React + Vite, API em Node (Fastify), num monorepo com npm
workspaces, com PostgreSQL local via Prisma 7. Roda nesta máquina (onde
estão o ComfyUI e o banco) e é acessível dos outros PCs pelo Tailscale.

## Começando

```powershell
npm install
.\scripts\criar-banco.ps1          # uma vez: pede a senha do usuário postgres
.\scripts\publicar-no-tailnet.ps1  # uma vez: HTTPS no tailnet (Creativa 8444, ComfyUI 8445)
```

Depois, **dê dois cliques em `Creativa.cmd`**. O servidor não fica numa
janela: ele vira um **ícone na bandeja**, perto do relógio. Duplo clique abre
o app; o botão direito traz o resto.

O `criar-banco.ps1` acrescenta o `DATABASE_URL` ao `.env`. O resto do `.env`
é opcional — veja o `.env.example` para apontar outra pasta ou porta do
ComfyUI (padrão: `C:\AI\ComfyUI`, `http://127.0.0.1:8188`).

## Banco de dados

PostgreSQL desta máquina (porta 5432), banco e usuário `creativa`. O usuário
é dono só do próprio banco: não é superusuário e não enxerga os bancos dos
outros projetos.

```
Projeto
├── Asset (personagem, cenário, objeto...) ── Referências, Outputs  ← Gerador
└── Cena (storyboard em texto)
    └── Shot ──────────────────────────────── Referências, Outputs  ← Gerador
```

Não existe cadastro de "geração". O **Gerador** é um recurso do código
(`apps/api/src/geracao/`) que aparece dentro de cada asset e shot: o tipo e
o workflow já vêm escolhidos pelo dono, você escreve o prompt e clica em
**Gerar**. Cada imagem que sai é um **Output** do asset/shot e guarda tudo o
que foi usado para gerá-la — tipo, workflow, modelo, prompt, seed, os outros
campos e o grafo enviado ao ComfyUI. Clicar num output mostra isso, e "Usar
estas configurações" devolve tudo ao Gerador.

| Tabela | O que guarda |
| --- | --- |
| `projeto` | O trabalho: "Poker de Camila", "Anime Katsuragi" |
| `asset` | Personagem, cenário, objeto ou outro. Com projeto ou solto |
| `cena` | Com projeto ou solta; tem o storyboard |
| `shot` | Sempre numa cena, em ordem. Toda cena nasce com um e nunca fica sem |
| `referencia` | Imagem, vídeo ou texto enviado. De um asset, de um shot, ou solta |
| `output` | Um arquivo gerado, com todos os metadados de como foi gerado. De um asset ou de um shot |
| `execucao` | A fila: cada envio ao ComfyUI (na fila → executando → concluída/falhou), com o `prompt_id` |

Regras que o banco garante (FKs e `CHECK`s):

- Apagar um projeto **solta** os assets e cenas dele; não apaga.
- O que tem arquivo é protegido: asset, shot ou cena com referência ou
  output não se apaga. A tela explica o que remover antes. O histórico da
  fila (`execucao`) cai junto com o dono.
- Referência pertence a um asset, a um shot, ou a nenhum — nunca aos dois.
- Output e execução pertencem a exatamente um: asset **ou** shot.

A conexão leva `options=-c timezone=UTC`: sem isso o driver grava os
horários 3 horas deslocados, em silêncio (lição do NihongoHub).

### Desenvolver de outra máquina do tailnet

Dá para mexer no código de outro PC e deixar o banco e a GPU aqui: a API do
notebook fala com este Postgres pela porta 5432 do tailnet, e com este
ComfyUI pela 8445. Nada de pasta compartilhada — tudo é HTTP e WebSocket.

No notebook, o `DATABASE_URL` aponta para o IP do tailnet desta máquina:

```
DATABASE_URL="postgresql://creativa:<senha>@100.65.76.22:5432/creativa?options=-c%20timezone%3DUTC"
```

O IP, e não o nome MagicDNS: o nome depende do DNS do Tailscale, que às vezes
não sobe no Windows, e o IP de um nó é estável.

**Aqui**, uma vez, rode `.\scripts\liberar-banco-no-tailnet.ps1` como
Administrador: o `criar-banco.ps1` deixa o `pg_hba.conf` só com 127.0.0.1, e
sem essa linha a conexão é recusada antes de olhar a senha —
`nenhuma entrada em pg_hba.conf para o hospedeiro "100.x.y.z"`. Ele também
garante a regra de firewall **"PostgreSQL - tailnet"** (5432, só da faixa do
tailnet), compartilhada com o MediaFlow: sem ela o `pg_hba` fica certo e o
pacote nem chega. Rodar de novo é seguro, porque ele só completa o que falta.

As instruções prontas para isso estão em
[`scripts/liberar-banco-no-tailnet.md`](scripts/liberar-banco-no-tailnet.md) —
feitas para colar no Claude Code da máquina do banco, com o que ele pode e o
que ele não pode mexer. O script atende qualquer projeto no mesmo servidor
com banco e usuário de mesmo nome: `-Banco trimly`, `-Banco nihongohub`.

Para começar um projeto novo no mesmo molde (tray, atalhos, portas, banco e
acesso pelo tailnet), veja [`docs/padrao-de-projeto.md`](docs/padrao-de-projeto.md).

Duas coisas não funcionam do outro PC:

- **Iniciar e Parar o ComfyUI** pela barra do topo — procuram o
  `python_embeded` e a porta na máquina de onde a API roda. Deixe o ComfyUI
  ligado aqui, pelo ícone da bandeja ou pelo app em 8444.
- **Os arquivos.** O `/view` baixa os outputs para o `ARQUIVOS_DIR` do outro
  PC, mas o registro vai para este banco: a imagem fica lá e aqui dá 404. Para
  os dois lados combinarem, compartilhe `D:\Creativa` e aponte o
  `ARQUIVOS_DIR` do outro PC para o compartilhamento.

## Assistente de prompt (LLM local)

No Gerador, depois do workflow, dá para escolher um **assistente de prompt**:
você escreve a ideia ("salão de baile abandonado, fim de tarde"), clica em
**Expandir com o assistente** e uma LLM local reescreve o campo com o prompt
completo, do jeito que aquele workflow pede. O output guarda o assistente e a
ideia de onde o prompt saiu.

Um assistente é um markdown com instruções, como uma skill do Claude. Eles são
cadastrados na página **Assistentes**: nome, projeto (sem projeto = vale para
todos) e em quais workflows aparecem. Dá para importar e exportar `.md`, no
formato de skill (cabeçalho com `name` e `description` entre linhas `---`). Há um pronto para a Placa
de cenário em [`docs/assistentes/placa-cenario.md`](docs/assistentes/placa-cenario.md).

A LLM recebe as instruções do assistente **e** o que o código sabe do
workflow — a dica do campo, a faixa de palavras, as regras que o Gerador
confere — e a descrição do asset ou shot. O assistente não precisa repetir
isso.

**A LLM** é o [Ollama](https://ollama.com) com o `gemma4:12b-it-qat` (~7 GB),
nesta máquina:

```powershell
winget install Ollama.Ollama        # o app fica na bandeja e sobe com o Windows
ollama pull gemma4:12b-it-qat
```

Trocar de modelo é `ollama pull` + `ASSISTENTE_MODELO` no `.env` (relido a
cada uso).

**A GPU é dividida.** São 12 GB para o ComfyUI e a LLM, que se revezam:

- antes de expandir, se o ComfyUI está parado, o Creativa tira os modelos dele
  da VRAM (`/free`) e a LLM roda inteira na placa — a próxima geração
  recarrega o modelo do NVMe, uns segundos a mais;
- com o ComfyUI gerando, ninguém é interrompido: a LLM roda com o que sobra,
  mais devagar, e a tela avisa;
- antes de mandar algo ao ComfyUI, o Creativa tira a LLM da VRAM.

## Arquivos

Referências enviadas (e, depois, os outputs) ficam em **`D:\Creativa`**,
configurável por `ARQUIVOS_DIR` no `.env`. O HDD aguenta o volume de vídeo; o
NVMe fica para os modelos. O banco guarda só o caminho relativo, então mudar
a pasta é mover os arquivos e trocar o `.env`. A API serve os arquivos em
`/api/arquivos/<caminho>`.

O backup (`npm run backup` ou pelo ícone) é só do banco: os arquivos em
`D:\Creativa` não entram no dump.

## O ícone da bandeja

Veio do Trimly (que veio do NihongoHub), com as mesmas decisões: sem janela
de console, matar a árvore de processos inteira, conferir se quem responde na
porta é mesmo o Creativa.

| Item do menu | O que faz |
| --- | --- |
| **Abrir no Edge** | Abre o app. Com o servidor parado, sobe ele antes |
| Copiar link do tailnet | Copia a URL HTTPS para abrir de outro PC |
| Abrir no VS Code | Abre `Creativa.code-workspace` |
| Abrir a pasta do projeto | Abre a pasta do código-fonte no Explorer |
| **Publicar a versão nova** | Confere, faz backup e só então reinicia — ver abaixo |
| Reiniciar o servidor | Aplica migrações pendentes, recompila o front e sobe de novo |
| **ComfyUI — _estado_** | Submenu: abrir, iniciar/parar, copiar o link do tailnet, pasta e log |
| Fazer backup do banco | Roda `scripts\backup-banco.ps1` numa janela |
| Iniciar com o Windows | Liga e desliga a subida automática no login |
| Ver o log | `%LOCALAPPDATA%\Creativa\servidor.log` no Bloco de Notas |
| Sair | Encerra o servidor (e o ComfyUI, se foi o ícone que o iniciou) |

| Ícone | Estado do Creativa |
| --- | --- |
| colorido, **selo verde** | no ar |
| cinza, sem selo | subindo |
| cinza, **selo vermelho** | caiu ou não subiu — veja o log |

O selo fala só do Creativa. O estado do ComfyUI aparece na dica do ícone
(passe o mouse) e no título do submenu.

### O ComfyUI pelo ícone

"Iniciar o ComfyUI" roda o Python embutido do pacote portátil com os mesmos
argumentos do `run_nvidia_gpu.bat`, só que oculto e com a saída em
`%LOCALAPPDATA%\Creativa\comfyui.log`. Ele atende só nesta máquina (sem
`--listen`): quem fala com o ComfyUI é a API do Creativa, e os outros PCs
chegam pelo Creativa.

Argumentos extras vão no `COMFYUI_ARGS` do `.env` — por exemplo
`--fast fp16_accumulation`, mais rápido em RTX 30/40 com precisão um pouco
menor. São relidos a cada partida: edite e pare/inicie o ComfyUI pelo menu,
sem reiniciar o tray. Com o fp16 ligado, o `comfyui.log` traz a linha
`Enabled fp16 accumulation.`

### O ComfyUI pelo site

A barra do topo do app mostra sempre o estado do ComfyUI e tem **Iniciar**,
**Parar** (com confirmação: interrompe uma geração em andamento) e **Log**
(as últimas linhas, atualizando sozinho). Funciona de qualquer PC do
tailnet: quem liga e desliga é o servidor do Creativa, nesta máquina.

Usa a mesma configuração do tray (`COMFYUI_DIR`, `COMFYUI_URL`,
`COMFYUI_ARGS`) e o mesmo `comfyui.log`. O ComfyUI sobe por um `cmd start`
que sai na hora, e fica órfão de propósito: assim o **Reiniciar o servidor**
do tray, que derruba a árvore de processos do servidor, não leva o ComfyUI
junto no meio de uma geração. "Parar" derruba quem estiver ouvindo na porta,
tenha sido iniciado pelo site, pelo tray ou pelo `.bat`.

Um ComfyUI aberto por fora (pelo `.bat`) também é reconhecido — o estado
segue a porta. Ao **Sair**, o ícone só derruba o ComfyUI que ele mesmo
iniciou: o oculto não teria outro jeito de ser fechado.

### Publicar uma versão nova

Depois de mexer no código (ou de um `git pull`), use **Publicar a versão
nova**. Ele abre uma janela que roda `scripts\publicar.ps1`: TypeScript, um
build de conferência e o backup do banco — tudo com a versão antiga ainda no
ar. Só se tudo passar o tray reinicia o servidor, e o reinício aplica as
migrações. Se algo falha, a janela fica aberta com o erro e o site nem
percebe. (Veio do Trimly; aqui sem a etapa de testes, que o Creativa ainda
não tem.)

Gerações rodando no ComfyUI não se perdem: o ComfyUI não depende do servidor,
e o acompanhamento retoma as execuções quando ele volta.

**Reiniciar** sozinho derruba o servidor antes de compilar: um erro ali deixa
o site fora do ar até ser consertado. Serve para destravar, não para publicar.

O build de conferência vai para uma pasta temporária, e não para
`apps\web\dist`: é dali que o servidor no ar serve o site, e o Vite esvazia a
pasta antes de escrever.

### O tray roda o app "de verdade", não o de desenvolvimento

O ícone sobe `npm run servir`: aplica as migrações, compila o front e sobe a
API, que serve o front pronto na **porta 3400**. Depois de um `git pull`,
**Reiniciar** é tudo o que se precisa: banco, front e back saem atualizados
juntos.

Para mexer no código, `npm run dev` sobe o Vite (3410) e a API em modo watch
(3401) — portas diferentes, então dá para desenvolver com o app no ar. O Vite
aceita conexões de fora, então dá para desenvolver de outro PC pelo IP do
tailnet.

## Portas

| Porta | Quem |
| --- | --- |
| 3400 | App (o que o tray sobe) |
| 3401 | API em `npm run dev` |
| 3410 | Vite em `npm run dev` |
| 8444 | HTTPS no tailnet (`tailscale serve` → 3400) |
| 8445 | ComfyUI no tailnet (`tailscale serve` → 8188) |
| 8188 | ComfyUI |
| 5432 | PostgreSQL (compartilhado; banco `creativa`) |
| 11434 | Ollama (a LLM do assistente de prompt) |

Já ocupadas nesta máquina por outros projetos: 443/3001, 3002, 3200/8443 (Trimly), 8787.

## Comandos

| Comando | O que faz |
| --- | --- |
| `Creativa.cmd` | Põe o Creativa na bandeja |
| `npm run dev` | Desenvolvimento: http://localhost:3410 |
| `npm run servir` | O que o tray roda: migra, compila e sobe na 3400 |
| `npm run db:migrate` | Cria migração nova a partir do schema (dev) |
| `npm run db:studio` | Prisma Studio para olhar o banco |
| `npm run backup` | Dump do banco em `backups\` |
| `npm run typecheck` | TypeScript nos dois apps |
| `npm run icons` | Regenera os ícones a partir do SVG |

## Estrutura

```
apps/
  api/
    prisma/schema.prisma  Tabelas, enums e as regras de exclusão
    src/server.ts         Fastify: registra as rotas, arquivos e o front pronto
    src/rotas/            projetos, assets, cenas (+ shots), referencias, gerador, outputs, fila
    src/geracao/          O Gerador: catálogo de tipos e workflows, e a execução no ComfyUI
    src/lib/              prisma, validacao (zod), arquivos (D:\Creativa), filtros
  web/                    React + Vite + Tailwind, tela cheia (Full HD / QHD)
    src/paginas/          Uma por item do menu, com a lista e o detalhe
    src/componentes/      layout, ui, modal, filtros, referencias, gerador, outputs...
    scripts/gerar-icones.mjs
docs/
  padrao-de-projeto.md    Como montar um projeto novo no mesmo molde
scripts/
  tray.ps1                Ícone da bandeja
  criar-banco.ps1         Usuário + banco + .env + migrações
  backup-banco.ps1        pg_dump com verificação
  publicar.ps1            Confere e faz backup antes de publicar (tray)
  publicar-no-tailnet.ps1 tailscale serve: Creativa 8444, ComfyUI 8445
  liberar-banco-no-tailnet.ps1
                          pg_hba + firewall: deixa outro PC do tailnet usar o banco
                          (.md: instruções para o Claude da máquina do banco)
```
