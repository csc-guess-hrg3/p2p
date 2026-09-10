<#
.SYNOPSIS
  Deploy do P2P para o servidor .21 (I:\p2p) - frontend e/ou backend.

.DESCRIPTION
  Codifica as licoes que aprendemos na marra:

  1. COPIA ATOMICA DO FRONTEND: os pedacos (chunks) do site tem nome com hash.
     Se o index.html novo chega ANTES dos chunks que ele referencia, quem
     carregar naquela janela leva "Failed to fetch dynamically imported module".
     -> Copiamos TUDO menos o index.html primeiro; o index.html vai por ULTIMO.

  2. NUNCA /MIR: /MIR apaga os chunks antigos do destino e derruba as sessoes
     que ja estavam abertas (elas ainda pedem os chunks velhos). Sempre /E
     (aditivo) - os antigos ficam, as sessoes abertas continuam vivas.

  3. RASTREIO: cada deploy grava no log de I:\p2p qual commit (SHA) subiu e se
     a arvore estava suja (codigo nao commitado). E o "o que esta no ar".

  O backend roda no .21 via pm2 (processo p2p-api-prod). Este script NAO
  reinicia o pm2 - ele roda no .21, nao daqui. O script copia o dist e
  imprime o comando exato pra voce rodar la.

.PARAMETER Target
  frontend (padrao) | backend | both

.PARAMETER SkipBuild
  Copia o dist atual sem rebuildar (ex.: re-subir a mesma build).

.PARAMETER DeployRoot
  Raiz do destino no .21. Padrao: I:\p2p

.EXAMPLE
  .\deploy.ps1                 # build + deploy do frontend (sem downtime)
  .\deploy.ps1 -Target both    # frontend + backend (backend pede pm2 restart no .21)
  .\deploy.ps1 -Target backend # so backend
#>

[CmdletBinding()]
param(
  [ValidateSet('frontend', 'backend', 'both')]
  [string]$Target = 'frontend',
  [switch]$SkipBuild,
  [string]$DeployRoot = 'I:\p2p'
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$doFront = $Target -in @('frontend', 'both')
$doBack  = $Target -in @('backend', 'both')

function Say  ($m) { Write-Host $m -ForegroundColor Cyan }
function Ok   ($m) { Write-Host $m -ForegroundColor Green }
function Warn ($m) { Write-Host $m -ForegroundColor Yellow }
function Die  ($m) { Write-Host $m -ForegroundColor Red; exit 1 }

# robocopy: 0..7 = sucesso (flags de bits); >=8 = erro real.
function Invoke-Robocopy {
  param([string]$Src, [string]$Dst, [string[]]$Extra)
  $roboArgs = @($Src, $Dst, '/E', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NP') + $Extra
  robocopy @roboArgs | Out-Null
  if ($LASTEXITCODE -ge 8) { Die "robocopy falhou ($Src -> $Dst), exit $LASTEXITCODE" }
}

# ---------------------------------------------------------------------------
# Estado do git - o que esta subindo
# ---------------------------------------------------------------------------
Push-Location $repo
$branch = (git branch --show-current 2>$null)
$sha    = (git rev-parse --short HEAD 2>$null)
$dirty  = [bool]((git status --porcelain 2>$null) | Select-Object -First 1)
$backendChanged = [bool]((git status --porcelain backend 2>$null) | Select-Object -First 1)
Pop-Location

Say "P2P deploy  |  target=$Target  branch=$branch  sha=$sha  destino=$DeployRoot"
if ($dirty) {
  Warn "AVISO: arvore de trabalho SUJA (ha codigo nao commitado)."
  Warn "       O que sobe agora NAO corresponde a um commit limpo - rollback fica manual."
  Warn "       Recomendado: commitar antes de subir. Prosseguindo mesmo assim (carimbado no log)."
}
# Nudge: mexeu no backend mas esta subindo so o frontend?
if ($doFront -and -not $doBack -and $backendChanged) {
  Warn "NOTA: ha alteracoes em backend/ mas voce esta subindo SO o frontend."
  Warn "      Se essas mudancas precisam ir pro ar, rode: .\deploy.ps1 -Target both"
}

$entryChunk = $null

# ---------------------------------------------------------------------------
# FRONTEND
# ---------------------------------------------------------------------------
if ($doFront) {
  $frontSrc = Join-Path $repo 'frontend'
  $distSrc  = Join-Path $frontSrc 'dist'
  $distDst  = Join-Path $DeployRoot 'frontend\dist'

  if (-not $SkipBuild) {
    Say "`n[frontend] build (tsc -b && vite build)..."
    Push-Location $frontSrc
    npm run build
    $bc = $LASTEXITCODE
    Pop-Location
    if ($bc -ne 0) { Die "[frontend] build falhou (exit $bc)." }
    Ok "[frontend] build OK"
  } else {
    Warn "[frontend] -SkipBuild: usando o dist atual sem rebuildar"
  }

  if (-not (Test-Path (Join-Path $distSrc 'index.html'))) {
    Die "[frontend] dist nao encontrado em $distSrc - build nao gerou o index.html."
  }

  # Qual e o chunk de entrada nesta build (pra verificar depois que subiu)
  $idxSrc = Get-Content (Join-Path $distSrc 'index.html') -Raw
  if ($idxSrc -match '/assets/(index-[^"]+\.js)') { $entryChunk = $Matches[1] }

  Say "[frontend] copiando ASSETS primeiro (aditivo, /E; index.html fica pro fim)..."
  # Passo 1: tudo menos o index.html - garante que os chunks novos existam
  #          ANTES do index.html novo apontar pra eles.
  Invoke-Robocopy -Src $distSrc -Dst $distDst -Extra @('/XF', 'index.html')

  Say "[frontend] copiando index.html por ULTIMO (troca o ponteiro pros chunks novos)..."
  Copy-Item (Join-Path $distSrc 'index.html') (Join-Path $distDst 'index.html') -Force

  # Verificacao: o index.html que ficou no ar aponta pra um chunk que existe?
  if ($entryChunk) {
    $landed = Test-Path (Join-Path $distDst "assets\$entryChunk")
    $idxDst = Get-Content (Join-Path $distDst 'index.html') -Raw
    if ($landed -and $idxDst -match [regex]::Escape($entryChunk)) {
      Ok "[frontend] no ar: index.html -> assets\$entryChunk (presente)"
    } else {
      Die "[frontend] VERIFICACAO FALHOU: index.html aponta pra $entryChunk que nao esta no destino."
    }
  } else {
    Ok "[frontend] copiado (nao consegui identificar o chunk de entrada pra verificar)"
  }
}

# ---------------------------------------------------------------------------
# BACKEND
# ---------------------------------------------------------------------------
if ($doBack) {
  $backSrc = Join-Path $repo 'backend'
  $distSrc = Join-Path $backSrc 'dist'
  $distDst = Join-Path $DeployRoot 'backend\dist'

  if (-not $SkipBuild) {
    Say "`n[backend] build (nest build)..."
    Push-Location $backSrc
    npm run build
    $bc = $LASTEXITCODE
    Pop-Location
    if ($bc -ne 0) { Die "[backend] build falhou (exit $bc)." }
    Ok "[backend] build OK"
  } else {
    Warn "[backend] -SkipBuild: usando o dist atual sem rebuildar"
  }

  if (-not (Test-Path (Join-Path $distSrc 'src\main.js'))) {
    Die "[backend] dist\src\main.js nao encontrado - build nao gerou a saida esperada."
  }

  Say "[backend] copiando dist (aditivo, /E)..."
  # O processo pm2 que esta rodando ja carregou o codigo na memoria - sobrescrever
  # os .js no disco nao afeta nada ate o restart. A troca acontece no pm2 restart.
  Invoke-Robocopy -Src $distSrc -Dst $distDst -Extra @()
  Ok "[backend] dist copiado"
  Warn "`n[backend] ACAO NECESSARIA no .21 (o pm2 roda la, nao daqui):"
  Warn "          pm2 restart p2p-api-prod"
}

# ---------------------------------------------------------------------------
# Registro do deploy (o "o que esta no ar")
# ---------------------------------------------------------------------------
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$dirtyTag = if ($dirty) { 'DIRTY' } else { 'clean' }
$logLine = "$stamp | target=$Target | branch=$branch | sha=$sha | $dirtyTag | entry=$entryChunk | by=$env:USERNAME"
$logPath = Join-Path $DeployRoot '.deploy-history.log'
try {
  Add-Content -Path $logPath -Value $logLine -Encoding utf8
  $current = [ordered]@{
    at = $stamp; target = $Target; branch = $branch; sha = $sha
    dirty = $dirty; entryChunk = $entryChunk; by = $env:USERNAME
  }
  $current | ConvertTo-Json | Set-Content -Path (Join-Path $DeployRoot '.deployed.json') -Encoding utf8
  Ok "`nRegistrado em $logPath"
} catch {
  Warn "`nNao consegui gravar o log de deploy em $logPath ($($_.Exception.Message)) - deploy dos arquivos OK mesmo assim."
}

Ok "Deploy concluido: $logLine"
if ($doFront) { Say "Frontend vale no refresh (Cloudflare respeita no-cache do index.html)." }
if ($doBack)  { Warn "Backend so vale DEPOIS do 'pm2 restart p2p-api-prod' no .21." }

# Sai 0 no sucesso. Sem isso, o processo herda o exit do ultimo robocopy
# (3 = "copiou + havia extras"), que qualquer chamador leria como falha.
# Falhas reais ja sairam com 'exit 1' via Die().
exit 0
