import { fetchText } from '../http.js';
import { ExtractionError, type Player } from './types.js';

// VidMoly serves the same embed page from several mirror domains.
const DOMAINS = ['vidmoly', 'voembed'];

export function extractVidmolyStream(html: string): string | null {
  const patterns = [
    /sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+)['"]/,
    /file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/,
    /['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/,
  ];
  for (const pattern of patterns) {
    const url = pattern.exec(html)?.[1];
    if (url && /^https?:\/\//.test(url)) return url;
  }
  return null;
}

export const vidmoly: Player = {
  id: 'vidmoly',
  name: 'VidMoly',

  handles: (embedUrl) => {
    const host = new URL(embedUrl).hostname.toLowerCase();
    return DOMAINS.some((domain) => host.includes(domain));
  },

  async resolve(embedUrl, signal) {
    const origin = `${new URL(embedUrl).origin}/`;
    const html = await fetchText(embedUrl, { referer: origin, signal });
    if (/File was deleted|File not found|Video not found/i.test(html)) {
      throw new ExtractionError(this.name, 'vidéo supprimée chez l’hébergeur');
    }
    const url = extractVidmolyStream(html);
    if (!url) throw new ExtractionError(this.name, 'lien HLS introuvable dans la page');
    return { url, headers: { Referer: origin, Origin: origin.slice(0, -1) }, player: this.name };
  },
};
