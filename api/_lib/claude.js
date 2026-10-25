// The one place that talks to Claude. The key is read from ANTHROPIC_API_KEY on the server and never sent to
// the browser. Refused requests are retried server-side on Anthropic's recommended fallback model.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.ZAN_MODEL || 'claude-opus-5-5';
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

let client;
const anthropic = () => (client ||= new Anthropic({ maxRetries: 1, timeout: 55_000 }));

const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
// Thinking is always on and counts toward max_tokens, so the limits below leave room for it beyond the short replies.

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Asks for one JSON object that matches the schema. Throws AiError when nothing usable came back. */
export async function askJson({ system, prompt, schema, maxTokens = 8192, effort = 'low' }) {
  const msg = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort, format: { type: 'json_schema', schema } },
    ...FALLBACK,
  });
  if (msg.stop_reason === 'refusal') throw new AiError('refusal', 'declined');
  if (msg.stop_reason === 'max_tokens') throw new AiError('truncated', 'output cut off');
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('bad_output', 'not json');
  }
}

/** Streams plain text to onText. Returns how it ended: 'end', 'refusal' or 'max_tokens'. */
export async function streamText({ system, prompt, maxTokens = 4096, effort = 'low', onText, signal }) {
  const stream = anthropic().beta.messages.stream(
    {
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort },
      ...FALLBACK,
    },
    { signal },
  );
  let stop = 'end';
  for await (const ev of stream) {
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') onText(ev.delta.text);
    else if (ev.type === 'message_delta' && ev.delta.stop_reason) stop = ev.delta.stop_reason;
  }
  return stop === 'refusal' ? 'refusal' : stop === 'max_tokens' ? 'max_tokens' : 'end';
}

/** Maps SDK errors to a short code for the app. */
export function errorCode(e) {
  if (e instanceof AiError) return e.code;
  if (e instanceof Anthropic.RateLimitError) return 'rate_limited';
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'misconfigured';
  if (e instanceof Anthropic.BadRequestError) return 'bad_request';
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (e instanceof Anthropic.APIError) return 'upstream';
  return 'error';
}
