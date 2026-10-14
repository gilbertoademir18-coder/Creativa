# Pendências para rodar na máquina de casa (`overdrive`)

Lista do que **só** dá para fazer na máquina de casa, escrita pelo Claude que
roda no notebook `dev`. Lá eu alcanço o banco e o ComfyUI pelo tailnet, mas não
o disco nem a GPU — ver a seção "Rodar de outra máquina, com a IA em casa" do
`CLAUDE.md`.

Cada item diz **o que fazer**, **como conferir que deu certo** e **por que**.
Risque o que terminar (`- [x]`) e anote o resultado na linha de baixo, para a
próxima sessão não refazer.

---

## 1. Limpar a sujeira do teste de blockout — feito

- [x] Apagar `ComfyUI\output\creativa-teste\` (6 PNGs).
- [x] Apagar `ComfyUI\input\creativa-teste\teste-layout-sala.png`.

Feito em 2026-10-14: os 7 arquivos batiam com a lista (criados entre 10:21 e
10:24), e as duas pastas sumiram.

---

## 2. Ollama para o notebook — feito em casa, falta conferir no notebook

- [x] Em casa: **não** foi pela 8447. O Ollama devolve **403** para Host que
      não é local, e o `tailscale serve` repassa o Host do tailnet. Agora o
      Creativa de casa repassa a LLM em `/ollama` (`rotas/ollama.ts`), e o
      teste com o `conversar` de verdade passou, em streaming. Os detalhes
      estão na seção "Rodar de outra máquina" do `CLAUDE.md`.
- [ ] No notebook, pôr no `.env`:

  ```
  OLLAMA_URL="https://overdrive.tail2c882a.ts.net:8444/ollama"
  ASSISTENTE_MODELO="gemma4:12b-it-qat"
  ```

  **Confira:** `GET /api/assistentes/estado` dá `noAr: true`, e uma expansão
  no Gerador escreve o texto aos poucos. O app de casa tem de estar rodando o
  código novo (depois de "Reiniciar o servidor" na bandeja).

---

## 3. ControlNet depth — feito, funciona com strength 2,5

- [x] Pesos baixados (`models/model_patches/qwen_image_depth_diffsynth_controlnet.safetensors`, 2,27 GB).
- [x] Testado em 2026-10-14 pelo `/prompt`, sem banco: uma base sem ControlNet
      e os strengths 0,4 / 0,6 / 0,8 / 1,0 / 1,5 / 2,0 / 2,5 / 3,5. Em 2,0 e
      2,5, rodei com as 3 seeds.
- [x] Resultado anotado no `CLAUDE.md` (seção da máquina) e no LEIA-ME do
      blockout. O patch do Qwen-Image base **serve** no Edit 2511, mas pede
      **~2,5**. O grafo do repositório já vem com 2,5.
- [ ] Apagar `ComfyUI/output/creativa-teste/` e `input/creativa-teste/`
      depois de o usuário ver as imagens.

Próximo passo possível: levar o ControlNet para o workflow "Primeiro quadro de
shot" do Creativa (pela skill `/workflow-creativa`), com o depth como um campo
de imagem opcional.

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
