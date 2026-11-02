import { randomInt } from 'node:crypto';

export function selectQuestions(bank, used, count = 20, difficulty = 'mixed') {
  const eligible = bank.filter(q => difficulty === 'mixed' || q.difficulty === difficulty);
  if (eligible.length < count) throw new Error('Banco insuficiente para este nivel');
  let remaining = eligible.filter(q => !used.has(q.id));
  let reset = false;
  // The last match of a cycle can straddle the boundary. Its questions remain unique.
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  shuffle(remaining);
  let selected = remaining.slice(0, count);
  let previousCycle = 0;
  if (selected.length < count) {
    reset = true;
    previousCycle = selected.length;
    const ids = new Set(selected.map(q => q.id));
    selected.push(...shuffle(eligible.filter(q => !ids.has(q.id))).slice(0, count - selected.length));
  }
  return { selected: shuffle([...selected]), reset, previousCycle,
    newCycleIds: reset ? selected.slice(previousCycle).map(q => q.id) : selected.map(q => q.id) };
}

export class MemoryHistory {
  constructor() { this.used = new Set(); this.queue = Promise.resolve(); }
  async ready() {}
  async healthy() { return true; }
  reserve(bank, difficulty) {
    const job = this.queue.then(() => {
      const used = this.used;
      const result = selectQuestions(bank, used, 20, difficulty);
      if (result.reset) bank.filter(q => difficulty === 'mixed' || q.difficulty === difficulty).forEach(q => used.delete(q.id));
      result.newCycleIds.forEach(id => used.add(id));
      return result.selected;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async close() {}
}

export class PostgresHistory {
  constructor(pool) { this.pool = pool; }
  async ready() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS trivia_rotation_v1 (
      scope text PRIMARY KEY, cycle bigint NOT NULL DEFAULT 1,
      used_ids text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  async healthy() { await this.pool.query('SELECT 1'); return true; }
  async reserve(bank, difficulty) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Shared history across difficulty changes; row lock serializes concurrent starts.
      await client.query('INSERT INTO trivia_rotation_v1(scope) VALUES ($1) ON CONFLICT DO NOTHING', ['global']);
      const { rows: [row] } = await client.query('SELECT used_ids FROM trivia_rotation_v1 WHERE scope=$1 FOR UPDATE', ['global']);
      const used = new Set(row.used_ids);
      const result = selectQuestions(bank, used, 20, difficulty);
      if (result.reset) bank.filter(q => difficulty === 'mixed' || q.difficulty === difficulty).forEach(q => used.delete(q.id));
      result.newCycleIds.forEach(id => used.add(id));
      await client.query(`UPDATE trivia_rotation_v1 SET used_ids=$2, cycle=cycle+$3, updated_at=now() WHERE scope=$1`,
        ['global', [...used], result.reset ? 1 : 0]);
      await client.query('COMMIT');
      return result.selected;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
