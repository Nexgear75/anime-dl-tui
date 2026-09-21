import { EventEmitter } from 'node:events';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { download, DownloadError, type DownloadProgress } from './downloader.js';
import { resolveStream } from './players/index.js';
import { getSources, type Episode } from './voiranime.js';

export type JobStatus =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'retrying'
  | 'done'
  | 'skipped'
  | 'failed'
  | 'cancelled';

export interface Job {
  episode: Episode;
  output: string;
  status: JobStatus;
  attempt: number;
  progress: DownloadProgress | null;
  player?: string;
  error?: string;
  /** Last yt-dlp lines, kept for the log file when a job fails. */
  log?: string[];
  startedAt?: number;
  finishedAt?: number;
}

export interface QueueOptions {
  concurrency: number;
  preferredPlayer?: string;
  maxAttempts?: number;
  /** Base pause between attempts, multiplied by the attempt number. */
  retryDelayMs?: number;
  fragments?: number;
  ytDlpPath?: string;
}

export const isFinished = (status: JobStatus) =>
  status === 'done' || status === 'skipped' || status === 'failed' || status === 'cancelled';

export const isActive = (status: JobStatus) =>
  status === 'resolving' || status === 'downloading' || status === 'retrying';

const fileExists = async (file: string) => {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
};

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * Runs episode downloads with bounded concurrency. Emits `update` whenever a
 * job changes and `idle` once nothing is queued or running.
 */
export class DownloadQueue extends EventEmitter<{ update: []; idle: [] }> {
  readonly jobs: Job[] = [];
  private readonly controllers = new Map<Job, AbortController>();
  private running = 0;
  private stopped = false;

  constructor(private readonly options: QueueOptions) {
    super();
  }

  add(items: { episode: Episode; output: string }[]) {
    for (const { episode, output } of items) {
      this.jobs.push({ episode, output, status: 'queued', attempt: 0, progress: null });
    }
    this.pump();
  }

  /** Puts failed and cancelled jobs back in the queue. */
  retryFailed() {
    this.stopped = false;
    for (const job of this.jobs) {
      if (job.status === 'failed' || job.status === 'cancelled') {
        Object.assign(job, { status: 'queued', attempt: 0, error: undefined, progress: null });
      }
    }
    this.emit('update');
    this.pump();
  }

  /** Stops everything; partial files are kept so a later run resumes them. */
  cancelAll() {
    this.stopped = true;
    for (const job of this.jobs) {
      if (job.status === 'queued') job.status = 'cancelled';
    }
    for (const controller of this.controllers.values()) controller.abort(new Error('Annulé'));
    this.emit('update');
    if (this.running === 0) this.emit('idle');
  }

  get idle() {
    return this.running === 0 && !this.jobs.some((job) => job.status === 'queued');
  }

  private pump() {
    if (this.stopped) return;
    while (this.running < this.options.concurrency) {
      const job = this.jobs.find((candidate) => candidate.status === 'queued');
      if (!job) break;
      // Claim the job synchronously: run() only updates it after an await,
      // and the next loop iteration must not pick the same job again.
      job.status = 'resolving';
      this.running++;
      void this.run(job).finally(() => {
        this.running--;
        this.emit('update');
        this.pump();
        if (this.idle) this.emit('idle');
      });
    }
  }

  private update(job: Job, patch: Partial<Job>) {
    Object.assign(job, patch);
    this.emit('update');
  }

  private async run(job: Job) {
    const controller = new AbortController();
    this.controllers.set(job, controller);
    const { signal } = controller;
    const maxAttempts = this.options.maxAttempts ?? 3;
    this.update(job, { startedAt: Date.now(), error: undefined });

    try {
      if (await fileExists(job.output)) {
        this.update(job, { status: 'skipped', finishedAt: Date.now() });
        return;
      }
      await mkdir(path.dirname(job.output), { recursive: true });

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Stream URLs carry expiring tokens, so every attempt re-resolves them.
          this.update(job, { status: 'resolving', attempt });
          const sources = await getSources(job.episode.url, signal);
          const stream = await resolveStream(sources, this.options.preferredPlayer, signal);

          this.update(job, { status: 'downloading', player: stream.player });
          await download({
            url: stream.url,
            headers: stream.headers,
            output: job.output,
            signal,
            fragments: this.options.fragments,
            ytDlpPath: this.options.ytDlpPath,
            onProgress: (progress) => this.update(job, { progress }),
          });

          this.update(job, { status: 'done', finishedAt: Date.now(), error: undefined });
          return;
        } catch (error) {
          if (signal.aborted) throw error;
          const message = error instanceof Error ? error.message : String(error);
          const log = error instanceof DownloadError ? error.log : undefined;
          if (attempt === maxAttempts) {
            this.update(job, { status: 'failed', error: message, log, finishedAt: Date.now() });
            return;
          }
          this.update(job, { status: 'retrying', error: message, log });
          await wait((this.options.retryDelayMs ?? 3000) * attempt, signal);
        }
      }
    } catch (error) {
      if (signal.aborted) {
        this.update(job, { status: 'cancelled', finishedAt: Date.now() });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        this.update(job, { status: 'failed', error: message, finishedAt: Date.now() });
      }
    } finally {
      this.controllers.delete(job);
    }
  }
}
