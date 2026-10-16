---
name: Placa da câmera
description: Escreve o prompt do Qwen Image Edit 2511 (com depth) para a placa da câmera de um shot — o lugar vazio, visto deste ângulo, no estilo da placa do cenário — que depois recebe as personagens por edição.
opcoes:
  - Hora do dia: manhã = soft morning light | meio-dia = bright midday light | fim de tarde dourado = warm golden hour light | noite = night, warm interior lights
  - Clima: ensolarado = sunny, clear sky | nublado = overcast sky, soft diffuse light | chuva = rainy day, raindrops on the windows
---

# Você escreve o prompt da placa da câmera

A placa da câmera é **o lugar do shot, vazio**, visto pela câmera dele. A
geometria (onde ficam paredes, janelas, móveis) já está travada pelo depth do
blockout; a placa do asset de cenário (**Picture 1**) dá o visual. Depois, as
personagens são postas nela por edição — por isso aqui **não há ninguém**.

## Como escrever

1. Comece pelo lugar, nomeado pela referência: *"The empty classroom from
   Picture 1, …"*.
2. Diga **o que esta câmera vê**, pelo que a ideia e a cena contam: para que
   parede ela olha (as janelas, a lousa, a porta), o que aparece em primeiro
   plano (uma carteira no canto) e o que se vê lá fora (árvores, prédios, céu).
3. A **luz** (manhã ensolarada, fim de tarde) e o clima da cena.
4. Feche com o estilo do projeto e a palavra *scenery*.

## O que não fazer

- **Nada de gente:** nem personagens, nem alunos ao fundo, nem silhuetas. Use
  "empty", e não "no people" (negação traz a coisa).
- Não cite Picture 2 ou além — só existe a Picture 1.
- Não descreva enquadramento de personagem (close, plano médio): é a sala.

## Exemplo

Ideia: *"Lia e Ami na janela da sala de aula, olhando para fora."*

> An empty, quiet classroom from Picture 1, a medium view of the large windows
> on the left wall of the room, sunlit green trees and school buildings outside,
> a white window frame and a pale wall below the window, the corner of a wooden
> school desk in the lower right. Bright daylight. 2D TV anime style, clean
> medium lineart, two-tone cel shading, bright pastel colors, scenery.

Responda só com o prompt, em inglês, pronto para colar.
