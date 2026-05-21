const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || '/app/data/goals.db';
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id           TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL,
    date         TEXT NOT NULL,
    time         TEXT NOT NULL DEFAULT '00:00',
    subject      TEXT NOT NULL DEFAULT 'Другое',
    task         TEXT NOT NULL,
    priority     TEXT NOT NULL DEFAULT 'средний',
    done         INTEGER NOT NULL DEFAULT 0,
    carried_from TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_user_date ON goals (user_id, date);
`);

const q = {
  getGoals:   db.prepare('SELECT * FROM goals WHERE user_id=? AND date=? ORDER BY time, created_at'),
  insertGoal: db.prepare('INSERT INTO goals (id,user_id,date,time,subject,task,priority,carried_from) VALUES (?,?,?,?,?,?,?,?)'),
  getOne:     db.prepare('SELECT * FROM goals WHERE id=?'),
  toggle:     db.prepare('UPDATE goals SET done=? WHERE id=? AND user_id=?'),
  del:        db.prepare('DELETE FROM goals WHERE id=? AND user_id=?'),
  getUndone:  db.prepare('SELECT * FROM goals WHERE user_id=? AND date=? AND done=0'),
  history:    db.prepare(`
    SELECT date, COUNT(*) as total, SUM(done) as done
    FROM goals WHERE user_id=?
    GROUP BY date ORDER BY date DESC LIMIT 60
  `)
};

const insertMany = db.transaction((uid, date, goals) => {
  const result = [];
  for (const g of goals) {
    const id = randomUUID();
    q.insertGoal.run(id, uid, date,
      g.time || '00:00',
      g.subject || 'Другое',
      g.task,
      g.priority || 'средний',
      g.carriedFrom || null
    );
    result.push(q.getOne.get(id));
  }
  return result;
});

module.exports = {
  getGoals:    (uid, date) => q.getGoals.all(uid, date),
  insertGoals: insertMany,

  toggleGoal: (id, uid, done) => {
    q.toggle.run(done ? 1 : 0, id, uid);
    return q.getOne.get(id);
  },

  deleteGoal: (id, uid) => q.del.run(id, uid),

  carryGoals: (uid, fromDate, toDate) => {
    const undone = q.getUndone.all(uid, fromDate);
    if (!undone.length) return [];
    return insertMany(uid, toDate, undone.map(g => ({
      time: g.time, subject: g.subject, task: g.task,
      priority: g.priority, carriedFrom: fromDate
    })));
  },

  getHistory: (uid) => q.history.all(uid)
};
