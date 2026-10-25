// POST /api/ai { kind, input } -> { ok, data, left, cap }
// kinds: recap (nightly page), suggest (AI の案), boss (a name for the shadow), plan (work, after confirmation).
// Prompts are built here from checked fields only; each request takes one use from the caller's monthly cap.
import { aiConfigured, askJson, errorCode } from './_lib/claude.js';
import { authMode, caller } from './_lib/auth.js';
import { giveBack, take } from './_lib/quota.js';
import { KINDS, SYSTEM } from './_lib/prompts.js';
import { noStore, readJson } from './_lib/http.js';

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!aiConfigured() || authMode() === 'none') return res.status(503).json({ error: 'ai_off' });
  const body = await readJson(req);
  const make = body && Object.hasOwn(KINDS, body.kind) ? KINDS[body.kind] : null;
  const job = make ? make(body.input) : null;
  if (!job) return res.status(400).json({ error: 'bad_request' });
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'sign_in' });
  const q = await take(who);
  if (!q.ok) return res.status(429).json({ error: q.reason, left: q.left, cap: q.cap });
  const refunded = () => (q.left === null ? null : q.left + 1);
  try {
    const data = job.out(await askJson({ system: SYSTEM, prompt: job.prompt, schema: job.schema }));
    if (!data) {
      await giveBack(who);
      return res.status(502).json({ error: 'bad_output', left: refunded(), cap: q.cap });
    }
    return res.status(200).json({ ok: true, data, left: q.left, cap: q.cap });
  } catch (e) {
    const code = errorCode(e);
    await giveBack(who);
    if (code === 'misconfigured' || code === 'bad_request' || code === 'error') console.error('zan ai', body.kind, code, e instanceof Error ? e.message : '');
    const status = code === 'refusal' ? 422 : code === 'rate_limited' ? 429 : 502;
    return res.status(status).json({ error: code, left: refunded(), cap: q.cap });
  }
}
