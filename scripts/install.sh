#!/usr/bin/env sh
# Installs anime-dl-tui from the latest GitHub release and checks its runtime tools.
set -eu

PACKAGE_URL="https://github.com/Nexgear75/anime-dl-tui/releases/latest/download/anime-dl-tui.tgz"

red() { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }

if ! command -v node >/dev/null 2>&1; then
  red "Node.js est introuvable. Installe Node 22 ou plus récent : https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
  red "Node $(node -v) est trop ancien : il faut Node 22 ou plus récent."
  exit 1
fi

echo "Installation d'anime-dl-tui…"
npm install -g "$PACKAGE_URL"

missing=0
for tool in yt-dlp ffmpeg; do
  if command -v "$tool" >/dev/null 2>&1; then
    green "✔ $tool trouvé"
  else
    missing=1
    yellow "⚠ $tool est manquant"
  fi
done

if [ "$missing" -eq 1 ]; then
  echo
  if command -v brew >/dev/null 2>&1; then
    yellow "Installe-les avec : brew install yt-dlp ffmpeg"
  elif command -v apt-get >/dev/null 2>&1; then
    yellow "Installe-les avec : sudo apt install ffmpeg pipx && pipx install yt-dlp"
  else
    yellow "Installe yt-dlp (https://github.com/yt-dlp/yt-dlp) et ffmpeg (https://ffmpeg.org)."
  fi
fi

echo
green "C'est prêt ! Lance « adl » pour démarrer."
