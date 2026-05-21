require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ── CONFIG ────────────────────────────────────────────
const APP_URL   = process.env.APP_URL;
const ADMIN_KEY = process.env.ADMIN_KEY;
const USER_ID   = parseInt(process.argv[2]);

if (!USER_ID) {
  console.error('Usage: node import-goals.js <TELEGRAM_USER_ID>');
  process.exit(1);
}

// ── Фильтр: какие задачи НЕ добавлять ────────────────
const SKIP = [
  'подъём', 'умыться', 'завтрак', 'обед', 'ужин',
  'дорога', 'школа', 'перерыв', 'свободное время',
  'подготовка ко сну', 'полный отдых', 'не учиться',
  'заслуженный отдых', 'отдых -', 'отдых после'
];

function shouldSkip(title) {
  const t = title.toLowerCase();
  return SKIP.some(s => t.startsWith(s) || t === s);
}

// ── Определение предмета ──────────────────────────────
function getSubject(title) {
  const t = title.toLowerCase();
  if (t.includes('матем') || t.includes('зад.13') || t.includes('зад.15') || t.includes('зад.16') || t.includes('зад.18') || t.includes('зад.19')) return 'Математика';
  if (t.includes('русск') || t.includes('сочинени') || t.includes('паронимы') || t.includes('ударени')) return 'Русский';
  if (t.includes('инфа') || t.includes('информат') || t.includes('python') || t.includes('программ') || t.includes('курсы по')) return 'Информатика';
  if (t.includes('физик')) return 'Физика';
  if (t.includes('егэ')) {
    if (t.includes('русск')) return 'Русский';
    if (t.includes('матем')) return 'Математика';
    if (t.includes('физик')) return 'Физика';
    if (t.includes('информат')) return 'Информатика';
  }
  return 'Другое';
}

// ── Определение приоритета ────────────────────────────
function getPriority(title) {
  const t = title.toLowerCase();
  if (t.includes('егэ') && (t.startsWith('егэ') || t.includes('экзамен'))) return 'высокий';
  if (t.includes('пробник') && !t.includes('разбор')) return 'высокий';
  if (t.includes('зад.27') || t.includes('программ')) return 'высокий';
  if (t.includes('задачи части 2') || t.includes('зад.13') || t.includes('зад.15') || t.includes('зад.16')) return 'высокий';
  if (t.includes('курсы по информатике')) return 'высокий';
  if (t.includes('закрепление курса')) return 'высокий';
  if (t.includes('сочинени') && !t.includes('разбор')) return 'высокий';
  if (t.includes('слабые задания') || t.includes('слабые темы')) return 'высокий';
  if (t.includes('финальн') && t.includes('прогон')) return 'средний';
  if (t.includes('разбор ошибок') || t.includes('прогон формул') || t.includes('прогон зад')) return 'средний';
  if (t.includes('ударения') || t.includes('паронимы')) return 'средний';
  if (t.includes('лёгкий') || t.includes('спокойно')) return 'низкий';
  return 'средний';
}

// ── Парсинг CSV ───────────────────────────────────────
function parseTime(timeStr) {
  // "7:40 AM" → "07:40", "2:00 PM" → "14:00"
  const m = timeStr.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return '00:00';
  let h = parseInt(m[1]);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2,'0')}:${min}`;
}

function parseDate(dateStr) {
  // "05/21/2026" → "2026-05-21"
  const [m, d, y] = dateStr.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

const csvPath = path.join('C:\\Users\\cdani\\Downloads\\ege_final_sprint.csv');
const lines = fs.readFileSync(csvPath, 'utf-8').split('\n').slice(1); // skip header

const byDate = {};

for (const line of lines) {
  if (!line.trim()) continue;

  // Parse CSV (simple — fields in quotes)
  const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g);
  if (!cols || cols.length < 5) continue;

  const title     = cols[0].replace(/^"|"$/g, '').trim();
  const startDate = cols[1].replace(/^"|"$/g, '').trim();
  const startTime = cols[2].replace(/^"|"$/g, '').trim();
  const allDay    = cols[5]?.replace(/^"|"$/g, '').trim();

  if (allDay === 'True') continue; // пропустить all-day события (маркеры ЕГЭ)
  if (shouldSkip(title)) continue;

  const date = parseDate(startDate);
  const time = parseTime(startTime);

  if (!byDate[date]) byDate[date] = [];
  byDate[date].push({
    time,
    subject:  getSubject(title),
    task:     title,
    priority: getPriority(title)
  });
}

// ── Загрузка в API ────────────────────────────────────
async function importAll() {
  const dates = Object.keys(byDate).sort();
  console.log(`Найдено ${dates.length} дней, загружаю...`);

  for (const date of dates) {
    const goals = byDate[date];
    try {
      const res = await fetch(`${APP_URL}/api/admin/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: ADMIN_KEY, userId: USER_ID, date, goals })
      });
      const json = await res.json();
      if (res.ok) {
        console.log(`✓ ${date} — ${goals.length} целей`);
      } else {
        console.error(`✗ ${date}:`, json);
      }
    } catch (e) {
      console.error(`✗ ${date}:`, e.message);
    }
  }

  console.log('\n✅ Готово! Все цели загружены.');
}

importAll();
