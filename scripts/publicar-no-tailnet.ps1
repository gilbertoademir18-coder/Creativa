<#
.SYNOPSIS
    Publica o Creativa (8444) e o ComfyUI (8445) no tailnet, em HTTPS.

.DESCRIPTION
    Os outros PCs chegam ao app pelo Tailscale. O `tailscale serve` entrega
    HTTPS com certificado válido para o nome da máquina no tailnet
    (`*.ts.net`), sem nada a configurar à mão.

    Nesta máquina a 443 já é de outro app e a 8443 é do Trimly, então o
    Creativa fica na 8444 e o ComfyUI na 8445. Só quem está no seu tailnet
    enxerga os endereços — não é a internet aberta (isso seria o
    `tailscale funnel`, que não usamos).

    O ComfyUI publicado é para abrir a interface dele de outro PC (o botão
    "Abrir o ComfyUI" da barra do topo). Para gerar, o Creativa nem precisa
    dele: quem fala com o ComfyUI é o servidor, nesta máquina.

    Roda uma vez: com `--bg` o Tailscale guarda a configuração e a refaz
    sozinho depois de reiniciar a máquina.

.EXAMPLE
    .\scripts\publicar-no-tailnet.ps1

.EXAMPLE
    .\scripts\publicar-no-tailnet.ps1 -Desligar
#>

[CmdletBinding()]
param(
    [int]$PortaHttps = 8444,
    [int]$PortaApp = 3400,
    [int]$PortaHttpsComfy = 8445,
    [int]$PortaComfy = 8188,
    [switch]$Desligar
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) {
    Write-Host "  x Não achei o tailscale.exe no PATH." -ForegroundColor Red
    exit 1
}

if ($Desligar) {
    & tailscale serve "--https=$PortaHttps" off
    & tailscale serve "--https=$PortaHttpsComfy" off
    exit $LASTEXITCODE
}

& tailscale serve --bg "--https=$PortaHttps" "http://127.0.0.1:$PortaApp"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& tailscale serve --bg "--https=$PortaHttpsComfy" "http://127.0.0.1:$PortaComfy"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$nome = (& tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd(".")
Write-Host ""
Write-Host "  Creativa no tailnet: https://${nome}:$PortaHttps" -ForegroundColor Green
Write-Host "  ComfyUI no tailnet:  https://${nome}:$PortaHttpsComfy" -ForegroundColor Green
