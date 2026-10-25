// Small request helpers shared by the functions.
const LIMIT = 16_000;

/** The JSON body as an object, or null when it is missing, too large or not JSON. */
export async function readJson(req) {
  let body = req.body;
  if (body === undefined) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > LIMIT) return null;
    }
    body = raw;
  }
  if (typeof body === 'string') {
    if (body.length > LIMIT) return null;
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return JSON.stringify(body).length > LIMIT ? null : body;
}

export function noStore(res) {
  res.setHeader('cache-control', 'no-store');
}
