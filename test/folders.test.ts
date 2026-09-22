import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildYtDlpArgs } from '../src/core/downloader.js';
import { DRIVES, listFolders, nearestExisting, parentFolder, seriesFolder } from '../src/core/folders.js';
import { ffmpegAsset, ytDlpAsset } from '../src/core/tools.js';

describe('folder picker helpers', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'adl-folders-'));
    for (const name of ['Anime', 'b', 'Series 10', 'Series 2', '.hidden']) await mkdir(path.join(root, name));
    await writeFile(path.join(root, 'file.txt'), 'x');
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('lists sub-folders only, sorted naturally, hiding dot folders', async () => {
    expect(await listFolders(root)).toEqual(['Anime', 'b', 'Series 2', 'Series 10']);
    expect(await listFolders(root, true)).toContain('.hidden');
  });

  it('finds the closest existing folder', async () => {
    expect(await nearestExisting(path.join(root, 'Anime', 'New', 'Deeper'))).toBe(path.join(root, 'Anime'));
  });

  it('goes up to the drive list on Windows and stops at / elsewhere', () => {
    expect(parentFolder('/home/me', 'linux')).toBe('/home');
    expect(parentFolder('/', 'linux')).toBeNull();
    expect(parentFolder('C:\\Users', 'win32')).toBe('C:\\');
    expect(parentFolder('C:\\', 'win32')).toBe(DRIVES);
    expect(parentFolder(DRIVES, 'win32')).toBeNull();
  });

  it('puts the series in its own sub-folder', () => {
    expect(seriesFolder(path.join(root, 'Anime'), 'One Piece')).toBe(path.join(root, 'Anime', 'One Piece'));
    expect(seriesFolder(path.join(root, 'One Piece'), 'One Piece')).toBe(path.join(root, 'One Piece'));
  });
});

describe('tools', () => {
  it('picks the right yt-dlp and ffmpeg builds', () => {
    expect(ytDlpAsset('win32', 'x64')).toBe('yt-dlp.exe');
    expect(ytDlpAsset('darwin', 'arm64')).toBe('yt-dlp_macos');
    expect(ytDlpAsset('linux', 'arm64')).toBe('yt-dlp_linux_aarch64');
    expect(ffmpegAsset('win32', 'x64')).toBe('ffmpeg-master-latest-win64-gpl.zip');
    expect(ffmpegAsset('darwin', 'arm64')).toBeNull();
  });

  it('passes a non-PATH ffmpeg to yt-dlp', () => {
    const base = { url: 'https://x/m.m3u8', headers: {}, output: '/tmp/a.mp4' };
    expect(buildYtDlpArgs(base)).not.toContain('--ffmpeg-location');
    expect(buildYtDlpArgs({ ...base, ffmpegPath: 'ffmpeg' })).not.toContain('--ffmpeg-location');
    const args = buildYtDlpArgs({ ...base, ffmpegPath: 'C:\\bin\\ffmpeg.exe' });
    expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe('C:\\bin\\ffmpeg.exe');
  });
});
