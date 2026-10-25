// Who is calling the AI endpoints. With Firebase configured, only signed-in people (optionally an allowlist of
// emails). Without it, nobody, unless ZAN_ALLOW_ANON_AI=1 lets anonymous callers in under per-IP limits.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let keys;

export const firebaseProject = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
const anonAllowed = () => process.env.ZAN_ALLOW_ANON_AI === '1';

/** 'firebase' (sign-in required), 'anon' (no sign-in, per-IP limits) or 'none' (AI closed). */
export function authMode() {
  if (firebaseProject()) return 'firebase';
  return anonAllowed() ? 'anon' : 'none';
}

function allowlist() {
  return (process.env.ZAN_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Verifies a Firebase ID token from the Authorization header. Returns { uid, email } or null. */
export async function verifyUser(req) {
  const project = firebaseProject();
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
  if (!project || !m) return null;
  keys ||= createRemoteJWKSet(new URL(JWKS));
  try {
    const { payload } = await jwtVerify(m[1], keys, {
      issuer: `https://securetoken.google.com/${project}`,
      audience: project,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    const allowed = allowlist();
    if (allowed.length && !(email && payload.email_verified === true && allowed.includes(email))) return null;
    return { uid: payload.sub, email };
  } catch {
    return null;
  }
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  const first = (Array.isArray(xf) ? xf[0] : xf || '').split(',')[0].trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

/** The caller's id for quotas, or null when this caller may not use the AI. */
export async function caller(req) {
  const user = await verifyUser(req);
  if (user) return { id: 'u_' + user.uid, kind: 'user' };
  if (anonAllowed()) return { id: 'ip_' + clientIp(req).replace(/[^0-9a-fA-F.:]/g, '').slice(0, 64), kind: 'anon' };
  return null;
}
