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
# Without write access to npm's global folder (system Node on Linux), install
# under ~/.local instead of asking for sudo.
NPM_PREFIX=$(npm prefix -g)
if [ -w "$NPM_PREFIX/lib" ] || [ -w "$NPM_PREFIX/lib/node_modules" ]; then
  npm install -g "$PACKAGE_URL"
else
  NPM_PREFIX="$HOME/.local"
  yellow "Pas d'accès en écriture au dossier global de npm : installation dans ~/.local"
  npm install -g --prefix "$NPM_PREFIX" "$PACKAGE_URL"
fi
ADL="$NPM_PREFIX/bin/adl"

# yt-dlp / ffmpeg: anything missing is downloaded into anime-dl-tui's own folder.
TOOLS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/anime-dl-tui/bin"
missing=0
for tool in yt-dlp ffmpeg; do
  if command -v "$tool" >/dev/null 2>&1 || [ -x "$TOOLS_DIR/$tool" ]; then
    green "✔ $tool trouvé"
  else
    missing=1
    yellow "⚠ $tool est manquant"
  fi
done
if [ "$missing" -eq 1 ]; then
  echo "Installation automatique des outils manquants…"
  "$ADL" --install-tools || yellow "Échec : réessaie plus tard avec « adl --install-tools »."
fi

echo
case ":$PATH:" in
  *":$NPM_PREFIX/bin:"*) green "C'est prêt ! Lance « adl » pour démarrer." ;;
  *)
    green "C'est prêt !"
    yellow "Ajoute $NPM_PREFIX/bin à ton PATH (dans ~/.zshrc ou ~/.bashrc) :"
    echo "  export PATH=\"$NPM_PREFIX/bin:\$PATH\""
    echo "En attendant, lance : $ADL"
    ;;
esac
