---
name: descricao-projeto
description: Escreve ou revisa a descrição (a "bíblia") de um projeto do Creativa — premissa, formato, público, tom, estilo visual, mundo, personagens, recorrentes, som, evitar, referências — no modelo com títulos fixos que os assistentes de prompt recortam. Use quando o usuário quiser criar, completar, revisar ou reorganizar a descrição de um projeto, criar ou mudar personagens do projeto, ou definir o estilo visual dele.
---

# Descrição de projeto do Creativa

Você ajuda o usuário a escrever a descrição de um projeto: a bíblia que ele
lê e que a LLM dos assistentes de prompt recebe, recortada por seção, a cada
geração. **Leia `docs/descricao-de-projeto.md` antes de tudo.** O modelo, os
títulos e as regras de cada seção estão lá, e o código
(`apps/api/src/geracao/descricao-projeto.ts`) depende deles. Este arquivo diz
só *como conduzir* o trabalho.

## 1. Ponto de partida: sempre a versão mais recente

A descrição tem histórico de versões no Creativa. Você **sempre parte da
versão atual** e **sempre grava uma versão nova**: nunca edita uma antiga,
nunca trabalha em cima de um texto da conversa sem conferir o do app.

Leia com o script desta skill (da raiz do repositório, com um arquivo no
scratchpad):

```bash
node .claude/skills/descricao-projeto/descricao.mjs ler "garota mágica" <scratchpad>/descricao.md
# {"id":"cb64...","nome":"Garota Mágica Prompt!","versao":3,"caracteres":8123,"arquivo":"..."}
```

Guarde o `id` e a `versao`: são o que você manda ao gravar. Leia o arquivo
inteiro antes de propor qualquer coisa. Se o projeto ainda não existe, peça
para o usuário criá-lo na tela; você não cria projetos.

Diga em poucas linhas o que já está preenchido e quais seções faltam ou estão
fracas.

## 2. Perguntas: poucas, e com proposta

O usuário é criativo, não quer um formulário. Então:

- Pergunte **no máximo 3 coisas por vez**, das seções mais importantes primeiro:
  Premissa → Estilo visual → Personagens → Mundo → Tom → o resto.
- **Proponha em vez de só perguntar:** "Pensei na Ami de cabelo azul com
  óculos, o cérebro do grupo. Serve, ou você imaginou outra coisa?" É mais
  rápido aceitar ou corrigir do que inventar do zero.
- Se ele disser "pode inventar", invente com coerência e **marque na resposta
  o que foi invenção sua**, para ele revisar.
- Não pare tudo por um detalhe: escreva com o que tem e liste as dúvidas no fim.

## 3. O que conferir antes de entregar

- **Os títulos são os do modelo**, escritos igual, na ordem da tabela.
  Seções extras só se o usuário pedir, e avise que elas não vão para o assistente.
- **Estilo visual em palavras visíveis:** técnica, traço, paleta com nomes de
  cor, luz, câmera, efeitos. Corte adjetivos vagos ("lindo", "épico",
  "marcante") ou troque pelo que se vê.
- **Nenhum nome de obra, estúdio ou artista fora de `## Referências`.** Se o
  usuário disser "visual de X", ponha X nas Referências e descreva no Estilo
  visual, com suas palavras, o que se pega de X.
- **Personagens:** título `### Nome` ou `### Nome (Outro nome)`, só nomes.
  Ponha entre parênteses as formas transformadas e os nomes dos assets de
  personagem do projeto, se forem diferentes. A ficha usa os rótulos do modelo.
  A **Aparência** precisa bastar para desenhar a personagem sem ver uma
  imagem: rosto, olhos, cabelo (cor, comprimento, penteado), corpo, roupa de
  sempre, acessório marcante.
- **Idade de personagem menor de idade** sempre explícita, e o `## Evitar`
  cobre sexualização e fanservice.
- **Seções diretas:** cada seção que vai ao assistente é cortada em 2.500
  caracteres. A descrição inteira fica entre 1.000 e 2.000 palavras.
- Em português, no estilo de escrita do usuário.

## 4. Entrega: grave você mesmo, como versão nova

O usuário quer que a skill grave sozinha. É seguro porque toda gravação vira
uma versão nova e as antigas ficam no histórico do projeto (botão
**Versões**, na janela da descrição). Então, quando o texto estiver pronto:

1. Escreva a descrição **completa**, não só o trecho que mudou, num `.md` no
   scratchpad. Mexa só no que foi pedido e mantenha o resto palavra por palavra.
2. Grave, passando a versão que você leu e uma nota de uma linha com o que mudou:

   ```bash
   node .claude/skills/descricao-projeto/descricao.mjs salvar <id> <scratchpad>/nova.md 3 "+ Ficha do gato Bit; Recorrentes: gag da recarga"
   # Gravada a versão 4 de "Garota Mágica Prompt!".
   ```

3. **Recusa 409** (outra versão entrou depois da sua leitura, pela tela ou por
   outra conversa): não force. Leia de novo, refaça as suas mudanças em cima da
   versão nova, mostre ao usuário o que mudou e grave com a base nova.
4. **"API antiga, sem versões"**: o app precisa ser reiniciado. Avise o usuário
   e não grave por outro caminho.

Na resposta, diga a versão gravada e o que mudou, seção por seção. Depois liste
em poucas linhas o que você inventou e as perguntas que ficaram em aberto. Se
o usuário não gostar, a versão anterior se restaura na tela ou com uma nova
gravação feita por você.

Nunca chame a API de outro jeito para escrever (sem `curl -X PUT`, sem SQL):
só o script, que sempre manda a base e marca a origem "Claude".
