# Carga vcvars64 (MSVC) y ejecuta npm run tauri:dev desde la raiz del repositorio.
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"

if (-not (Test-Path -LiteralPath $vswhere)) {
    Write-Host ""
    Write-Host "[DataDash Pro] No se encontro vswhere.exe." -ForegroundColor Red
    Write-Host "Instale: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    Write-Host ""
    exit 1
}

$vcvars = $null

# Instalacion completa con VC registrado
$vcvars = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find "VC\Auxiliary\Build\vcvars64.bat" |
    Select-Object -First 1

# VS "incompleto" o sin componente registrado: recorrer TODAS las instancias (vswhere -latest las omite a veces)
if (-not $vcvars -or -not (Test-Path -LiteralPath $vcvars)) {
    $json = & $vswhere -all -products * -format json
    $instances = $json | ConvertFrom-Json
    if (-not ($instances -is [array])) { $instances = @($instances) }
    foreach ($inst in $instances) {
        if (-not $inst.installationPath) { continue }
        $candidate = Join-Path $inst.installationPath.TrimEnd() "VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path -LiteralPath $candidate) {
            $vcvars = $candidate
            break
        }
    }
}

if (-not $vcvars -or -not (Test-Path -LiteralPath $vcvars)) {
    Write-Host ""
    Write-Host "[DataDash Pro] No se encontro vcvars64.bat." -ForegroundColor Red
    Write-Host "Visual Studio Installer -> Modificar -> 'Desarrollo de escritorio con C++'." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "[DataDash Pro] Cargando entorno MSVC..." -ForegroundColor Cyan
Write-Host "  $vcvars"

$biRoot = Join-Path $repoRoot "datadash_pro_bi"
$cmd = "call `"$vcvars`" >nul && cd /d `"$biRoot`" && npm run tauri:dev"
$process = Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", $cmd) -NoNewWindow -Wait -PassThru
exit $process.ExitCode
