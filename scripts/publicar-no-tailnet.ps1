<#
.SYNOPSIS
    Publica o Creativa no tailnet, em HTTPS, na porta 8444.

.DESCRIPTION
    Os outros PCs chegam ao app pelo Tailscale. O `tailscale serve` entrega
    HTTPS com certificado válido para o nome da máquina no tailnet
    (`*.ts.net`), sem nada a configurar à mão.

    Nesta máquina a 443 já é de outro app e a 8443 é do Trimly, então o
    Creativa fica na 8444. Só quem está no seu tailnet enxerga o endereço —
    não é a internet aberta (isso seria o `tailscale funnel`, que não usamos).

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
    [switch]$Desligar
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command tailscale.exe -ErrorAction SilentlyContinue)) {
    Write-Host "  x Não achei o tailscale.exe no PATH." -ForegroundColor Red
    exit 1
}

if ($Desligar) {
    & tailscale serve "--https=$PortaHttps" off
    exit $LASTEXITCODE
}

& tailscale serve --bg "--https=$PortaHttps" "http://127.0.0.1:$PortaApp"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$nome = (& tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd(".")
Write-Host ""
Write-Host "  Creativa no tailnet: https://${nome}:$PortaHttps" -ForegroundColor Green
