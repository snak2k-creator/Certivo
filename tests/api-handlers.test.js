// The functions end to end, with Claude replaced by a stub: who gets in, what is refunded, what is returned.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const claude = vi.hoisted(() => ({ on: true, askJson: vi.fn(), streamText: vi.fn() }));
vi.mock('../api/_lib/claude.js', () => {
  class AiError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }
  return {
    AiError,
    aiConfigured: () => claude.on,
    askJson: claude.askJson,
    streamText: claude.streamText,
    errorCode: (e) => (e instanceof AiError ? e.code : 'upstream'),
  };
});

const { AiError } = await import('../api/_lib/claude.js');
const ai = (await import('../api/ai.js')).default;
const tutor = (await import('../api/tutor.js')).default;
const status = (await import('../api/status.js')).default;

let ip = 0;
const req = (body, method = 'POST', headers = {}) => ({ method, body, headers: { 'x-forwarded-for': `198.51.100.${++ip}`, ...headers } });
function res() {
  return {
    code: 0,
    body: null,
    text: '',
    head: {},
    setHeader() {},
    status(c) {
      this.code = c;
      return this;
    },
    json(o) {
      this.body = o;
      return this;
    },
    writeHead(c, h) {
      this.code = c;
      this.head = h;
    },
    write(t) {
      this.text += t;
    },
    end() {
      this.writableFinished = true;
    },
    on() {},
  };
}
const recap = { kind: 'recap', input: { date: '2026-10-21', answered: 5, correct: 5 } };

beforeEach(() => {
  claude.on = true;
  claude.askJson.mockReset();
  claude.streamText.mockReset();
  process.env.ZAN_ALLOW_ANON_AI = '1';
});
afterEach(() => {
  delete process.env.ZAN_ALLOW_ANON_AI;
  delete process.env.FIREBASE_PROJECT_ID;
});

describe('POST /api/ai', () => {
  it('answers with the checked output and what is left', async () => {
    claude.askJson.mockResolvedValue({ text: '朝の欠片は 5問とも 正解。' });
    const r = res();
    await ai(req(recap), r);
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ ok: true, data: { text: '朝の欠片は 5問とも 正解。' }, left: 19, cap: 20 });
    expect(claude.askJson.mock.calls[0][0].schema.additionalProperties).toBe(false);
  });

  it('stays closed when the key or the access rule is missing', async () => {
    claude.on = false;
    const a = res();
    await ai(req(recap), a);
    expect(a.code).toBe(503);
    claude.on = true;
    delete process.env.ZAN_ALLOW_ANON_AI;
    const b = res();
    await ai(req(recap), b);
    expect(b.code).toBe(503);
    expect(claude.askJson).not.toHaveBeenCalled();
  });

  it('wants sign-in when sign-in is set up', async () => {
    delete process.env.ZAN_ALLOW_ANON_AI;
    process.env.FIREBASE_PROJECT_ID = 'zan-test';
    const r = res();
    await ai(req(recap), r);
    expect(r).toMatchObject({ code: 401, body: { error: 'sign_in' } });
  });

  it('turns away unknown kinds and bad bodies without using the AI', async () => {
    for (const body of [{ kind: 'hack', input: {} }, { kind: 'constructor', input: {} }, { kind: 'recap', input: { date: 'x' } }, '[]', 'nope']) {
      const r = res();
      await ai(req(body), r);
      expect(r.code).toBe(400);
    }
    const g = res();
    await ai(req(recap, 'GET'), g);
    expect(g.code).toBe(405);
    expect(claude.askJson).not.toHaveBeenCalled();
  });

  it('gives the use back when the AI declines or fails', async () => {
    claude.askJson.mockRejectedValueOnce(new AiError('refusal'));
    const one = req(recap);
    const a = res();
    await ai(one, a);
    expect(a).toMatchObject({ code: 422, body: { error: 'refusal', left: 20 } });
    claude.askJson.mockRejectedValueOnce(new Error('boom'));
    const b = res();
    await ai({ ...one }, b);
    expect(b).toMatchObject({ code: 502, body: { error: 'upstream', left: 20 } });
    claude.askJson.mockResolvedValueOnce({ text: '' });
    const c = res();
    await ai({ ...one }, c);
    expect(c).toMatchObject({ code: 502, body: { error: 'bad_output', left: 20 } });
  });
});

describe('POST /api/tutor', () => {
  const input = { stem: '問い', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: ['a'], pick: ['b'], explanation: '解説' };

  it('streams the explanation', async () => {
    claude.streamText.mockImplementation(async ({ onText }) => {
      onText('決め手は ');
      onText('A です。');
      return 'end';
    });
    const r = res();
    await tutor(req({ input }), r);
    expect(r.code).toBe(200);
    expect(r.text).toBe('決め手は A です。');
    expect(r.head['x-zan-cap']).toBe('20');
  });

  it('says so when it cannot answer, and refunds when nothing was written', async () => {
    claude.streamText.mockResolvedValue('refusal');
    const one = req({ input });
    const r = res();
    await tutor(one, r);
    expect(r.text).toBe('この問いには、ここでは 答えられませんでした。');
    const s = res();
    await status({ method: 'GET', headers: one.headers }, s);
    expect(s.body).toMatchObject({ ai: true, auth: 'anon', left: 20, cap: 20 });
  });
});

describe('GET /api/status', () => {
  it('says the AI is off when the server is not set up for it', async () => {
    delete process.env.ZAN_ALLOW_ANON_AI;
    const r = res();
    await status(req(undefined, 'GET'), r);
    expect(r.body).toEqual({ ai: false, auth: 'none', cap: 120, left: null });
  });
});
