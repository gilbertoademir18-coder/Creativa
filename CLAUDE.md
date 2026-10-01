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