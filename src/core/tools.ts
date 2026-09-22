import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { promisify } from 'node:util';

const run = promisify(execFile);
const isWindows = process.platform === 'win32';
const exe = (name: string) => (isWindows ? `${name}.exe` : name);

export interface Tool {
  name: string;
  ok: boolean;
  /** Command or absolute path to run it with. */
  path: string;
  version?: string;
}

/**
 * Folder where `adl --install-tools` puts yt-dlp and ffmpeg. The app looks
 * there too, so the tools work without touching the PATH.
 */
export function toolsDir(): string {
  if (isWindows) {
    const base = process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local');
    return path.join(base, 'anime-dl-tui', 'bin');
  }
  const base = process.env.XDG_DATA_HOME ?? path.join(homedir(), '.local', 'share');
  return path.join(base, 'anime-dl-tui', 'bin');
}

/** Places to look for a tool, in order: PATH, our own folder, winget's links (new shells only). */
export function toolCandidates(name: string): string[] {
  const candidates = [name, path.join(toolsDir(), exe(name))];
  if (isWindows && process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', exe(name)));
  }
  return candidates;
}

async function probe(name: string, args: string[]): Promise<Tool> {
  for (const candidate of toolCandidates(name)) {
    try {
      const { stdout } = await run(candidate, args, { timeout: 15_000, windowsHide: true });
      return { name, ok: true, path: candidate, version: stdout.split('\n')[0]?.trim() };
    } catch {
      // Try the next location.
    }
  }
  return { name, ok: false, path: name };
}

/** yt-dlp downloads the streams; ffmpeg lets it remux HLS into a clean mp4. */
export async function checkTools(): Promise<{ ytDlp: Tool; ffmpeg: Tool }> {
  const [ytDlp, ffmpeg] = await Promise.all([probe('yt-dlp', ['--version']), probe('ffmpeg', ['-version'])]);
  return { ytDlp, ffmpeg };
}

export const INSTALL_HINTS: Record<string, string> = {
  'yt-dlp': 'Lance « adl --install-tools » pour l’installer automatiquement.',
  ffmpeg:
    process.platform === 'darwin'
      ? 'Installe-le avec « brew install ffmpeg ».'
      : 'Lance « adl --install-tools » pour l’installer automatiquement.',
};

const YTDLP_RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/';
const FFMPEG_RELEASE = 'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/';

/** Standalone yt-dlp binary for this platform (no Python needed). */
export function ytDlpAsset(platform = process.platform, arch = process.arch): string | null {
  if (platform === 'win32') return arch === 'arm64' ? 'yt-dlp_arm64.exe' : arch === 'ia32' ? 'yt-dlp_x86.exe' : 'yt-dlp.exe';
  if (platform === 'darwin') return 'yt-dlp_macos';
  if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : arch === 'x64' ? 'yt-dlp_linux' : null;
  return null;
}

/** Static ffmpeg build for this platform; macOS has none (use Homebrew). */
export function ffmpegAsset(platform = process.platform, arch = process.arch): string | null {
  if (platform === 'win32') return arch === 'arm64' ? 'ffmpeg-master-latest-winarm64-gpl.zip' : 'ffmpeg-master-latest-win64-gpl.zip';
  if (platform === 'linux') {
    if (arch === 'x64') return 'ffmpeg-master-latest-linux64-gpl.tar.xz';
    if (arch === 'arm64') return 'ffmpeg-master-latest-linuxarm64-gpl.tar.xz';
  }
  return null;
}

async function downloadFile(url: string, destination: string, label: string, log: (line: string) => void) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${label} : téléchargement impossible (HTTP ${response.status})`);

  const total = Number(response.headers.get('content-length')) || 0;
  let received = 0;
  let lastShown = -1;
  const body = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    received += chunk.length;
    const percent = total ? Math.floor((received / total) * 100) : -1;
    if (percent >= lastShown + 10) {
      lastShown = percent;
      log(`  ${label} : ${percent}%`);
    }
  });
  await pipeline(body, createWriteStream(destination));
}

async function findFile(folder: string, name: string): Promise<string | null> {
  for (const entry of await readdir(folder, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name === name) return path.join(entry.parentPath, entry.name);
  }
  return null;
}

/**
 * Downloads yt-dlp (and ffmpeg where a static build exists) into toolsDir().
 * Running it again updates them.
 */
export async function installTools(log: (line: string) => void = console.log): Promise<void> {
  const dir = toolsDir();
  await mkdir(dir, { recursive: true });

  const ytAsset = ytDlpAsset();
  if (!ytAsset) throw new Error(`Pas de yt-dlp prêt à l’emploi pour ${process.platform}/${process.arch}.`);
  log('Téléchargement de yt-dlp…');
  const ytTarget = path.join(dir, exe('yt-dlp'));
  await downloadFile(YTDLP_RELEASE + ytAsset, `${ytTarget}.download`, 'yt-dlp', log);
  await rename(`${ytTarget}.download`, ytTarget);
  if (!isWindows) await chmod(ytTarget, 0o755);
  log(`✔ yt-dlp installé dans ${ytTarget}`);

  const ffAsset = ffmpegAsset();
  if (!ffAsset) {
    log(`ffmpeg : ${INSTALL_HINTS.ffmpeg}`);
    return;
  }
  log('Téléchargement de ffmpeg (≈ 150 à 200 Mo, patience)…');
  const work = await mkdtemp(path.join(tmpdir(), 'adl-ffmpeg-'));
  try {
    const archive = path.join(work, ffAsset);
    await downloadFile(FFMPEG_RELEASE + ffAsset, archive, 'ffmpeg', log);
    // Windows 10+ ships bsdtar, which reads zip archives too; call it by full path
    // because a GNU tar from Git for Windows may come first on the PATH and cannot.
    const tar = isWindows ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    await run(tar, ['-xf', archive, '-C', work], { windowsHide: true });
    for (const tool of ['ffmpeg', 'ffprobe']) {
      const found = await findFile(work, exe(tool));
      if (!found) throw new Error(`${tool} introuvable dans l’archive téléchargée.`);
      await copyFile(found, path.join(dir, exe(tool)));
      if (!isWindows) await chmod(path.join(dir, exe(tool)), 0o755);
    }
    log(`✔ ffmpeg installé dans ${dir}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
