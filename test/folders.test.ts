import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildYtDlpArgs } from '../src/core/downloader.js';
import { completeFolder, listFolders, longestCommonPrefix, seriesFolder, splitForCompletion } from '../src/core/folders.js';
import { ffmpegAsset, ytDlpAsset } from '../src/core/tools.js';

describe('folder autocompletion', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'adl-folders-'));
    for (const name of ['Anime', 'animations', 'b', 'Series 10', 'Series 2', '.hidden']) await mkdir(path.join(root, name));
    await writeFile(path.join(root, 'file.txt'), 'x');
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('lists sub-folders only, sorted naturally, hiding dot folders', async () => {
    expect(await listFolders(root)).toEqual(['animations', 'Anime', 'b', 'Series 2', 'Series 10']);
    expect(await listFolders(root, true)).toContain('.hidden');
  });

  it('splits the typed path into folder and partial name', () => {
    expect(splitForCompletion('~/Dow', 'darwin')).toEqual({ typedDir: '~/', partial: 'Dow' });
    expect(splitForCompletion('~', 'linux')).toEqual({ typedDir: '~/', partial: '' });
    expect(splitForCompletion('/a/b/', 'linux')).toEqual({ typedDir: '/a/b/', partial: '' });
    expect(splitForCompletion('C:\\Users\\me\\Vid', 'win32')).toEqual({ typedDir: 'C:\\Users\\me\\', partial: 'Vid' });
    expect(splitForCompletion('D:', 'win32')).toEqual({ typedDir: 'D:\\', partial: '' });
    expect(splitForCompletion('Anime', 'linux')).toEqual({ typedDir: '', partial: 'Anime' });
  });

  it('suggests matching folders, case-insensitively, exact case first', async () => {
    const typed = `${root}/ani`;
    expect(await completeFolder(typed, root, 'linux')).toEqual([`${root}/animations/`, `${root}/Anime/`]);
    expect(await completeFolder(`${root}/Series`, root, 'linux')).toEqual([`${root}/Series 2/`, `${root}/Series 10/`]);
    expect(await completeFolder(`${root}/.h`, root, 'linux')).toEqual([`${root}/.hidden/`]);
    expect(await completeFolder(`${root}/nope/x`, root, 'linux')).toEqual([]);
  });

  it('completes relative paths from the working folder', async () => {
    expect(await completeFolder('b', root, 'linux')).toEqual(['b/']);
  });

  it('finds what all suggestions share', () => {
    expect(longestCommonPrefix(['/x/Series 2/', '/x/Series 10/'])).toBe('/x/Series ');
    expect(longestCommonPrefix(['/x/animations/', '/x/Anime/'])).toBe('/x/anim');
    expect(longestCommonPrefix([])).toBe('');
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
