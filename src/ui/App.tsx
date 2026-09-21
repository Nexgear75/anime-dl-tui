import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { Box, Text, useApp, useInput } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';
import { episodeFileName, numberWidth, parseSelection, sanitizeFilename } from '../core/format.js';
import { DownloadQueue } from '../core/queue.js';
import { saveSettings, writeLog, type Settings } from '../core/system.js';
import { getSeries, search, type SearchResult, type Series } from '../core/voiranime.js';
import { Header } from './components/common.js';
import { Downloads } from './screens/Downloads.js';
import { EpisodePicker } from './screens/EpisodePicker.js';
import { Home } from './screens/Home.js';
import { Options, type DownloadPlan } from './screens/Options.js';
import { Results } from './screens/Results.js';

export interface Launch {
  /** Search text or series/episode URL given on the command line. */
  input?: string;
  /** Episode selection given with --episodes; skips the picker. */
  episodes?: string;
  /** Final output folder given with --output. */
  output?: string;
}

export interface Summary {
  done: number;
  failed: number;
  outputDir?: string;
}

interface Props {
  launch: Launch;
  settings: Settings;
  warning?: string;
  onExit: (summary: Summary) => void;
}

type Screen = 'home' | 'results' | 'episodes' | 'options' | 'downloads';

const isUrl = (value: string) => /^https?:\/\//i.test(value.trim());

async function downloadedIds(series: Series, folder: string) {
  const width = numberWidth(series.episodes);
  let files: Set<string>;
  try {
    files = new Set(await readdir(folder));
  } catch {
    return new Set<string>();
  }
  return new Set(
    series.episodes.filter((e) => files.has(episodeFileName(series.title, e, width))).map((e) => e.id),
  );
}

const message = (error: unknown) => {
  if (error instanceof Error) {
    return error.message.includes('fetch failed')
      ? 'Impossible de joindre le site. Vérifie ta connexion (ou l’adresse du site avec --base-url).'
      : error.message;
  }
  return String(error);
};

export function App({ launch, settings: initialSettings, warning, onExit }: Props) {
  const { exit } = useApp();
  const [settings, setSettings] = useState(initialSettings);
  const [screen, setScreen] = useState<Screen>('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState(launch.input && !isUrl(launch.input) ? launch.input : '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [series, setSeries] = useState<Series>();
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Set<string>>();
  const [plan, setPlan] = useState<DownloadPlan>();
  const [queue, setQueue] = useState<DownloadQueue>();
  const launchUsed = useRef(false);
  const cameFromResults = useRef(false);

  const quit = useCallback(() => {
    const jobs = queue?.jobs ?? [];
    onExit({
      done: jobs.filter((job) => job.status === 'done').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      outputDir: queue ? plan?.outputDir : undefined,
    });
    exit();
  }, [queue, plan, onExit, exit]);

  // Ctrl+C / SIGTERM stop downloads cleanly (yt-dlp keeps its partial files)
  // before exiting; a second one exits immediately.
  const stopping = useRef(false);
  const interrupt = useCallback(() => {
    if (stopping.current) process.exit(130);
    stopping.current = true;
    if (queue && !queue.idle) {
      queue.once('idle', quit);
      queue.cancelAll();
    } else {
      quit();
    }
  }, [queue, quit]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') interrupt();
  });

  useEffect(() => {
    process.on('SIGTERM', interrupt);
    process.on('SIGHUP', interrupt);
    return () => {
      process.off('SIGTERM', interrupt);
      process.off('SIGHUP', interrupt);
    };
  }, [interrupt]);

  const openSeries = useCallback(
    async (url: string) => {
      setLoading(true);
      setError(undefined);
      try {
        const loaded = await getSeries(url);
        const outputDir =
          (!launchUsed.current && launch.output) ||
          path.join(settings.downloadDir, sanitizeFilename(loaded.title));
        const present = await downloadedIds(loaded, outputDir);
        setSeries(loaded);
        setDownloaded(present);
        setPlan({ outputDir, concurrency: settings.concurrency, preferredPlayer: settings.preferredPlayer });

        if (!launchUsed.current && launch.episodes) {
          launchUsed.current = true;
          const picked = parseSelection(launch.episodes, loaded.episodes);
          if (picked.size === 0) throw new Error(`Aucun épisode ne correspond à « ${launch.episodes} »`);
          setSelection(picked);
          setScreen('options');
        } else {
          launchUsed.current = true;
          setSelection(undefined);
          setScreen('episodes');
        }
      } catch (e) {
        launchUsed.current = true;
        setError(message(e));
      } finally {
        setLoading(false);
      }
    },
    [launch, settings],
  );

  const submit = useCallback(
    async (value: string) => {
      setQuery(value);
      if (isUrl(value)) {
        cameFromResults.current = false;
        return openSeries(value);
      }
      setLoading(true);
      setError(undefined);
      try {
        setResults(await search(value, settings.baseUrl));
        cameFromResults.current = true;
        setScreen('results');
      } catch (e) {
        setError(message(e));
      } finally {
        setLoading(false);
      }
    },
    [openSeries, settings.baseUrl],
  );

  // Command-line input starts the flow right away.
  useEffect(() => {
    if (launch.input) void submit(launch.input);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (chosen: DownloadPlan) => {
    if (!series || !selection) return;
    const next: Settings = {
      ...settings,
      concurrency: chosen.concurrency,
      preferredPlayer: chosen.preferredPlayer,
    };
    // Remember the parent folder when the output follows the "<parent>/<series>" layout.
    if (path.basename(chosen.outputDir) === sanitizeFilename(series.title)) {
      next.downloadDir = path.dirname(chosen.outputDir);
    }
    setSettings(next);
    void saveSettings(next);

    const width = numberWidth(series.episodes);
    const created = new DownloadQueue({
      concurrency: chosen.concurrency,
      preferredPlayer: chosen.preferredPlayer,
    });
    created.on('idle', () => {
      const failures = created.jobs.filter((job) => job.status === 'failed');
      if (failures.length) {
        void writeLog(
          failures.flatMap((job) => [
            `ÉCHEC ${series.title} — ${job.episode.label} (${job.episode.url}) : ${job.error}`,
            ...(job.log ?? []).map((line) => `    ${line}`),
          ]),
        );
      }
      // Terminal bell when a batch ends on its own (not when the user stops it).
      if (!created.jobs.some((job) => job.status === 'cancelled')) process.stdout.write('\x07');
    });
    created.add(
      series.episodes
        .filter((episode) => selection.has(episode.id))
        .map((episode) => ({
          episode,
          output: path.join(chosen.outputDir, episodeFileName(series.title, episode, width)),
        })),
    );
    setPlan(chosen);
    setQueue(created);
    setScreen('downloads');
  };

  const reset = () => {
    setQueue(undefined);
    setSeries(undefined);
    setSelection(undefined);
    setError(undefined);
    setScreen('home');
  };

  const subtitle = {
    home: 'recherche',
    results: 'résultats',
    episodes: 'épisodes',
    options: 'options',
    downloads: 'téléchargements',
  }[screen];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header subtitle={subtitle} />
      {warning ? <Text color="yellow">⚠ {warning}</Text> : null}
      <Box marginTop={1} flexDirection="column">
        {screen === 'home' ? (
          <Home initialQuery={query} loading={loading} error={error} onSubmit={submit} onQuit={quit} />
        ) : null}
        {screen === 'results' ? (
          <Results
            query={query}
            results={results}
            loading={loading}
            error={error}
            onSelect={(result) => void openSeries(result.url)}
            onBack={() => {
              setError(undefined);
              setScreen('home');
            }}
          />
        ) : null}
        {screen === 'episodes' && series ? (
          <EpisodePicker
            series={series}
            downloaded={downloaded}
            initialSelection={selection}
            onConfirm={(picked) => {
              setSelection(picked);
              setScreen('options');
            }}
            onBack={() => setScreen(cameFromResults.current ? 'results' : 'home')}
          />
        ) : null}
        {screen === 'options' && series && selection && plan ? (
          <Options
            seriesTitle={series.title}
            count={selection.size}
            initial={plan}
            onStart={start}
            onBack={() => setScreen('episodes')}
          />
        ) : null}
        {screen === 'downloads' && queue && plan ? (
          <Downloads queue={queue} outputDir={plan.outputDir} onNew={reset} onQuit={quit} />
        ) : null}
      </Box>
    </Box>
  );
}
