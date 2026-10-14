# Blockout da sala de aula

Modelo 3D de apoio para gerar *first frames* consistentes: o Blender dá a
**geometria, o enquadramento e a escala**, e o Qwen dá o estilo. As duas coisas
que as referências de imagem não resolvem bem são exatamente as que o blockout
resolve.

Feito em 2026-10-14, Blender 5.2.

## Os arquivos

| Arquivo | O que é |
| --- | --- |
| `sala.py` | Monta a sala e renderiza `sala_layout.png`. Recria tudo do zero — é a fonte de verdade, não o `.blend`. |
| `depth.py` | Abre o `.blend` e renderiza `sala_depth.png` (passe Mist invertido). |
| `sala_de_aula.blend` | O resultado do `sala.py`, para abrir e ajustar à mão. |
| `sala_layout.png` | O render de aparência, 1344 × 768 — a mesma resolução do workflow. |
| `sala_depth.png` | O mapa de profundidade, para o ControlNet depth. |
| `workflow-controlnet-depth.json` | Grafo da API pronto para o `POST /prompt`, com o ControlNet ligado (strength 2,5). |

## Como rodar

```powershell
& "C:\Program Files\Blender 5.2\blender.exe" --background --factory-startup `
    --python sala.py -- <pasta de saída>

& "C:\Program Files\Blender 5.2\blender.exe" --background --factory-startup `
    --python depth.py -- <...>\sala_de_aula.blend <pasta de saída>
```

Eevee, cerca de 8 segundos cada.

## O que importa saber

- **Proxy, não personagem.** O cilindro com uma esfera por cabeça (1,66 m) só
  marca **onde** a pessoa está, de que tamanho e virada para onde. Quem diz
  *quem* ela é são as referências de imagem do Qwen (Picture 1/2). Modelar
  personagem em 3D é ordens de magnitude mais trabalho e não paga: o Qwen já
  acerta identidade por referência.
- **A câmera é o que muda entre shots.** A sala fica; mover só a câmera e
  regerar é o que dá consistência de espaço entre planos.
- **A resolução do render acompanha a do workflow** (1344 × 768). Mudou lá,
  mude no `sala.py`.
- **Blender 5.x mudou o compositor:** `scene.node_tree` e o nó `Composite` não
  existem mais — agora é `scene.compositing_node_group`, com a saída num
  `NodeGroupOutput`. O `depth.py` já faz certo; não "conserte" para a API
  antiga.
- O blockout sai **cinza e chapado de propósito**. Se for usá-lo como latente
  de partida com denoise médio, vale pintar os materiais mais perto do look
  final: em denoise baixo a imagem herda a cor do render.

## O que já foi medido

Teste de 2026-10-14, usando o render como latente de partida (sem ControlNet),
no `Primeiro quadro de shot (Qwen Image Edit 2511)`:

- **denoise 0,60** — blocking exato (o proxy vira gente no lugar certo), mas a
  imagem sai lavada.
- **denoise 0,85–0,90** — estilo de anime cheio e a **sala** se mantém entre
  seeds; a **posição do personagem**, não: em três sementes ele foi parar em
  três lugares.
- A varredura teve **uma amostra por ponto**. O 0,75 saiu pior que o 0,90 em
  geometria, o que pode ser ruído de semente — não trate como tendência.

### Com o ControlNet depth (`workflow-controlnet-depth.json`)

O mesmo dia, denoise 1 e latente vazio, só o `sala_depth.png` como controle:

- **strength ≤ 1,0** — quase não faz efeito: a sala e a professora mudam de
  lugar como se não houvesse controle. O 1,0 do template oficial não basta,
  provavelmente porque o patch é do Qwen-Image base e o modelo é o Edit 2511.
- **2,0** — a lousa e a grade de carteiras batem nas 3 seeds; a professora,
  em 2 das 3.
- **2,5** — **tudo bate nas 3 seeds**, inclusive a posição da professora, com o
  estilo de anime inteiro. É o valor do grafo.
- **3,5** — passou do ponto: a imagem sai lavada, borrada e com blocos.

Cerca de 10 s por imagem, sem estourar os 12 GB.
