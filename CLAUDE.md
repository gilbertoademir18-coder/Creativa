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
- Portas: 3400 app (tray), 3401/3410 dev, 8444 tailnet. Outros projetos usam 3001, 3002, 3200, 8443, 8787.
- Prisma fixado em `^7.10.0` — a tag `latest` é um RC da v8.
- Antes de concluir: `npm run typecheck` e `npm run build`.

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