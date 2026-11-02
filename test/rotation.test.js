import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { MemoryHistory, PostgresHistory, selectQuestions } from '../rotation.js';
import { validateBank } from '../bank.js';
const bank = JSON.parse(readFileSync(new URL('../questions.json', import.meta.url), 'utf8'));

test('2000 questions, exact categories, valid options and English levels', () => {
  assert.equal(validateBank(bank).total, 2000);
  const english = bank.filter(q => q.cefr);
  assert.equal(english.filter(q => q.cefr === 'B1').length, 100);
  assert.equal(english.filter(q => q.cefr === 'B2').length, 100);
});

test('100 simultaneous reservations exhaust the bank without repetitions', async () => {
  const history = new MemoryHistory();
  const matches = await Promise.all(Array.from({ length: 100 }, () => history.reserve(bank, 'mixed')));
  assert.ok(matches.every(qs => qs.length === 20));
  assert.equal(new Set(matches.flat().map(q => q.id)).size, 2000);
  assert.equal(new Set((await history.reserve(bank, 'mixed')).map(q => q.id)).size, 20);
});

test('difficulty changes use shared history', async () => {
  const history = new MemoryHistory();
  const mixed = await history.reserve(bank, 'mixed');
  const easy = await history.reserve(bank, 'easy');
  assert.ok(easy.every(q => q.difficulty === 'easy'));
  assert.equal(new Set([...mixed,...easy].map(q => q.id)).size, 40);
});

test('a cycle boundary consumes remaining questions and never duplicates a match', () => {
  const small = bank.slice(0, 43);
  const used = new Set(small.slice(0,40).map(q => q.id));
  const result = selectQuestions(small, used);
  assert.equal(result.reset, true);
  assert.equal(result.previousCycle, 3);
  assert.equal(new Set(result.selected.map(q => q.id)).size, 20);
  assert.ok(small.slice(40).every(q => result.selected.includes(q)));
  assert.equal(result.newCycleIds.length, 17);
  assert.ok(small.slice(40).every(q => !result.newCycleIds.includes(q.id)));
});

test('level exhaustion preserves history of the other levels', async () => {
  const history = new MemoryHistory();
  const hard = await history.reserve(bank, 'hard');
  const easy = bank.filter(q => q.difficulty === 'easy');
  for (let i=0; i<Math.ceil(easy.length/20); i++) await history.reserve(bank, 'easy');
  assert.ok(hard.every(q => history.used.has(q.id)));
});

// PGlite executes the production PostgreSQL SQL and persists it to disk. It does not
// replace the deployment check against a real PostgreSQL server/multiple connections.
function poolFor(db) {
  return { query: (sql, args) => db.query(sql,args),
    connect: async () => ({ query: (sql,args) => db.query(sql,args), release() {} }),
    end: () => db.close() };
}

test('PostgreSQL schema and history survive closing and reopening a database', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'trivia-db-'));
  let history;
  try {
    history = new PostgresHistory(poolFor(new PGlite(dir)));
    await history.ready(); await history.ready(); // migration is additive/idempotent
    const first = await history.reserve(bank,'mixed');
    await history.close();
    history = new PostgresHistory(poolFor(new PGlite(dir)));
    await history.ready();
    const second = await history.reserve(bank,'mixed');
    assert.equal(new Set([...first,...second].map(q => q.id)).size,40);
    assert.equal(await history.healthy(),true);
  } finally { if (history) await history.close(); rmSync(dir,{recursive:true,force:true}); }
});

test('failed transaction rolls back and releases its connection', async () => {
  const calls=[];
  const history = new PostgresHistory({connect: async () => ({
    query: async sql => {calls.push(sql); if(sql.includes('SELECT used_ids')) throw new Error('database unavailable');},
    release: () => calls.push('release')
  })});
  await assert.rejects(history.reserve(bank,'mixed'));
  assert.ok(calls.includes('ROLLBACK'));
  assert.equal(calls.at(-1),'release');
});

test('variable match lengths share a persistent deck across a database restart', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'trivia-counts-'));
  let history = new PostgresHistory(poolFor(new PGlite(dir)));
  try {
    await history.ready();
    const first = await history.reserve(bank,'mixed',50);
    assert.equal(first.length,50);
    await history.close();
    history = new PostgresHistory(poolFor(new PGlite(dir)));
    await history.ready();
    const all = [...first];
    for (const count of [10,20,30,40]) {
      const questions = await history.reserve(bank,'mixed',count);
      assert.equal(questions.length,count); all.push(...questions);
    }
    assert.equal(new Set(all.map(q=>q.id)).size,150);
  } finally { await history.close(); rmSync(dir,{recursive:true,force:true}); }
});
