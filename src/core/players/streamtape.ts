import { request, fetchText } from '../http.js';
import { ExtractionError, type Player } from './types.js';

const DOMAINS = ['streamtape', 'strtape', 'stape', 'tapecontent', 'streamta.pe'];

/**
 * Streamtape hides the file link in an obfuscated innerHTML assignment:
 * `document.getElementById('botlink').innerHTML = '//streamtape.com/get_video?id=' + ('xcdabc...').substring(3)`
 */
export function extractStreamtapeLink(html: string): string | null {
  const match =
    /getElementById\(\s*['"]botlink['"]\s*\)\.innerHTML\s*=\s*['"]([^'"]*)['"]\s*\+\s*\(?\s*['"]([^'"]+)['"]\s*\)?\s*\.substring\(\s*(\d+)\s*\)(?:\s*\.substring\(\s*(\d+)\s*\))?/.exec(
      html,
    );
  if (!match) return null;
  const [, prefix, token, first, second] = match;
  let tail = token!.substring(Number(first));
  if (second) tail = tail.substring(Number(second));
  const path = prefix! + tail;
  if (path.startsWith('//')) return `https:${path}`;
  if (path.startsWith('/')) return `https://streamtape.com${path}`;
  return path;
}

export const streamtape: Player = {
  id: 'streamtape',
  name: 'Streamtape',

  handles: (embedUrl) => {
    const host = new URL(embedUrl).hostname.toLowerCase();
    return DOMAINS.some((domain) => host.includes(domain));
  },

  async resolve(embedUrl, signal) {
    const html = await fetchText(embedUrl, { signal });
    const link = extractStreamtapeLink(html);
    if (!link) throw new ExtractionError(this.name, 'lien vidéo introuvable (vidéo supprimée ?)');

    const streamUrl = `${link}&stream=1`;
    const response = await request(streamUrl, { redirect: 'manual', signal });
    const location = response.headers.get('location');
    await response.body?.cancel();
    return {
      url: location ? new URL(location, streamUrl).href : streamUrl,
      headers: { Referer: 'https://streamtape.com/' },
      player: this.name,
    };
  },
};
