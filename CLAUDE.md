# Como responder

- Seja amigável e bem-humorado.
- Explique o raciocínio de forma clara.
- Dê exemplos práticos.
- Use linguagem natural, como um colega de equipe.
- Seja proativo ao sugerir melhorias.

# Mantenha este arquivo em dia (sempre, sem pedir licença)

Este arquivo é a memória do projeto entre uma sessão e outra. **Sempre que
aprender algo relevante durante uma tarefa, registre aqui na mesma tarefa** —
e diga na resposta final o que acrescentou ou mudou.

- **Registre:** decisões e conceitos novos do usuário (como "não existe cadastro
  de geração"), regras de interface, caminhos e versões da máquina que mudaram,
  pegadinhas que custaram tempo (e como contornar), o jeito certo de verificar
  algo sem escrever no banco.
- **Não registre:** o que o código ou o README já dizem por si, detalhes de uma
  tarefa só, histórico do que foi feito (isso é o `git log`).
- **Corrija e apague o que ficou velho** — uma linha errada aqui engana a
  próxima sessão. Mudou um caminho, uma porta, um nome: troque em todo lugar.
- Curto e direto, na seção que combina. Seção nova só se nenhuma servir.

# Projeto

- Plataforma para criar vídeos, imagens, sons e assets com IA chamando workflows do ComfyUI (portátil em `C:\IA\ComfyUI`, porta 8188).
- Monorepo npm workspaces: `apps/api` (Fastify) e `apps/web` (React + Vite + Tailwind). Leia o README antes de mudanças estruturais.
- Código, nomes e comentários em português.
- Versões muito novas (TypeScript 7, Vite 8): confira a API em `node_modules` antes de assumir.
- Scripts `.ps1` precisam ser salvos em UTF-8 **com BOM**, senão o PowerShell 5.1 estraga os acentos.
- Portas: 3400 app (tray), 3401/3410 dev, 8444 tailnet (Creativa), 8445 tailnet (ComfyUI), 11434 Ollama. Outros projetos usam 3001, 3002, 3200, 8443, 8787.
- Prisma fixado em `^7.10.0` — a tag `latest` é um RC da v8.
- Antes de concluir: `npm run typecheck` e `npm run build`.
- **O app da 3400 roda o código de quando subiu.** O `npm run build` troca na
  hora o front que ele serve, mas a API continua a velha: depois de mudar API ou
  schema, avise o usuário para usar "Reiniciar o servidor" (ou "Publicar a
  versão nova") no ícone da bandeja. Até lá, front novo + API velha podem quebrar.
- Assistentes de prompt prontos para importar ficam em `docs/assistentes/`
  (um `.md` por assistente, cabeçalho de skill `name`/`description`).

# A hierarquia

`Projeto → Lista de vídeos → Vídeo → Cena → Shot`, mais assets do projeto e
"cenas sem vídeo". Lista e vídeo são **genéricos e só agrupam** — não chame
de "temporada"/"episódio" no código nem na tela. Apagar lista ou vídeo solta
as cenas (`SetNull`), nunca as apaga.

- Cena num vídeo: o projeto dela é **sempre** o da lista do vídeo — quem
  acerta é a API (`encaixarNoVideo` em `rotas/cenas.ts`), não a tela.
- Quem salva uma cena manda o `videoId` junto (mesmo só mudando o
  storyboard): sem ele, a cena sai do vídeo.
- Listas, vídeos, cenas de um vídeo e shots têm `ordem`; a tela reordena com
  `ListaOrdenavel` (`componentes/ordenavel.tsx`) e a API recebe a lista
  inteira de ids na ordem nova.

# Interface

- Tela cheia, só desktop: monitores Full HD e QHD. Sem versão de celular.
- **O estado do ComfyUI fica sempre à vista**, na barra do topo (`BarraComfy`
  em `componentes/layout.tsx`), em todas as páginas. Nenhuma tela esconde ou
  cobre essa barra.
- **Filtros: todo campo de filtro com valor mostra um × à direita que limpa
  aquele filtro com um clique** — texto ou lista de escolha. A pessoa tem que
  conseguir desfazer qualquer filtro só com o mouse. Use os componentes de
  `apps/web/src/componentes/filtros.tsx` (`FiltroBusca`, `FiltroSelecao`,
  `FiltroProjeto`), que já fazem isso; nunca monte um filtro com
  `Entrada`/`Seletor` direto. Filtro de pílulas (`Pilulas`) não precisa: a
  opção "Todos" já está à vista.
- Filtros moram na URL (`useFiltros`), para dar para voltar, recarregar e
  mandar o link de um filtro pronto.
- **Texto longo em markdown** usa o editor visual `EditorMarkdown`
  (`componentes/editor-markdown.tsx`, MDXEditor). Ele pesa ~1,4 MB: importe
  sempre com `React.lazy` (como em `documento-markdown.tsx`), nunca direto —
  senão vai para o pacote principal. O conteúdo usa a classe `.texto-md`
  (`app.css`), que devolve títulos e listas que o Tailwind zera.
- Colar no `EditorMarkdown`: o MDXEditor sozinho cola o HTML que o VS Code põe
  na área de transferência (uma `<div>` por linha → quebras dobradas). O
  componente intercepta o colar e, se o texto tem cara de markdown, usa
  `insertMarkdown`. Mexeu no editor? Teste colando um `.md` copiado do VS Code.
- O MDXEditor reescreve o markdown ao carregar (junta as linhas de um
  parágrafo, troca escapes) e avisa pelo `onChange` com `normalizacao = true`.
  Para saber se a pessoa mexeu, compare com o texto normalizado (a `base` da
  `ModalDocumento`), nunca com o do banco: senão "alterações não salvas" aparece
  sem ninguém tocar.
- Onde só cabe um resumo (cartão, cabeçalho), mostre `resumoMarkdown()`, nunca
  o markdown cru com `#` e `**`.
- A descrição do projeto é um documento à parte: modal própria e rota própria
  (`PUT /api/projetos/:id/descricao`). O "Editar" do projeto mexe só no nome.
- **Toda página de dentro de um projeto** (asset, vídeo, cena, shot — e as
  que vierem) tem o botão **"Descrição do projeto"** no cabeçalho:
  `BotaoDescricaoProjeto` (`componentes/descricao-projeto.tsx`), que busca o
  projeto ao clicar e abre a mesma janela, com as versões. Sem projeto, ele
  não aparece.
- **A descrição do projeto tem versões** (`versao_descricao`): cada gravação
  com texto diferente vira versão nova; versões não se editam nem se apagam, e
  restaurar é gravar o texto antigo de novo. Quem grava manda `base` (a
  `descricaoVersao` que leu) e a API recusa com 409 se outra entrou no meio.
  A skill `/descricao-projeto` grava sozinha (origem "Claude"), **só** pelo
  script `descricao.mjs` dela — é a exceção autorizada à regra de não escrever
  no banco, e só para a descrição.
- **A descrição do projeto tem modelo fixo** (`docs/descricao-de-projeto.md`):
  o assistente de prompt recebe só as seções `##` que servem à saída do tipo
  e as fichas `###` dos personagens citados (`geracao/descricao-projeto.ts`).
  Mudou um título ou uma seção? Mude o doc, o código e a skill
  `.claude/skills/descricao-projeto` juntos.

# O Gerador e os workflows do ComfyUI

- **Não existe cadastro de geração.** O Gerador é um recurso do sistema que
  aparece dentro do asset e do shot; cada imagem gerada é um `Output` do
  dono, e **o output guarda tudo o que foi usado para gerá-lo** (tipo,
  workflow, modelo, prompt, seed, `parametros`, `grafo_enviado`). A tabela
  `execucao` é só a fila do ComfyUI, não um cadastro.
- **Assistentes de prompt** (página Assistentes, tabela `assistente`) são do
  usuário: markdown que a LLM local segue para expandir a ideia no campo
  marcado `assistivel` do workflow (a caixa "O assistente de prompt escreve
  aqui", no editor de campos). O código acrescenta sozinho a dica, as palavras
  e os avisos do campo.
- **Tipos de geração e workflows são cadastros do usuário** (páginas Tipos de
  geração e Workflows; tabelas `tipo_geracao` e `workflow`) — não existe mais
  workflow em código. Como dados do usuário, **não crie nem edite** registros
  deles sem pedido. A exceção é a skill `/workflow-creativa`: invocá-la é o
  pedido, e ela cria ou altera tipos, workflows, assistentes, um asset, cena
  ou shot de exemplo e o rascunho do Gerador, **só** pelos scripts dela
  (`creativa.mjs`, que passa pela API), sem apagar nada.
- **O rascunho do Gerador** (`rascunho_gerador` em `asset` e `shot`) guarda
  onde o Gerador parou: tipo, workflow, valores, assistente (pelo nome) e
  ideia. O Gerador abre por ele (antes do último output) e salva sozinho.
  Rascunho que existe é do usuário: não passe por cima.
- **Templates oficiais do ComfyUI** ficam em
  `C:\IA\ComfyUI\python_embeded\Lib\site-packages\comfyui_workflow_templates_json\templates`
  (os `api_*` são serviços pagos). Eles trazem os números certos de cada
  modelo e, nos loaders, o link de download de cada arquivo. O `comfy.mjs`
  da skill `workflow-creativa` lê os templates, confere um grafo contra o
  `/object_info` sem rodar nada e salva workflows na lista do ComfyUI
  (`user/default/workflows`, formato de tela).
- O workflow é **genérico**: `ferramenta` (hoje só `comfyui`), o `grafo` como
  a ferramenta exporta (ComfyUI: o "Export (API)"), os `campos` e as `saidas`.
  Cada campo tem **alvos** (nó + entrada do grafo); gerar é copiar o grafo e
  escrever os valores nos alvos (`montarGrafo` em `geracao/grafo.ts`). Tipos
  de campo: texto, numero, opcoes, seed, tamanho (largura **e** altura) e
  imagem. O formato e a validação moram em `geracao/definicoes.ts` (zod) —
  campo novo começa ali e no `CampoDinamico` do front.
- **Campo de imagem** (referência de workflow): o valor é
  `{ origem: "referencia" | "output", id }`, de qualquer asset ou shot **do
  projeto do dono** (sem projeto, só do próprio dono; no "Testar", qualquer
  um). Ao gerar, `enviarImagens` (`geracao/imagens.ts`) manda o arquivo ao
  ComfyUI (`/upload/image`, em `input/creativa/`, com o nome pelo hash) e o
  nome vai para o `LoadImage`. O output guarda a referência, não o arquivo.
- Ferramenta nova (fora do ComfyUI) = um adaptador em `geracao/execucao.ts`
  (hoje `executar` recusa o que não é `comfyui`) e uma linha em `FERRAMENTAS`.
- Execuções, outputs e assistentes guardam as **chaves** (`tipo_geracao`,
  `workflow`), não ids: a chave nasce do nome e nunca muda.
- O "Testar" do cadastro (`POST /api/workflows/testar`) roda sem gravar nada
  no Creativa; a imagem fica em `C:\IA\ComfyUI\ComfyUI\output`. Se **você**
  testar por ele, apague a imagem de teste depois (confira nome, tamanho e hora).
- Tipo sem workflow nenhum não aparece no Gerador.

# Git

- Um dev e um usuário só: o dono do projeto. **Sem branches e sem PRs** —
  commit e push direto na `main`.

# A máquina (o que importa para gerar com IA)

Levantado em 2026-10-01. Tudo roda aqui: ComfyUI, API, banco.

| Peça | Detalhe |
| --- | --- |
| GPU | **RTX 3080 Ti, 12 GB VRAM** — Ampere (compute 8.6), driver 617.14, CUDA 13 |
| CPU | Ryzen 7 5800X, 8 núcleos / 16 threads |
| RAM | 32 GB DDR4-3466 (o WMI lê um dos pentes como 1 GB; são 4×8) |
| `C:` | NVMe Samsung 980 PRO 2 TB — **todo modelo de IA fica em `C:\IA`**: `C:\IA\ComfyUI`, `C:\IA\Ollama\models`. Ferramenta nova de IA também vai para lá |
| `D:` | HDD 4 TB ("Data") — bom para arquivar saídas, ruim para modelos (carrega devagar) |
| SO | Windows 11 Home |
| ComfyUI | 0.36.0 portátil, Python 3.13, PyTorch 2.13 + cu130, attention do PyTorch |
| Nós extras | ComfyUI-Manager, Civicomfy. Sem `triton`: nada de SageAttention ou `torch.compile` com backend triton |
| LLM local | Ollama 0.35 (bandeja, porta 11434), modelo `gemma4:12b-it-qat` (~7 GB) para o assistente de prompt. Modelos em `C:\IA\Ollama\models` — a variável `OLLAMA_MODELS` **e** o "Model location" do app (o do app vence) |

O que isso muda nas escolhas:

- **12 GB de VRAM é o gargalo.** Modelo que não cabe roda com offload para a
  RAM (lento) ou quantizado: pesos fp8, GGUF. Ex.: Flux dev em fp16 (~23 GB)
  não cabe; em fp8 ou GGUF Q8, cabe.
- **Ampere tem bf16 e fp16, mas não FP8 nem NVFP4 nativos** (esses são das
  RTX 40/50). Pesos fp8 funcionam, mas o cálculo sobe para fp16/bf16 — economiza
  VRAM, não ganha velocidade.
- `--fast fp16_accumulation` (via `COMFYUI_ARGS` no `.env`) acelera na 3080 Ti.
- **Um job por vez.** A GPU é uma só: a fila de execuções do Creativa deve
  mandar uma geração por vez ao ComfyUI, e vídeo (Wan e afins) ocupa a placa
  inteira por minutos.
- **ComfyUI e a LLM se revezam na VRAM.** Antes de enviar ao ComfyUI, o
  Creativa descarrega a LLM (`descarregar()` em `lib/ollama.ts`); antes de
  expandir um prompt, libera o ComfyUI com `/free` se ele estiver parado.
  Mantenha esse revezamento em qualquer coisa nova que use a GPU.
- **O Ollama usa 4096 tokens de contexto se ninguém pedir outro** e corta o
  começo calado (as instruções!). O `gerarTexto` pede `num_ctx` 16384: no
  gemma4 12B custa só ~330 MB a mais. Confira com `GET :11434/api/ps`
  (`context_length`).
- 32 GB de RAM seguram um offload, mas modelos de vídeo grandes + offload
  chegam perto do limite.
- **Personagem de anime: Anima Aesthetic v1.1** (2B, ~6 GB de VRAM com o
  codificador), escolhido em 2026-10-03 contra Illustrious XL e Anima Turbo.
  O `CLIPLoader` dele é `type = stable_diffusion`, e com cfg 4 o negativo
  funciona. O porquê e os números estão nas notas do workflow.
- **Personagem com referência de estilo: Krea 2 Turbo int8 + o LoRA
  `krea2_style_reference`** (ostris), em nós nativos (`TextEncodeQwenImageEditPlus`
  + `index_timestep_zero`). O modelo tem 13,5 GB, mais do que a placa, e roda
  com offload. O `CLIPLoader` é `type = krea2`, e com cfg 1 não há negativo.
  O prompt descreve só o conteúdo: o estilo vem da imagem.

# Banco de dados

**Os dados são do usuário. Não escreva neles.**

- Nada de criar, semear, editar ou apagar registros — nem "só para testar", nem
  dados que pareçam ser de exemplo. Quem cadastra workflows, projetos e
  execuções é o usuário.
- Nada de `truncate`, `DELETE`, `prisma migrate reset` ou scripts que gravem.
  Se algo assim parecer necessário, **pergunte antes** e espere a resposta.
- Não presuma que uma linha é resíduo de teste.
- Migrações podem ser criadas e aplicadas normalmente (mudam o schema, não os
  dados). Só o `reset` é que está fora.
- **Migração que move ou apaga dados** (drop de tabela ou coluna com conteúdo)
  é diferente: pergunte antes. E escreva à mão, no estilo das que já existem —
  primeiro copia, confere (um `RAISE EXCEPTION` se faltar algo), só então apaga.
- Antes de qualquer operação de risco que o usuário autorize: `npm run backup`.
- Arquivos gerados (imagens, vídeos, sons) seguem a mesma regra: não apague.

## Como verificar sem escrever

- `npm run typecheck` e `npm run build`.
- Requisições `GET` à API — leem e não mexem em nada (`/api/banco/estado` faz só `SELECT 1`).
- Pedidos que a API **recusa** (validação 400) também não gravam — servem para
  testar rotas de escrita.
- **Ensaiar uma migração:** um script (no scratchpad) com o `pg` do
  `node_modules` que roda o SQL entre `BEGIN` e `ROLLBACK`, consulta o
  resultado e desfaz. Depois de aplicar, confira que não sobrou diferença:
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  (em `apps/api`) tem que dizer "empty migration".
- **Testar o assistente de prompt sem banco:** script que importa
  `montarSistema`/`campoAssistivel` (`rotas/assistentes.ts`) e `gerarTexto`
  (`lib/ollama.ts`), monta o sistema com um `.md` de `docs/assistentes/` e
  confere palavras e avisos do campo. Depois, `descarregar()` para devolver a VRAM.
- **Conferir um grafo do ComfyUI sem rodar:**
  `node .claude/skills/workflow-creativa/comfy.mjs validar <grafo-api.json>`
  (nós, entradas, ligações, opções, modelos baixados).
- **Diga explicitamente o que você não conseguiu verificar.**

# Pegadinhas do terminal nesta máquina

Coisas que já custaram tempo — e o contorno:

- **API de dev em segundo plano:** suba com
  `node --import tsx src/server.ts --dev` (em `apps/api`, com `exec` na frente),
  não com `npx tsx`. Com `npx`, parar a tarefa mata só o `npx` e o filho do
  `tsx` fica órfão na 3401 rodando código velho. Depois de parar, confira que a
  porta 3401 ficou livre.
- **Barras invertidas:** o Git Bash estraga caminhos do Windows em `sed` e em
  `node -e '...'`. Para editar texto com `C:\...`, escreva um script `.cjs` no
  scratchpad e rode com `node`.
- **Scripts de teste fora do projeto:** use extensão `.mts` (fora do pacote
  `"type": "module"` o `tsx` trata `.ts` como CommonJS), importe o projeto por
  `file:///C:/Projetos/Creativa/...` e rode de `apps/api` com
  `node --env-file=../../.env --import tsx <script>`.
- **Ollama:** abra o app com `explorer.exe "<...>\ollama app.exe"`. Lançado
  direto do terminal do Claude, ele não consegue criar o processo do servidor
  (fica sem a porta 11434 e sem erro no log).
- **`.ps1`:** depois de editar, confira que os 3 primeiros bytes continuam
  `EF BB BF` (o BOM).