require('dotenv').config();
const express = require('express');
const crypto  = require('crypto');
const path    = require('path');
const db      = require('./db');

const app    = express();
const TOKEN  = process.env.BOT_TOKEN;
const IS_DEV = process.env.NODE_ENV !== 'production';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth ────────────────────────────────────────────────
function validateInitData(raw) {
  if (IS_DEV && raw === 'dev') return { id: 1, first_name: 'Dev' };
  try {
    const params   = new URLSearchParams(raw);
    const hash     = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    const authDate = parseInt(params.get('auth_date'), 10);
    if (Date.now() / 1000 - authDate > 86400) return null;

    const checkStr = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`).join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
    const expected = crypto.createHmac('sha256', secret).update(checkStr).digest('hex');
    if (hash !== expected) return null;

    return JSON.parse(params.get('user'));
  } catch { return null; }
}

function auth(req, res, next) {
  const user = validateInitData(req.headers['x-init-data'] || '');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

// ── Webhook ─────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const msg = req.body?.message;
  if (!msg?.text) return;

  if (msg.text === '/myid') {
    fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: msg.chat.id,
        text: `Твой Telegram ID: \`${msg.from.id}\``,
        parse_mode: 'Markdown'
      })
    });
    return;
  }

  if (msg.text === '/start') {
    fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: msg.chat.id,
        text: 'Привет! Открывай приложение и ставь цели на день 🎯',
        reply_markup: {
          inline_keyboard: [[{
            text: '📋 Мои цели',
            web_app: { url: process.env.APP_URL }
          }]]
        }
      })
    });
  }
});

// ── API ─────────────────────────────────────────────────
app.get('/api/goals', auth, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });
  res.json(db.getGoals(req.user.id, date));
});

app.post('/api/goals', auth, (req, res) => {
  const { date, goals } = req.body;
  if (!date || !Array.isArray(goals)) return res.status(400).json({ error: 'invalid body' });
  res.json(db.insertGoals(req.user.id, date, goals));
});

app.patch('/api/goals/:id', auth, (req, res) => {
  res.json(db.toggleGoal(req.params.id, req.user.id, req.body.done));
});

app.delete('/api/goals/:id', auth, (req, res) => {
  db.deleteGoal(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.post('/api/carry', auth, (req, res) => {
  const { fromDate, toDate } = req.body;
  res.json(db.carryGoals(req.user.id, fromDate, toDate));
});

app.get('/api/history', auth, (req, res) => {
  res.json(db.getHistory(req.user.id));
});

// ── Admin bulk import ────────────────────────────────────
app.post('/api/admin/import', (req, res) => {
  const { adminKey, userId, date, goals } = req.body;
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(db.insertGoals(userId, date, goals));
});

// One-time setup endpoint — open in browser to register webhook
app.get('/setup', async (req, res) => {
  const url = `${process.env.APP_URL}/webhook`;
  const r   = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(url)}`);
  res.json(await r.json());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✓ Listening on http://localhost:${PORT}`));
