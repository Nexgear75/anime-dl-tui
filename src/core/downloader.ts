import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { USER_AGENT } from './http.js';

export interface DownloadProgress {
  downloadedBytes: number;
  /** Exact or estimated size, null while unknown. */
  totalBytes: number | null;
  /** Bytes per second. */
  speed: number | null;
  /** Seconds remaining. */
  eta: number | null;
  /** 0..1, null while unknown. */
  ratio: number | null;
}

export interface DownloadRequest {
  url: string;
  headers: Record<string, string>;
  /** Final file path (the extension should be .mp4). */
  output: string;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  /** Parallel HLS fragments per download. */
  fragments?: number;
  ytDlpPath?: string;
  /** ffmpeg binary to use when it is not on the PATH. */
  ffmpegPath?: string;
}

// Children still running when Node exits (crash, forced quit) would keep
// downloading in the background, so they are killed on exit.
const children = new Set<ReturnType<typeof spawn>>();
process.on('exit', () => {
  for (const child of children) child.kill('SIGKILL');
});

const MARKER = 'ADLPROGRESS';
const FIELDS = [
  'downloaded_bytes',
  'total_bytes',
  'total_bytes_estimate',
  'speed',
  'eta',
  'fragment_index',
  'fragment_count',
] as const;
const PROGRESS_TEMPLATE = `download:${MARKER}|${FIELDS.map((f) => `%(progress.${f})s`).join('|')}`;

const toNumber = (value: string | undefined) => {
  if (value === undefined || value === 'NA' || value === 'None' || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Parses one line printed through PROGRESS_TEMPLATE; returns null for other lines. */
export function parseProgressLine(line: string): DownloadProgress | null {
  const start = line.indexOf(`${MARKER}|`);
  if (start === -1) return null;
  const values = line.slice(start + MARKER.length + 1).trim().split('|');
  const [downloaded, total, estimate, speed, eta, fragmentIndex, fragmentCount] = values.map(toNumber);

  const totalBytes = total ?? estimate ?? null;
  let ratio: number | null = null;
  if (fragmentIndex !== null && fragmentIndex !== undefined && fragmentCount) {
    ratio = fragmentIndex / fragmentCount;
  } else if (totalBytes && downloaded !== null && downloaded !== undefined) {
    ratio = downloaded / totalBytes;
  }

  return {
    downloadedBytes: downloaded ?? 0,
    totalBytes,
    speed: speed ?? null,
    eta: eta ?? null,
    ratio: ratio === null ? null : Math.min(1, Math.max(0, ratio)),
  };
}

export function buildYtDlpArgs(request: DownloadRequest): string[] {
  const headers = { 'User-Agent': USER_AGENT, ...request.headers };
  return [
    '--quiet',
    '--progress',
    '--newline',
    '--no-warnings',
    '--color',
    'no_color',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--no-playlist',
    '--no-mtime',
    '--continue',
    '--retries',
    '10',
    '--fragment-retries',
    '10',
    '--retry-sleep',
    'fragment:exp=1:20',
    '--concurrent-fragments',
    String(request.fragments ?? 8),
    ...Object.entries(headers).flatMap(([name, value]) => ['--add-headers', `${name}:${value}`]),
    ...(request.ffmpegPath && request.ffmpegPath !== 'ffmpeg' ? ['--ffmpeg-location', request.ffmpegPath] : []),
    '-o',
    request.output,
    '--',
    request.url,
  ];
}

export class DownloadError extends Error {
  constructor(
    message: string,
    readonly log: string[],
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

/**
 * Downloads a stream with yt-dlp. Aborting sends SIGINT so yt-dlp keeps its
 * `.part` file, and the next attempt resumes where it stopped.
 */
export function download(request: DownloadRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const { signal } = request;
    if (signal?.aborted) return reject(signal.reason);

    const child = spawn(request.ytDlpPath ?? 'yt-dlp', buildYtDlpArgs(request), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    children.add(child);

    const log: string[] = [];
    let lastError = '';
    const remember = (line: string) => {
      log.push(line);
      if (log.length > 40) log.shift();
      if (/^ERROR:/.test(line)) lastError = line.replace(/^ERROR:\s*/, '');
    };

    const onLine = (line: string) => {
      const progress = parseProgressLine(line);
      if (progress) request.onProgress?.(progress);
      else if (line.trim()) remember(line.trim());
    };
    createInterface({ input: child.stdout }).on('line', onLine);
    createInterface({ input: child.stderr }).on('line', onLine);

    // yt-dlp does not always honour SIGINT while fragment threads are busy,
    // so escalate until it stops.
    const timers: NodeJS.Timeout[] = [];
    const onAbort = () => {
      child.kill('SIGINT');
      timers.push(setTimeout(() => child.kill('SIGTERM'), 1500));
      timers.push(setTimeout(() => child.kill('SIGKILL'), 5000));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (error: NodeJS.ErrnoException) => {
      children.delete(child);
      signal?.removeEventListener('abort', onAbort);
      reject(
        error.code === 'ENOENT'
          ? new DownloadError('yt-dlp est introuvable. Lance « adl --install-tools ».', log)
          : error,
      );
    });

    child.on('close', (code) => {
      children.delete(child);
      timers.forEach(clearTimeout);
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(signal.reason);
      if (code === 0) return resolve();
      reject(new DownloadError(lastError || `yt-dlp a échoué (code ${code})`, log));
    });
  });
}
