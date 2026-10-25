// The enemy system: every week a shadow is born from where you stumble. Seven types, each tied to a way of
// getting questions wrong. No player HP and no losing: a miss only means the shadow dodged.
import type { Answer, Boss, Conf, EnemyType, Pack, Question, StudyProgress, Topic } from './types';
import { addDays, uid, weekStart } from './util';
import { weakestTopic } from './study';

export interface EnemyMeta { kanji: string; name: string; weak: string; gimmick: string; crit: string; taunt: string }
export const ENEMY: Record<EnemyType, EnemyMeta> = {
  bakusa: { kanji: '鎖', name: '縛鎖', weak: '順番', gimmick: '体に巻いた札を、データが流れる順に斬ると 鎖が解ける', crit: '札を 順に斬る', taunt: '順も知らずに、ここを通れると思うな。' },
  souei: { kanji: '双', name: '双影', weak: '似た二つ', gimmick: '似た二つの どちらが本物かを 見分けた正解は 会心', crit: '見分けて 正解', taunt: 'どちらが本物か、お前に見分けられるか。' },
  sakazuri: { kanji: '逆', name: '逆吊', weak: '打ち消し', gimmick: '「ない」を 見落とさずに 正解すると 会心', crit: '打ち消しの問いで 正解', taunt: '“ない”を見落とす者に、勝ち目はない。' },
  muchu: { kanji: '霧', name: '霧中', weak: '決め手の条件', gimmick: '長い問いの、決め手の条件を 見抜いた正解は 会心', crit: '長い問いで 正解', taunt: '霧の中の、たった一つの条件を 探してみろ。' },
  kyoman: { kanji: '驕', name: '驕慢', weak: '思い込み', gimmick: '「確実」で 正解すると 会心。外すと 驕りを突かれる', crit: '確実で 正解', taunt: 'その“確実”は、本当に 確実か。' },
  zanzo: { kanji: '残', name: '残像', weak: 'あやふやな記憶', gimmick: '「勘」に頼らず 正解すると 会心', crit: '勘なしで 正解', taunt: '勘で当てた答えは、すぐに 消える。' },
  kokugen: { kanji: '刻', name: '刻限', weak: '時間', gimmick: '20秒以内に 正解すると 会心', crit: '20秒以内に 正解', taunt: '迷っている間に、時は 尽きる。' },
};
export const ENEMY_ORDER: EnemyType[] = ['bakusa', 'souei', 'sakazuri', 'muchu', 'kyoman', 'zanzo', 'kokugen'];

/** How each type is told apart in 図鑑: its kind, a short hint before meeting it, and when it is born. */
export const TYPE_INFO: Record<EnemyType, { kind: string; hint: string; born: string }> = {
  bakusa: { kind: '順番の型', hint: '順番の取り違え', born: '流れの順番を 取り違えたとき' },
  souei: { kind: '見分けの型', hint: '似た二つの混同', born: '似た二つを 取り違えたとき' },
  sakazuri: { kind: '打ち消しの型', hint: '「ない」の見落とし', born: '「〜ではないもの」を 読み落としたとき' },
  muchu: { kind: '条件の型', hint: '条件の見落とし', born: '長い問題文で、決め手の条件を 見落としたとき' },
  kyoman: { kind: '思い込みの型', hint: '確実の外れ', born: '「確実」と答えて 外したとき' },
  zanzo: { kind: 'うろ覚えの型', hint: '勘の正解', born: '「勘」で 当たったとき（うろ覚え）' },
  kokugen: { kind: '時間の型', hint: '時間切れ', born: '本番の時間配分より、遅かったとき' },
};

export const WEEK_HP = 2000;
/** A shadow that got away and came back the next week (from Lv.9). */
export const STRONG_HP = 2600;
export const BATTLE_QUESTIONS = 4;

const NEG = /ない|誤って|誤り|適切でない|当てはまらない|除く/;
export const isNegation = (q: Question) => NEG.test(q.stem);
export const isLong = (q: Question) => q.stem.length >= 70;

export const topicShort = (t: Topic) => t.short || t.title.split(/[：:（(]/)[0];

/** Counts how the last two weeks of answers went wrong, as evidence for each type. */
export function evidence(pk: Pack, log: Answer[], today: string, topicId?: string) {
  const since = addDays(today, -14);
  const byQ = new Map(pk.questions.map((q) => [q.id, q]));
  const ev: Record<EnemyType, number> = { bakusa: 0, souei: 0, sakazuri: 0, muchu: 0, kyoman: 0, zanzo: 0, kokugen: 0 };
  for (const a of log) {
    if (a.d < since) continue;
    const q = byQ.get(a.q);
    if (!q) continue;
    const t = pk.topics.find((x) => x.id === q.topicId);
    const here = !topicId || q.topicId === topicId;
    if (!a.ok) {
      if (a.conf === 'sure') ev.kyoman += 1;
      if (isNegation(q)) ev.sakazuri += 1;
      if (isLong(q)) ev.muchu += 0.8;
      if (t?.twins && here) ev.souei += 1.2;
      if (t?.order && here) ev.bakusa += 1.4;
    } else if (a.conf === 'guess') ev.zanzo += 1;
    if (a.ms > 45000) ev.kokugen += 0.7;
  }
  return ev;
}

function pickType(pk: Pack, sp: StudyProgress, topic: Topic, today: string): EnemyType {
  const ev = evidence(pk, sp.log, today, topic.id);
  if (!topic.order) ev.bakusa = 0;
  if (!topic.twins) ev.souei = 0;
  const best = ENEMY_ORDER.reduce((a, b) => (ev[b] > ev[a] ? b : a), ENEMY_ORDER[0]);
  if (ev[best] > 0) return best;
  if (topic.order) return 'bakusa';
  if (topic.twins) return 'souei';
  return 'muchu';
}

function terms(type: EnemyType, topic: Topic) {
  if (type === 'bakusa' && topic.order) return topic.order.steps.slice(0, 4);
  if (type === 'souei' && topic.twins) return [topic.twins.a, topic.twins.b];
  if (type === 'sakazuri') return ['ではない'];
  return [];
}

function lastWords(type: EnemyType, topic: Topic) {
  if (type === 'bakusa' && topic.order) return topic.order.lastWords;
  if (type === 'souei' && topic.twins) return topic.twins.tell;
  return topic.examTip || topic.overview;
}

/** Makes this week's shadow on the device. The AI may later rename it and rewrite its lines (never its facts). */
export function makeBoss(pk: Pack, sp: StudyProgress, today: string, avoidTopic?: string): Boss {
  let topic = weakestTopic(pk, sp, today);
  if (avoidTopic && topic.id === avoidTopic) {
    const others = pk.topics.filter((t) => t.id !== avoidTopic);
    topic = weakestTopic({ ...pk, topics: others }, sp, today);
  }
  const type = pickType(pk, sp, topic, today);
  const short = topicShort(topic);
  const misses = sp.log.filter((a) => a.d >= addDays(today, -7) && !a.ok && pk.questions.find((q) => q.id === a.q)?.topicId === topic.id).length;
  const week = weekStart(today);
  return {
    id: uid('b'),
    week,
    type,
    certId: pk.id,
    topicId: topic.id,
    name: `${short}の${ENEMY[type].name}`,
    born: misses ? `生まれ：この1週間、${short}で ${misses}回 迷った` : `生まれ：${short}は、まだ 手つかず`,
    taunt: ENEMY[type].taunt,
    lastWords: lastWords(type, topic),
    terms: terms(type, topic),
    hp: WEEK_HP,
    max: WEEK_HP,
    deadline: addDays(week, 6),
    tier: 'week',
    battles: 0,
    hits: 0,
    crits: 0,
    misses: 0,
    source: 'zan',
    createdAt: Date.now(),
  };
}

/** Whether a right answer meets this shadow's critical condition. */
export function isCrit(type: EnemyType, q: Question, conf: Conf, ms: number, topic?: Topic) {
  switch (type) {
    case 'kyoman': return conf === 'sure';
    case 'zanzo': return conf !== 'guess';
    case 'kokugen': return ms <= 20000;
    case 'sakazuri': return isNegation(q);
    case 'muchu': return isLong(q);
    case 'souei': {
      if (!topic?.twins) return false;
      const all = q.stem + q.options.map((o) => o.text).join(' ');
      return all.includes(topic.twins.a) || all.includes(topic.twins.b);
    }
    case 'bakusa': return false;
  }
}

/** Damage for one right answer in a battle. */
export function battleDamage(combo: number, crit: boolean) {
  const base = 220 + Math.min(4, combo) * 30;
  return Math.round(crit ? base * 1.5 : base);
}
export const PLATE_DAMAGE = 90;
export const KAKERA_DAMAGE = 40;
export const studyTaskDamage = (xp: number) => xp * 2;

export function weekNumber(boss: Boss, firstWeek: string) {
  const n = Math.round((Date.parse(boss.week) - Date.parse(firstWeek)) / (7 * 864e5));
  return Math.max(1, n + 1);
}

/** The shadow that got away last week, back for this week and stronger. Same topic, same last words. */
export function strongBoss(prev: Boss, today: string): Boss {
  const week = weekStart(today);
  return {
    ...prev,
    id: uid('b'),
    week,
    name: prev.name.startsWith('強') ? prev.name : `強・${prev.name}`,
    born: `生まれ：先週 倒しそびれた影が、強くなって 戻った`,
    hp: STRONG_HP,
    max: STRONG_HP,
    deadline: addDays(week, 6),
    tier: 'strong',
    battles: 0,
    hits: 0,
    crits: 0,
    misses: 0,
    createdAt: Date.now(),
  };
}
