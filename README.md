# anime-dl-tui

Une interface terminal pour **rechercher et télécharger des animes depuis [voir-anime](https://voir-anime.to)**, écrite en TypeScript avec [Ink](https://github.com/vadimdemedes/ink).

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ ▶ anime-dl tui                                               téléchargements │
╰──────────────────────────────────────────────────────────────────────────────╯
 Téléchargement en cours
 → ~/Downloads/Anime/Mushoku Tensei 3

 ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 15%  0/2 · 2 en cours · 13.5 Mo/s

 ⠼ Épisode 5    ██████░░░░░░░░░░░░░░░░   20% 5.0 Mo/s · 68.4 Mo/340 Mo · reste 00:41
 ⠼ Épisode 6    ███░░░░░░░░░░░░░░░░░░░    9% 8.6 Mo/s · 40.2 Mo/456 Mo · reste 00:37

 q arrêter et quitter
```

## Fonctionnalités

- **Recherche par nom** (VF et VOSTFR) ou collage direct d’une URL de série ou d’épisode.
- **Sélection des épisodes** au clavier : cocher, tout, inverser, « non téléchargés », ou une plage comme `1-5, 8, 10-`.
- **Téléchargements en parallèle** (1 à 8) avec barre de progression, débit, taille et temps restant.
- **Robuste**
  - si un lecteur est mort, les autres lecteurs de l’épisode sont essayés automatiquement ;
  - 3 tentatives par épisode, avec un lien regénéré à chaque essai (les liens vidéo expirent) ;
  - reprise des téléchargements interrompus (fichiers `.part`) ;
  - épisodes déjà présents ignorés et signalés « ✓ téléchargé » dans la liste ;
  - `Ctrl+C` / `q` arrête proprement, sans processus orphelin, et une relance reprend là où ça s’était arrêté.
- **Mode texte** (`--plain`) pour les scripts, cron ou un serveur sans écran.
- Les réglages (dossier, parallélisme, lecteur) sont mémorisés entre deux lancements.

## Installation

### En une commande

**Windows** (PowerShell) :

```powershell
irm https://raw.githubusercontent.com/Nexgear75/anime-dl-tui/main/scripts/install.ps1 | iex
```

**macOS / Linux** :

```sh
curl -fsSL https://raw.githubusercontent.com/Nexgear75/anime-dl-tui/main/scripts/install.sh | sh
```

Le script installe tout ce qu’il faut :

- **Node.js** ≥ 22 (sous Windows, installé avec `winget` s’il manque) ;
- la dernière version publiée d’anime-dl-tui ;
- **yt-dlp** et **ffmpeg** s’ils sont absents, téléchargés dans le dossier de l’application (`%LOCALAPPDATA%\anime-dl-tui\bin` ou `~/.local/share/anime-dl-tui/bin`) : pas besoin de toucher au PATH. Sous macOS, ffmpeg s’installe avec `brew install ffmpeg`.

Relancer la même commande met l’application à jour.

### Outils manquants ou à mettre à jour

```sh
adl --install-tools
```

Télécharge (ou met à jour) yt-dlp et ffmpeg dans le dossier de l’application. Si yt-dlp manque au lancement, `adl` propose aussi de l’installer.

### Avec npm

```sh
npm install -g https://github.com/Nexgear75/anime-dl-tui/releases/latest/download/anime-dl-tui.tgz
adl --install-tools
```

Sous Windows, lance ces commandes dans `cmd` ou tape `npm.cmd` dans PowerShell (le script `npm.ps1` y est bloqué par défaut).

### Depuis les sources

```sh
git clone https://github.com/Nexgear75/anime-dl-tui.git
cd anime-dl-tui
npm ci
npm run build
npm link        # rend les commandes `adl` et `anime-dl-tui` disponibles
```

Pour désinstaller : `npm uninstall -g anime-dl-tui`.

## Utilisation

```sh
adl                                   # interface interactive
adl "mushoku tensei"                  # lance directement une recherche
adl https://voir-anime.to/anime/mushoku-tensei-3/   # ouvre directement la série
```

### Raccourcis clavier

| Écran | Touches |
| --- | --- |
| Recherche | `Entrée` rechercher · `Échap` quitter |
| Résultats | `↑` `↓` naviguer · `Entrée` ouvrir · `Échap` retour |
| Épisodes | `Espace` cocher · `a` tout/rien · `i` inverser · `n` non téléchargés · `s` plage (`1-5,8`) · `PgUp`/`PgDn`/`Début`/`Fin` · `Entrée` continuer |
| Options | `↑` `↓` choisir un champ · `←` `→` modifier · `Entrée` sur « Dossier » pour le changer, sinon lancer |
| Choix du dossier | taper le chemin (`~` accepté) · `Tab` compléter · `↑` `↓` choisir une suggestion · `Entrée` valider · `Échap` annuler |
| Téléchargements | `q` arrêter et quitter · `r` réessayer les échecs · `Entrée` nouvelle recherche (une fois fini) |

`Ctrl+C` fonctionne partout : il arrête proprement les téléchargements en cours. Un second `Ctrl+C` force l’arrêt.

### Options de la ligne de commande

| Option | Description |
| --- | --- |
| `-e, --episodes <sélection>` | épisodes à télécharger : `1-5,8`, `10-` (jusqu’à la fin), `all` |
| `-o, --output <dossier>` | dossier de destination de la série (`~` accepté, même entre guillemets) |
| `-c, --concurrency <n>` | téléchargements simultanés, de 1 à 8 |
| `-p, --player <id>` | lecteur préféré : `vidmoly` ou `streamtape` |
| `--base-url <url>` | adresse du site, si voir-anime change de domaine |
| `--plain` | mode texte sans interface |
| `--install-tools` | installe ou met à jour yt-dlp et ffmpeg |
| `-h, --help` / `-v, --version` | aide / version |

Avec `--episodes`, l’écran de sélection est sauté et tu arrives directement sur la confirmation.

### Exemples

```sh
# Toute la saison 3 dans un dossier précis
adl https://voir-anime.to/anime/mushoku-tensei-3/ -e all -o "~/Downloads/Anime/MushokuTensei-S3"

# Les nouveaux épisodes de One Piece, sans interface (cron, serveur…)
adl https://voir-anime.to/anime/one-piece/ -e 1170- --plain
```

En mode `--plain`, le code de sortie vaut `0` si tout est téléchargé, `1` en cas d’échec et `130` en cas d’interruption.

## Fichiers

Chaque épisode est enregistré sous la forme `<dossier>/<Série> - 01.mp4` ; les films et épisodes spéciaux gardent leur titre. Par défaut, `<dossier>` vaut `~/Downloads/Anime/<Série>`. Le dossier se choisit dans l’écran Options : tape le chemin, les dossiers existants sont proposés au fur et à mesure et `Tab` complète, comme dans un terminal. Un dossier qui n’existe pas encore est créé au lancement. La série y reçoit son propre sous-dossier, et le dossier choisi devient le défaut des prochaines fois.

| Fichier | Contenu |
| --- | --- |
| `~/.config/anime-dl-tui/config.json` | réglages mémorisés : `downloadDir`, `concurrency`, `preferredPlayer`, `baseUrl` |
| `~/.config/anime-dl-tui/anime-dl-tui.log` | détail des échecs, avec les dernières lignes de yt-dlp |

## Dépannage

- **« Aucun lecteur compatible »** : l’épisode n’a pas de lecteur supporté (VidMoly ou Streamtape). Essaie la version VF/VOSTFR, ou ouvre une issue avec l’URL.
- **« Impossible de joindre le site »** : vérifie ta connexion. Si voir-anime a changé d’adresse, utilise `--base-url https://nouveau-domaine`. Les URL collées fonctionnent quel que soit le domaine.
- **Erreurs HTTP 403 ou lien invalide** : mets yt-dlp à jour (`adl --install-tools`, `brew upgrade yt-dlp` ou `yt-dlp -U`), puis réessaie avec `r`.
- **Vidéo illisible ou mal assemblée** : installe ffmpeg (`adl --install-tools`, ou `brew install ffmpeg` sur macOS).
- **Windows : « l’exécution de scripts est désactivée »** : relance l’installation en une commande (elle retire les raccourcis `.ps1` bloqués), ou lance `adl.cmd`.
- Le détail de chaque échec est dans `~/.config/anime-dl-tui/anime-dl-tui.log`.

## Développement

```sh
npm ci
npm run dev -- "mushoku"   # lance depuis les sources (tsx)
npm test                   # tests (vitest)
npm run typecheck
npm run build
```

```
src/
├── cli.tsx               point d'entrée : arguments, vérification des outils, mode --plain
├── core/
│   ├── voiranime.ts      recherche, liste des épisodes, lecteurs d'un épisode
│   ├── players/          extraction du lien vidéo (VidMoly, Streamtape) et repli entre lecteurs
│   ├── downloader.ts     pilotage de yt-dlp et lecture de sa progression
│   ├── queue.ts          file de téléchargements : parallélisme, essais, annulation
│   ├── http.ts           fetch avec délai maximal et nouveaux essais
│   ├── format.ts         noms de fichiers, plages d'épisodes, affichage
│   ├── folders.ts        autocomplétion des dossiers (écran de choix du dossier)
│   ├── tools.ts          recherche et installation de yt-dlp/ffmpeg
│   └── system.ts         réglages et journal
└── ui/                   écrans Ink (recherche, résultats, épisodes, options, téléchargements)
```

**Ajouter un lecteur** : crée `src/core/players/<nom>.ts` qui implémente l’interface `Player` (`handles` + `resolve`), puis ajoute-le à `PLAYERS` dans `src/core/players/index.ts`.

**Publier une version** : mets à jour `version` dans `package.json`, puis pousse un tag `vX.Y.Z`. Le workflow « Release » crée la release GitHub avec l’archive installable.

## Crédits et avertissement

Inspiré du projet Python [Toukoms/anime-dl](https://github.com/Toukoms/anime-dl).

Ce projet n’est pas affilié à voir-anime ni aux hébergeurs vidéo. Il est fourni à des fins personnelles et éducatives : respecte le droit d’auteur et la législation de ton pays.

Licence [MIT](LICENSE).
