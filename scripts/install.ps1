# Installs anime-dl-tui on Windows, with everything it needs.
#
#   irm https://raw.githubusercontent.com/Nexgear75/anime-dl-tui/main/scripts/install.ps1 | iex
#
# 1. Node.js 22+ (installed with winget if missing or too old)
# 2. anime-dl-tui from the latest GitHub release
# 3. yt-dlp and ffmpeg (downloaded into %LOCALAPPDATA%\anime-dl-tui\bin if missing)
#
# Only uses ASCII so that Windows PowerShell 5.1 reads it correctly without a BOM.

$PackageUrl = "https://github.com/Nexgear75/anime-dl-tui/releases/latest/download/anime-dl-tui.tgz"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERREUR] $msg" -ForegroundColor Red }

function Update-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user"
}

function Get-NodeMajor {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { return 0 }
    try {
        $version = (& node.exe -p "process.versions.node" 2>$null | Select-Object -First 1)
        return [int]($version.Split(".")[0])
    } catch {
        return 0
    }
}

function Install-AnimeDlTui {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

    Write-Host ""
    Write-Host "  anime-dl-tui - installation" -ForegroundColor Magenta
    Write-Host ""

    # 1. Node.js
    Write-Step "Verification de Node.js (22 ou plus recent)..."
    if ((Get-NodeMajor) -lt 22) {
        if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
            Write-Err "Node.js 22+ est introuvable et winget n'est pas disponible."
            Write-Host "Installe Node.js LTS depuis https://nodejs.org puis relance cette commande."
            return $false
        }
        Write-Warn "Installation de Node.js LTS avec winget..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements | Out-Host
        Update-SessionPath
        if ((Get-NodeMajor) -lt 22) {
            Write-Err "Node.js 22+ n'est toujours pas disponible."
            Write-Host "Ferme ce terminal, ouvre-en un nouveau et relance la commande."
            return $false
        }
    }
    Write-Ok "Node.js $(& node.exe -v)"

    # 2. anime-dl-tui
    # npm.cmd rather than npm: the npm.ps1 shim is blocked by the default execution policy.
    Write-Step "Installation d'anime-dl-tui..."
    & npm.cmd install -g $PackageUrl | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install a echoue (voir les messages ci-dessus)."
        return $false
    }

    $prefix = (& npm.cmd prefix -g | Select-Object -First 1).Trim()
    # PowerShell prefers the .ps1 shims, which the default execution policy blocks
    # ("running scripts is disabled"). Removing them makes it use adl.cmd instead.
    foreach ($name in @("adl", "anime-dl-tui")) {
        Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $prefix "$name.ps1")
    }
    $cli = Join-Path $prefix "node_modules\anime-dl-tui\dist\cli.js"
    if (-not (Test-Path $cli)) {
        Write-Err "Installation incomplete : $cli est introuvable."
        return $false
    }
    Write-Ok "anime-dl-tui $(& node.exe $cli --version)"

    # 3. yt-dlp and ffmpeg
    Write-Step "Verification de yt-dlp et ffmpeg..."
    $missing = @()
    foreach ($tool in @("yt-dlp", "ffmpeg")) {
        $local = Join-Path $env:LOCALAPPDATA "anime-dl-tui\bin\$tool.exe"
        if ((Get-Command $tool -ErrorAction SilentlyContinue) -or (Test-Path $local)) {
            Write-Ok "$tool trouve"
        } else {
            $missing += $tool
        }
    }
    if ($missing.Count -gt 0) {
        Write-Warn "Manquant : $($missing -join ', '). Telechargement automatique..."
        & node.exe $cli --install-tools | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Impossible d'installer yt-dlp/ffmpeg. Reessaie plus tard avec : adl --install-tools"
            return $false
        }
    }

    # npm's global folder must be on the PATH for the 'adl' command.
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $allEntries = @("$userPath;$machinePath".Split(";") | Where-Object { $_ } | ForEach-Object { $_.TrimEnd("\") })
    if ($allEntries -notcontains $prefix.TrimEnd("\")) {
        # Read the raw value so entries like %USERPROFILE%\... stay unexpanded.
        $rawUserPath = (Get-Item -Path "HKCU:\Environment").GetValue("Path", "", "DoNotExpandEnvironmentNames")
        $newPath = (@($rawUserPath.Split(";") | Where-Object { $_ }) + $prefix) -join ";"
        Set-ItemProperty -Path "HKCU:\Environment" -Name "Path" -Value $newPath -Type ExpandString
        # Setting a variable through .NET broadcasts the change to new terminals.
        [Environment]::SetEnvironmentVariable("ANIME_DL_TUI", "1", "User")
        Write-Ok "$prefix ajoute au PATH"
    }
    Update-SessionPath

    Write-Host ""
    Write-Host "C'est pret ! Lance 'adl' pour demarrer (dans un nouveau terminal si la commande est introuvable)." -ForegroundColor Green
    Write-Host ""
    return $true
}

$ok = Install-AnimeDlTui
# With 'irm | iex', 'exit' would close the user's window: only exit when run as a file.
if ($PSCommandPath -and -not $ok) { exit 1 }
