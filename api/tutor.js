// POST /api/tutor { input: { stem, options, answer, pick, explanation, ask } } -> the explanation, streamed as text.
// Remaining uses come back in the x-zan-left and x-zan-cap headers.
import { aiConfigured, errorCode, streamText } from './_lib/claude.js';
import { authMode, caller } from './_lib/auth.js';
import { giveBack, take } from './_lib/quota.js';
import { SYSTEM, tutor } from './_lib/prompts.js';
import { noStore, readJson } from './_lib/http.js';

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!aiConfigured() || authMode() === 'none') return res.status(503).json({ error: 'ai_off' });
  const body = await readJson(req);
  const job = body ? tutor(body.input) : null;
  if (!job) return res.status(400).json({ error: 'bad_request' });
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: 'sign_in' });
  const q = await take(who);
  if (!q.ok) return res.status(429).json({ error: q.reason, left: q.left, cap: q.cap });

  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-zan-left': String(q.left ?? ''),
    'x-zan-cap': String(q.cap),
  });
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });
  let wrote = false;
  try {
    const end = await streamText({
      system: SYSTEM,
      prompt: job.prompt,
      signal: abort.signal,
      onText: (t) => {
        wrote = true;
        res.write(t);
      },
    });
    if (end === 'refusal') {
      if (!wrote) await giveBack(who);
      res.write(wrote ? '\n（ここから先は、答えられませんでした）' : 'この問いには、ここでは 答えられませんでした。');
    } else if (end === 'max_tokens') {
      if (!wrote) await giveBack(who);
      res.write(wrote ? '…' : 'いまは 答えられません。少しあとで、もう一度。');
    }
  } catch (e) {
    if (!wrote) await giveBack(who);
    if (!abort.signal.aborted) {
      console.error('zan tutor', errorCode(e));
      res.write(wrote ? '\n（通信が 途切れました）' : 'いまは 答えられません。少しあとで、もう一度。');
    }
  }
  res.end();
}
