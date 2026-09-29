import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Check .env.local (or your host's env vars).");
}

// Pooled connection for ordinary request-scoped queries.
export const sql = neon(process.env.DATABASE_URL);

/** True for failures that happened before any request reached the database
 * (DNS hiccup, TCP connect timeout, a dropped socket) — safe to retry
 * because the server never saw the query. Never retries a real database
 * error (constraint violation, bad SQL, etc.), only the network layer
 * underneath the Neon HTTP driver. */
function isTransientNetworkError(err: unknown): boolean {
  const e = err as { message?: string; cause?: { code?: string }; sourceError?: { message?: string; cause?: { code?: string } } };
  const msg = String(e?.message || e?.sourceError?.message || "");
  const code = e?.cause?.code || e?.sourceError?.cause?.code;
  const transientCodes = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNRESET", "ETIMEDOUT", "UND_ERR_SOCKET", "ENOTFOUND", "EAI_AGAIN"]);
  return msg.includes("fetch failed") || (!!code && transientCodes.has(code));
}

/** Runs a database call, retrying once (short backoff) if it failed at the
 * network level before reaching Postgres. Wrap every `sql\`...\`` call site
 * with this: `await withRetry(() => sql\`SELECT ...\`)`. */
export async function withRetry<T>(fn: () => Promise<T>, retriesLeft = 1): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retriesLeft > 0 && isTransientNetworkError(err)) {
      await new Promise((r) => setTimeout(r, 350));
      return withRetry(fn, retriesLeft - 1);
    }
    throw err;
  }
}
