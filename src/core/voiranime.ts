import * as cheerio from 'cheerio';
import { fetchText } from './http.js';

export const DEFAULT_BASE_URL = 'https://voir-anime.to';

export type Language = 'VF' | 'VOSTFR';

export interface SearchResult {
  title: string;
  url: string;
  language: Language;
  type?: string;
  status?: string;
  year?: string;
}

export interface Episode {
  /** Last path segment of the episode URL, unique within a series. */
  id: string;
  /** Episode number, or null for films/specials that carry none. */
  number: number | null;
  label: string;
  url: string;
}

export interface Series {
  title: string;
  url: string;
  episodes: Episode[];
}

/** Host label as shown on the site (e.g. "LECTEUR myTV") mapped to its embed URL. */
export type EpisodeSources = Record<string, string>;

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

const languageOf = (value: string): Language => (/(^|[-\s(])vf([-\s)/]|$)/i.test(value) ? 'VF' : 'VOSTFR');

/**
 * Accepts a series URL or an episode URL and returns the canonical series URL
 * (`<origin>/anime/<slug>/`).
 */
export function normalizeSeriesUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`URL invalide : ${input}`);
  }
  const [kind, slug] = url.pathname.split('/').filter(Boolean);
  if (kind !== 'anime' || !slug) {
    throw new Error(`Ce n'est pas une page d'anime voir-anime : ${input}`);
  }
  return `${url.origin}/anime/${slug}/`;
}

export function parseSearch(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  $('.c-tabs-item__content').each((_, element) => {
    const item = $(element);
    const link = item.find('.post-title a, h3 a').first();
    const url = link.attr('href');
    const title = clean(link.text());
    if (!url || !title || seen.has(url)) return;
    seen.add(url);

    const meta: Record<string, string> = {};
    item.find('.post-content_item').each((_, row) => {
      const key = clean($(row).find('.summary-heading').text()).toLowerCase();
      const value = clean($(row).find('.summary-content').text());
      if (key) meta[key] = value;
    });

    results.push({
      title,
      url,
      language: languageOf(`${title} ${url}`),
      type: meta.type || undefined,
      status: meta.status || undefined,
      year: meta['année'] || meta.year || undefined,
    });
  });

  return results;
}

/** Extracts an episode number from a slug like `mushoku-tensei-3-01-vostfr`. */
export function episodeNumber(slug: string, label: string): number | null {
  const fromSlug = /-(\d+)-(?:vostfr|vf)$/i.exec(slug);
  if (fromSlug) return Number(fromSlug[1]);
  // Labels look like "Mushoku Tensei 3 - 13 VOSTFR - 13"
  const fromLabel = /-\s*(\d+(?:[.,]\d+)?)\s*(?:VOSTFR|VF)?\s*(?:-|$)/i.exec(label);
  if (fromLabel) return Number(fromLabel[1]!.replace(',', '.'));
  return null;
}

export function parseSeries(html: string, seriesUrl: string): Series {
  const $ = cheerio.load(html);
  const base = normalizeSeriesUrl(seriesUrl);

  const title =
    clean($('.post-title h1').first().text()) ||
    clean($('meta[property="og:title"]').last().attr('content') ?? '') ||
    base.split('/').filter(Boolean).pop()!;

  const episodes: Episode[] = [];
  const seen = new Set<string>();

  const collect = (selector: string) => {
    $(selector).each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;
      let url: string;
      try {
        url = new URL(href, base).href;
      } catch {
        return;
      }
      if (!url.startsWith(base)) return;
      const id = url.slice(base.length).split('/').filter(Boolean)[0];
      if (!id || id === 'feed' || id.startsWith('#') || seen.has(id)) return;
      if (!/(vostfr|vf)/i.test(id)) return;
      seen.add(id);
      const label = clean($(element).text()) || id;
      episodes.push({ id, number: episodeNumber(id, label), label, url: `${base}${id}/` });
    });
  };

  collect('li.wp-manga-chapter a');
  // Theme changes can drop the list markup; fall back to any matching link.
  if (episodes.length === 0) collect('a[href]');

  episodes.sort((a, b) => {
    if (a.number === null && b.number === null) return a.label.localeCompare(b.label);
    if (a.number === null) return 1;
    if (b.number === null) return -1;
    return a.number - b.number;
  });

  return { title, url: base, episodes };
}

export function parseSources(html: string): EpisodeSources {
  const sources: EpisodeSources = {};
  const match = /var\s+thisChapterSources\s*=\s*(\{.*\})\s*;/.exec(html);
  if (match) {
    try {
      const raw = JSON.parse(match[1]!) as Record<string, string>;
      for (const [host, iframe] of Object.entries(raw)) {
        const src = /src=["']([^"']+)["']/i.exec(iframe)?.[1];
        if (src) sources[host] = src.startsWith('//') ? `https:${src}` : src;
      }
    } catch {
      // Malformed JSON: fall through to the iframe scan below.
    }
  }

  if (Object.keys(sources).length === 0) {
    const $ = cheerio.load(html);
    $('#chapter-video-frame iframe[src], iframe[src]').each((index, element) => {
      const src = $(element).attr('src')!;
      if (!Object.values(sources).includes(src)) sources[`iframe ${index + 1}`] = src;
    });
  }

  return sources;
}

export async function search(query: string, baseUrl = DEFAULT_BASE_URL, signal?: AbortSignal) {
  const url = new URL('/', baseUrl);
  url.searchParams.set('s', query);
  url.searchParams.set('post_type', 'wp-manga');
  return parseSearch(await fetchText(url.href, { signal }));
}

export async function getSeries(seriesUrl: string, signal?: AbortSignal) {
  const url = normalizeSeriesUrl(seriesUrl);
  return parseSeries(await fetchText(url, { signal }), url);
}

export async function getSources(episodeUrl: string, signal?: AbortSignal) {
  return parseSources(await fetchText(episodeUrl, { signal }));
}
