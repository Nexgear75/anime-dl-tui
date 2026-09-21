export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} sur ${url}`);
    this.name = 'HttpError';
  }
}

export interface RequestOptions {
  referer?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first one, for network errors, 429 and 5xx. */
  retries?: number;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

const isRetryable = (error: unknown) =>
  error instanceof HttpError
    ? error.status === 429 || error.status >= 500
    : !(error instanceof Error && error.name === 'AbortError');

export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const { referer, timeoutMs = 20_000, retries = 2, signal, redirect = 'follow' } = options;
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  };
  if (referer) headers.Referer = referer;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, {
        headers,
        redirect,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (response.status >= 400) throw new HttpError(response.status, url);
      return response;
    } catch (error) {
      lastError = error instanceof Error && error.name === 'TimeoutError'
        ? new Error(`Délai dépassé (${timeoutMs / 1000}s) sur ${url}`)
        : error;
      if (signal?.aborted || !isRetryable(error) || attempt === retries) break;
      await sleep(600 * 2 ** attempt, signal);
    }
  }
  throw lastError;
}

export async function fetchText(url: string, options?: RequestOptions): Promise<string> {
  const response = await request(url, options);
  return response.text();
}
