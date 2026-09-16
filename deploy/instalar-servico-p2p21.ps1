# Instala um backend do P2P como SERVICO DO WINDOWS na .21 (mesmo molde do SYNC: NSSM, conta LocalSystem).
# Sobe no boot sem ninguem logado, reinicia sozinho se cair, nao depende de perfil de usuario nem de pm2.
#
# DIFERENCAS em relacao ao SYNC (importantes):
#   * As variaveis de ambiente NAO vem de um .env em disco (o .env do backend e HML e nao pode reger a PROD).
#     Elas sao lidas do bloco escolhido do pm2.config.js e injetadas no servico (mesma fonte que o pm2 usa hoje).
#   * O diretorio de trabalho e a pasta backend, para o app achar ..\frontend\dist (igual ao cwd do pm2).
#
# Uso: no PROPRIO servidor .21 (RDP), como Administrador, a partir do caminho LOCAL do projeto.
#   PROD (porta 3000):  C:\Integracoes\p2p\deploy\instalar-servico-p2p21.ps1
#   HML  (porta 3001):  C:\Integracoes\p2p\deploy\instalar-servico-p2p21.ps1 -Block p2p-api-hml
# (nao rode pela rede / caminho \\...\ : servico LocalSystem nao acessa share no boot.)

param(
  [ValidateSet('p2p-api-prod', 'p2p-api-hml')]
  [string]$Block = 'p2p-api-prod',
  [string]$ServiceName
)

if (-not $ServiceName) { $ServiceName = if ($Block -eq 'p2p-api-hml') { 'P2PApiHml' } else { 'P2PApi' } }

$saida = Join-Path $PSScriptRoot ("saida_instalar-servico-p2p21_" + $ServiceName + ".txt")
try { Start-Transcript -Path $saida -Force | Out-Null } catch {}
Write-Host ("Inicio: " + (Get-Date -Format "dd/MM/yyyy HH:mm:ss") + "  usuario: $env:USERDOMAIN\$env:USERNAME  admin: " + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
Write-Host ("Bloco: $Block   Servico: $ServiceName") -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
try {
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path              # ...\p2p  (raiz do projeto)
if ($repo -like '\\*') { throw "Rode a partir do caminho LOCAL da .21 (ex.: C:\Integracoes\p2p\deploy\instalar-servico-p2p21.ps1), nao pela rede ($repo). Servico LocalSystem nao acessa share no boot." }
$backend = Join-Path $repo "backend"
$node    = "C:\Program Files\nodejs\node.exe"
$entry   = Join-Path $backend "dist\src\main.js"
$pm2cfg  = Join-Path $backend "pm2.config.js"
$logDir  = Join-Path $backend "logs"
$nssm    = @('C:\ProgramData\pm2\nssm.exe', 'C:\nssm-2.24-101-g897c7ad\win64\nssm.exe') | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $nssm)                { throw "nssm.exe nao encontrado (esperado em C:\ProgramData\pm2 ou C:\nssm-2.24-101-g897c7ad\win64)" }
if (-not (Test-Path $node))    { throw "Node nao encontrado em $node" }
if (-not (Test-Path $entry))   { throw "Build nao encontrado ($entry) - rode 'npm run build' no backend antes" }
if (-not (Test-Path $pm2cfg))  { throw "pm2.config.js nao encontrado ($pm2cfg) - preciso dele para pegar as variaveis" }
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Write-Host "repo:    $repo`nbackend: $backend`nentry:   $entry`nnssm:    $nssm" -ForegroundColor Cyan

Write-Host "`n[1/6] Lendo as variaveis do bloco $Block (pm2.config.js)..." -ForegroundColor Cyan
$json = & $node -e "const c=require(process.argv[1]);const a=(c.apps||[]).find(x=>x.name===process.argv[2]);if(!a){process.stderr.write('bloco nao encontrado');process.exit(3);}process.stdout.write(JSON.stringify(a.env||{}));" $pm2cfg $Block
if ($LASTEXITCODE -ne 0 -or -not $json) { throw "Falha ao ler o env do bloco $Block do pm2.config.js" }
$envObj = $json | ConvertFrom-Json
$envPairs = @()
foreach ($p in $envObj.PSObject.Properties) { $envPairs += ("{0}={1}" -f $p.Name, $p.Value) }
# NAO imprime valores (tem segredos). So confirma quais chaves e o banco de destino.
Write-Host ("  variaveis lidas: " + (($envObj.PSObject.Properties.Name) -join ', ')) -ForegroundColor DarkGray
Write-Host ("  DESTINO -> NODE_ENV=" + $envObj.NODE_ENV + "  PORT=" + $envObj.PORT + "  DB_HOST=" + $envObj.DB_HOST + "  DB_NAME=" + $envObj.DB_NAME) -ForegroundColor Yellow
# Guarda de sanidade: o env lido tem que bater com o bloco pedido (nao trocar PROD por HML sem querer).
if ($Block -eq 'p2p-api-prod' -and ("$($envObj.DB_NAME)" -ne 'P2P_DB' -or "$($envObj.DB_HOST)" -eq '192.168.10.34')) { throw "ABORTADO: bloco prod nao aponta pra PROD (esperado DB_HOST 192.168.10.5 / DB_NAME P2P_DB)." }
if ($Block -eq 'p2p-api-hml'  -and "$($envObj.DB_NAME)" -notmatch 'HML') { throw "ABORTADO: bloco hml nao aponta pra HML (esperado DB_NAME HML_P2P_DB)." }

Write-Host "`n[2/6] Tirando p2p-api-prod e p2p-api-hml do pm2 deste usuario (para nao disputar as portas)..." -ForegroundColor Cyan
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
  pm2 delete p2p-api-prod 2>$null | Out-Null
  pm2 delete p2p-api-hml  2>$null | Out-Null
  pm2 save 2>$null | Out-Null
  Write-Host "  removidos do pm2 (se existiam) e pm2 save feito."
} else {
  Write-Host "  pm2 nao esta no PATH desta sessao. Remova manualmente na sessao do Administrador dona do pm2:" -ForegroundColor Yellow
  Write-Host "     pm2 delete p2p-api-prod ; pm2 delete p2p-api-hml ; pm2 save" -ForegroundColor Yellow
}

Write-Host "`n[3/6] Instalando o servico $ServiceName (LocalSystem)..." -ForegroundColor Cyan
& $nssm stop $ServiceName 2>$null | Out-Null
& $nssm remove $ServiceName confirm 2>$null | Out-Null
& $nssm install $ServiceName $node $entry
& $nssm set $ServiceName AppDirectory $backend
& $nssm set $ServiceName AppStdout (Join-Path $logDir ($ServiceName + ".out.log"))
& $nssm set $ServiceName AppStderr (Join-Path $logDir ($ServiceName + ".err.log"))
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 10485760
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppExit Default Restart
& $nssm set $ServiceName AppRestartDelay 5000
& $nssm set $ServiceName Description "P2P API ($Block) - Procure-to-Pay (porta $($envObj.PORT)); env do bloco $Block do pm2.config.js"

# Env via registro (REG_MULTI_SZ) em vez de linha de comando: seguro para segredos com aspas/chaves/(). O nssm le daqui.
$parm = "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName\Parameters"
if (-not (Test-Path $parm)) { New-Item -Path $parm -Force | Out-Null }
New-ItemProperty -Path $parm -Name AppEnvironmentExtra -PropertyType MultiString -Value ([string[]]$envPairs) -Force | Out-Null
Write-Host ("  env injetado no servico (" + $envPairs.Count + " variaveis).")

Write-Host "`n[4/6] Iniciando..." -ForegroundColor Cyan
& $nssm start $ServiceName
Start-Sleep -Seconds 12
& $nssm status $ServiceName
Get-Service $ServiceName | Format-Table Name, Status, StartType -AutoSize

Write-Host "`n[5/6] Conferindo saude..." -ForegroundColor Cyan
$port = "$($envObj.PORT)"; if (-not $port) { $port = "3000" }
try {
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 ("http://localhost:$port/api/health/live")
  Write-Host "  /api/health/live -> HTTP $($r.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "  /api/health/live ainda nao responde: $($_.Exception.Message) - veja $logDir\$ServiceName.err.log" -ForegroundColor Yellow
}
Get-NetTCPConnection -State Listen -LocalPort ([int]$port) -ErrorAction SilentlyContinue | ForEach-Object {
  $pr = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"
  Write-Host ("  porta ${port}: pid $($_.OwningProcess) -> " + $pr.CommandLine)
}

Write-Host "`n[6/6] Proximos passos (rode voce, so DEPOIS de ver 'HTTP 200' e a porta $port apontando pro node do servico):" -ForegroundColor Cyan
Write-Host "  Operar:   nssm restart $ServiceName  |  nssm status $ServiceName  |  logs em $logDir" -ForegroundColor Green
Write-Host "  Deploy:   deploy.ps1 -Target backend  e depois  nssm restart $ServiceName   (o pm2 nao controla mais o P2P)" -ForegroundColor Green
Write-Host "  Remover a tarefa de boot do pm2 (confira o nome com: Get-ScheduledTask | ? TaskName -match 'pm2'):" -ForegroundColor Green
Write-Host "            schtasks /Delete /TN pm2-boot /F" -ForegroundColor Green
Write-Host "  ROLLBACK (se o servico nao subir): " -ForegroundColor Yellow
Write-Host "            $nssm stop $ServiceName ; $nssm remove $ServiceName confirm" -ForegroundColor Yellow
Write-Host ("            pm2 start `"$pm2cfg`" --env production --only $Block ; pm2 save") -ForegroundColor Yellow
} catch { Write-Host "ERRO: $_" -ForegroundColor Red; Write-Host $_.ScriptStackTrace }
try { Stop-Transcript | Out-Null } catch {}
Write-Host "`nSaida gravada em $saida"
Read-Host "Pressione Enter para fechar"
