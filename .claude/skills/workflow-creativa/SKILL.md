---
name: workflow-creativa
description: Cria ou altera, no Creativa, o que um projeto precisa para gerar algo com IA — escolhe o modelo certo para esta máquina (e sugere o download), monta o workflow no ComfyUI, cadastra tipo de geração, workflow e assistente de prompt, e deixa um asset ou shot de exemplo com o Gerador pronto. Use quando o usuário pedir "workflow e assistente para X" num projeto, quiser gerar um tipo novo de imagem/vídeo/som, trocar o modelo de um workflow, ou ajustar um workflow ou assistente que já existe.
---

# Workflow e assistente para o Creativa

Exemplo de pedido: *"para o projeto Garota Mágica Prompt!, quero um workflow
e um assistente para criar imagens de personagens"*.

O caminho tem sete passos: **entender** o projeto e o catálogo → **escolher o
modelo** → **montar o workflow no ComfyUI** → **cadastrar** tipo e workflow
→ **escrever o assistente** → **deixar o exemplo** no Gerador → **fechar**.

Os scripts ficam nesta pasta e rodam da raiz do repositório:

- `node .claude/skills/workflow-creativa/comfy.mjs ...` — o ComfyUI: modelos,
  templates oficiais, nós, validação e salvar o workflow na lista dele.
- `node .claude/skills/workflow-creativa/creativa.mjs ...` — o Creativa:
  catálogo, projeto, e cadastrar tipo, workflow, assistente, asset, cena,
  shot e rascunho do Gerador.

O começo de cada script lista os comandos. Use arquivos no scratchpad para
os JSON e os `.md`.

## Regras

- **Nada roda na GPU sem o usuário pedir:** nem "Testar", nem "Gerar", nem
  "Expandir com o assistente". O resultado é tudo cadastrado e pronto. No
  fim, *ofereça* o teste.
- **Escreva só pelos scripts.** Eles passam pela API, que valida grafo,
  campos e alvos. Sem SQL, sem `curl -X POST` solto.
- **Não apague nada.** Para alterar, mude só o que foi pedido. O
  `workflow-salvar` com `id` guarda a versão anterior num `.antes.json`.
  Rascunho do Gerador que já existe é do usuário: não passe por cima.
- **Download de modelo só com o "ok" do usuário**, e sempre para
  `C:\IA\ComfyUI\ComfyUI\models\<pasta>` (todo modelo de IA fica em `C:\IA`).
- **Custom node novo** (instalar pacote no ComfyUI) é decisão do usuário:
  prefira modelos com nós nativos. Se não houver jeito, explique e pergunte.
- **Arquivo do ComfyUI que já existe** não se substitui sem pedido: escolha
  outro nome.
- Código, nomes, notas e assistentes **em português**. O prompt que vai para
  o modelo pode ser em inglês, se o modelo pedir.

## 1. Entender o pedido, o projeto e o catálogo

```bash
node .claude/skills/workflow-creativa/creativa.mjs projeto "garota mágica" <sp>/descricao.md
node .claude/skills/workflow-creativa/creativa.mjs catalogo
```

- **Leia a descrição inteira.** Estilo visual, personagens, Evitar e Formato
  decidem o modelo, a proporção e o assistente. Ela segue
  `docs/descricao-de-projeto.md`.
- **Veja o que já existe.** Um tipo de geração que serve (ex.: "Personagem de
  Anime" sem workflow) se reaproveita. Um workflow parecido pode ser o caso
  de *alterar*, não de criar outro.
- Defina: **o que sai** (imagem, vídeo, som), **para quem** (que tipo de
  asset, ou shots), **com que entrada** (só texto, ou imagem de referência)
  e **em que proporção** (a do projeto).
- Ficou ambíguo? Pergunte no máximo 3 coisas, já com uma proposta em cada.

## 2. Escolher o modelo

**A máquina** está no `CLAUDE.md`, seção "A máquina". O que mais pesa:

- **RTX 3080 Ti com 12 GB de VRAM**, Ampere: bf16 e fp16 nativos. fp8 economiza
  VRAM mas não acelera. Modelo grande demais roda quantizado (fp8, GGUF) ou com
  offload para a RAM (32 GB), que é lento.
- **Sem triton:** nada de SageAttention nem `torch.compile` com triton.
- ComfyUI 0.36, só nós nativos mais ComfyUI-Manager e Civicomfy.
- Uma geração por vez. A LLM do assistente divide a placa com o ComfyUI.

**Onde procurar, nesta ordem:**

1. **O que já está baixado** (`comfy.mjs modelos`): se servir bem, é o melhor,
   porque não tem download nem troca de modelo na VRAM.
2. **Os templates oficiais** (`comfy.mjs templates <busca>`, por exemplo
   `anima`, `qwen`, `flux`, `z_image`, `wan`): mostram o que roda nativo, os
   arquivos certos e os links, e o que já está baixado.
3. **Pesquisa na web** (WebSearch), para saber o que é bom *hoje* para a
   tarefa e o estilo do projeto. Confira: qualidade no estilo pedido (anime,
   foto, 3D...), VRAM real na quantização que cabe, suporte nativo no
   ComfyUI, licença, e se segue bem o prompt (texto longo, várias pessoas).

**Apresente** uma recomendação e 1–2 alternativas numa tabela curta: modelo,
arquivos e tamanho, VRAM, velocidade esperada, pontos fortes no estilo do
projeto, o que falta baixar. Diga por que a recomendada ganhou.

**Download**, depois do "ok": o link vem do template ou da página do modelo
no Hugging Face. Rode em segundo plano, um arquivo por vez:

```bash
curl -L --fail -o "C:/IA/ComfyUI/ComfyUI/models/diffusion_models/<arquivo>" "<url>"
```

Confira o tamanho no fim e rode `comfy.mjs modelos <pasta>`, porque o ComfyUI
relê as pastas sozinho. Modelo "gated", que pede aceite e token do Hugging
Face, não baixa assim: explique o que o usuário precisa fazer. Se o usuário
não quiser baixar, proponha o melhor entre os já baixados.

## 3. Montar o workflow no ComfyUI

1. **Parta do template oficial do modelo** (`comfy.mjs template <id>`). Dele
   vêm os nós, os números (steps, cfg, sampler, scheduler, shift, resolução
   nativa) e as armadilhas, como o `type` certo do `CLIPLoader`. **Não chute
   número:** anote de onde veio cada um. Sem template, use a página oficial do
   modelo e diga isso nas notas.
2. **Escreva o grafo em formato API** (`grafo.json`): é o que o Creativa guarda
   e manda ao ComfyUI.
   - Ids `"1"`, `"2"`... na ordem do fluxo, e `class_type` com os `inputs`.
   - Ligação é `["<id>", <saída>]`.
   - O texto do prompt fica `""`, a seed `0` e o tamanho no padrão: os campos
     do Creativa escrevem neles.
   - `SaveImage` (ou o de vídeo/som) com `filename_prefix` `creativa/<chave-do-tipo>`.
   - Os nomes exatos das entradas vêm de `comfy.mjs no <Classe>`.
3. **Valide** com `comfy.mjs validar grafo.json` até dar OK. A validação confere
   nós, entradas obrigatórias, ligações, tipos, opções e se os modelos estão
   baixados.
4. **Escreva as notas** (`notas.md`), no estilo das que já existem (veja um
   workflow com `ler-workflow placa-cenario-zimage`):
   - para que serve;
   - como é o prompt deste modelo;
   - uma tabela com os números e de onde vieram;
   - as armadilhas (⚠️);
   - os modelos, com tamanho.
5. **Salve na lista do ComfyUI**, para o usuário poder abrir e mexer lá:

   ```bash
   node .claude/skills/workflow-creativa/comfy.mjs salvar-tela grafo.json "Personagem anime 2-3 (Anima).json" --nota notas.md
   ```

   Use um nome legível, sem acento e sem `:` (vira nome de arquivo), com o
   modelo entre parênteses. Ele vira a `origem` do workflow no Creativa.

## 4. Cadastrar o tipo e o workflow no Creativa

**O tipo de geração** é global, não é do projeto. Reaproveite se existir um
que sirva. Se for criar, use um nome genérico ("Personagem de Anime", e não
"Personagens da Lia"):

```json
{ "nome": "Personagem de Anime", "descricao": "...", "saida": "IMAGEM", "tiposAsset": ["PERSONAGEM"], "shot": false }
```

`creativa.mjs tipo-salvar tipo.json`. Os `tiposAsset` decidem em que assets
o Gerador oferece o tipo, e `shot` decide se ele aparece nos shots.

**O workflow** (`def.json`):

```json
{
  "nome": "Personagem anime 2:3 (Anima)",
  "tipoGeracaoId": "<id do tipo>",
  "ferramenta": "comfyui",
  "grafo": { ... },
  "campos": [ ... ],
  "saidas": ["<id do nó de saída>"],
  "descricao": "Uma frase: o que entra e o que sai (até 500 caracteres).",
  "notas": "<o mesmo notas.md>",
  "origem": "Personagem anime 2-3 (Anima).json",
  "modelo": "<arquivo do modelo principal>"
}
```

**Os campos** são o que o Gerador mostra. O formato está em
`apps/api/src/geracao/definicoes.ts` (leia antes). Os tipos são `texto`,
`numero`, `opcoes`, `seed` e `tamanho`, e cada um tem `alvos` (nó + entrada).
Mostre só o que a pessoa vai querer mudar; o resto fica fixo no grafo. O
normal:

- **`texto` do prompt:** `assistivel: true` (é nele que o assistente escreve),
  `obrigatorio`, `linhas`, `palavras` {min, max} do tamanho que o modelo
  gosta, `dica` (a regra curta do prompt) e `avisos`. Os avisos são regex
  (`quando`: "tem"/"falta") para as regras que o modelo exige. O código
  manda dica, palavras e avisos à LLM sozinho.
- **`tamanho`:** opções na proporção do projeto e na resolução nativa do
  modelo, com `padrao`.
- **`seed`.**

`creativa.mjs workflow-salvar def.json`. Se a API recusar, ela diz qual
campo ou alvo está errado.

**Para alterar um que existe:** `ler-workflow <chave> def.json`, mude só o que
foi pedido e rode `workflow-salvar def.json` (com o `id` que veio). A chave
nunca muda: outputs e assistentes guardam ela.

## 5. Escrever o assistente de prompt

O assistente é um `.md` no formato de skill que a LLM local (Gemma 12B) segue
para transformar uma ideia curta no prompt do workflow. O modelo é o
`docs/assistentes/placa-cenario.md`: leia antes de escrever.

**O código já manda à LLM, então não repita no assistente:**
- o nome e a descrição do workflow, a dica, as palavras e os avisos do campo;
- as seções da descrição do projeto que servem à saída (Premissa, Tom,
  Estilo visual, Mundo, Recorrentes, Evitar);
- as fichas dos personagens citados;
- a descrição do asset, da cena e do shot.

**O assistente diz:**
- como **este modelo** quer o prompt: idioma, estrutura (parágrafos e em
  que ordem), tamanho, palavras que ajudam, o que atrapalha (negação com
  cfg 1, aspect ratio no texto, nomes de artistas);
- como **usar o contexto do projeto**: por exemplo, "descreva a personagem
  pela Aparência da ficha, nunca pelo nome; o estilo vem da seção Estilo
  visual";
- **um exemplo** curto de ideia → prompt.

Se ele carrega o estilo do projeto, amarre-o ao projeto (`--projeto <id>`).
Se é só a técnica do modelo, deixe sem projeto e ele vale para todos. Os
`--workflows` levam as chaves dos workflows em que ele aparece.

Salve o `.md` em `docs/assistentes/<nome-curto>.md` (fica no repositório) e
cadastre:

```bash
node .claude/skills/workflow-creativa/creativa.mjs assistente-salvar docs/assistentes/personagem-anime.md --workflows personagem-anime-anima --projeto <id>
```

Para alterar um existente: `ler-assistente <nome> a.md`, edite e rode
`assistente-salvar a.md --id <id> --workflows ...`.

## 6. Deixar o exemplo no Gerador

Escolha **um asset ou shot do projeto** onde o workflow aparece:
- **Asset:** do tipo certo (personagem, cenário...). Prefira um que já existe
  e não tem rascunho. Se não houver, crie com `asset-criar`, com a descrição
  tirada da descrição do projeto. Para um personagem, use a Aparência da ficha.
- **Shot:** `cena-criar` e `shot-criar`, se o tipo é de shots.

Depois grave o **rascunho do Gerador**, para ele abrir pronto:

```json
{
  "tipo": "<chave do tipo>",
  "workflow": "<chave do workflow>",
  "valores": { "prompt": "Lia transformada em Prompt, corpo inteiro, pose confiante apontando para o console", "tamanho": "832x1216", "seed": null },
  "assistente": "<nome do assistente>",
  "ideia": null
}
```

`creativa.mjs rascunho asset <id> rascunho.json`.

- O **prompt é a ideia curta**, em português, 1 ou 2 frases: é o que o
  usuário vê no campo, pronto para clicar em "Expandir com o assistente".
- As chaves de `valores` são as dos campos. `seed: null` quer dizer aleatória.
- `ideia` fica `null`, porque ainda não houve expansão.

## 7. Fechar

Responda com:
- **o modelo escolhido e por quê**, o que foi baixado (e o tamanho), e as
  alternativas descartadas numa linha;
- **o que foi cadastrado:** o arquivo no ComfyUI, o tipo, o workflow, o
  assistente (e o `.md` em `docs/assistentes/`) e o asset ou shot com o
  rascunho;
- **como experimentar:** abrir o asset → o Gerador já vem preenchido →
  "Expandir com o assistente" → "Gerar";
- **o que você não verificou.** O grafo foi validado mas nunca rodou, e o
  assistente nunca foi testado na LLM.

Ofereça rodar o teste. Se o usuário aceitar:
- **workflow:** use o "Testar" (`POST /api/workflows/testar`). Ele não grava
  nada no Creativa, e a imagem fica em `C:\IA\ComfyUI\ComfyUI\output`: apague a
  imagem de teste depois, conferindo nome, tamanho e hora.
- **assistente:** use o roteiro sem banco do `CLAUDE.md` ("Testar o assistente
  de prompt sem banco") e depois `descarregar()`.

Se algo do ComfyUI ou da máquina mudou (modelo novo baixado, pegadinha
nova), registre no `CLAUDE.md`.
