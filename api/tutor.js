// AI tutor endpoint (Vercel Node function). The API key stays on the server (ANTHROPIC_API_KEY).
// GET  -> 200 when the tutor is configured, 503 otherwise (the app hides the tutor on 503).
// POST { prompt } -> streams the answer as plain text.
const MODEL = process.env.CERTIVO_MODEL || "claude-sonnet-5-5";
const MAX_PROMPT = 8000;

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "tutor_not_configured" });
  if (req.method === "GET") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).end();

  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  if (!prompt || prompt.length > MAX_PROMPT) return res.status(400).json({ error: "bad_prompt" });

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, stream: true, messages: [{ role: "user", content: prompt }] }),
  });
  if (upstream.status === 429) return res.status(429).json({ error: "rate_limited" });
  if (!upstream.ok || !upstream.body) return res.status(502).json({ error: "upstream_failed" });

  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  const reader = upstream.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const ev = JSON.parse(line.slice(5));
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") res.write(ev.delta.text);
      } catch { /* ignore keep-alives */ }
    }
  }
  res.end();
}
