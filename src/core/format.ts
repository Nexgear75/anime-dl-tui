import { homedir } from 'node:os';
import path from 'node:path';
import type { Episode } from './voiranime.js';

export function expandHome(input: string): string {
  const value = input.trim();
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(homedir(), value.slice(2));
  return value;
}

/** Shortens a path under the home directory to `~/…` for display. */
export function tildify(input: string): string {
  const home = homedir();
  return input === home || input.startsWith(home + path.sep) ? `~${input.slice(home.length)}` : input;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned.slice(0, 180) || 'Anime';
}

export function episodeFileName(seriesTitle: string, episode: Episode, width: number): string {
  const series = sanitizeFilename(seriesTitle);
  if (episode.number === null) return `${sanitizeFilename(episode.label)}.mp4`;
  const [whole, fraction] = String(episode.number).split('.');
  const number = whole!.padStart(width, '0') + (fraction ? `.${fraction}` : '');
  return `${series} - ${number}.mp4`;
}

export function numberWidth(episodes: Episode[]): number {
  const max = Math.max(0, ...episodes.map((episode) => Math.trunc(episode.number ?? 0)));
  return Math.max(2, String(max).length);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export const formatSpeed = (speed: number | null | undefined) =>
  speed ? `${formatBytes(speed)}/s` : '—';

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Parses an episode selection such as `1-5, 8, 10-` (open ranges run to the
 * end) and returns the matching episode ids. `*` or `all` selects everything.
 */
export function parseSelection(input: string, episodes: Episode[]): Set<string> {
  const selected = new Set<string>();
  const text = input.trim().toLowerCase();
  if (text === '*' || text === 'all' || text === 'tout') {
    for (const episode of episodes) selected.add(episode.id);
    return selected;
  }
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d+(?:\.\d+)?)?(?:(-)(\d+(?:\.\d+)?)?)?$/.exec(part);
    if (!match || (!match[1] && !match[3])) throw new Error(`Sélection invalide : « ${part} »`);
    const from = match[1] ? Number(match[1]) : -Infinity;
    const to = match[2] ? (match[3] ? Number(match[3]) : Infinity) : from;
    for (const episode of episodes) {
      if (episode.number !== null && episode.number >= from && episode.number <= to) {
        selected.add(episode.id);
      }
    }
  }
  return selected;
}

export function truncate(text: string, width: number): string {
  if (width <= 1) return text.slice(0, Math.max(0, width));
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}
