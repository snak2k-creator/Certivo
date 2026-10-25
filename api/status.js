// GET /api/status -> { ai, auth, cap, left }. The app hides or disables AI features from this.
// auth: 'firebase' (AI needs sign-in), 'anon' (AI without sign-in, per-IP limits) or 'none' (AI closed).
import { aiConfigured } from './_lib/claude.js';
import { authMode, caller } from './_lib/auth.js';
import { left, monthlyCap } from './_lib/quota.js';
import { noStore } from './_lib/http.js';

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  const auth = authMode();
  const ai = aiConfigured() && auth !== 'none';
  let quota = { left: null, cap: monthlyCap(auth === 'anon' ? 'anon' : 'user') };
  if (ai) {
    const who = await caller(req);
    if (who) quota = await left(who);
  }
  return res.status(200).json({ ai, auth, cap: quota.cap, left: quota.left });
}
