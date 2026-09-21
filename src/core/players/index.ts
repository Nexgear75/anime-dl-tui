import type { EpisodeSources } from '../voiranime.js';
import { streamtape } from './streamtape.js';
import type { Player, ResolvedStream } from './types.js';
import { vidmoly } from './vidmoly.js';

export type { Player, ResolvedStream } from './types.js';

export const PLAYERS: Player[] = [vidmoly, streamtape];
export const PLAYER_IDS = PLAYERS.map((player) => player.id);

export function playerFor(embedUrl: string): Player | undefined {
  try {
    return PLAYERS.find((player) => player.handles(embedUrl));
  } catch {
    return undefined; // malformed URL
  }
}

export interface Candidate {
  host: string;
  embedUrl: string;
  player: Player;
}

/** Supported sources of an episode, the preferred player first. */
export function candidates(sources: EpisodeSources, preferred?: string): Candidate[] {
  const list: Candidate[] = [];
  for (const [host, embedUrl] of Object.entries(sources)) {
    const player = playerFor(embedUrl);
    if (player) list.push({ host, embedUrl, player });
  }
  const rank = (candidate: Candidate) => {
    const index = PLAYERS.indexOf(candidate.player);
    return candidate.player.id === preferred ? -1 : index;
  };
  return list.sort((a, b) => rank(a) - rank(b));
}

/**
 * Tries each supported source in turn and returns the first stream that
 * resolves, so a dead host does not fail the episode.
 */
export async function resolveStream(
  sources: EpisodeSources,
  preferred?: string,
  signal?: AbortSignal,
): Promise<ResolvedStream> {
  const list = candidates(sources, preferred);
  if (list.length === 0) {
    const hosts = Object.keys(sources).join(', ') || 'aucun';
    throw new Error(`Aucun lecteur compatible (lecteurs disponibles : ${hosts})`);
  }
  const errors: string[] = [];
  for (const { host, embedUrl, player } of list) {
    signal?.throwIfAborted();
    try {
      return await player.resolve(embedUrl, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(`${host} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Tous les lecteurs ont échoué : ${errors.join(' | ')}`);
}
