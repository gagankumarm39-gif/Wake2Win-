/** Pure weak-topic detection from question attempts. */

export interface AttemptTopicRow {
  subject: string;
  chapter: string | null;
  correct: boolean;
}

export interface TopicStat {
  topic: string;
  subject: string;
  attempts: number;
  accuracy: number; // 0–100
}

export function weakTopics(rows: AttemptTopicRow[], minAttempts = 3, limit = 3): TopicStat[] {
  const map = new Map<string, { subject: string; total: number; correct: number }>();
  for (const r of rows) {
    const key = r.chapter ? `${r.subject} · ${r.chapter}` : r.subject;
    const cur = map.get(key) ?? { subject: r.subject, total: 0, correct: 0 };
    cur.total += 1;
    if (r.correct) cur.correct += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .filter(([, v]) => v.total >= minAttempts)
    .map(([topic, v]) => ({
      topic,
      subject: v.subject,
      attempts: v.total,
      accuracy: Math.round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
