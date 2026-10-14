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
- Portas: 3400 app (tray), 3401/3410 dev, 8444 tailnet (Creativa), 8445 tailnet (ComfyUI), 11434 Ollama. Outros projetos usam 3001, 3002, 3100, 3200, 8443, 8446, 8787.
- Prisma fixado em `^7.10.0` — a tag `latest` é um RC da v8.
- Antes de concluir: `npm run typecheck` e `npm run build`.
- **O app da 3400 roda o código de quando subiu.** O `npm run build` troca na
  hora o front que ele serve (o `fastifyStatic` do front procura o arquivo a
  cada pedido; com `wildcard: false` ele só conhecia os `.js` de quando
  subiu, e depois de um build a página ficava em branco), mas a API continua a velha: depois de mudar API ou
  schema, avise o usuário para usar "Reiniciar o servidor" (ou "Publicar a
  versão nova") no ícone da bandeja. Até lá, front novo + API velha podem quebrar.
- Assistentes de prompt prontos para importar ficam em `docs/assistentes/`
  (um `.md` por assistente, cabeçalho de skill `name`/`description`).

# A hierarquia

`Projeto → Lista de vídeos → Vídeo → Cena → Shot`, mais assets do projeto e
"cenas sem vídeo". Lista e vídeo são **genéricos e só agrupam** — não chame
de "temporada"/"episódio" no código nem na tela. Apagar lista ou vídeo solta
as cenas (`SetNull`), nunca as apaga.

- **Cena e shot nascem sem nome** (`nome` é `String?` desde 2026-10-14): o
  número — a **posição na lista**, nunca o campo `ordem` — já identifica, e
  nome é só para quando merecem um ("A fuga"), posto pelo usuário. Os rótulos
  saem de `rotulos.ts`: `comNumero` nas abas e listas (`2`, ou `2. A fuga`),
  `titulo` em títulos e frases (`Cena 2`), `paraCampo` nos formulários.
  Onde há só um registro solto (fila, escolha de imagem), a API usa `ordem + 1`
  (`lib/rotulos.ts`) — aproximação consciente: apagar um do meio deixa buraco
  na ordem guardada, e aí esse rótulo diverge da posição que a barra mostra.
- **Vídeo nunca está solto:** vídeo sempre tem lista, e lista sempre tem
  projeto (os dois campos são obrigatórios no banco). Por isso o filtro de
  projeto da página de vídeos usa `permitirSem={false}` — "Sem projeto" ali
  seria um filtro que nunca acha nada — e o `GET /api/videos` recusa
  `projeto=sem` com 400. Asset e cena, sim, podem estar soltos.
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
- **Ações de uma janela ou painel que rola ficam sempre à vista:** barra de
  ferramentas grudada em cima, botões (Salvar, Fechar, Excluir, abrir em aba
  nova) grudados embaixo — `sticky` com fundo opaco e uma linha separando,
  como no rodapé da `ModalDocumento` e no painel do output. Cuidado com
  `overflow-hidden` entre o `sticky` e quem rola: ele prende o `sticky`.
- **Outputs favoritos ficam numa seção própria, em cima** ("Favoritos" e
  "Os outros"), no Gerador e na página Outputs: `GruposDeOutputs`
  (`componentes/outputs.tsx`). A API já manda os favoritos primeiro, então o
  visor (← →) segue a mesma ordem.
- **Janela dentro de janela** (a `Modal` é um `<dialog>` nativo): o React
  repassa o evento `close` da janela de dentro para a de fora. Por isso o
  `onClose` da `Modal` confere `e.target === e.currentTarget` — sem isso, o
  "Excluir?" fechava o visor de outputs junto.
- **Miniatura de imagem sem corte:** em listas de imagens (cartões de asset,
  a janela de escolher imagem), todas com a **mesma altura** e a largura pela
  proporção — `flex flex-wrap`, cartão `w-min`, `<img class="h-… w-auto
  max-w-none">` e o texto em `w-0 min-w-full` (não alarga o cartão). Nada de
  `aspect-square` + `object-cover`, que corta personagem em pé.
- **Filtros: todo campo de filtro com valor mostra um × à direita que limpa
  aquele filtro com um clique** — texto ou lista de escolha. A pessoa tem que
  conseguir desfazer qualquer filtro só com o mouse. Use os componentes de
  `apps/web/src/componentes/filtros.tsx` (`FiltroBusca`, `FiltroSelecao`,
  `FiltroProjeto`), que já fazem isso; nunca monte um filtro com
  `Entrada`/`Seletor` direto. Filtro de pílulas (`Pilulas`) não precisa: a
  opção "Todos" já está à vista.
- **Todo vídeo tem pelo menos uma cena**, como toda cena tem pelo menos um
  shot. Vídeo novo já nasce com "Cena 1" (que nasce com "Shot 1"), e
  `exigirOutraCenaNoVideo` (`rotas/cenas.ts`) barra as **duas** saídas com 409:
  apagar a última cena e tirá-la do vídeo pelo `PUT`. Só as duas pontas juntas
  seguram a regra — com uma só, bastava mover a cena para esvaziar o vídeo.
  Cena fora de vídeo não tem essa amarra.
- **Excluir vídeo pode levar as cenas junto** (`DELETE /api/videos/:id?cenas=apagar`,
  a opção no modal): sem isso elas voltam soltas para o projeto. Os shots caem
  em cascata, mas referência e output são Restrict — cena com geração barra
  tudo, e aí nem o vídeo é apagado. A opção nasce desabilitada nesse caso, com
  os nomes das cenas presas.
- **Trocar de shot ou de cena não apaga a tela.** O `VeuCarregando`
  (`componentes/ui.tsx`) deixa o conteúdo anterior no lugar, esmaecido, com uma
  pílula "Carregando..." por cima — o `Carregando` cheio fica só para a
  primeira carga, quando não há o que velar. E quem já tem a cena com os shots
  (a barra, o painel do vídeo) linka **direto para o shot** com
  `caminhoDaCena` (`caminhos.ts`), em vez de passar por `/cenas/<id>`: o desvio
  carregava a cena só para redirecionar, e a tela piscava duas vezes.
- **Painel de vídeo e de cena têm a mesma planta**: a lista do que vem dentro
  à esquerda, em destaque (cenas / shots), e na coluna estreita a identidade
  (nome e mais um campo) e o documento longo — sinopse ou storyboard — como
  resumo com um botão que abre o `ModalDocumento`. Rodapé com o aviso à
  esquerda e o excluir à direita. Mexeu num, mexa no outro.
- **Modal que mora na barra tem de fechar quando o dono muda.** A barra fica no
  Layout e **nunca desmonta**: sair da página tira o `<dialog>` do DOM, mas o
  `aberto` continua guardado no estado, e ao voltar pela SPA o modal ressurge
  sozinho (foi o que acontecia logo depois de criar um vídeo, que leva direto
  ao shot dele). Cada modal da barra tem um `useEffect` que o fecha quando a
  cena, o vídeo ou o shot muda. Modal de página não tem esse problema — a
  página desmonta e leva o estado junto.
- **O caminho até o shot é um bloco só.** A `BarraCena`
  (`componentes/barra-cena.tsx`) desenha duas linhas no mesmo bloco, sem borda
  entre elas: a de cima é o **vídeo** com as cenas dele (só quando a cena está
  num vídeo), a de baixo é a **cena** com os shots. Faixa sobre faixa comeria a
  tela — em Full HD já são quatro barras antes do Gerador.
- **Nem vídeo nem cena têm página.** `/videos/<id>` manda para o shot de
  `editadoEm` mais recente **de todas as cenas do vídeo** (e não para a cena de
  `editadoEm` mais novo: trabalhar num shot não mexe no `editadoEm` da cena);
  vídeo sem cena nenhuma mostra um vazio com "Nova cena", porque devolver à
  lista pareceria que o clique falhou. Sinopse, ordem das cenas, renomear e
  excluir o vídeo moram no painel que a barra abre
  (`componentes/painel-video.tsx`). **Os painéis não têm botão próprio: quem abre é o
  nome**, na barra — o botão ao lado do nome que já abria o mesmo painel era
  repetição. O nome ganha sublinhado pontilhado no hover para se anunciar
  clicável.
- **A cena é uma barra, não uma página.** Em todo shot, embaixo da barra do
  projeto, a `BarraCena` (`componentes/barra-cena.tsx`) mostra o nome da cena e
  os shots dela. É **neutra** de propósito: a violeta é o projeto, a cinza é a
  cena dentro dele — duas violetas coladas competiriam. `/cenas/<id>` não é mais
  tela: manda para o shot de `editadoEm` mais recente (o rascunho do Gerador
  mantém isso em dia sozinho). Storyboard, ordem dos shots, renomear e excluir a
  cena moram no painel que a barra abre (`componentes/painel-cena.tsx`) — que é o
  único lugar onde a ordem dos shots se muda; a barra só navega.
  A página do shot **não tem título**: o nome já está aceso na barra, e repetir
  só empurrava o Gerador para baixo. "Editar shot" também é da barra, e edita o
  aceso; o excluir do shot mora dentro desse modal, e não na barra, porque ao
  lado do excluir da cena seria pedir para alguém apagar a coisa errada. Sobra
  para a página o Gerador, as referências e uma faixa que só aparece se houver
  vídeo ou descrição.
- **Projeto tem `ordem`, e a página se reordena arrastando** (`GradeArrastavel`
  em `componentes/ordenavel.tsx`, arrasto nativo, sem biblioteca). Grade e não
  lista: entre cartões lado a lado, setinhas ↑ ↓ não diriam o que fazem.
  Quem está sendo arrastado mora num **ref**, não no estado — o `dragover` vem
  logo depois do `dragstart` e precisa do valor já atualizado para chamar
  `preventDefault()`; com estado, o navegador recusava o "soltar".
  Todo projeto nasce em `ordem: 0` e a listagem desempata por `editadoEm`, então
  a ordem de antes vale até alguém arrastar o primeiro. **Com busca ativa a
  grade é só de leitura**: a lista à vista é um pedaço, e reordenar nela
  reescreveria a página inteira a partir dele.
- **Arrasta-se pela alça, não pelo cartão inteiro.** A `GradeArrastavel` passa
  uma `alca` ao cartão, que a põe onde quiser; o quadro só aceita o arrasto se
  ele começou nela (um `ref` marcado no `mousedown`, conferido no `dragstart`).
  Sem isso, o cartão inteiro arrastava e um clique na estrela virava arrasto.
- **Os favoritos abrem o menu lateral**, numa seção "Projetos" antes de tudo:
  um clique e você está dentro. A lista vem de `GET /projetos?favoritos=1` e
  mora num contexto (`componentes/projetos-favoritos.tsx`) — quem marca a
  estrela é a página de projetos e quem mostra é o menu, então sem o contexto
  favoritar só apareceria lá depois de um F5. Sem favorito nenhum, a seção
  some: seção vazia só ocuparia a lateral.
- **Projeto favorito é só destaque** (a estrela do cartão): não mexe na ordem,
  que é só do arrastar. A rota usa **SQL cru** de propósito — o `update` do
  Prisma toca o `editadoEm` (`@updatedAt`), e como a listagem desempata por
  ele, favoritar fazia o projeto pular para o começo quando as ordens ainda
  estavam todas em 0.
- Filtros moram na URL (`useFiltros`), para dar para voltar, recarregar e
  mandar o link de um filtro pronto.
- **Texto longo em markdown** usa o editor visual `EditorMarkdown`
  (`componentes/editor-markdown.tsx`, MDXEditor). Ele pesa ~1,4 MB: importe
  sempre com `React.lazy` (como em `documento-markdown.tsx`), nunca direto —
  senão vai para o pacote principal. O conteúdo usa a classe `.texto-md`
  (`app.css`), que devolve títulos e listas que o Tailwind zera. A barra de
  ferramentas dele é `sticky` (gruda no topo de quem rola): **nada em volta
  do editor pode ter `overflow-hidden`**, senão ela rola junto com o texto.
  Os menus dele (Heading, link, tabela) abrem num container que ele pendura
  no `<body>` — atrás do `<dialog>` da `Modal`, invisíveis. Por isso o
  `EditorMarkdown` passa `overlayContainer` com uma div de dentro dele.
- Colar no `EditorMarkdown`: o MDXEditor sozinho cola o HTML que o VS Code põe
  na área de transferência (uma `<div>` por linha → quebras dobradas). O
  componente intercepta o colar e, se o texto tem cara de markdown, usa
  `insertMarkdown`. Mexeu no editor? Teste colando um `.md` copiado do VS Code.
- O MDXEditor reescreve o markdown ao carregar (junta as linhas de um
  parágrafo, troca escapes) e avisa pelo `onChange` com `normalizacao = true`.
  Para saber se a pessoa mexeu, compare com o texto normalizado (a `base` da
  `ModalDocumento`), nunca com o do banco: senão "alterações não salvas" aparece
  sem ninguém tocar.
- **Página que troca de registro sem desmontar** (a barra de shots, `/shots/A`
  → `/shots/B`): o `useCarregar` guarda os dados velhos até os novos chegarem,
  e o estado interno fica. Os painéis com estado (Gerador, Referências) ficam
  numa `div key={id}` — sem ela, o Gerador mostrava o rascunho do shot
  anterior e o gravava no novo. **A `key` vai no invólucro, nunca repetida em
  irmãos:** dois irmãos com a mesma `key` fazem o React deixar os velhos na
  página (os Geradores se empilhavam). Para ver isso de verdade, um Edge
  headless pelo DevTools Protocol (`--remote-debugging-port`) com o domínio
  `Fetch` barrando todo pedido que não é GET: clica, lê o DOM e não grava nada.
- Onde só cabe um resumo (cartão, cabeçalho), mostre `resumoMarkdown()`, nunca
  o markdown cru com `#` e `**`.
- A descrição do projeto é um documento à parte: modal própria e rota própria
  (`PUT /api/projetos/:id/descricao`). O "Editar" do projeto mexe só no nome.
- **Toda página de dentro de um projeto** (o projeto, asset, vídeo, cena,
  shot, as listas filtradas por um projeto — e as que vierem) mostra a
  **barra do projeto** (`componentes/barra-projeto.tsx`), violeta, embaixo
  da barra do ComfyUI: o nome, links fixos (Visão geral, Assets, Cenas,
  Referências, Outputs, Conversas) e o botão "Descrição do projeto".
  **Conversa de um projeto** (`conversa.projeto_id`; a página Conversas com
  `?projeto=<id>`): a lista mostra só as dele, a nova nasce dele e a LLM
  recebe a descrição inteira do projeto no sistema, lida a cada mensagem
  (sempre a versão mais recente). A página só chama
  `useProjetoAtual(idDoProjeto)` (aceita o filtro `projeto` da URL direto);
  o Layout desenha. Página nova de dentro de um projeto: chame o hook antes
  dos `return` antecipados. **Com a barra, a navegação é só por ela:** nada
  de "← voltar" nem de link para o projeto no cabeçalho (o contexto, como
  "Lista › Vídeo", fica como texto). O "← voltar" só aparece fora de projeto.
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
  Seção `##` **fora do modelo vai sempre** (antes era ignorada calada, e o
  uniforme novo nunca chegou à LLM); o editor avisa com `avisosDaDescricao`
  (`componentes/descricao-projeto.tsx`, que repete a lista de títulos).
  Formato, Público-alvo e Referências nunca vão. Mudou um título ou uma
  seção? Mude o doc, o código (API e a lista do front) e a skill
  `.claude/skills/descricao-projeto` juntos.
- **Uma fonte só para cada coisa:** a descrição do asset também vai à LLM, e
  mais perto da ideia — se ela repete a aparência da ficha (ou o uniforme do
  Mundo) e as duas divergem, a do asset ganha. Na descrição do asset, aponte
  para a do projeto em vez de copiar.

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
  e os avisos do campo. Tudo o que vai à LLM sai de `montarPedido`
  (`rotas/assistentes.ts`), que a expansão e a **prévia** usam igual: o botão
  "Ver o que vai para a LLM" no Gerador (`POST /api/assistentes/:id/previa`,
  só lê) mostra as instruções, o pedido e quais seções e fichas entraram.
  Mexeu no que vai à LLM? Mexa em `montarPedido`, e a prévia acompanha.
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
- **Dono de uma referência:** um asset, um shot, **o projeto em si**
  (`referencia.projeto_id`: moodboard, inspiração) ou ninguém (solta).
  `projeto_id` só existe sem asset e sem shot (um CHECK no banco garante); a
  de um asset ou shot chega ao projeto por eles. Na página Referências
  filtrada por projeto, o upload cria a referência do projeto — antes criava
  solta, e ela sumia do filtro (parecia que o upload falhava). Os filtros de
  referência (`refDoProjeto`, `refDoVinculo` em `rotas/referencias.ts`) não
  são os de output, que não têm esse vínculo.
- **Campo de imagem** (referência de workflow): o valor é
  `{ origem: "referencia" | "output", id }`, de qualquer asset ou shot **do
  projeto do dono**, ou referência do projeto em si (sem projeto, só do
  próprio dono; no "Testar", qualquer um, inclusive as soltas). Ao gerar, `enviarImagens` (`geracao/imagens.ts`) manda o arquivo ao
  ComfyUI (`/upload/image`, em `input/creativa/`, com o nome pelo hash) e o
  nome vai para o `LoadImage`. O output guarda a referência, não o arquivo.
  Campo de imagem com `opcional: true` pode ficar vazio (null): o
  `montarGrafo` tira o `LoadImage` e as ligações que saem dele, então ele
  precisa ligar direto numa entrada opcional.
- **Campo novo na definição + app da 3400 rodando a API velha = campo
  perdido em silêncio:** o zod descarta chaves que não conhece, então salvar
  um workflow com um campo recém-criado (ex.: `opcional`) antes de reiniciar
  o servidor grava sem ele. Reinicie e salve de novo; confira com `ler-workflow`.
- **Vídeo:** o `SaveVideo` aparece no histórico do ComfyUI na mesma lista
  `images` (com `animated`); o tipo do output (IMAGEM, VIDEO, AUDIO) sai do
  mime do arquivo (`tipoDoMime` em `geracao/execucao.ts`). Nó V3 com "combo
  dinâmico" (o `format` do `SaveVideo`) vai no grafo API como valor, e as
  sub-escolhas em chaves com ponto: `"format": "auto", "format.codec": "auto"`.
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

Levantado em 2026-10-01 (placa-mãe e RAM revistas em 2026-10-09). Tudo roda aqui: ComfyUI, API, banco.

| Peça | Detalhe |
| --- | --- |
| GPU | **RTX 3080 Ti, 12 GB VRAM** — Ampere (compute 8.6), driver 617.14, CUDA 13 |
| CPU | Ryzen 7 5800X, 8 núcleos / 16 threads |
| Placa-mãe | **Asus TUF Gaming B550M-Plus** (BIOS 3645), desde 2026-10-09 — a X570 Aorus Elite morreu ao salvar a BIOS |
| RAM | 32 GB (kit 4×8 Kingston HyperX `KHX3466C16D4/8GX`) rodando a **3200, XMP desligado**. Os 32 GB estão em uso, mas a ficha (SPD) de dois pentes parece corrompida: o B1 se diz 1 GB e 8 bits, e o A1 se diz `KAX...` (na BIOS e no WMI, nas duas placas). O Diagnóstico de Memória do Windows passou sem erro (2026-10-09). Como o perfil XMP mora no SPD, não ligue o XMP com esses pentes |
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
  Mantenha esse revezamento em qualquer coisa nova que use a GPU. Na API,
  toda rota que chama a LLM começa com `exigirOllama()` e
  `abrirEspacoParaLlm()` (`rotas/assistentes.ts`), e o streaming de texto
  na tela passa por `textoEmStreaming` (`api.ts`).
- **O Ollama usa 4096 tokens de contexto se ninguém pedir outro** e corta o
  começo calado (as instruções!). O `conversar` (e o `gerarTexto`) pede
  `num_ctx` 16384: no gemma4 12B custa só ~330 MB a mais. Confira com
  `GET :11434/api/ps` (`context_length`). Conversa longa (página Conversas)
  é cortada antes, pelo começo, em `LIMITE_CONTEXTO` caracteres
  (`lib/ollama.ts`).
- 32 GB de RAM seguram um offload, mas modelos de vídeo grandes + offload
  chegam perto do limite.
- **O MiniMax H3 `int8_convrot` derruba o PC nesta máquina** (resolvido em
  2026-10-12). Reinício seco no começo da amostragem — Kernel-Power 41 com
  `BugcheckCode = 0`, sem minidump e sem WHEA —, intermitente (às vezes passa
  uma ou duas vezes). Não era placa-mãe (trocada), XMP (desligado), fonte
  (OCCT "Power" 35 min com GPU ~369 W + CPU ~140 W, 12 V entre 11,79 e
  12,18 V; e os 12 V ficaram firmes até o instante da queda) nem falta de RAM
  (commit com 24 GB livres, pagefile sem uso). Outras pessoas relatam o
  mesmo com o H3 `int8_convrot` em placas Ampere (Comfy-Org/ComfyUI #15760
  e #16946, sem correção oficial). **Com o DiT `fl2va_pruned_fp8_scaled` e o
  turbo de 4 passos, gerou 4 vezes seguidas sem cair.** Regra (decisão do
  usuário): **nunca use modelo `int8_convrot` (nem `w6a8`) nesta máquina** —
  use a variante `fp8_scaled` ou bf16. A skill `workflow-creativa` recusa no
  `validar`. Desde 2026-10-12 nenhum modelo `int8_convrot` fica em `C:\IA`
  (o Krea 2 passou para fp8 e os arquivos int8 foram apagados). Se o PC
  voltar a cair: `Get-WinEvent` no log System (Id 41, WHEA, nvlddmkm), o fim
  de `C:\IA\ComfyUI\ComfyUI\user\comfyui_8188*.log` (`.prev`/`.prev2` são
  as sessões anteriores) e um log do **HWiNFO64** (instalado; CSV a 200 ms
  só com o "Global" do Período de pesquisa em 200 e "Gravar direto no
  disco"), em `C:\IA\Diagnostico`. O **OCCT** também está instalado. No
  teste, a CPU chegou a 90,5 °C (limite do 5800X) e o hot spot da GPU a
  99,8 °C (alto: pasta/pads velhos?). Não ligue o XMP sem o usuário pedir.
- **A GPU roda no limite de fábrica** (370 W, lido como `power.default_limit`
  desde a placa-mãe nova; antes lia 350 W). Contra os desligamentos houve uma
  tarefa agendada que baixava para 280 W; com a B550 estável, foi apagada em
  2026-10-09 a pedido do usuário. Mudar o limite exige administrador.
- **Tempos medidos (5 s de vídeo):** Wan 2.2 a 832×480 em ~2,5 min; MiniMax
  H3 fp8 com 4 passos a 864×480, com som, em ~1,7 min.
- **Personagem de anime: Anima Aesthetic v1.1** (2B, ~6 GB de VRAM com o
  codificador), escolhido em 2026-10-03 contra Illustrious XL e Anima Turbo.
  O `CLIPLoader` dele é `type = stable_diffusion`, e com cfg 4 o negativo
  funciona. O porquê e os números estão nas notas do workflow.
- **Personagem com referência de estilo: Krea 2 Turbo fp8 (`krea2_turbo_fp8_scaled`)
  + o LoRA `krea2_style_reference`** (ostris), em nós nativos (`TextEncodeQwenImageEditPlus`
  + `index_timestep_zero`). O template oficial usa o int8, que aqui é
  proibido. O modelo tem 13,1 GB, mais do que a placa, e roda
  com offload. O `CLIPLoader` é `type = krea2`, e com cfg 1 não há negativo.
  O prompt descreve só o conteúdo: o estilo vem da imagem. **Cor marcante da
  referência vaza** (a Ami saía com o cabelo azul da Prompt): use como
  referência uma imagem neutra — no Garota Mágica Prompt!, o asset "Folha de
  estilo" (garota genérica, cabelo castanho-escuro) — e, se ainda vazar,
  baixe a "Força do estilo" para 0,7–0,8.
- **Vídeo a partir do primeiro quadro** (tipo "Vídeo do primeiro quadro", só
  shots), dois workflows para comparar, escolhidos em 2026-10-04:
  **Wan 2.2 I2V 14B fp8 + LightX2V 4 passos** (dois modelos de 14,3 GB,
  high/low noise, 16 fps, mudo) e **MiniMax H3 FL2VA fp8_scaled + turbo 4
  passos** (21 GB + codificador Qwen3-VL 32B NVFP4 de 15,7 GB, 24 fps, **com som**).
  Os dois passam muito da placa e rodam com offload; o H3 deixa a RAM no
  limite e o NVFP4 não é nativo na Ampere. O nó do H3 **estica** o primeiro
  quadro (o do Wan recorta no centro): o grafo tem um `ImageScale` com
  `crop = center` antes. A seção Som da descrição vai para saídas de vídeo.
  O H3 que vale é o **"MiniMax H3 fp8, 4 passos"** (2026-10-12): o mesmo
  grafo com o DiT `fl2va_pruned_fp8_scaled` e o LoRA `turbo_4step_v1.0_768p`,
  com o mesmo assistente. O workflow H3 `int8_convrot` + 8 passos foi
  removido do Creativa em 2026-10-12 (os outputs dele ficaram).
  LTX 2.5 ficou de fora: o repositório é *gated* no Hugging Face.
- **Placa de cenário em anime: o mesmo Anima Aesthetic** (2026-10-12), 16:9 e
  **sempre vazia** — decisão do usuário. O vazio se segura nas duas pontas:
  `scenery, no humans` no começo do prompt e pessoas no negativo (cfg 4). A
  placa da Z-Image é fotográfica: fica para projetos que não são anime.
- **Primeiro quadro de shot: Qwen Image Edit 2511 fp8mixed + Lightning 4
  passos** (escolhido em 2026-10-12 contra FLUX.2 Klein 4B; o Klein 9B é
  *gated* e não comercial). Até **3 referências**, em posições fixas: Personagem 1
  = "Picture 1", Personagem 2 = "Picture 2", Cenário = "Picture 3" — o
  `TextEncodeQwenImageEditPlus` numera pela entrada, então o cenário segue
  "Picture 3" mesmo sem a Personagem 2. As três são opcionais. A imagem nasce
  de um `EmptySD3LatentImage` 16:9 (não da imagem 1, como no template de edição).

# Rodar de outra máquina, com a IA em casa

**O que só dá para fazer na máquina de casa vai para `docs/pendencias-em-casa.md`** —
com o que fazer, como conferir e por quê. Escreveu uma pendência? Anote lá, não
na resposta: a próxima sessão não lê esta conversa.

O notebook `dev` (i5-1235U, **sem GPU NVIDIA**) roda o Creativa local e usa o
que é pesado em casa (`overdrive`, `100.65.76.22`), pelo Tailscale. Conferido
em 2026-10-14. O `.env` de cada máquina é que muda — o código é o mesmo.

- **Nome da máquina de casa: `overdrive`** (era `x570-aorus` até 2026-10-14).
  O IP do tailnet não mudou.
- **Funciona:** o banco (`5432` direto no IP) e o ComfyUI (`8445`, pelo
  `tailscale serve`). Gerar vai de ponta a ponta: a API só fala HTTP com o
  ComfyUI (`/prompt`, `/history`, `/view`, `/upload/image`), então a 3080 Ti
  de casa trabalha e o arquivo é **baixado para o `ARQUIVOS_DIR` local**.
- **Não funciona, e o motivo:**
  - **Assistentes e Conversas**: o Ollama só atende em `127.0.0.1:11434` na
    máquina de casa — o `publicar-no-tailnet.ps1` publica a 8444 e a 8445, e
    **não** a 11434. De fora, `/api/assistentes/estado` dá `noAr: false`.
    Para resolver: um `tailscale serve` da 11434 em casa (a **8447** está
    livre) e `OLLAMA_URL` apontando para ela. Prefira o `serve` a
    `OLLAMA_HOST=0.0.0.0`, que abriria a LAN de casa sem autenticação.
  - **Os arquivos antigos** (referências e outputs) moram em `D:\Creativa` em
    casa, e o banco guarda só o caminho relativo. Resolvido pelo
    `ARQUIVOS_REMOTOS` do `.env`: o que não está na pasta local vira um
    **redirect 302** para o Creativa de casa, e o navegador busca direto pelo
    tailnet (~1,3 s um PNG de 1 MB). Sem a variável, arquivo que falta é 404,
    como antes — é assim na máquina que tem os arquivos. O que se gera ou
    envia daqui fica local e nem passa por isso.
  - **"Iniciar"/"Parar" o ComfyUI**: procuram o `python_embeded` e a porta
    nesta máquina. O ComfyUI tem de estar ligado em casa.
- **O tray mente sobre o ComfyUI remoto:** `Vigiar-Comfy` (`scripts\tray.ps1`)
  decide pelo `Porta-Ouvindo $COMFY_PORTA`, que olha **listener TCP local**.
  Com o ComfyUI em casa nada ouve na 8445 aqui, então o ícone diz
  "ComfyUI — parado" enquanto a barra do topo — que consulta por HTTP — diz
  "no ar". A barra é que está certa.
- **A GPU continua sendo uma só.** Gerar do notebook e de casa ao mesmo tempo
  põe dois clientes na mesma 3080 Ti, e o revezamento LLM/ComfyUI é
  coordenado por quem chama (`descarregar()` em `lib/ollama.ts`), não por uma
  trava central.

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
- **Regex dentro de heredoc ou template literal perde a barra:** `\b` vira
  backspace e `\d` vira `d`, e o aviso do workflow nunca dispara (já
  aconteceu, em silêncio). JSON com regex: escreva com a ferramenta Write ou
  com `String.raw` num `.cjs`. A API recusa aviso com caractere de controle.
- **Scripts de teste fora do projeto:** use extensão `.mts` (fora do pacote
  `"type": "module"` o `tsx` trata `.ts` como CommonJS), importe o projeto por
  `file:///C:/Projetos/Creativa/...` e rode de `apps/api` com
  `node --env-file=../../.env --import tsx <script>`.
- **Ollama:** abra o app com `explorer.exe "<...>\ollama app.exe"`. Lançado
  direto do terminal do Claude, ele não consegue criar o processo do servidor
  (fica sem a porta 11434 e sem erro no log).
- **Não rode `prettier`:** o projeto não tem configuração dele, e o padrão
  (80 colunas) reformata o arquivo inteiro — o código usa linhas longas.
  Formate à mão, no estilo do arquivo.
- **`.ps1`:** depois de editar, confira que os 3 primeiros bytes continuam
  `EF BB BF` (o BOM).