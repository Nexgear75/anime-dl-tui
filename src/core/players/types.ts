export interface ResolvedStream {
  /** Direct media URL (HLS playlist or progressive file). */
  url: string;
  /** Headers the CDN expects when fetching the media. */
  headers: Record<string, string>;
  /** Name of the player that produced the stream, for display. */
  player: string;
}

export interface Player {
  /** Short identifier used in config and CLI flags. */
  id: string;
  name: string;
  /** Whether this player knows how to extract the given embed URL. */
  handles(embedUrl: string): boolean;
  resolve(embedUrl: string, signal?: AbortSignal): Promise<ResolvedStream>;
}

export class ExtractionError extends Error {
  constructor(player: string, message: string) {
    super(`${player} : ${message}`);
    this.name = 'ExtractionError';
  }
}
