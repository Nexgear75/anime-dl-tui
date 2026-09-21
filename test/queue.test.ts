import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadRequest } from '../src/core/downloader.js';
import type { Episode } from '../src/core/voiranime.js';

const download = vi.fn<(request: DownloadRequest) => Promise<void>>();

vi.mock('../src/core/voiranime.js', () => ({ getSources: vi.fn(async () => ({ host: 'https://voembed.net/e' })) }));
vi.mock('../src/core/players/index.js', () => ({
  resolveStream: vi.fn(async () => ({ url: 'https://cdn/master.m3u8', headers: {}, player: 'VidMoly' })),
}));
vi.mock('../src/core/downloader.js', async (original) => ({
  ...(await original<typeof import('../src/core/downloader.js')>()),
  download: (request: DownloadRequest) => download(request),
}));

const { DownloadQueue } = await import('../src/core/queue.js');

const episode = (n: number): Episode => ({ id: `e${n}`, number: n, label: `Episode ${n}`, url: `https://x/${n}/` });
const dir = () => mkdtempSync(path.join(tmpdir(), 'adl-test-'));
const untilIdle = (queue: InstanceType<typeof DownloadQueue>) =>
  new Promise<void>((resolve) => queue.once('idle', resolve));

beforeEach(() => {
  download.mockReset();
});

describe('DownloadQueue', () => {
  it('starts each job exactly once, even with spare concurrency', async () => {
    download.mockResolvedValue();
    const queue = new DownloadQueue({ concurrency: 4 });
    const idle = untilIdle(queue);
    const out = dir();
    queue.add([1, 2].map((n) => ({ episode: episode(n), output: path.join(out, `${n}.mp4`) })));
    await idle;
    expect(download).toHaveBeenCalledTimes(2);
    expect(queue.jobs.map((job) => job.status)).toEqual(['done', 'done']);
  });

  it('respects the concurrency limit', async () => {
    let running = 0;
    let peak = 0;
    download.mockImplementation(async () => {
      peak = Math.max(peak, ++running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running--;
    });
    const queue = new DownloadQueue({ concurrency: 2 });
    const idle = untilIdle(queue);
    const out = dir();
    queue.add([1, 2, 3, 4, 5].map((n) => ({ episode: episode(n), output: path.join(out, `${n}.mp4`) })));
    await idle;
    expect(peak).toBe(2);
    expect(download).toHaveBeenCalledTimes(5);
  });

  it('skips files that already exist', async () => {
    const out = dir();
    const file = path.join(out, '1.mp4');
    writeFileSync(file, 'video');
    const queue = new DownloadQueue({ concurrency: 1 });
    const idle = untilIdle(queue);
    queue.add([{ episode: episode(1), output: file }]);
    await idle;
    expect(download).not.toHaveBeenCalled();
    expect(queue.jobs[0]!.status).toBe('skipped');
  });

  it('retries, then reports the last error', async () => {
    download.mockRejectedValue(new Error('HTTP 403'));
    const queue = new DownloadQueue({ concurrency: 1, maxAttempts: 2, retryDelayMs: 1 });
    const idle = untilIdle(queue);
    queue.add([{ episode: episode(1), output: path.join(dir(), '1.mp4') }]);
    await idle;
    expect(download).toHaveBeenCalledTimes(2);
    expect(queue.jobs[0]).toMatchObject({ status: 'failed', error: 'HTTP 403' });
  });

  it('cancels running and queued jobs', async () => {
    download.mockImplementation(
      ({ signal }) =>
        new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason))),
    );
    const queue = new DownloadQueue({ concurrency: 1 });
    const out = dir();
    queue.add([1, 2].map((n) => ({ episode: episode(n), output: path.join(out, `${n}.mp4`) })));
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const idle = untilIdle(queue);
    queue.cancelAll();
    await idle;
    expect(queue.jobs.map((job) => job.status)).toEqual(['cancelled', 'cancelled']);

    download.mockResolvedValue();
    const again = untilIdle(queue);
    queue.retryFailed();
    await again;
    expect(queue.jobs.map((job) => job.status)).toEqual(['done', 'done']);
  });
});
