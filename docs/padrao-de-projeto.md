# Padrão para um projeto novo

Como montar um projeto novo nesta máquina (`x570-aorus`) para que ele se
comporte como os outros: um ícone na bandeja que segura o servidor, os mesmos
atalhos, um banco no Postgres compartilhado e acesso pelo tailnet, inclusive
ao banco.

Levantado em 2026-10-03, comparando Creativa, Trimly, NihongoHub e MediaFlow.
O padrão é o que **Trimly e Creativa** têm em comum: são os mais novos e
nasceram um do outro (NihongoHub → Trimly → Creativa). Na dúvida, copie do
**Trimly** se o projeto não tem nada de especial, ou do **Creativa** se ele
depende de outro serviço local (como o ComfyUI).

> Em todos os exemplos, `<Projeto>` é o nome com maiúsculas (`Trimly`) e
> `<projeto>` é o mesmo nome em minúsculas (`trimly`).

---

## 1. Nome: o mesmo em todo lugar

O nome do projeto amarra tudo. Quem vê um deles acha os outros.

| Peça | Formato | Exemplo (Creativa) |
| --- | --- | --- |
| Lançador na raiz | `<Projeto>.cmd` | `Creativa.cmd` |
| Workspace do VS Code | `<Projeto>.code-workspace` | `Creativa.code-workspace` |
| Mutex do tray (instância única) | `"<Projeto>Tray"` | `"CreativaTray"` |
| Pasta de logs | `%LOCALAPPDATA%\<Projeto>\` | `%LOCALAPPDATA%\Creativa\servidor.log` |
| Atalho de "Iniciar com o Windows" | `<Startup>\<Projeto>.lnk` | `Creativa.lnk` |
| Banco e usuário do Postgres | `<projeto>` / `<projeto>` | `creativa` / `creativa` |
| Rota de saúde | `GET /api/saude` → `{ app: "<Projeto>", ok: true }` | `apps/api/src/server.ts` |

A rota de saúde não é enfeite: o tray usa ela para saber se quem responde na
porta é **este** projeto, e não outro que pegou a porta. Sem ela, o ícone
anunciaria "no ar" e abriria o navegador no app errado.

---

## 2. Portas: uma centena por projeto

| Porta | Uso |
| --- | --- |
| `x00` | O app "de verdade", que o tray sobe (API servindo o front pronto) |
| `x01` | API em `npm run dev` |
| `x10` | Vite em `npm run dev` |
| `84xx` | HTTPS no tailnet (`tailscale serve` → `x00`) |

Com portas diferentes para produção e desenvolvimento, dá para mexer no
código com o app no ar.

**Já ocupadas nesta máquina:**

| Projeto | Portas |
| --- | --- |
| MediaFlow | 3001 (web), 3002 (API), 8787 (Agent), 443 (tailnet) |
| NihongoHub | 3100 |
| Trimly | 3200, 3201, 3210, 8443 (tailnet) |
| Creativa | 3400, 3401, 3410, 8444 e 8445 (tailnet, a 8445 é do ComfyUI) |
| Compartilhadas | 5432 (PostgreSQL), 8188 (ComfyUI) |

A próxima centena livre é a **3500**, e a próxima porta de tailnet é a
**8446**. A 3300 não aparece em nenhum projeto, mas também não foi usada por
ninguém de propósito; se quiser usá-la, confira antes:

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3300,3301,3310 | Select-Object LocalPort, OwningProcess
```

Ao escolher, **acrescente o projeto novo a esta tabela** e à tabela de portas
do `CLAUDE.md` de cada projeto.

---

## 3. O lançador: `<Projeto>.cmd`

Dois cliques nele põem o projeto na bandeja. Ele **não segura o servidor**: só
confere o que pode falhar antes de existir um ícone para avisar, e some.
Modelo: `Creativa.cmd`.

Em ordem:

1. `chcp 65001` e `cd /d "%~dp0"`. O primeiro deixa os acentos certos; o
   segundo faz o `.cmd` funcionar de qualquer lugar, inclusive do atalho de
   Startup.
2. **Fallback do fnm.** Com o Node instalado pelo fnm, ele só entra no PATH de
   um terminal que rodou `fnm env`, e dois cliques não passam por terminal
   nenhum:
   ```bat
   where node >nul 2>&1 || (where fnm >nul 2>&1 && for /f "delims=" %%L in ('fnm env --shell cmd') do %%L)
   ```
   (Só o Creativa tem isso hoje. Ponha em todo projeto novo.)
3. Sem Node: mensagem e `pause`.
4. Sem `node_modules\`: `npm install`, avisando que é só na primeira vez.
5. Sem `DATABASE_URL` no `.env`: mensagem mandando rodar o
   `scripts\criar-banco.ps1`, e `pause`.
6. `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\tray.ps1"`,
   **sem `start`**: o tray se relança sem console e devolve o controle na
   hora, então a janela do `.cmd` fecha sozinha.

O `.cmd` é escrito sem acentos nas mensagens (o `cmd.exe` é temperamental
com codificação). Os comentários `rem` explicam o porquê de cada passo.

---

## 4. O ícone da bandeja: `scripts\tray.ps1`

Copie o do Trimly ou o do Creativa e troque nome, portas e o que for
específico. Ele não depende de pacote nenhum: o WinForms já vem com o Windows.

> Como todo `.ps1` destes projetos, salve em **UTF-8 com BOM**. Sem o BOM, o
> PowerShell 5.1 estraga os acentos das mensagens e dos itens do menu.

### O que todo tray faz

- **Sem console, de verdade.** `-WindowStyle Hidden` não basta no Windows 11
  (o console é do Windows Terminal). O script relança a si mesmo com
  `CreateNoWindow`, `-STA` e o switch interno `-SemConsole`, e sai.
- **Uma instância só**, pelo Mutex `"<Projeto>Tray"`. A segunda mostra um
  MessageBox ("já está na bandeja, procure perto do relógio") e sai.
- **Adota um servidor que já está no ar** se `/api/saude` responder com o nome
  do projeto. Se a porta estiver com outro programa, mostra um MessageBox e
  sai, em vez de brigar por ela.
- **Sobe o servidor oculto** pelo `cmd /c`, com a saída redirecionada pelo
  próprio cmd para `%LOCALAPPDATA%\<Projeto>\servidor.log`. Nunca por pipes do
  .NET: pipe que ninguém lê enche e congela o processo filho.
- **Roda o app de produção**, não o de dev: `npm run servir` com
  `NODE_ENV=production` (aplica migrações, compila o front, sobe a API servindo
  o front na `x00`). Assim, depois de um `git pull`, **Reiniciar** atualiza
  banco, front e back juntos. (O NihongoHub ainda roda `next dev`; é a exceção
  antiga, não o padrão.)
- **Para matando a árvore inteira**: sobe do PID que ouve na porta até o topo
  dos "andaimes" (`node.exe`, `cmd.exe`, `npm.exe`) e dá `taskkill /T /F`.
  Matar só o dono da porta deixaria os pais vivos.
- **Um relógio de 1 segundo** vigia a porta com `GetActiveTcpListeners()`
  (milissegundos). `Get-NetTCPConnection` custa centenas e travaria o menu;
  ele só é usado na hora de parar.
- **O navegador nunca abre sozinho**: nem ao subir, nem ao adotar. Só quando a
  pessoa pede.

### O ícone em si

O ícone é o **painel de estado**: balão some em quatro segundos, ícone fica.

| Ícone | Estado |
| --- | --- |
| colorido, **selo verde** | no ar |
| cinza, sem selo | subindo (passageiro, não vale alarme) |
| cinza, **selo vermelho** | caiu ou não subiu: veja o log |

Ele é montado em tempo de execução (`Novo-Bitmap`) a partir do
`apps\web\public\icon-192.png`: recortado em círculo de 32×32, cinza quando
apagado, e o selo no canto inferior direito com um anel preto, que o mantém
legível em bandeja clara ou escura. O desenho segue o do reWASD.

O PNG vem do `apps\web\scripts\gerar-icones.mjs` (`npm run icons`), que gera
`favicon.svg`, `icon-192.png` e `icon-512.png` a partir de **um SVG só**, com
o `sharp`. Trocou a marca, roda `npm run icons` e o tray, o favicon e o PWA
mudam juntos. O nome `icon-192.png` é fixo porque o tray aponta para ele.

**Balões** só para o que deu errado e para respostas de ações que não deixam
rastro na tela (como "Copiado: <link>"). Sucesso de rotina não interrompe:
quem diz que está tudo bem é o selo verde.

A **dica** do ícone (passar o mouse) diz o estado em texto. O Windows corta a
dica em 63 caracteres.

### O menu padrão

| Item | Obrigatório? | O que faz |
| --- | --- | --- |
| **Abrir no Edge** (negrito) | sim | Abre o app. Com o servidor parado, sobe ele e abre quando ficar no ar. É o que o **duplo clique** faz |
| Copiar link do tailnet | se publicado no tailnet | Copia `https://<máquina>.<tailnet>.ts.net:84xx`. No Trimly, "Copiar link do celular" |
| Abrir no VS Code | sim | Abre o `<Projeto>.code-workspace` (ou a pasta, se ele não existir) |
| Abrir a pasta do projeto | sim | Explorer na raiz desta cópia |
| — | | |
| **Publicar a versão nova** | sim | Roda `scripts\publicar.ps1` numa janela; só reinicia se ele sair com 0 |
| Reiniciar o servidor | sim | Derruba e sobe de novo. Serve para destravar, não para publicar |
| — | | |
| _Submenu de dependência_ | se houver | Ex.: **ComfyUI — _estado_** no Creativa |
| — | | |
| Fazer backup do banco | se tiver banco | `scripts\backup-banco.ps1` numa janela visível, com `-NoExit` |
| Iniciar com o Windows | sim | Marca liga/desliga o atalho de Startup (ver seção 5) |
| Ver o log | sim | `servidor.log` no Bloco de Notas |
| — | | |
| Sair | sim | Para o servidor, esconde o ícone (senão ele vira fantasma) e encerra |

Regras do menu:

- **Publicar** e **Reiniciar** ficam desabilitados enquanto o servidor está
  subindo ou uma publicação está aberta.
- "Abrir no VS Code" fica desabilitado se o VS Code não está instalado. A
  busca é pelo `Code.exe`, não pelo `code` do PATH: aquele é um `.cmd` e
  piscaria um console a cada clique.
- O que pode mudar por fora (atalho de Startup, VS Code) é relido a cada vez
  que o menu abre (`$menu.add_Opening`).
- Ao **Sair**, o tray só derruba uma dependência (como o ComfyUI) **se foi ele
  quem a iniciou**. O que foi aberto por fora, quem abriu é quem fecha.

### Publicar a versão nova: `scripts\publicar.ps1`

"Reiniciar" derruba o app antes de compilar: um erro ali deixa o site fora do
ar. O `publicar.ps1` faz antes tudo o que pode falhar, **com a versão antiga
ainda no ar**:

1. Mostra branch, commit e o que não foi commitado (o que vai ao ar é a pasta,
   não o `main`).
2. `npm run typecheck`.
3. `npm run test`, se o projeto tiver testes (o Trimly tem).
4. Build de conferência numa **pasta temporária**, nunca no `dist` de onde o
   servidor no ar está servindo: o Vite esvazia a pasta antes de escrever.
5. Backup do banco, porque o reinício aplica as migrações pendentes.
6. Sai com 0. Quem reinicia é o tray, quando vê o 0.

Com `-DaBandeja`, uma falha espera um Enter antes de fechar a janela, senão o
erro sumiria junto com ela.

---

## 5. Atalhos

| Atalho | Onde fica | Quem cria |
| --- | --- | --- |
| **`<Projeto>.cmd`** | raiz do projeto | versionado; é o atalho principal |
| **`<Projeto>.lnk`** | pasta Inicializar do usuário | o item "Iniciar com o Windows" do tray |
| **`<Projeto>.code-workspace`** | raiz do projeto | versionado; o tray abre por ele |
| Duplo clique no ícone | bandeja | = "Abrir no Edge" |

**Iniciar com o Windows** (`Definir-Inicio-Automatico` no `tray.ps1`):

- A pasta é pedida ao Windows com `[Environment]::GetFolderPath("Startup")`,
  porque o caminho muda com o idioma da instalação.
- O `.lnk` é criado com `WScript.Shell.CreateShortcut`, apontando para o
  `<Projeto>.cmd`, com `WorkingDirectory` na raiz e **`WindowStyle = 7`**
  (minimizado): o `.cmd` ainda confere Node e dependências num console, mas no
  login ele vai para a barra de tarefas em vez de saltar na tela.
- A marca do menu só fica ligada se o atalho existe **e** o `TargetPath` é
  esta cópia do projeto. Um atalho deixado por uma pasta antiga não conta.
- Depois de mudar, a marca é relida do arquivo: se a escrita falhou, ela volta.

O `.code-workspace` padrão esconde o que não se edita:

```json
{
  "folders": [{ "path": "." }],
  "settings": {
    "files.exclude": {
      "**/node_modules": true,
      "**/dist": true
    }
  }
}
```

Nenhum projeto cria atalho na área de trabalho ou no Menu Iniciar. O `.cmd`
na raiz, a bandeja e o Startup bastam. Se um dia quiser, siga o mesmo jeito do
Startup (`CreateShortcut`, alvo no `.cmd`), num item de menu que liga e desliga.

---

## 6. Banco de dados

PostgreSQL 17 desta máquina, porta **5432**, compartilhado por todos os
projetos. Cada projeto tem **o seu banco e o seu usuário, com o mesmo nome**.

### Criar: `scripts\criar-banco.ps1`

Copie o do Creativa ou do Trimly (são idênticos tirando o nome). Ele:

- Pede a senha do superusuário `postgres`, que só é usada ali e não fica
  gravada em lugar nenhum.
- Gera uma senha aleatória **só com letras e números** para o usuário do app:
  ela vai dentro de uma URL e de um literal SQL, e assim nenhum dos dois
  precisa de escape.
- `CREATE ROLE <projeto> WITH LOGIN CREATEDB` (o `CREATEDB` é para o banco-sombra
  do `prisma migrate dev`) e
  `CREATE DATABASE <projeto> OWNER <projeto> ENCODING UTF8 TEMPLATE template0`.
  O usuário não é superusuário e não enxerga os outros bancos.
- Acrescenta ao `.env`, em UTF-8 **sem** BOM:
  ```
  DATABASE_URL="postgresql://<projeto>:<senha>@127.0.0.1:5432/<projeto>?options=-c%20timezone%3DUTC"
  ```
  O `options=-c timezone=UTC` é obrigatório: sem ele o driver grava os
  horários 3 horas deslocados, em silêncio (lição do NihongoHub).
- **Para se o `.env` já tiver `DATABASE_URL`**: trocar a senha deixaria o app
  sem entrar num banco que já existe.
- Aplica as migrações.

### Backup: `scripts\backup-banco.ps1`

- Lê a conexão do `.env`, então funciona igual com o banco local ou pelo
  tailnet.
- `pg_dump -Fc` em `backups\<projeto>-<carimbo>.dump` (pasta no `.gitignore`).
- Confere o arquivo com `pg_restore -l` e guarda os últimos 10 (`-Manter`).
- Fica em `npm run backup` e no item "Fazer backup do banco" do tray.
- Só o banco: arquivos gerados em disco não entram no dump.

### Os dados são do usuário

Vale para todo projeto, e deve ir para o `CLAUDE.md` dele: nada de criar,
semear, editar ou apagar registros (nem "para testar"), nada de `truncate`,
`DELETE` ou `prisma migrate reset`. Migrações podem ser criadas e aplicadas
normalmente; o `reset` é que está fora. Antes de qualquer operação de risco
autorizada, `npm run backup`.

---

## 7. Acessar o banco de outra máquina (tailnet)

Para desenvolver no notebook (`dev`, `100.111.145.14`) com o banco aqui
(`x570-aorus`, **`100.65.76.22`**). A conexão passa por três portões, e os três
precisam estar abertos:

| Portão | Quem cuida | Como está |
| --- | --- | --- |
| `listen_addresses` no `postgresql.conf` | Postgres escutar fora do localhost | já é `'*'` — **não mexa** |
| Firewall do Windows na 5432 | o pacote chegar | **uma regra para todos**: `PostgreSQL - tailnet` |
| `pg_hba.conf` | o Postgres aceitar aquele banco/usuário | **uma linha por projeto** |

Hoje o `pg_hba.conf` tem uma linha para `mediaflow`, `creativa`, `trimly` e
`nihongohub`, todas no mesmo formato:

```
host    <projeto>    <projeto>    100.64.0.0/10    scram-sha-256
```

`100.64.0.0/10` é a faixa CGNAT do Tailscale: cobre qualquer máquina do
tailnet, agora e depois, e não é alcançável de fora dele. A senha continua
sendo exigida (`scram-sha-256`), então o tailnet é o primeiro portão, não o
único. Sem TLS de propósito: o Tailscale já cifra o túnel com WireGuard.

### Para liberar um projeto novo

Na máquina do banco, num PowerShell **como Administrador**:

```powershell
cd C:\Projetos\Creativa
.\scripts\liberar-banco-no-tailnet.ps1 -Banco <projeto>
```

O script do Creativa serve para **qualquer projeto** que siga o padrão banco =
usuário. Não precisa copiá-lo para o projeto novo. Ele:

1. **`pg_hba`:** se ainda não houver a linha daquele banco (confere banco
   **e** faixa), faz backup datado do `pg_hba.conf` e acrescenta a linha,
   usando o mesmo método de autenticação das linhas que já existem.
2. **Firewall:** garante a regra `PostgreSQL - tailnet` (TCP 5432, entrada,
   só de `100.64.0.0/10`, perfil Private). Se ela já existe, não faz nada.
3. **`listen_addresses`:** só confere e avisa se estiver errado. Nunca muda.
4. **Reload, nunca restart:** `pg_ctl reload`, só se o `pg_hba` mudou. O
   `pg_hba` é relido sem derrubar conexão nenhuma; um restart cortaria os
   outros projetos no meio do que estivessem fazendo.

Rodar de novo é seguro: cada passo confere o seu e só completa o que falta.

No notebook, o `.env` do projeto leva o mesmo `DATABASE_URL` daqui, trocando
só o host:

```
DATABASE_URL="postgresql://<projeto>:<mesma senha>@100.65.76.22:5432/<projeto>?options=-c%20timezone%3DUTC"
```

### Como saber que funcionou

O teste que vale é **conectar pelo IP do tailnet**, nunca por `127.0.0.1`
(loopback passa mesmo com o `pg_hba` fechado). Daqui, sem privilégio:

```powershell
psql -h 100.65.76.22 -U <projeto> -d <projeto> -c "SELECT 1"
```

Leia o erro, se houver:

| Erro | O que significa |
| --- | --- |
| `nenhuma entrada em pg_hba.conf para o hospedeiro ...` (`28000`) | Falta a linha do banco. Rode o script |
| `autenticação do tipo senha falhou` (`28P01`) | A liberação **funcionou**; a senha do `.env` está errada |
| timeout / `connection refused` **do notebook** | Firewall ou `listen_addresses`. Confira a regra `PostgreSQL - tailnet` |

Duas pegadinhas, medidas em 2026-10-03:

- **O teste daqui não prova o firewall.** Conectar no próprio IP do tailnet
  não passa por ele. O firewall só se prova de outra máquina: no notebook,
  `npx prisma migrate status` respondendo.
- **Não use `pg_conf_load_time()` para saber se o reload aconteceu.** Nesta
  instalação ele não acompanhou o reload do `pg_hba`. A prova é a conexão.

Também não dá para conferir pela view `pg_hba_file_rules`: ela exige
superusuário, e os usuários dos projetos levam "permissão negada".

### Scripts antigos que **não** seguem o padrão

| Script | Problema |
| --- | --- |
| `NihongoHub\scripts\abrir-banco-no-tailnet.ps1` | Cria **outra** regra de firewall (`NihongoHub PostgreSQL (tailnet)`), pode mudar o `listen_addresses` e faz **`Restart-Service`** no Postgres, derrubando todos os projetos. Não use; o NihongoHub já está liberado pelo do Creativa |
| `MediaFlow\scripts\abrir-banco-no-tailnet.ps1` | Já alinhado em 2026-10-03: usa a regra `PostgreSQL - tailnet` e confere banco e faixa. Serve só para o `mediaflow` |

### O que nunca fazer

- Linha `all all` ou faixa `0.0.0.0/0` no `pg_hba`. O superusuário `postgres`
  fica só em loopback: é ele que cria banco e restaura dump, e manter a
  recuperação presa a esta máquina impede que um acidente remoto seja total.
- Regra de firewall para a 5432 além da `PostgreSQL - tailnet`, ou fora do
  perfil Private.
- `tailscale funnel` (isso é a internet aberta). Só `serve`.
- Reiniciar o serviço do PostgreSQL para aplicar o `pg_hba`. Reload basta.

---

## 8. O app no tailnet: `scripts\publicar-no-tailnet.ps1`

Para abrir o app de outro PC ou do celular, com HTTPS de certificado válido
(`*.ts.net`) e nada para configurar à mão:

```powershell
tailscale serve --bg --https=<84xx> http://127.0.0.1:<x00>
```

Com `--bg`, o Tailscale guarda a configuração e a refaz depois de reiniciar a
máquina, então o script roda uma vez só. Ele tem `-Desligar` e, no fim,
imprime o endereço. Modelo: o do Creativa ou do Trimly.

---

## 9. Checklist do projeto novo

- [ ] Escolher a centena de portas (seção 2) e anotar nas tabelas.
- [ ] `<Projeto>.cmd` com fallback do fnm.
- [ ] `<Projeto>.code-workspace`.
- [ ] `GET /api/saude` → `{ app: "<Projeto>", ok: true }`.
- [ ] `npm run servir` = migrar + build + start na `x00`.
- [ ] `apps\web\scripts\gerar-icones.mjs` com a marca em SVG; `npm run icons`.
- [ ] `scripts\tray.ps1` (UTF-8 com BOM): nome, Mutex, portas, menu padrão.
- [ ] `scripts\publicar.ps1`, com a etapa de testes se houver testes.
- [ ] `scripts\criar-banco.ps1` e `scripts\backup-banco.ps1`; `npm run backup`.
- [ ] `backups\` no `.gitignore`.
- [ ] `.env.example` com as variáveis do app, comentadas.
- [ ] `scripts\publicar-no-tailnet.ps1` com a porta `84xx`.
- [ ] Liberar o banco no tailnet: `liberar-banco-no-tailnet.ps1 -Banco <projeto>`
      (do Creativa), como Administrador.
- [ ] Testar o banco do notebook (`npx prisma migrate status`).
- [ ] `CLAUDE.md` com: portas, regra de "os dados são do usuário", UTF-8 com
      BOM nos `.ps1`, e `npm run typecheck` + `npm run build` antes de concluir.
