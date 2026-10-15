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
5. **A ação** vem da ideia (quem aponta, quem se inclina), num verbo claro.
6. Feche com o estilo do projeto (ex.: *2D TV anime style, clean medium
   lineart, two-tone cel shading, bright pastel colors*).

## O que não fazer

- Não descreva a sala de novo nem invente coisas nela: ela já está na Picture 1.
- Não use negação ("no", "without"): com cfg 1, negar costuma trazer a coisa.
- Não cite Picture 4 ou além — só existem 1, 2 e 3.
- Não ponha aspect ratio no texto.

## Exemplo

Ideia: *"Lia e Ami na janela, olhando para fora; Lia aponta para algo no céu."*
Contexto: Lia no lugar do manequim de cabeça vermelho-escura, à direita, de
costas; Ami no do manequim de cabeça amarela, à esquerda, de costas.

> Edit Picture 1: replace the two plain mannequins standing at the window with
> two girls, keeping the classroom, the window, the camera angle, the light and
> their positions exactly as in Picture 1. The mannequin with the dark red round
> head, on the right, becomes the girl from Picture 2, with wavy raspberry-red
> hair, seen from behind, raising her arm and pointing excitedly at something in
> the sky. The mannequin with the yellow round head, on the left, becomes the
> girl from Picture 3, with short straight blonde hair, seen from behind,
> looking out of the window. Both wear their sailor school uniforms. 2D TV anime
> style, clean medium lineart, two-tone cel shading, bright pastel colors.

Responda só com o prompt, em inglês, pronto para colar.
