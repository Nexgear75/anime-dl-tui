#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { render } from 'ink';
import { expandHome, formatSpeed, parseSelection, sanitizeFilename, episodeFileName, numberWidth, tildify } from './core/format.js';
import { PLAYER_IDS } from './core/players/index.js';
import { DownloadQueue, type Job } from './core/queue.js';
import { loadSettings, logPath, writeLog, type Settings } from './core/system.js';
import { checkTools, installTools, INSTALL_HINTS } from './core/tools.js';
import { getSeries } from './core/voiranime.js';
import { App, type Launch, type Summary } from './ui/App.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const HELP = `
anime-dl-tui ${version} — télécharge des animes depuis voir-anime

Usage
  adl                              interface interactive
  adl "mushoku tensei"             lance une recherche
  adl <url de série ou d'épisode>  ouvre directement la série

Options
  -e, --episodes <sélection>   épisodes à prendre : "1-5,8", "10-", "all"
  -o, --output <dossier>       dossier de destination de la série
  -c, --concurrency <n>        téléchargements simultanés (1-8)
  -p, --player <id>            lecteur préféré : ${PLAYER_IDS.join(', ')}
      --base-url <url>         adresse du site (si le domaine change)
      --plain                  mode texte sans interface (scripts, cron)
      --install-tools          installe ou met à jour yt-dlp et ffmpeg
  -h, --help                   affiche cette aide
  -v, --version                affiche la version

Exemples
  adl https://voir-anime.to/anime/mushoku-tensei-3/ -e 1-13 -o ~/Anime/MushokuTensei-S3
  adl https://voir-anime.to/anime/one-piece/ -e 1100- --plain
`;

function fail(message: string): never {
  process.stderr.write(`\x1b[31m✖ ${message}\x1b[0m\n`);
  process.exit(1);
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [O/n] `);
  rl.close();
  return !/^n/i.test(answer.trim());
}

function parseCli() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        episodes: { type: 'string', short: 'e' },
        output: { type: 'string', short: 'o' },
        concurrency: { type: 'string', short: 'c' },
        player: { type: 'string', short: 'p' },
        'base-url': { type: 'string' },
        plain: { type: 'boolean' },
        'install-tools': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    fail(`${(error as Error).message}\nLance « adl --help » pour l’aide.`);
  }
}

/** Non-interactive mode: logs one line per event, suited to scripts and pipes. */
async function runPlain(launch: Launch, settings: Settings, tools: { ytDlpPath: string; ffmpegPath?: string }) {
  if (!launch.input || !/^https?:\/\//.test(launch.input)) {
    fail('Le mode --plain a besoin de l’URL d’une série.');
  }
  const series = await getSeries(launch.input);
  const selected = parseSelection(launch.episodes ?? 'all', series.episodes);
  const episodes = series.episodes.filter((episode) => selected.has(episode.id));
  if (episodes.length === 0) fail('Aucun épisode à télécharger.');

  const outputDir = launch.output ?? path.join(settings.downloadDir, sanitizeFilename(series.title));
  const width = numberWidth(series.episodes);
  console.log(`${series.title} — ${episodes.length} épisode(s) → ${tildify(outputDir)}`);

  const queue = new DownloadQueue({
    concurrency: settings.concurrency,
    preferredPlayer: settings.preferredPlayer,
    ...tools,
  });
  const lastStatus = new Map<Job, string>();
  queue.on('update', () => {
    for (const job of queue.jobs) {
      if (lastStatus.get(job) === job.status) continue;
      lastStatus.set(job, job.status);
      const line = {
        queued: null,
        resolving: job.attempt > 1 ? `recherche du lien (essai ${job.attempt})` : 'recherche du lien',
        downloading: `téléchargement via ${job.player}`,
        retrying: `erreur, nouvel essai : ${job.error}`,
        done: 'terminé ✔',
        skipped: 'déjà présent',
        failed: `ÉCHEC : ${job.error}`,
        cancelled: 'annulé',
      }[job.status];
      if (line) console.log(`[${job.episode.label}] ${line}`);
    }
  });
  const ticker = setInterval(() => {
    for (const job of queue.jobs) {
      if (job.status === 'downloading' && job.progress?.ratio !== null && job.progress?.ratio !== undefined) {
        console.log(
          `[${job.episode.label}] ${Math.floor(job.progress.ratio * 100)}% · ${formatSpeed(job.progress.speed)}`,
        );
      }
    }
  }, 10_000);

  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log('Arrêt en cours… (recommence pour forcer)');
    queue.cancelAll();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise<void>((resolve) => {
    queue.once('idle', resolve);
    queue.add(episodes.map((episode) => ({ episode, output: path.join(outputDir, episodeFileName(series.title, episode, width)) })));
  });
  clearInterval(ticker);

  const failures = queue.jobs.filter((job) => job.status === 'failed');
  if (failures.length) {
    await writeLog(failures.map((job) => `ÉCHEC ${series.title} — ${job.episode.label} : ${job.error}`));
  }
  const done = queue.jobs.filter((job) => job.status === 'done' || job.status === 'skipped').length;
  console.log(`\n${done}/${queue.jobs.length} épisode(s) disponibles dans ${tildify(outputDir)}`);
  if (failures.length) console.log(`${failures.length} échec(s), détails dans ${tildify(logPath())}`);
  process.exitCode = stopping ? 130 : failures.length ? 1 : 0;
}

async function main() {
  const { values, positionals } = parseCli();
  if (values.help) return void process.stdout.write(HELP);
  if (values.version) return void console.log(version);
  if (values['install-tools']) {
    await installTools();
    return;
  }

  const settings = await loadSettings();
  if (values.concurrency !== undefined) {
    const n = Number(values.concurrency);
    if (!Number.isInteger(n) || n < 1 || n > 8) fail('--concurrency doit être un entier entre 1 et 8.');
    settings.concurrency = n;
  }
  if (values.player !== undefined) {
    if (!PLAYER_IDS.includes(values.player)) fail(`Lecteur inconnu « ${values.player} » (${PLAYER_IDS.join(', ')}).`);
    settings.preferredPlayer = values.player;
  }
  if (values['base-url']) settings.baseUrl = values['base-url'];

  const launch: Launch = {
    input: positionals.join(' ').trim() || undefined,
    episodes: values.episodes,
    output: values.output ? path.resolve(expandHome(values.output)) : undefined,
  };

  let found = await checkTools();
  if (!found.ytDlp.ok && process.stdin.isTTY && (await confirm('yt-dlp est introuvable. L’installer maintenant ?'))) {
    await installTools();
    found = await checkTools();
  }
  if (!found.ytDlp.ok) fail(`yt-dlp est introuvable — il est nécessaire pour télécharger.\n  ${INSTALL_HINTS['yt-dlp']}`);
  const tools = { ytDlpPath: found.ytDlp.path, ffmpegPath: found.ffmpeg.ok ? found.ffmpeg.path : undefined };
  const warning = found.ffmpeg.ok
    ? undefined
    : `ffmpeg est absent : les vidéos risquent d’être mal assemblées. ${INSTALL_HINTS.ffmpeg}`;

  const interactive = process.stdin.isTTY && process.stdout.isTTY && !values.plain;
  if (!interactive) {
    if (warning) console.warn(`⚠ ${warning}`);
    return runPlain(launch, settings, tools);
  }

  let summary: Summary = { done: 0, failed: 0 };
  const app = render(
    <App launch={launch} settings={settings} warning={warning} tools={tools} onExit={(s) => (summary = s)} />,
    { exitOnCtrlC: false, alternateScreen: true },
  );
  await app.waitUntilExit();

  if (summary.outputDir && (summary.done || summary.failed)) {
    console.log(`✔ ${summary.done} épisode(s) téléchargé(s) dans ${tildify(summary.outputDir)}`);
    if (summary.failed) console.log(`✖ ${summary.failed} échec(s), détails dans ${tildify(logPath())}`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
