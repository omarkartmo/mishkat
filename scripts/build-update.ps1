<#
.SYNOPSIS
Builds the official update package for Mishkat Server.

.DESCRIPTION
This script compiles the project, gathers the necessary runtime files (dist, migrations),
installs production dependencies (node_modules), and packages them into a .zip file
ready for GitHub Releases. It also generates the release-manifest.json.
#>

$ErrorActionPreference = 'Stop'

# Ensure we are in the project root
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ProjectRoot
Set-Location $ProjectRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Mishkat Update Package Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Read Version
$PackageJsonPath = Join-Path $ProjectRoot "package.json"
if (-not (Test-Path $PackageJsonPath)) {
    Write-Error "package.json not found!"
    exit 1
}
$PackageData = Get-Content $PackageJsonPath | ConvertFrom-Json
$Version = $PackageData.version
Write-Host "Version detected: $Version" -ForegroundColor Green

# 2. Build the project
Write-Host "`n[1/5] Building project (Vite + esbuild)..." -ForegroundColor Yellow
npm run build

# 3. Create Staging Directory
$StagingDir = Join-Path $ProjectRoot "update-staging"
if (Test-Path $StagingDir) {
    Remove-Item -Recurse -Force $StagingDir
}
New-Item -ItemType Directory -Path $StagingDir | Out-Null

Write-Host "`n[2/5] Copying application files..." -ForegroundColor Yellow
# Copy dist
$DistStaging = Join-Path $StagingDir "dist"
New-Item -ItemType Directory -Path $DistStaging | Out-Null
Copy-Item -Recurse -Force (Join-Path $ProjectRoot "dist\*") $DistStaging

# Copy migrations
$MigrationsSrc = Join-Path $ProjectRoot "server\db\migrations"
if (Test-Path $MigrationsSrc) {
    $MigrationsStaging = Join-Path $StagingDir "server\db\migrations"
    New-Item -ItemType Directory -Path (Split-Path $MigrationsStaging) -Force | Out-Null
    Copy-Item -Recurse -Force $MigrationsSrc $MigrationsStaging
}

# Copy public assets
$PublicSrc = Join-Path $ProjectRoot "public"
if (Test-Path $PublicSrc) {
    $PublicStaging = Join-Path $StagingDir "public"
    New-Item -ItemType Directory -Path $PublicStaging -Force | Out-Null
    Copy-Item -Recurse -Force (Join-Path $PublicSrc "*") $PublicStaging
}

# Copy package files for dependency resolution
Copy-Item (Join-Path $ProjectRoot "package.json") $StagingDir
Copy-Item (Join-Path $ProjectRoot "package-lock.json") $StagingDir

# 4. Install Production Dependencies (Offline mode for target server)
Write-Host "`n[3/5] Installing production dependencies..." -ForegroundColor Yellow
Set-Location $StagingDir
npm ci --omit=dev
Set-Location $ProjectRoot

# 5. Compress to Zip
$ZipName = "mishkat-server-v$Version-win-x64.zip"
$ZipPath = Join-Path $ProjectRoot "updates\$ZipName"
if (-not (Test-Path (Join-Path $ProjectRoot "updates"))) {
    New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "updates") | Out-Null
}
if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}

Write-Host "`n[4/5] Compressing update package..." -ForegroundColor Yellow
Compress-Archive -Path "$StagingDir\*" -DestinationPath $ZipPath -Force

# 6. Compute SHA-256 and generate manifest
Write-Host "`n[5/5] Generating Manifest and SHA-256..." -ForegroundColor Yellow
$Hash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash

$Manifest = @{
    version = $Version
    releaseDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    description = "Official Update for Mishkat Server"
    sha256 = $Hash
    downloadUrl = "https://github.com/omarkartmo/mishkat/releases/download/v$Version/$ZipName"
    criticalSecurityUpdate = $false
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 5
$ManifestPath = Join-Path $ProjectRoot "updates\release-manifest.json"
Set-Content -Path $ManifestPath -Value $ManifestJson -Encoding UTF8

# Cleanup staging
Remove-Item -Recurse -Force $StagingDir

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ Update Package Generated Successfully!" -ForegroundColor Green
Write-Host "Package: $ZipPath"
Write-Host "SHA-256: $Hash"
Write-Host "Manifest: $ManifestPath"
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "1. Commit and push your changes: git push"
Write-Host "2. Create a new tag: git tag v$Version && git push --tags"
Write-Host "3. Create a GitHub Release for v$Version"
Write-Host "4. Upload $ZipName and release-manifest.json to the release assets."
