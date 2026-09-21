import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildYtDlpArgs, parseProgressLine } from '../src/core/downloader.js';
import { episodeFileName, numberWidth, parseSelection, sanitizeFilename } from '../src/core/format.js';
import { candidates, playerFor } from '../src/core/players/index.js';
import { extractStreamtapeLink } from '../src/core/players/streamtape.js';
import { extractVidmolyStream } from '../src/core/players/vidmoly.js';
import {
  episodeNumber,
  normalizeSeriesUrl,
  parseSearch,
  parseSeries,
  parseSources,
  type Episode,
} from '../src/core/voiranime.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const SERIES_URL = 'https://voir-anime.to/anime/mushoku-tensei-3/';

describe('normalizeSeriesUrl', () => {
  it('keeps series URLs and adds the trailing slash', () => {
    expect(normalizeSeriesUrl('https://voir-anime.to/anime/mushoku-tensei-3')).toBe(SERIES_URL);
  });
  it('maps an episode URL to its series', () => {
    expect(
      normalizeSeriesUrl('https://voir-anime.to/anime/mushoku-tensei-3/mushoku-tensei-3-01-vostfr/?host=x'),
    ).toBe(SERIES_URL);
  });
  it('rejects other pages', () => {
    expect(() => normalizeSeriesUrl('https://voir-anime.to/')).toThrow();
    expect(() => normalizeSeriesUrl('pas une url')).toThrow();
  });
});

describe('parseSeries', () => {
  const series = parseSeries(fixture('series.html'), SERIES_URL);

  it('reads the title', () => {
    expect(series.title).toBe('Mushoku Tensei 3');
  });
  it('lists episodes in order, without the feed link', () => {
    expect(series.episodes).toHaveLength(13);
    expect(series.episodes.map((e) => e.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(series.episodes[0]!.url).toBe(`${SERIES_URL}mushoku-tensei-3-01-vostfr/`);
  });
});

describe('episodeNumber', () => {
  it('does not confuse the season with the episode', () => {
    expect(episodeNumber('mushoku-tensei-3-01-vostfr', '')).toBe(1);
    expect(episodeNumber('one-piece-1179-vostfr', '')).toBe(1179);
  });
  it('returns null for films', () => {
    expect(episodeNumber('film-vf-one-piece-red', '(FILM VF) One Piece Red')).toBeNull();
  });
});

describe('parseSearch', () => {
  const results = parseSearch(fixture('search.html'));
  it('extracts titles, links and language', () => {
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.url).toMatch(/^https:\/\/voir-anime\.to\/anime\/[^/]+\/$/);
      expect(result.title).not.toBe('');
      expect(result.language).toBe(result.url.includes('-vf/') ? 'VF' : 'VOSTFR');
    }
  });
});

describe('parseSources', () => {
  it('reads every host from thisChapterSources', () => {
    const sources = parseSources(fixture('episode.html'));
    expect(sources['LECTEUR myTV']).toBe('https://voembed.net/embed-63lsjrk2zg6a.html');
    expect(Object.keys(sources)).toEqual(['LECTEUR myTV', 'LECTEUR MOON', 'LECTEUR VOE', 'LECTEUR Stape']);
  });
  it('falls back to iframes when the script is missing', () => {
    const sources = parseSources('<div id="chapter-video-frame"><iframe src="https://vidmoly.biz/embed-a.html"></iframe></div>');
    expect(Object.values(sources)).toEqual(['https://vidmoly.biz/embed-a.html']);
  });
});

describe('players', () => {
  it('recognises VidMoly mirrors and Streamtape', () => {
    expect(playerFor('https://voembed.net/embed-x.html')?.id).toBe('vidmoly');
    expect(playerFor('https://vidmoly.biz/embed-x.html')?.id).toBe('vidmoly');
    expect(playerFor('https://streamtape.com/e/abc')?.id).toBe('streamtape');
    expect(playerFor('https://voe.sx/e/abc')).toBeUndefined();
  });
  it('orders candidates with the preferred player first', () => {
    const sources = parseSources(fixture('episode.html'));
    expect(candidates(sources, 'streamtape').map((c) => c.player.id)).toEqual(['streamtape', 'vidmoly']);
    expect(candidates(sources).map((c) => c.player.id)).toEqual(['vidmoly', 'streamtape']);
  });
  it('extracts the VidMoly HLS playlist', () => {
    expect(extractVidmolyStream(fixture('vidmoly.html'))).toMatch(/^https:\/\/.+master\.m3u8\?t=TOKEN/);
    expect(extractVidmolyStream('<html>rien</html>')).toBeNull();
  });
  it('decodes the Streamtape botlink', () => {
    const html = `document.getElementById('botlink').innerHTML = '//streamtape.com/get_' + ('xyzvideo?id=abc&token=t').substring(3);`;
    expect(extractStreamtapeLink(html)).toBe('https://streamtape.com/get_video?id=abc&token=t');
  });
});

describe('yt-dlp progress', () => {
  it('parses HLS fragment progress', () => {
    const progress = parseProgressLine('ADLPROGRESS|1048576|NA|10485760|524288.5|18|25|100');
    expect(progress).toEqual({
      downloadedBytes: 1048576,
      totalBytes: 10485760,
      speed: 524288.5,
      eta: 18,
      ratio: 0.25,
    });
  });
  it('falls back to bytes and tolerates missing values', () => {
    expect(parseProgressLine('ADLPROGRESS|50|100|NA|NA|NA|NA|NA')?.ratio).toBe(0.5);
    expect(parseProgressLine('ADLPROGRESS|NA|NA|NA|NA|NA|NA|NA')?.ratio).toBeNull();
    expect(parseProgressLine('[download] Destination: x.mp4')).toBeNull();
  });
  it('passes headers and output to yt-dlp', () => {
    const args = buildYtDlpArgs({ url: 'https://x/m.m3u8', headers: { Referer: 'https://r/' }, output: '/tmp/a.mp4' });
    expect(args).toContain('Referer:https://r/');
    expect(args.slice(-4)).toEqual(['-o', '/tmp/a.mp4', '--', 'https://x/m.m3u8']);
  });
});

describe('selection and file names', () => {
  const episodes: Episode[] = [1, 2, 3, 4, 5, 10, 12].map((n) => ({
    id: `e${n}`,
    number: n,
    label: `Episode ${n}`,
    url: '',
  }));

  it('parses ranges, lists and open ranges', () => {
    expect([...parseSelection('1-3, 10', episodes)]).toEqual(['e1', 'e2', 'e3', 'e10']);
    expect([...parseSelection('5-', episodes)]).toEqual(['e5', 'e10', 'e12']);
    expect(parseSelection('all', episodes).size).toBe(7);
    expect(() => parseSelection('abc', episodes)).toThrow();
  });

  it('builds sortable, safe file names', () => {
    expect(sanitizeFilename('Re:Zero / Saison 2?')).toBe('Re Zero Saison 2');
    const width = numberWidth(episodes);
    expect(episodeFileName('Mushoku Tensei 3', episodes[0]!, width)).toBe('Mushoku Tensei 3 - 01.mp4');
    expect(
      episodeFileName('One Piece', { id: 'f', number: null, label: '(FILM VF) One Piece Red', url: '' }, width),
    ).toBe('(FILM VF) One Piece Red.mp4');
  });
});
