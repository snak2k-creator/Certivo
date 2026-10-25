// What each AI request may contain, how it is checked, and the prompt built from it on the server.
// The app sends only the fields below; anything else is dropped. Work tasks reach the AI only through
// `plan`, which the app sends after the person has checked exactly what will be sent.

const clean = (v, max) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v)) || 0));
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const SYSTEM = [
  'あなたは ZAN というアプリの中で、短い文を書く係です。',
  'ZAN は、資格の勉強と毎日のやることを一つにした手帳です。やることを済ませると「斬った」と数え、経験値が入ります。',
  '問題で迷ったところからは、毎週「影」という敵が生まれ、正解するたびに削れていきます。',
  '',
  '文体：落ち着いた、やさしい、短い日本語。命令・説教・おだては書かない。感嘆符、絵文字、顔文字は使わない。',
  '表記：句の区切りに半角スペースを一つ入れる。例「朝の欠片は 5問とも 正解。」「弱点の「RAG」を 3問」。',
  '事実：渡された情報だけを使う。数字は渡されたとおりに書く。資格の内容について、新しい事実を足さない。',
].join('\n');

const TYPE_NAMES = {
  bakusa: '縛鎖',
  souei: '双影',
  sakazuri: '逆吊',
  muchu: '霧中',
  kyoman: '驕慢',
  zanzo: '残像',
  kokugen: '刻限',
};

/* ---------- recap: the nightly page, from the personal notebook only ---------- */
function recap(input) {
  const i = input || {};
  if (!isDate(i.date)) return null;
  const facts = {
    date: i.date,
    answered: int(i.answered, 500),
    correct: int(i.correct, 500),
    kakera: !!i.kakera,
    slashes: int(i.slashes, 200),
    xp: int(i.xp, 5000),
    three: !!i.three,
    workDone: int(i.workDone, 200),
    done: list(i.done, 6).map((s) => clean(s, 40)).filter(Boolean),
    boss: i.boss && typeof i.boss === 'object'
      ? { name: clean(i.boss.name, 24), dmg: int(i.boss.dmg, 5000), hp: int(i.boss.hp, 5000), killed: !!i.boss.killed }
      : null,
    stumbled: list(i.stumbled, 2)
      .map((s) => ({ topic: clean(s?.topic, 24), n: int(s?.n, 50) }))
      .filter((s) => s.topic),
    streak: int(i.streak, 3650),
  };
  return {
    prompt: [
      `${facts.date} の記録から、夜の「1日の記録」を 書いてください。`,
      '- 2〜4文、全体で 120字以内。',
      '- できたことを 先に。迷ったところは 責めずに、あしたの朝の欠片に 入れたことに つなげる。',
      '- 仕事は 件数だけが 渡されています。中身には 触れない。',
      '- 何もしていない日は、休んだことを 責めずに 一文で。',
      '',
      '記録（JSON）:',
      JSON.stringify(facts),
    ].join('\n'),
    schema: {
      type: 'object',
      properties: { text: { type: 'string', description: '1日の記録の本文' } },
      required: ['text'],
      additionalProperties: false,
    },
    out: (o) => {
      const text = clean(o?.text, 220);
      return text ? { text } : null;
    },
  };
}

/* ---------- suggest: AI の案, one short drill for today ---------- */
function suggest(input) {
  const i = input || {};
  const topics = list(i.topics, 40)
    .map((t) => ({
      id: clean(t?.id, 40),
      name: clean(t?.name, 30),
      missedYesterday: int(t?.missedYesterday, 50),
      accuracy: t?.accuracy === null || t?.accuracy === undefined ? null : int(t.accuracy, 100),
      answered: int(t?.answered, 2000),
    }))
    .filter((t) => t.id && t.name);
  if (!topics.length) return null;
  const ids = [...new Set(topics.map((t) => t.id))];
  const daysLeft = i.daysLeft === null || i.daysLeft === undefined ? null : int(i.daysLeft, 999);
  return {
    prompt: [
      '今日の「AI の案」を 一つ 選んでください。案は、一つの分野から 3問だけ解く、5分ほどの 短い練習です。',
      '- きのう迷った分野を いちばん重く見る。なければ、正答率が低い分野、まだ手をつけていない分野の順。',
      '- title は 20字以内。分野名を 「」でくくって 入れる。例「弱点の「RAG」を 3問」。',
      '- reason は 30字以内。なぜ今日それなのかを、渡された数字だけで。例「きのう 2回 迷ったところから」。',
      daysLeft !== null ? `- 試験まで あと ${daysLeft}日。` : '',
      '',
      '分野ごとの記録（JSON）:',
      JSON.stringify(topics),
    ]
      .filter((l) => l !== '')
      .join('\n'),
    schema: {
      type: 'object',
      properties: {
        topicId: { type: 'string', enum: ids },
        title: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['topicId', 'title', 'reason'],
      additionalProperties: false,
    },
    out: (o) => {
      if (!ids.includes(o?.topicId)) return null;
      const title = clean(o.title, 24);
      const reason = clean(o.reason, 40);
      return title && reason ? { topicId: o.topicId, title, reason } : null;
    },
  };
}

/* ---------- boss: a name and a line for this week's shadow (never facts) ---------- */
function boss(input) {
  const i = input || {};
  const typeName = TYPE_NAMES[i.type];
  if (!typeName) return null;
  const facts = {
    type: typeName,
    weakness: clean(i.weak, 20),
    topic: clean(i.topic, 24),
    born: clean(i.born, 60),
  };
  return {
    prompt: [
      '今週の影に、二つ名と 決め台詞を つけてください。',
      `- 影の種類は「${typeName}」。名前は「二つ名の${typeName}」の形になります。`,
      '- epithet（二つ名）は 2〜8字。分野を連想させる、短く 硬い言葉。最後に「の」は つけない。',
      '- taunt（決め台詞）は 28字以内。影が 挑戦者に 投げる一言。脅しや 暴力の言葉は 使わない。',
      '- 資格の内容について、事実を 書かない。雰囲気だけ。',
      '- かわいい、ゆるい、ファンタジーの おとぎ話の調子は 避けて、硬く、静かに。',
      '',
      '影の情報（JSON）:',
      JSON.stringify(facts),
    ].join('\n'),
    schema: {
      type: 'object',
      properties: { epithet: { type: 'string' }, taunt: { type: 'string' } },
      required: ['epithet', 'taunt'],
      additionalProperties: false,
    },
    out: (o) => {
      const epithet = clean(o?.epithet, 10).replace(/の$/, '');
      const taunt = clean(o?.taunt, 36);
      return epithet && taunt ? { name: `${epithet}の${typeName}`, taunt } : null;
    },
  };
}

/* ---------- plan: tomorrow's order for work tasks the person checked ---------- */
function plan(input) {
  const i = input || {};
  if (!isDate(i.date)) return null;
  const items = list(i.items, 12)
    .map((t) => ({ title: clean(t?.title, 60), time: isTime(t?.time) ? t.time : '', mins: int(t?.mins, 480) || 0 }))
    .filter((t) => t.title);
  if (!items.length) return null;
  const start = isTime(i.start) ? i.start : '09:00';
  const end = isTime(i.end) ? i.end : '18:00';
  return {
    prompt: [
      `${i.date} の 仕事の段取りを 作ってください。${start} から ${end} の間で。`,
      '- 渡された やることだけを 並べる。大きいものは 二つまでに 分けてよい。新しい仕事は 足さない。',
      '- 時刻が 決まっているものは、その時刻のまま。',
      '- time は「HH:MM」。mins は 5〜240 の 分。',
      '- note は 40字以内。段取りの ねらいを 一言で。',
      '',
      'やること（JSON）:',
      JSON.stringify(items),
    ].join('\n'),
    schema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, time: { type: 'string' }, mins: { type: 'integer' } },
            required: ['title', 'time', 'mins'],
            additionalProperties: false,
          },
        },
        note: { type: 'string' },
      },
      required: ['steps', 'note'],
      additionalProperties: false,
    },
    out: (o) => {
      const steps = list(o?.steps, 16)
        .map((s) => ({ title: clean(s?.title, 60), time: isTime(s?.time) ? s.time : '', mins: Math.max(5, Math.min(240, int(s?.mins, 240) || 15)) }))
        .filter((s) => s.title);
      return steps.length ? { steps, note: clean(o?.note, 60) } : null;
    },
  };
}

export const KINDS = { recap, suggest, boss, plan };

/* ---------- tutor: why an answer is right, streamed ---------- */
export function tutor(input) {
  const i = input || {};
  const stem = clean(i.stem, 600);
  const options = list(i.options, 8)
    .map((o) => ({ id: clean(o?.id, 4), text: clean(o?.text, 200) }))
    .filter((o) => o.id && o.text);
  const ids = new Set(options.map((o) => o.id));
  const answer = list(i.answer, 8).map((a) => clean(a, 4)).filter((a) => ids.has(a));
  const pick = list(i.pick, 8).map((a) => clean(a, 4)).filter((a) => ids.has(a));
  if (!stem || options.length < 2 || !answer.length) return null;
  const explanation = clean(i.explanation, 600);
  const ask = clean(i.ask, 300);
  const right = pick.length === answer.length && answer.every((a) => pick.includes(a));
  return {
    prompt: [
      '資格試験の問題について、受験者の 迷いを ほどく 解説を 書いてください。',
      '- 280字以内。見出しや 太字は 使わない。必要なら「・」で 始まる 短い行を 3行まで。',
      '- 正解が なぜ正しいか、決め手になる 条件を 先に。',
      right ? '- 受験者は 正解しています。理解を 確かにする 一言を 添える。' : '- 受験者が 選んだ肢が なぜ 違うのかも、一文で。',
      '- 公式の解説と 食い違うことは 書かない。わからないことは、わからないと 書く。',
      ask ? `- 受験者からの 質問にも 答える：「${ask}」` : '',
      '',
      `問題：${stem}`,
      ...options.map((o) => `${o.id}. ${o.text}`),
      `正解：${answer.join(', ')}`,
      `受験者の答え：${pick.length ? pick.join(', ') : '（未回答）'}`,
      explanation ? `公式の解説：${explanation}` : '',
    ]
      .filter((l) => l !== '')
      .join('\n'),
  };
}
