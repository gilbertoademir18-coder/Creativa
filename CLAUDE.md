# Como responder

- Seja amigável e bem-humorado.
- Explique o raciocínio de forma clara.
- Dê exemplos práticos.
- Use linguagem natural, como um colega de equipe.
- Seja proativo ao sugerir melhorias.

# Projeto

- Plataforma para criar vídeos, imagens, sons e assets com IA chamando workflows do ComfyUI (portátil em `C:\AI\ComfyUI`, porta 8188).
- Monorepo npm workspaces: `apps/api` (Fastify) e `apps/web` (React + Vite + Tailwind). Leia o README antes de mudanças estruturais.
- Código, nomes e comentários em português.
- Versões muito novas (TypeScript 7, Vite 8): confira a API em `node_modules` antes de assumir.
- Scripts `.ps1` precisam ser salvos em UTF-8 **com BOM**, senão o PowerShell 5.1 estraga os acentos.
- Portas: 3400 app (tray), 3401/3410 dev, 8444 tailnet (Creativa), 8445 tailnet (ComfyUI), 11434 Ollama. Outros projetos usam 3001, 3002, 3200, 8443, 8787.
- Prisma fixado em `^7.10.0` — a tag `latest` é um RC da v8.
- Antes de concluir: `npm run typecheck` e `npm run build`.

# Interface

- Tela cheia, só desktop: monitores Full HD e QHD. Sem versão de celular.
- **O estado do ComfyUI fica sempre à vista**, na barra do topo (`BarraComfy`
  em `componentes/layout.tsx`), em todas as páginas. Nenhuma tela esconde ou
  cobre essa barra.
- **Filtros: todo campo de filtro com valor mostra um × à direita que limpa
  aquele filtro com um clique** — texto ou lista de escolha. A pessoa tem que
  conseguir desfazer qualquer filtro só com o mouse. Use os componentes de
  `apps/web/src/componentes/filtros.tsx` (`FiltroBusca`, `FiltroSelecao`,
  `FiltroProjeto`), que já fazem isso; nunca monte um filtro com
  `Entrada`/`Seletor` direto. Filtro de pílulas (`Pilulas`) não precisa: a
  opção "Todos" já está à vista.
- Filtros moram na URL (`useFiltros`), para dar para voltar, recarregar e
  mandar o link de um filtro pronto.

# O Gerador e os workflows do ComfyUI

- **Não existe cadastro de geração.** O Gerador é um recurso do sistema que
  aparece dentro do asset e do shot; cada imagem gerada é um `Output` do
  dono, e **o output guarda tudo o que foi usado para gerá-lo** (tipo,
  workflow, modelo, prompt, seed, `parametros`, `grafo_enviado`). A tabela
  `execucao` é só a fila do ComfyUI, não um cadastro.
- **Assistentes de prompt** (página Assistentes, tabela `assistente`) são do
  usuário: markdown que a LLM local segue para expandir a ideia no campo
  marcado `assistivel` do workflow. O código acrescenta sozinho a dica, as
  palavras e os avisos do campo. Workflow novo com prompt: marque o campo
  `assistivel: true`.
- Tipos de geração e workflows são **programados no código**, em
  `apps/api/src/geracao/` — não ficam no banco. O output guarda as chaves
  (`tipo_geracao`, `workflow`) e os valores dos campos (`parametros`).
- Workflow novo = um arquivo em `geracao/workflows/` + uma linha em
  `geracao/registro.ts`. Para escrever:
  1. Leia o `.json` em `C:\AI\ComfyUI\ComfyUI\user\default\workflows` (formato
     de tela) — inclusive as notas (MarkdownNote): elas dizem o que é fixo e por quê.
  2. Confira os nomes de entrada de cada nó em `GET /object_info/<Classe>` do
     ComfyUI. Não chute: o widget de tela nem sempre bate com o nome do input.
  3. Traduza para o formato API mantendo os ids dos nós do arquivo; exponha
     como `campos` só o que muda de geração para geração.
  4. Teste mandando o grafo montado direto ao `POST /prompt` (sem gravar no
     banco) e confira a imagem. Apague o output de teste depois.
- Tipo sem workflow nenhum não aparece na tela.

# Git

- Um dev e um usuário só: o dono do projeto. **Sem branches e sem PRs** —
  commit e push direto na `main`.

# A máquina (o que importa para gerar com IA)

Levantado em 2026-10-01. Tudo roda aqui: ComfyUI, API, banco.

| Peça | Detalhe |
| --- | --- |
| GPU | **RTX 3080 Ti, 12 GB VRAM** — Ampere (compute 8.6), driver 617.14, CUDA 13 |
| CPU | Ryzen 7 5800X, 8 núcleos / 16 threads |
| RAM | 32 GB DDR4-3466 (o WMI lê um dos pentes como 1 GB; são 4×8) |
| `C:` | NVMe Samsung 980 PRO 2 TB — ComfyUI e modelos ficam aqui |
| `D:` | HDD 4 TB ("Data") — bom para arquivar saídas, ruim para modelos (carrega devagar) |
| SO | Windows 11 Home |
| ComfyUI | 0.36.0 portátil, Python 3.13, PyTorch 2.13 + cu130, attention do PyTorch |
| Nós extras | ComfyUI-Manager, Civicomfy. Sem `triton`: nada de SageAttention ou `torch.compile` com backend triton |
| LLM local | Ollama 0.35 (bandeja, porta 11434), modelo `gemma4:12b-it-qat` (~7 GB) para o assistente de prompt |

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
  Mantenha esse revezamento em qualquer coisa nova que use a GPU.
- 32 GB de RAM seguram um offload, mas modelos de vídeo grandes + offload
  chegam perto do limite.

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
- Antes de qualquer operação de risco que o usuário autorize: `npm run backup`.
- Arquivos gerados (imagens, vídeos, sons) seguem a mesma regra: não apague.

## Como verificar sem escrever

- `npm run typecheck` e `npm run build`.
- Requisições `GET` à API — leem e não mexem em nada (`/api/banco/estado` faz só `SELECT 1`).
- **Diga explicitamente o que você não conseguiu verificar.**