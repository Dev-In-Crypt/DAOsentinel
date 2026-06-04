/**
 * Minimal OpenRouter client. OpenRouter exposes an OpenAI-compatible
 * /chat/completions endpoint, so we don't pull a heavyweight SDK.
 *
 * Docs: https://openrouter.ai/docs
 */

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
}

export interface ChatResponse {
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export async function chat(opts: ChatOptions): Promise<ChatResponse | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.warn('OPENROUTER_API_KEY missing — skipping LLM call');
    return null;
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? OPENROUTER_MODEL,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 800,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.responseFormat === 'json') {
    body.response_format = { type: 'json_object' };
  }

  try {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        // OpenRouter ranking metadata — optional but recommended:
        'http-referer': process.env.NEXTAUTH_URL ?? 'https://govwatch.xyz',
        'x-title': 'GovWatch',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      console.error('openrouter request failed', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: ChatResponse['usage'];
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    return { text, usage: data.usage };
  } catch (err) {
    console.error('openrouter call threw', err);
    return null;
  }
}
