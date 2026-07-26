/**
 * Pure helpers for the DAO Sentinel MCP server — URL building and error
 * formatting, kept dependency-free and framework-agnostic so they're easy
 * to unit test without spinning up an MCP transport.
 */

export const DEFAULT_BASE_URL = 'https://www.daosentinel.xyz';

/** Joins a base URL + path and appends query params, skipping undefined values. */
export function buildUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(baseUrl.replace(/\/+$/, '') + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Turns a DAO Sentinel API error response into a human-readable tool message. */
export function formatApiError(status: number, body: unknown): string {
  const detail =
    typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : JSON.stringify(body);

  if (status === 401) {
    return `Authentication failed (${detail}). Set DAO_SENTINEL_API_KEY to a valid key from https://www.daosentinel.xyz/settings.`;
  }
  if (status === 429) {
    return `Rate limited (${detail}). Slow down, or check your monthly quota at https://www.daosentinel.xyz/settings.`;
  }
  return `DAO Sentinel API error ${status}: ${detail}`;
}
