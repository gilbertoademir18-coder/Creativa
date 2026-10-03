<#
.SYNOPSIS
    Libera um banco deste PostgreSQL para as outras máquinas do tailnet.

.DESCRIPTION
    Roda **na máquina onde o banco mora** (x570-aorus), como Administrador.

    O `criar-banco.ps1` deixa o Postgres atendendo só em 127.0.0.1 no
    `pg_hba.conf`: é o certo quando a API roda na mesma máquina. Para
    desenvolver de outro PC — API no notebook, banco e GPU aqui — falta uma
    linha dizendo que a faixa do Tailscale pode entrar.

    Sem isso, a conexão chega e é recusada antes de olhar a senha:

        FATAL: nenhuma entrada em pg_hba.conf para o hospedeiro "100.x.y.z",
               usuário "creativa", banco de dados "creativa"

    Um banco por vez, e só o usuário dele: os bancos dos outros projetos
    continuam invisíveis de fora. Serve a qualquer projeto que siga o padrão
    banco = usuário (Creativa, Trimly, NihongoHub, MediaFlow):

        .\scripts\liberar-banco-no-tailnet.ps1
        .\scripts\liberar-banco-no-tailnet.ps1 -Banco trimly

    Além da linha no pg_hba, garante a regra de firewall "PostgreSQL - tailnet"
    (TCP 5432, só da faixa do tailnet, perfil Private) — uma para todos os
    bancos, com o mesmo nome que o script do MediaFlow usa. Sem ela o pg_hba
    fica certo e o pacote nem chega.

    O tráfego vai sem TLS, e isso é de propósito: o Tailscale já cifra tudo
    com WireGuard, e a faixa 100.64.0.0/10 só é alcançável por dentro do
    tailnet. Pôr TLS por cima seria cifrar duas vezes o mesmo túnel.

    Rodar de novo é seguro: cada passo confere o seu e só completa o que
    falta. O reload só acontece se o pg_hba mudou.

.EXAMPLE
    .\scripts\liberar-banco-no-tailnet.ps1

.EXAMPLE
    .\scripts\liberar-banco-no-tailnet.ps1 -Banco trimly

.EXAMPLE
    .\scripts\liberar-banco-no-tailnet.ps1 -Faixa 100.111.145.14/32
#>

[CmdletBinding()]
param(
    # O banco a liberar. Cada projeto tem o seu, com um usuário de mesmo nome.
    [string]$Banco = "creativa",

    # O usuário. Vazio = o mesmo nome do banco, como o criar-banco.ps1 cria.
    [string]$Usuario = "",

    # A faixa CGNAT do Tailscale (100.64.0.0 – 100.127.255.255). Um /32 de um
    # nó só também serve, se preferir liberar uma máquina de cada vez.
    [string]$Faixa = "100.64.0.0/10",

    [int]$Porta = 5432
)

$ErrorActionPreference = "Stop"
if (-not $Usuario) { $Usuario = $Banco }

function Erro([string]$t) { Write-Host "  x $t" -ForegroundColor Red }
function Feito([string]$t) { Write-Host "  - $t" -ForegroundColor Green }
function Nota([string]$t) { Write-Host "  . $t" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "Liberar o banco '$Banco' (usuário '$Usuario') para $Faixa" -ForegroundColor Cyan
Write-Host ""

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Erro "Rode como Administrador: o pg_hba.conf fica em C:\Program Files."
    exit 1
}

# A pasta de dados da instalação mais nova, como no criar-banco.ps1: a versão
# instalada pode mudar e não vale fixar no script.
$dados = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [int]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName "data" } |
    Where-Object { Test-Path (Join-Path $_ "pg_hba.conf") } |
    Select-Object -First 1
if (-not $dados) { Erro "Não achei a pasta data do PostgreSQL. Ele está instalado aqui?"; exit 1 }

$hba = Join-Path $dados "pg_hba.conf"
Nota "pg_hba.conf: $hba"

# As linhas `host` que já existem, partidas em campos:
#   TIPO  BANCO  USUÁRIO  ENDEREÇO  MÉTODO
$hosts = @()
foreach ($l in Get-Content $hba) {
    if ($l -match '^\s*#') { continue }
    if ($l -notmatch '^\s*host\S*\s+') { continue }
    $c = @(($l -split '\s+') | Where-Object { $_ })
    if ($c.Count -ge 5) { $hosts += ,@{ linha = $l.Trim(); campos = $c } }
}

# Três passos independentes — pg_hba, firewall, reload —, cada um conferindo
# o seu: rodar de novo completa o que faltou, em vez de sair no primeiro
# "já está lá".

# --- 1. pg_hba.conf ---------------------------------------------------------
# Já liberado? Confere banco **e** endereço: depois de liberar o creativa, a
# faixa existe no arquivo, mas não para o trimly. (Olhar só a faixa daria
# "já está lá" para um banco que segue barrado.)
$jaTem = $hosts | Where-Object {
    $_.campos[3] -eq $Faixa -and ($_.campos[1] -eq $Banco -or $_.campos[1] -eq "all")
}
$mudouHba = $false
if ($jaTem) {
    Feito "pg_hba: '$Banco' já está liberado para $Faixa"
    Nota ($jaTem | Select-Object -First 1).linha
} else {
    # O método de autenticação das linhas host que já existem, em vez de fixar
    # um: uma instalação antiga pode estar em md5, e misturar métodos confunde.
    $metodo = "scram-sha-256"
    if ($hosts.Count -gt 0) { $metodo = $hosts[0].campos[4] }
    Nota "método de autenticação: $metodo (o mesmo das linhas host que já existem)"

    # O Postgres relê o pg_hba.conf sem reiniciar, mas um erro de digitação
    # aqui tranca todo mundo para fora. O backup é o caminho de volta.
    $copia = "$hba.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item $hba $copia
    Feito "backup: $copia"

    $regra = @"

# $Banco`: desenvolver de outro PC do tailnet (API no notebook, banco aqui).
# Só o banco $Banco e só o usuário $Usuario; os outros projetos seguem
# invisíveis de fora. Sem TLS de propósito: o Tailscale já cifra o túnel, e
# esta faixa não existe fora dele. (scripts\liberar-banco-no-tailnet.ps1)
host    $Banco    $Usuario    $Faixa    $metodo
"@

    # UTF-8 sem BOM e sem mexer no resto do arquivo: o Postgres lê o
    # pg_hba.conf como texto simples, e um BOM no meio dele viraria lixo.
    [IO.File]::AppendAllText($hba, $regra.Replace("`n", "`r`n"), (New-Object Text.UTF8Encoding $false))
    Feito "pg_hba: regra acrescentada: host $Banco $Usuario $Faixa $metodo"
    $mudouHba = $true
}

# --- 2. Firewall ------------------------------------------------------------
# O pg_hba diz quem entra; o firewall diz se o pacote chega. Uma regra só, para
# a porta, servindo a todos os bancos — quem separa um projeto do outro é o
# pg_hba. O nome é o mesmo no script do MediaFlow: quem rodar primeiro cria, o
# outro reconhece.
#
# ⚠️ Testar daqui não prova o firewall: conectar no próprio IP do tailnet não
# passa por ele. Só outra máquina enxerga a porta fechada.
$nomeFirewall = "PostgreSQL - tailnet"
$fw = Get-NetFirewallRule -DisplayName $nomeFirewall -ErrorAction SilentlyContinue
if ($fw) {
    $de = @(($fw | Get-NetFirewallAddressFilter).RemoteAddress) -join ", "
    Feito "firewall: '$nomeFirewall' já existe (de $de)"
} else {
    # Perfil Private: é onde a interface do Tailscale está. O RemoteAddress
    # limita à faixa do tailnet, então a porta não fica aberta na rede do
    # escritório nem num wi-fi qualquer.
    New-NetFirewallRule -DisplayName $nomeFirewall -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort $Porta -RemoteAddress $Faixa -Profile Private | Out-Null
    Feito "firewall: '$nomeFirewall' criada (TCP $Porta, entrada, só de $Faixa, perfil Private)"
}
$perfilTs = Get-NetConnectionProfile -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -like "Tailscale*" } | Select-Object -First 1
if ($perfilTs -and "$($perfilTs.NetworkCategory)" -ne "Private") {
    Erro "A rede do Tailscale está como $($perfilTs.NetworkCategory), e a regra só vale no perfil Private."
    Nota "Mude a rede 'Tailscale' para Privada nas configurações de rede do Windows."
}

# --- 3. listen_addresses ----------------------------------------------------
# Sem isso o Postgres nem escuta na placa do tailnet, e a conexão morre antes
# de chegar ao pg_hba. Só conferido, nunca mudado — é a configuração do
# servidor do usuário.
$conf = Join-Path $dados "postgresql.conf"
if (Test-Path $conf) {
    $escuta = Get-Content $conf | Where-Object { $_ -match '^\s*listen_addresses\s*=' } | Select-Object -Last 1
    if ($escuta -and $escuta -notmatch "'\*'" -and $escuta -notmatch '100\.') {
        Write-Host ""
        Erro "Atenção: $($escuta.Trim())"
        Nota "Para atender no tailnet, isso precisa ser '*' (ou incluir o IP 100.x)."
        Nota "Mude à mão em $conf e reinicie o serviço do PostgreSQL."
    } else {
        Feito "listen_addresses já atende fora do localhost"
    }
}

# --- 4. Reload --------------------------------------------------------------
# Recarregar, e não reiniciar: mudança no pg_hba.conf só precisa de um reload,
# e assim nenhuma geração em andamento perde a conexão. O pg_ctl, como
# Administrador, sinaliza o Postgres direto — sem pedir a senha do postgres.
if ($mudouHba) {
    $pgctl = Join-Path (Split-Path $dados -Parent) "bin\pg_ctl.exe"
    if (-not (Test-Path $pgctl)) {
        Erro "Não achei o pg_ctl em $pgctl. Reinicie o serviço do PostgreSQL para valer."
        exit 1
    }
    $ErrorActionPreference = "Continue"
    $saida = & $pgctl reload -D $dados 2>&1
    $ErrorActionPreference = "Stop"
    if ($LASTEXITCODE -ne 0) {
        Erro ($saida | Out-String).Trim()
        Nota "A regra está no arquivo. Reinicie o serviço do PostgreSQL para valer."
        exit 1
    }
    Feito "configuração recarregada (sem reiniciar, ninguém perdeu conexão)"
}

Write-Host ""
Write-Host "Pronto! Outro PC do tailnet consegue entrar no banco '$Banco'." -ForegroundColor Cyan