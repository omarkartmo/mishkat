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

Write-Host "  -> Building Student App (Pure Rust)..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\src-tauri"
cargo build --release
if ($LASTEXITCODE -ne 0) {
    Write-Error "Student App build failed. Aborting installer build!"
}
Set-Location $ProjectRoot
Write-Host "  ✓ Student App build complete." -ForegroundColor Green

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

# 3.1 Stage Portable NSSM in bin/
$NssmExe = Join-Path $BinDir "nssm.exe"
if (-not (Test-Path $NssmExe)) {
    Write-Host "  -> Staging portable NSSM service manager..." -ForegroundColor DarkCyan
    $NssmZip = Join-Path $BinDir "nssm.zip"
    $NssmTempDir = Join-Path $BinDir "nssm_temp"
    curl.exe -s -L -o $NssmZip "https://nssm.cc/release/nssm-2.24.zip"
    if (Test-Path $NssmZip) {
        Expand-Archive -Path $NssmZip -DestinationPath $NssmTempDir -Force
        $ExtractedNssm = Join-Path $NssmTempDir "nssm-2.24\win64\nssm.exe"
        if (Test-Path $ExtractedNssm) {
            Copy-Item $ExtractedNssm $NssmExe -Force
            Write-Host "  ✓ Portable NSSM ready: bin/nssm.exe" -ForegroundColor Green
        }
        Remove-Item $NssmZip -Force -ErrorAction SilentlyContinue
        Remove-Item $NssmTempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "  ✓ Portable NSSM ready: bin/nssm.exe" -ForegroundColor Green
}

# 3.2 Ensure Complete Production Server Runtime Dependencies in bin/node_modules/
Write-Host "  -> Ensuring complete production server runtime dependencies in bin..." -ForegroundColor DarkCyan
npm --prefix $BinDir install --omit=dev --no-audit --no-fund
npm --prefix $BinDir prune
Write-Host "  ✓ Production runtime dependencies ready in bin/node_modules" -ForegroundColor Green

# 4. Check for NSIS Compiler (makensis)
Write-Host "[4/5] Checking for NSIS Compiler..." -ForegroundColor Yellow
$MakeNsisPaths = @(
    "makensis",
    (Join-Path $ProjectRoot "bin\nsis\nsis-3.10\makensis.exe"),
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

# If not found, download portable NSIS automatically (Zero external dependency requirement)
if (-not $MakeNsis) {
    Write-Host "  -> Downloading portable NSIS compiler automatically..." -ForegroundColor DarkCyan
    $NsisZip = Join-Path $ProjectRoot "bin\nsis.zip"
    $NsisDir = Join-Path $ProjectRoot "bin\nsis"
    curl.exe -s -L -o $NsisZip "https://downloads.sourceforge.net/project/nsis/NSIS%203/3.10/nsis-3.10.zip"
    if (Test-Path $NsisZip) {
        Expand-Archive -Path $NsisZip -DestinationPath $NsisDir -Force
        Remove-Item $NsisZip -Force
        $PortableMakensis = Join-Path $NsisDir "nsis-3.10\makensis.exe"
        if (Test-Path $PortableMakensis) {
            $MakeNsis = $PortableMakensis
            Write-Host "  ✓ Portable NSIS ready: $MakeNsis" -ForegroundColor Green
        }
    }
}

# 5. Compile Installer if makensis is available
Write-Host "[5/5] Compiling Unified Installer (MISHKAT-Setup.exe)..." -ForegroundColor Yellow
$NsiScript = Join-Path $ProjectRoot "installer\mishkat-setup.nsi"
$OutputInstaller = Join-Path $ProjectRoot "MISHKAT-Setup.exe"
$DistInstallerDir = Join-Path $ProjectRoot "dist\installer"
$DistInstaller = Join-Path $DistInstallerDir "MISHKAT-Setup.exe"

if ($MakeNsis) {
    & $MakeNsis /INPUTCHARSET UTF8 $NsiScript
    if (Test-Path $OutputInstaller) {
        if (-not (Test-Path $DistInstallerDir)) {
            New-Item -ItemType Directory -Path $DistInstallerDir -Force | Out-Null
        }
        Copy-Item $OutputInstaller $DistInstaller -Force

        $Hash = (Get-FileHash $OutputInstaller -Algorithm SHA256).Hash
        $Size = (Get-Item $OutputInstaller).Length / 1MB
        Write-Host ""
        Write-Host "✨ MISHKAT-Setup.exe successfully compiled!" -ForegroundColor Green
        Write-Host "   Root Path: $OutputInstaller" -ForegroundColor White
        Write-Host "   Dist Path: $DistInstaller" -ForegroundColor White
        Write-Host "   Size:      $([Math]::Round($Size, 2)) MB" -ForegroundColor White
        Write-Host "   SHA256:    $Hash" -ForegroundColor White
    }
} else {
    Write-Host "ℹ️ NSIS compiler (makensis.exe) could not be retrieved." -ForegroundColor DarkYellow
    Write-Host "   Please ensure internet connectivity or install NSIS manually from https://nsis.sourceforge.io" -ForegroundColor White
}

Write-Host ""
Write-Host "Build process completed successfully." -ForegroundColor Cyan
