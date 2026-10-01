# Creativa

Plataforma web para criar projetos de vídeos, imagens, sons e assets com IA,
chamando workflows já prontos do **ComfyUI** pela interface do Creativa.

Front em React + Vite, API em Node (Fastify), num monorepo com npm
workspaces, com PostgreSQL local via Prisma 7. Roda nesta máquina (onde
estão o ComfyUI e o banco) e é acessível dos outros PCs pelo Tailscale.

## Começando

```powershell
npm install
.\scripts\criar-banco.ps1          # uma vez: pede a senha do usuário postgres
.\scripts\publicar-no-tailnet.ps1  # uma vez: HTTPS no tailnet, porta 8444
```

Depois, **dê dois cliques em `Creativa.cmd`**. O servidor não fica numa
janela: ele vira um **ícone na bandeja**, perto do relógio. Duplo clique abre
o app; o botão direito traz o resto.

O `criar-banco.ps1` acrescenta o `DATABASE_URL` ao `.env`. O resto do `.env`
é opcional — veja o `.env.example` para apontar outra pasta ou porta do
ComfyUI (padrão: `C:\AI\ComfyUI`, `http://127.0.0.1:8188`).

## Banco de dados

PostgreSQL desta máquina (porta 5432), banco e usuário `creativa`. O usuário
é dono só do próprio banco: não é superusuário e não enxerga os bancos dos
outros projetos.

| Tabela | O que guarda |
| --- | --- |
| `workflow` | Workflow do ComfyUI importado, com o grafo no formato API |
| `projeto` | O agrupador do trabalho |
| `execucao` | Cada vez que um workflow roda: parâmetros, grafo enviado, `prompt_id`, tempos |
| `asset` | Cada arquivo gerado, com o caminho relativo à pasta de saídas |

A conexão leva `options=-c timezone=UTC`: sem isso o driver grava os
horários 3 horas deslocados, em silêncio (lição do NihongoHub).

O backup (`npm run backup` ou pelo ícone) é só do banco. Os arquivos gerados
moram em disco e não entram no dump.

## O ícone da bandeja

Veio do Trimly (que veio do NihongoHub), com as mesmas decisões: sem janela
de console, matar a árvore de processos inteira, conferir se quem responde na
porta é mesmo o Creativa.

| Item do menu | O que faz |
| --- | --- |
| **Abrir no Edge** | Abre o app. Com o servidor parado, sobe ele antes |
| Copiar link do tailnet | Copia a URL HTTPS para abrir de outro PC |
| Abrir no VS Code | Abre `Creativa.code-workspace` |
| Abrir a pasta do projeto | Abre a pasta do código-fonte no Explorer |
| Reiniciar o servidor | Aplica migrações pendentes, recompila o front e sobe de novo |
| **ComfyUI — _estado_** | Submenu: abrir, iniciar/parar, pasta e log do ComfyUI |
| Fazer backup do banco | Roda `scripts\backup-banco.ps1` numa janela |
| Iniciar com o Windows | Liga e desliga a subida automática no login |
| Ver o log | `%LOCALAPPDATA%\Creativa\servidor.log` no Bloco de Notas |
| Sair | Encerra o servidor (e o ComfyUI, se foi o ícone que o iniciou) |

| Ícone | Estado do Creativa |
| --- | --- |
| colorido, **selo verde** | no ar |
| cinza, sem selo | subindo |
| cinza, **selo vermelho** | caiu ou não subiu — veja o log |

O selo fala só do Creativa. O estado do ComfyUI aparece na dica do ícone
(passe o mouse) e no título do submenu.

### O ComfyUI pelo ícone

"Iniciar o ComfyUI" roda o Python embutido do pacote portátil com os mesmos
argumentos do `run_nvidia_gpu.bat`, só que oculto e com a saída em
`%LOCALAPPDATA%\Creativa\comfyui.log`. Ele atende só nesta máquina (sem
`--listen`): quem fala com o ComfyUI é a API do Creativa, e os outros PCs
chegam pelo Creativa.

Argumentos extras vão no `COMFYUI_ARGS` do `.env` — por exemplo
`--fast fp16_accumulation`, mais rápido em RTX 30/40 com precisão um pouco
menor. São relidos a cada partida: edite e pare/inicie o ComfyUI pelo menu,
sem reiniciar o tray. Com o fp16 ligado, o `comfyui.log` traz a linha
`Enabled fp16 accumulation.`

Um ComfyUI aberto por fora (pelo `.bat`) também é reconhecido — o estado
segue a porta. Ao **Sair**, o ícone só derruba o ComfyUI que ele mesmo
iniciou: o oculto não teria outro jeito de ser fechado.

### O tray roda o app "de verdade", não o de desenvolvimento

O ícone sobe `npm run servir`: aplica as migrações, compila o front e sobe a
API, que serve o front pronto na **porta 3400**. Depois de um `git pull`,
**Reiniciar** é tudo o que se precisa: banco, front e back saem atualizados
juntos.

Para mexer no código, `npm run dev` sobe o Vite (3410) e a API em modo watch
(3401) — portas diferentes, então dá para desenvolver com o app no ar. O Vite
aceita conexões de fora, então dá para desenvolver de outro PC pelo IP do
tailnet.

## Portas

| Porta | Quem |
| --- | --- |
| 3400 | App (o que o tray sobe) |
| 3401 | API em `npm run dev` |
| 3410 | Vite em `npm run dev` |
| 8444 | HTTPS no tailnet (`tailscale serve` → 3400) |
| 8188 | ComfyUI |
| 5432 | PostgreSQL (compartilhado; banco `creativa`) |

Já ocupadas nesta máquina por outros projetos: 443/3001, 3002, 3200/8443 (Trimly), 8787.

## Comandos

| Comando | O que faz |
| --- | --- |
| `Creativa.cmd` | Põe o Creativa na bandeja |
| `npm run dev` | Desenvolvimento: http://localhost:3410 |
| `npm run servir` | O que o tray roda: migra, compila e sobe na 3400 |
| `npm run db:migrate` | Cria migração nova a partir do schema (dev) |
| `npm run db:studio` | Prisma Studio para olhar o banco |
| `npm run backup` | Dump do banco em `backups\` |
| `npm run typecheck` | TypeScript nos dois apps |
| `npm run icons` | Regenera os ícones a partir do SVG |

## Estrutura

```
apps/
  api/
    prisma/schema.prisma  Tabelas e enums
    src/server.ts         Fastify: /api/saude, /api/banco/estado, /api/comfyui/estado, front
    src/lib/prisma.ts     Cliente Prisma
  web/                    React + Vite + Tailwind
    scripts/gerar-icones.mjs
scripts/
  tray.ps1                Ícone da bandeja
  criar-banco.ps1         Usuário + banco + .env + migrações
  backup-banco.ps1        pg_dump com verificação
  publicar-no-tailnet.ps1 tailscale serve na 8444
```
