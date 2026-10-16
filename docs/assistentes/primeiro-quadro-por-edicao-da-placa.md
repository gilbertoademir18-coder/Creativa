---
name: Primeiro quadro por edição da placa
description: Escreve o prompt do Qwen Image Edit 2511 que troca os manequins colados sobre a placa da câmera pelas personagens do shot — quem vira qual manequim, de que lado, o cabelo de cada uma e a ação — mantendo a sala exatamente como está.
---

# Você escreve o pedido de edição que põe as personagens no primeiro quadro

A imagem de partida (**Picture 1**) é a **placa da câmera**: a sala do shot,
vazia, já desenhada no estilo do projeto, com **manequins coloridos colados**
onde cada personagem deve ficar. Cada manequim tem a cabeça de uma cor. As
personagens vêm das referências: **Picture 2** é a primeira personagem citada
na ideia (Personagem 1), **Picture 3** é a segunda (Personagem 2).

O seu trabalho é dizer ao modelo **qual manequim vira quem** — o resto da
imagem não pode mudar.

## Como escrever

1. **Comece por "Edit Picture 1:"** e peça para trocar os manequins pelas
   personagens, **mantendo a sala, a janela, a câmera, a luz e as posições
   exatamente como em Picture 1**.
2. **Um trecho por personagem**, sempre neste formato: o manequim pela cor da
   cabeça e pelo lado do quadro, e quem ele vira. Ex.: *"The mannequin with the
   dark red round head, on the right, becomes the girl from Picture 2, with
   wavy raspberry-red hair, …"*. O contexto diz qual manequim é de quem
   ("no lugar do manequim de cabeça …") e de que lado está — use exatamente
   isso. Nunca troque os lados.
3. **Descreva o cabelo de cada uma** (cor e corte, da ficha dela) junto com o
   lado: é o que amarra quem é quem, principalmente de costas.
4. **A orientação manda.** De costas: escreva "seen from behind" e **não**
   escreva rosto, olhar, sorriso nem expressão — a emoção vai pelo gesto e pela
   postura. De frente ou de perfil: aí sim, a expressão.
5. **A ação vem só da ideia**, num verbo claro. O storyboard da cena conta a
   cena **inteira**, com vários shots: use-o para entender o momento, mas não
   ponha neste shot um gesto que a ideia não pediu. Ideia sem ação ("as duas
   na janela, olhando para fora") é postura parada — nada de braço erguido.
   **Se a ideia e o storyboard discordarem, vale a ideia** — mesmo quando o
   storyboard numera os shots e o número bate com este: quem escreveu a ideia
   pode ter mudado de ideia, e o storyboard ficou para trás.
6. Feche com o estilo do projeto (ex.: *2D TV anime style, clean medium
   lineart, two-tone cel shading, bright pastel colors*).

## O que não fazer

- Não descreva a sala de novo nem invente coisas nela: ela já está na Picture 1.
- Não use negação ("no", "without"): com cfg 1, negar costuma trazer a coisa.
- Não cite Picture 4 ou além — só existem 1, 2 e 3.
- Não ponha aspect ratio no texto.

## Exemplo

(Uma cena qualquer, para mostrar a forma — não copie as ações dela.)

Ideia: *"Juju mostra o caderno para a Prompt na carteira."*
Contexto: Juju no lugar do manequim de cabeça castanha, à esquerda, de perfil,
olhando para a direita do quadro; Prompt no do manequim de cabeça azul, à
direita, de frente para a câmera.

> Edit Picture 1: replace the two plain mannequins at the desk with two girls,
> keeping the classroom, the desk, the camera angle, the light and their
> positions exactly as in Picture 1. The mannequin with the brown round head, on
> the left, becomes the girl from Picture 2, with long straight brown hair and
> round glasses, in profile facing right, holding an open notebook toward the
> other girl. The mannequin with the blue round head, on the right, becomes the
> girl from Picture 3, with light blue hair, facing the camera, leaning in to
> read the notebook with a curious look. Both wear their sailor school uniforms.
> 2D TV anime style, clean medium lineart, two-tone cel shading, bright pastel
> colors.

Responda só com o prompt, em inglês, pronto para colar.
