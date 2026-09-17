<#
.SYNOPSIS
    MISHKAT Commercial Distribution Build Script
    Builds production server assets, bundles portable runtime, and compiles MISHKAT-Setup.exe
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $ProjectRoot

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "        MISHKAT - Commercial Distribution Builder               " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Build Production Assets
Write-Host "[1/5] Building Frontend & Server Production Bundles..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Production build failed!"
}

# 2. Verify Output Artifacts
Write-Host "[2/5] Verifying Production Artifacts..." -ForegroundColor Yellow
$ServerBundle = Join-Path $ProjectRoot "dist\server.cjs"
$ClientBundle = Join-Path $ProjectRoot "dist\index.html"
if (-not (Test-Path $ServerBundle) -or -not (Test-Path $ClientBundle)) {
    Write-Error "Required production assets missing in dist/!"
}
Write-Host "  ✓ Server bundle: dist/server.cjs" -ForegroundColor Green
Write-Host "  ✓ Client bundle: dist/index.html" -ForegroundColor Green

# 3. Stage Portable Node.js Runtime in bin/
Write-Host "[3/5] Staging Portable Runtime in bin/..." -ForegroundColor Yellow
$BinDir = Join-Path $ProjectRoot "bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($NodeExe -and (Test-Path $NodeExe)) {
    Copy-Item $NodeExe (Join-Path $BinDir "node.exe") -Force
    Write-Host "  ✓ Portable Node.js runtime staged: bin/node.exe" -ForegroundColor Green
}

# 4. Check for NSIS Compiler (makensis)
Write-Host "[4/5] Checking for NSIS Compiler..." -ForegroundColor Yellow
$MakeNsisPaths = @(
    "makensis",
    "C:\Program Files (x86)\NSIS\makensis.exe",
    "C:\Program Files\NSIS\makensis.exe"
)

$MakeNsis = $null
foreach ($path in $MakeNsisPaths) {
    if (Get-Command $path -ErrorAction SilentlyContinue) {
        $MakeNsis = $path
        break
    }
    if (Test-Path $path) {
        $MakeNsis = $path
        break
    }
}

# 5. Compile Installer if makensis is available
Write-Host "[5/5] Compiling Unified Installer (MISHKAT-Setup.exe)..." -ForegroundColor Yellow
$NsiScript = Join-Path $ProjectRoot "installer\mishkat-setup.nsi"
$OutputInstaller = Join-Path $ProjectRoot "MISHKAT-Setup.exe"

if ($MakeNsis) {
    & $MakeNsis $NsiScript
    if (Test-Path $OutputInstaller) {
        $Hash = (Get-FileHash $OutputInstaller -Algorithm SHA256).Hash
        $Size = (Get-Item $OutputInstaller).Length / 1MB
        Write-Host ""
        Write-Host "✨ MISHKAT-Setup.exe successfully compiled!" -ForegroundColor Green
        Write-Host "   Path:   $OutputInstaller" -ForegroundColor White
        Write-Host "   Size:   $([Math]::Round($Size, 2)) MB" -ForegroundColor White
        Write-Host "   SHA256: $Hash" -ForegroundColor White
    }
} else {
    Write-Host "ℹ️ NSIS compiler (makensis.exe) not found on PATH." -ForegroundColor DarkYellow
    Write-Host "   To compile MISHKAT-Setup.exe:" -ForegroundColor White
    Write-Host "   1. Install NSIS from: https://nsis.sourceforge.io/Download" -ForegroundColor White
    Write-Host "   2. Run: makensis installer\mishkat-setup.nsi" -ForegroundColor White
    Write-Host "   All production assets and runtime are staged and ready in dist/ and bin/." -ForegroundColor Green
}

Write-Host ""
Write-Host "Build process completed successfully." -ForegroundColor Cyan
