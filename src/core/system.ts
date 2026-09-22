import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { DEFAULT_BASE_URL } from './voiranime.js';

const configDir = () =>
  process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, 'anime-dl-tui')
    : path.join(homedir(), '.config', 'anime-dl-tui');

export const configPath = () => path.join(configDir(), 'config.json');
export const logPath = () => path.join(configDir(), 'anime-dl-tui.log');

export interface Settings {
  /** Parent folder; each series gets its own sub-folder. */
  downloadDir: string;
  concurrency: number;
  preferredPlayer: string;
  baseUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  downloadDir: path.join(homedir(), 'Downloads', 'Anime'),
  concurrency: 2,
  preferredPlayer: 'vidmoly',
  baseUrl: DEFAULT_BASE_URL,
};

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = JSON.parse(await readFile(configPath(), 'utf8')) as Partial<Settings>;
    const settings = { ...DEFAULT_SETTINGS, ...raw };
    settings.concurrency = Math.min(8, Math.max(1, Math.trunc(Number(settings.concurrency)) || 2));
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await mkdir(configDir(), { recursive: true });
    await writeFile(configPath(), `${JSON.stringify(settings, null, 2)}\n`);
  } catch {
    // Settings are a convenience; failing to save them must not break a download.
  }
}

export async function writeLog(lines: string[]): Promise<void> {
  try {
    await mkdir(configDir(), { recursive: true });
    const stamp = new Date().toISOString();
    await appendFile(logPath(), lines.map((line) => `[${stamp}] ${line}`).join('\n') + '\n');
  } catch {
    // Logging must never crash the app.
  }
}
