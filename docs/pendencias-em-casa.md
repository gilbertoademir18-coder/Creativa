# Pendências para rodar na máquina de casa (`overdrive`)

Lista do que **só** dá para fazer na máquina de casa, escrita pelo Claude que
roda no notebook `dev`. Lá eu alcanço o banco e o ComfyUI pelo tailnet, mas não
o disco nem a GPU — ver a seção "Rodar de outra máquina, com a IA em casa" do
`CLAUDE.md`.

Cada item diz **o que fazer**, **como conferir que deu certo** e **por que**.
Risque o que terminar (`- [x]`) e anote o resultado na linha de baixo, para a
próxima sessão não refazer.

---

## 1. Limpar a sujeira do teste de blockout (rápido, faça primeiro)

- [ ] Apagar `ComfyUI\output\creativa-teste\` — **6 PNGs** (`layout-d045`,
      `layout-d06`, `layout-d075`, `layout-d09`, `layout-d09-s987654321`,
      `layout-d09-s555000111`).
- [ ] Apagar `ComfyUI\input\creativa-teste\teste-layout-sala.png`.

**Confira:** as duas pastas somem. **Por quê:** foram testes meus de 2026-10-14,
mandados direto ao `/prompt`. **Nada disso está no banco do Creativa** — nenhum
`Output` ou `Execucao` referencia esses arquivos, pode apagar sem medo.

---

## 2. Publicar o Ollama no tailnet (destrava Assistentes e Conversas)

Hoje o Ollama só atende em `127.0.0.1:11434` daí. De fora,
`GET /api/assistentes/estado` responde `noAr: false`, e as páginas
**Assistentes** e **Conversas** não funcionam em nenhuma outra máquina.

- [ ] Acrescentar a porta **8447** ao `scripts\publicar-no-tailnet.ps1`
      (hoje ele publica só a 8444 do Creativa e a 8445 do ComfyUI), apontando
      para a 11434 local. A 8447 está livre: 8443, 8446 e 8787 são de outros
      projetos — confira a lista de portas no `CLAUDE.md`.
- [ ] Rodar o script.
- [ ] Anotar a porta nova no `CLAUDE.md` (seção de portas) e no `README.md`.

**Confira, de outra máquina:**
`curl https://overdrive.tail2c882a.ts.net:8447/api/tags` tem de listar os
modelos. Depois, no notebook, pôr no `.env`:

```
OLLAMA_URL="https://overdrive.tail2c882a.ts.net:8447"
ASSISTENTE_MODELO="gemma4:12b-it-qat"
```

**Não use `OLLAMA_HOST=0.0.0.0`** como atalho: isso abre o Ollama para a LAN de
casa inteira, sem autenticação. O `tailscale serve` expõe só para o tailnet, e
com HTTPS.

---

## 3. ControlNet depth: baixar os pesos e testar

O objetivo: **travar a geometria sem gastar denoise**. No teste de 2026-10-14
(ver `blender/sala-de-aula/`), partir do render do Blender como latente
funcionou, mas com um porém — em denoise 0,60 o blocking fica exato e a imagem
sai lavada; em 0,90 o estilo fica ótimo mas o personagem sai do lugar. O
ControlNet promete os dois ao mesmo tempo, porque preserva **estrutura**, não
pixels.

O nó `QwenImageDiffsynthControlnet` **já existe** no ComfyUI 0.36.0 (é nativo,
categoria `model/patch/qwen`). Falta só o arquivo de pesos: a pasta
`models\model_patches` está vazia.

- [ ] Baixar `qwen_image_depth_diffsynth_controlnet.safetensors` (**2,11 GB**)
      de [Comfy-Org/Qwen-Image-DiffSynth-ControlNets](https://huggingface.co/Comfy-Org/Qwen-Image-DiffSynth-ControlNets/tree/main/split_files/model_patches)
      para `C:\IA\ComfyUI\ComfyUI\models\model_patches\`.
- [ ] Copiar `blender\sala-de-aula\sala_depth.png` deste repositório para
      `C:\IA\ComfyUI\ComfyUI\input\creativa-teste\sala_depth.png`.
- [ ] Mandar `blender\sala-de-aula\workflow-controlnet-depth.json` ao
      `POST /prompt` **sem gravar no banco**, variando só o `strength` do nó
      `19` — sugiro **0,4 / 0,6 / 0,8 / 1,0**, com a seed fixa em 123456789.

**Confira:** o grafo já vem com `denoise: 1.0` e latente vazio (nó 13) de
propósito — é essa a aposta. Compare com
`blender\sala-de-aula\sala_layout.png`: a lousa, a grade de carteiras, as
janelas e **a posição da professora** têm de bater, com estilo de anime cheio.

**Dois riscos reais, que o teste existe para medir:**

1. **Compatibilidade.** Esses pesos são do **Qwen-Image base**; o workflow usa
   **Qwen-Image-Edit 2511**. A documentação oficial do ComfyUI não afirma que
   servem para o Edit. Pode simplesmente não pegar — e aí o resultado sai igual
   ao de sem ControlNet. É a primeira coisa a verificar.
2. **VRAM.** São 12 GB, já ocupados pelo Qwen fp8. O patch pode empurrar para o
   offload. Se der OOM, feche tudo que estiver na GPU e tente de novo antes de
   concluir que não cabe.

**Alternativa mais leve, se der errado ou faltar VRAM:**
`qwen_image_union_diffsynth_lora.safetensors` (**0,88 GB**, em
`split_files/loras/` do mesmo repositório) cobre canny+depth+pose num arquivo e
carrega com `LoraLoaderModelOnly` — igual à Lightning que já está no grafo.
**Mas:** a documentação não deixa claro em que entrada a imagem de controle
entra nesse caminho. Se for testar o LoRA, descubra isso primeiro (o template
oficial do ComfyUI em
`python_embeded\Lib\site-packages\comfyui_workflow_templates_json\templates`
deve mostrar — eu não alcanço esse arquivo do notebook).

- [ ] Apagar `creativa-teste\` de novo quando terminar.
- [ ] Anotar no `CLAUDE.md` o que funcionou: o `strength` bom, e se o patch do
      Qwen-Image base serve ou não no Edit 2511. Isso custa 2 GB de download e
      uma rodada de GPU para descobrir — não deixe o resultado se perder.

---

## 4. O tray mente sobre o ComfyUI remoto (opcional)

`Vigiar-Comfy`, em `scripts\tray.ps1`, decide o estado pelo
`Porta-Ouvindo $COMFY_PORTA`, que olha **listener TCP local**. Com o ComfyUI em
casa e o Creativa rodando noutra máquina, nada escuta a 8445 lá, e o ícone diz
"ComfyUI — parado" enquanto a barra do topo — que consulta por HTTP — diz
"no ar". A barra é que está certa.

- [ ] Decidir se vale fazer o tray consultar `/api/comfyui/estado` (ou o
      `/system_stats` do próprio ComfyUI) quando a URL não for local, em vez de
      olhar a porta.

Na máquina de casa isso **não incomoda** (lá o ComfyUI é local mesmo), então é
melhoria de conforto para quem usa de fora. Mexer no tray muda comportamento:
**pergunte ao usuário antes**.
