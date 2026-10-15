---
name: blockout
description: Monta o blockout 3D de um shot no Creativa para travar a geometria do primeiro quadro — a planta de um cenário (a partir da placa), o manequim de uma personagem (a partir da ficha e da capa), a marcação de uma cena (quem fica onde) e a câmera de um shot, renderizados no Blender (depth para o ControlNet). Use quando o usuário pedir para "fazer o blockout", "modelar a sala/o cenário/a personagem no Blender", "posicionar as personagens na cena", "montar a câmera do shot" ou gerar a etapa Geometria.
---

# Blockout de um shot

A previs de animação, em três níveis — cada um mora num lugar do Creativa:

| Nível | Onde mora | Vem de |
|---|---|---|
| **Planta** do cenário | `asset.blockout` (formato `cenario`) | a placa do asset (a capa) e a descrição |
| **Manequim** da personagem | `asset.blockout` (formato `personagem`) | a ficha `###` na descrição do projeto e a capa |
| **Marcação** da cena | `cena.marcacao` | o storyboard / o pedido ("Lia e Ami perto da janela") |
| **Câmera** do shot | campos da etapa Geometria (workflow "Geometria do shot (Blender)") | o pedido ("plano médio das duas, do corredor") |

O formato exato (zod) está em `apps/api/src/geracao/blockout.ts`; quem monta a
cena é `blender/creativa/render.py`. O script desta skill:

```bash
node .claude/skills/blockout/blockout.mjs <comando> ...
```

O começo do `blockout.mjs` lista os comandos. Use o scratchpad para os JSON e
as prévias.

## Regras

- **Escreva só pelo script** (ele passa pela API, que valida). Sem SQL, sem
  `curl -X POST` solto. Esta skill é uma exceção autorizada à regra de não
  escrever no banco, e só para: `asset.blockout`, `cena.marcacao` e o
  rascunho da etapa de geometria do Gerador.
- **Não passe por cima** de blockout, marcação ou rascunho que já existe: o
  script recusa sem `--substituir`, e `--substituir` só com o pedido do
  usuário. **Nunca apague nada.**
- **Gerar** (`gerar`) cria um output no shot: só quando o usuário pediu. A
  `previa` roda o Blender aqui e não grava nada — use à vontade.
- Antes de gerar o **primeiro quadro** (ComfyUI, GPU), pergunte.

## O sistema de coordenadas

Metros. Origem no **centro do piso** da sala. **+y** aponta para a parede
`frente` (numa sala de aula, a da lousa); **+x** para a `direita` de quem olha
para a frente; **+z** para cima. Ângulos em graus em torno de z, **0 = virado
para +y**. Nas aberturas e painéis, `centro` corre ao longo da parede: x nas
paredes frente/fundo, y nas laterais.

## 1. Ver o que existe

```bash
node .claude/skills/blockout/blockout.mjs ver "garota mágica"
```

Mostra ✓/✗ de cada cenário, personagem e cena, e os ids dos shots.

## 2. A planta do cenário

1. **Olhe a placa** (a `capa` do asset, em `ARQUIVOS_DIR`; ou pela API
   `/api/arquivos/<capa>`). Anote **de que lado** ficam as janelas, a porta, a
   lousa — a placa manda, não o costume. (A Sala de Aula do Garota Mágica tem
   as janelas **à esquerda** de quem olha a lousa.)
2. Escreva o JSON `formato: "cenario"`: `sala` (largura × profundidade ×
   altura), `aberturas` (janelas com `base` = peitoril, portas com `base` 0),
   `paineis` (lousa, quadro de avisos), `pecas` e `fileiras` (as carteiras:
   `origem` da primeira, `passo` [x, y], linhas andam para −y). Medidas reais:
   sala de aula ~8 × 10 × 3,2 m, carteira ~0,6 × 0,45 m com o tampo a 0,73 m.
   Deixe **corredores** de pelo menos 0,8 m — é onde as personagens vão ficar.
3. Confira com `previa-asset <assetId> camera.json <pasta>` numa câmera parecida
   com a da placa, e **olhe a prévia ao lado da placa**. Ajuste até bater.
4. `salvar-asset <assetId> planta.json`.

## 3. O manequim da personagem

Da ficha (`###` dela na descrição do projeto) e da capa:

- `altura`: a ficha diz relativo ("a menor das três", "altura média") — traduza
  para metros coerentes entre elas (13 anos: ~1,42 a ~1,58 m) e **mantenha a
  proporção** entre as personagens do projeto.
- `corpo`: `saia`, `calca` ou `vestido` (a silhueta da cintura para baixo).
- `cabelo`: `comprimento` (`curto`, `medio`, `longo`), `volume` (1,0 liso
  colado; 1,2–1,4 armado) e `cor` (só para a prévia).
- `cores`: pele, cima e baixo, só para a prévia — ajudam a reconhecer quem é quem.

O manequim é **uma silhueta inteira** (braços colados, ombros redondos): nos
testes, braço solto do tronco virou "gente a mais" no primeiro quadro. Não
detalhe rosto nem mãos: quem diz quem é são as referências do Qwen.

`previa-asset` para olhar, `salvar-asset` para gravar.

## 4. A marcação da cena

Do storyboard ou do pedido: `cenario` (id do asset), `personagens` com `asset`,
`pos` [x, y], `olhaPara` [x, y] (ou `rot`) e `pose` (`em_pe`, `sentada`), e
`pecas` extras da cena. Ponha as personagens **nos corredores**, longe dos
móveis (o manequim tem ~0,5 m de largura), e virado para onde a ação pede.
`salvar-cena <cenaId> marcacao.json`.

## 5. A câmera de cada shot

1. Traduza o pedido em `camera.json`: `pos` [x, y, z], `alvo` [x, y, z] (para
   onde aponta) e `lente` (24 mm abre a sala; 35–50 mm aproxima).
2. **`previa <shotId> camera.json <pasta>`** e olhe a prévia. O relatório diz
   quanto do quadro cada personagem ocupa:
   - **≥ 60%** da altura do quadro: é o tamanho que funcionou (plano médio, ~70%).
   - **< 45%**: o depth **não segura** a personagem (plano geral, ~30%, falhou
     0 de 9). A sala obedece, ela vai para o centro. Diga isso ao usuário e
     proponha aproximar a câmera — ou usar o workflow de primeiro quadro **sem**
     geometria para esse shot.
3. **O prompt do primeiro quadro tem de concordar com a câmera.** O relatório
   diz de que lado cada uma está e se está de frente, de perfil ou de costas,
   e o assistente do primeiro quadro recebe isso sozinho (quando o workflow
   tem o campo `geometria` e o shot tem a geometria escolhida). Prompt
   pedindo rostos com o depth de costas fez o modelo virar as duas: gente a
   mais e imagem embaralhada (2026-10-15). Escrevendo o prompt à mão,
   descreva como o relatório diz.
4. Com a câmera boa: `camera <shotId> camera.json` (deixa no rascunho; o
   usuário clica em Gerar) **ou**, se ele pediu, `gerar` e depois
   `escolher <shotId> <outputId>` — o escolhido vai para o campo "Geometria"
   do primeiro quadro pelo pipeline.

## 6. Fechar

Mostre a prévia (ou o output) e diga o que ficou gravado. O primeiro quadro é
o workflow **"Primeiro quadro de shot com geometria"**: Lia/Ami/placa como
Picture 1/2/3 e o depth no campo Geometria, força **2,5**. Ofereça gerar.

## O que os testes ensinaram (2026-10-14 e 15)

- **Janela sem nada lá fora** é um buraco preto e liso no depth, e o ControlNet
  forte o transforma em mosaico de pixels. O `render.py` põe chão, árvores e
  prédios lá fora (`exterior` da planta: `misto`, `arvores`, `predios` ou
  `nada`) e grava o depth em **disparidade** (1/distância), como os mapas com
  que o ControlNet foi treinado.

- O patch de depth é do Qwen-Image **base**; no Edit 2511 pede força **2,5**.
- **Mantenha a placa do cenário como Picture 3** — sem ela, a Lia duplicou.
- A Picture 2 pesa menos que a 1: a segunda personagem desvia mais (manga,
  saia). Reforce no prompt o que a define.
- Blockout como imagem de referência (em vez de depth) **não serve**: o Qwen
  pinta os manequins. Resultados: blender/sala-de-aula/LEIA-ME.md.
