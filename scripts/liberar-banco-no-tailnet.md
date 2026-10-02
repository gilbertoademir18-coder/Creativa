# Para o Claude da máquina de casa: liberar os bancos no tailnet

Cole isto no Claude Code rodando **na máquina de casa** (`x570-aorus`), que é
onde o PostgreSQL mora. O trabalho é de servidor, não de código: mexe num
arquivo de configuração do Postgres e recarrega. Leva um minuto.

## O problema

O notebook (`dev`, `100.111.145.14`) tem o Creativa instalado e vai mexer no
código de lá, com o banco e a GPU aqui. A conexão chega, e o Postgres a
recusa **antes de olhar a senha**:

```
28000 FATAL: nenhuma entrada em pg_hba.conf para o hospedeiro "100.111.145.14",
             usuário "creativa", banco de dados "creativa", sem encriptação
             (routine: ClientAuthentication)
```

O motivo: o `criar-banco.ps1` roda com `-Hospedeiro 127.0.0.1`, porque foi
feito para o caso normal — API e banco na mesma máquina. O `pg_hba.conf` só
conhece o localhost, e qualquer outro PC é um estranho.

**O mesmo vale para o Trimly**: banco `trimly`, usuário `trimly`, no mesmo
servidor 5432. Libere os dois.

Já está descartado, então não investigue: o `listen_addresses` está correto.
Se não estivesse, a conexão nem chegaria ao `ClientAuthentication` — morreria
antes, no TCP. As portas 5432, 8444 e 8445 respondem do notebook.

## O que fazer

O script `scripts\liberar-banco-no-tailnet.ps1` (já está no repo — dê
`git pull` se não aparecer) faz tudo. Rode uma vez por banco, **como
Administrador**:

```powershell
.\scripts\liberar-banco-no-tailnet.ps1
.\scripts\liberar-banco-no-tailnet.ps1 -Banco trimly
```

Ele pede a senha do usuário `postgres` no fim, só para recarregar a
configuração. Acrescenta uma linha por banco:

```
host    creativa    creativa    100.64.0.0/10    scram-sha-256
host    trimly      trimly      100.64.0.0/10    scram-sha-256
```

`100.64.0.0/10` é a faixa CGNAT do Tailscale: cobre qualquer máquina do
tailnet, agora e depois, sem precisar voltar aqui a cada aparelho novo. Quem
não está no tailnet não alcança esses endereços — o Tailscale é o porteiro.

### Sobre rodar como Administrador

O `pg_hba.conf` fica em `C:\Program Files\PostgreSQL\<versão>\data`, então
precisa de elevação, e **o Claude Code não consegue se elevar sozinho**. Se a
sessão não estiver elevada, o script sai com
`Rode como Administrador` — nesse caso peça ao usuário para abrir um
PowerShell como Administrador e rodar as duas linhas acima. Não tente
contornar a elevação.

## O que você está autorizado a fazer

- Editar o `pg_hba.conf` (o script já faz backup com timestamp antes).
- Recarregar a configuração do Postgres com `SELECT pg_reload_conf()`.
- Ler o `postgresql.conf` para conferir o `listen_addresses`.

## O que você NÃO deve fazer

- **Não toque nos dados.** Nada de `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`
  ou `prisma migrate reset` em banco nenhum. Isto é um ajuste de acesso, não
  de conteúdo.
- **Não reinicie o serviço do PostgreSQL** sem precisar. Mudança no
  `pg_hba.conf` só pede um *reload*, e um restart derrubaria as conexões do
  Creativa e do Trimly que estiverem no ar — possivelmente no meio de uma
  geração na GPU.
- **Não mude o `listen_addresses`.** Já está certo. Se parecer errado, avise
  o usuário em vez de editar.
- **Não abra o Postgres para a internet.** Só a faixa do tailnet. Nada de
  `0.0.0.0/0`, nada de regra nova no firewall para a porta 5432.
- **Não mexa nos arquivos gerados** (`D:\Creativa`) nem nos backups.

## Como saber que funcionou

O teste de verdade é do notebook, não daqui — quem tem que entrar é ele. Mas
daqui você pode confirmar que o arquivo e o reload estão certos:

```powershell
# As linhas host do pg_hba (confirme que as duas novas estão lá)
Select-String -Path "C:\Program Files\PostgreSQL\*\data\pg_hba.conf" -Pattern '^\s*host' |
    ForEach-Object { $_.Line }
```

Depois avise o usuário para voltar ao notebook. Lá, `npx prisma migrate status`
em `apps\api` deve mostrar as migrações em dia em vez de `P1010`.

Se o notebook passar a dar `28P01 password authentication failed`, não é mais
este problema: aí a liberação funcionou e o que está errado é a senha no
`.env` de lá. A senha correta é a do `DATABASE_URL` do `.env` **desta**
máquina — ajude o usuário a comparar.

## Se algo der errado

O script copia o `pg_hba.conf` para `pg_hba.conf.bak-<data>-<hora>` antes de
escrever. Para voltar atrás: restaure a cópia e rode
`SELECT pg_reload_conf()`. Um `pg_hba.conf` quebrado tranca todo mundo para
fora, inclusive o app desta máquina — por isso o backup.
