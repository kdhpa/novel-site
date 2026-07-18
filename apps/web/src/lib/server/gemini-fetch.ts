const GEMINI_NETWORK_TIMEOUT_MS = 30_000;

function retryDelay(response: Response, attempt: number) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 2_000);
  }
  return 300 * (attempt + 1);
}

export async function fetchGemini(
  url: string,
  apiKey: string,
  init: Omit<RequestInit, 'signal'>
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          'x-goog-api-key': apiKey,
        },
        signal: AbortSignal.timeout(GEMINI_NETWORK_TIMEOUT_MS),
      });

      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini request failed');
}
