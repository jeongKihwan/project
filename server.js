require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { LocalReviewAnalyzer } = require('./providers/ai/local-review-analyzer');
const { MockPaymentProvider } = require('./providers/payment/mock-payment-provider');
const { TossPaymentProvider } = require('./providers/payment/toss-payment-provider');

const ROOT = __dirname;
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  });
}
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'development-only-change-me';
const dbPath = process.env.DATABASE_PATH || path.join(ROOT, 'data', 'review-insight.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
const aiProvider = new LocalReviewAnalyzer();
const paymentProvider = process.env.PAYMENT_PROVIDER === 'toss'
  ? new TossPaymentProvider({ clientKey: process.env.TOSS_CLIENT_KEY, secretKey: process.env.TOSS_SECRET_KEY })
  : new MockPaymentProvider();
if (process.env.PAYMENT_PROVIDER === 'toss' && (!process.env.TOSS_CLIENT_KEY || !process.env.TOSS_SECRET_KEY)) throw new Error('Toss 결제 키가 .env에 없습니다.');

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL, credits INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, plan_id TEXT NOT NULL, amount INTEGER NOT NULL, provider_payment_id TEXT UNIQUE, status TEXT NOT NULL, credited_at TEXT, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS credit_ledger (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, payment_id TEXT UNIQUE, analysis_id INTEGER UNIQUE, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS analyses (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, file_name TEXT NOT NULL, review_count INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id));
  CREATE TABLE IF NOT EXISTS consent_versions (id TEXT PRIMARY KEY, version TEXT NOT NULL, content TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS user_consents (user_id INTEGER NOT NULL, consent_id TEXT NOT NULL, version TEXT NOT NULL, agreed_at TEXT NOT NULL, PRIMARY KEY(user_id, consent_id), FOREIGN KEY(user_id) REFERENCES users(id));
`);
const seed = db.prepare('INSERT OR IGNORE INTO plans (id, name, price, credits) VALUES (?, ?, ?, ?)');
seed.run('starter', '스타터', 9900, 10); seed.run('growth', '그로스', 29000, 40); seed.run('pro', '프로', 59000, 100);
db.prepare('INSERT OR IGNORE INTO consent_versions (id, version, content) VALUES (?, ?, ?)').run('terms', '2026-08-16', '서비스 이용약관');
db.prepare('INSERT OR IGNORE INTO consent_versions (id, version, content) VALUES (?, ?, ?)').run('privacy', '2026-08-16', '개인정보 처리방침');

const now = () => new Date().toISOString();
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const fail = (res, status, message) => json(res, status, { error: message });
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`)));
const checkPassword = async (password, stored) => { const [salt, hash] = stored.split(':'); const actual = await hashPassword(password, salt); return crypto.timingSafeEqual(Buffer.from(actual.split(':')[1], 'hex'), Buffer.from(hash, 'hex')); };
const parseCookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => part.trim().split('=')));
function sessionUser(req) { const sid = parseCookies(req).sid; if (!sid) return null; const session = db.prepare('SELECT users.id, users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires_at>?').get(sid, Date.now()); return session || null; }
function setSession(res, userId) { const id = crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, Date.now() + 1000 * 60 * 60 * 24 * 14); res.setHeader('Set-Cookie', `sid=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600`); }
function readBody(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', (chunk) => { body += chunk; if (body.length > 2_000_000) reject(new Error('요청이 너무 큽니다.')); }); req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('요청 형식이 올바르지 않습니다.')); } }); }); }
function maskPii(text) { return String(text).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일]').replace(/(?:01[0-9][- ]?\d{3,4}[- ]?\d{4})/g, '[전화번호]').replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g, '[주민번호]').replace(/\b(?:\d[ -]?){13,19}\b/g, '[번호]').replace(/(?:서울|부산|대구|인천|광주|대전|울산|세종)[^,.\n]{3,35}/g, '[주소]'); }
function parseCsv(text) { const rows = []; let row = [], value = '', quoted = false; for (let i = 0; i < text.length; i++) { const char = text[i], next = text[i + 1]; if (char === '"' && quoted && next === '"') { value += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(value); value = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i++; row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = ''; } else value += char; } if (value || row.length) { row.push(value); rows.push(row); } if (rows.length < 2) throw new Error('리뷰가 포함된 CSV 파일이 필요합니다.'); const headers = rows.shift().map((item) => item.trim()); const commentIndex = headers.indexOf('댓글'); if (commentIndex < 0) throw new Error("CSV에서 '댓글' 항목을 찾을 수 없습니다."); const reviews = rows.map((item) => maskPii(item[commentIndex] || '').trim()).filter(Boolean); if (!reviews.length) throw new Error('분석 가능한 댓글이 없습니다.'); return reviews.slice(0, 5000); }
function credits(userId) { return db.prepare('SELECT COALESCE(SUM(amount), 0) AS balance FROM credit_ledger WHERE user_id=?').get(userId).balance; }
function customerKey(userId) { return crypto.createHmac('sha256', SESSION_SECRET).update(`toss-customer:${userId}`).digest('hex').slice(0, 40); }
function requireUser(req, res) { const user = sessionUser(req); if (!user) { fail(res, 401, '로그인이 필요합니다.'); return null; } return user; }

async function api(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/auth/signup') { const { email, password, terms, privacy } = await readBody(req); if (!/^\S+@\S+\.\S+$/.test(email || '')) return fail(res, 400, '올바른 이메일을 입력해주세요.'); if (!password || password.length < 8) return fail(res, 400, '비밀번호는 8자 이상이어야 합니다.'); if (!terms || !privacy) return fail(res, 400, '이용약관과 개인정보 처리방침 동의가 필요합니다.'); try { const info = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email.toLowerCase(), await hashPassword(password), now()); const userId = Number(info.lastInsertRowid); for (const id of ['terms', 'privacy']) { const consent = db.prepare('SELECT version FROM consent_versions WHERE id=?').get(id); db.prepare('INSERT INTO user_consents (user_id, consent_id, version, agreed_at) VALUES (?, ?, ?, ?)').run(userId, id, consent.version, now()); } setSession(res, userId); return json(res, 201, { email: email.toLowerCase() }); } catch { return fail(res, 409, '이미 가입된 이메일입니다.'); } }
  if (req.method === 'POST' && pathname === '/api/auth/login') { const { email, password } = await readBody(req); const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').toLowerCase()); if (!user || !(await checkPassword(password || '', user.password_hash))) return fail(res, 401, '이메일 또는 비밀번호가 올바르지 않습니다.'); setSession(res, user.id); return json(res, 200, { email: user.email }); }
  if (req.method === 'POST' && pathname === '/api/auth/logout') { const sid = parseCookies(req).sid; if (sid) db.prepare('DELETE FROM sessions WHERE id=?').run(sid); res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  if (req.method === 'GET' && pathname === '/api/me') { const user = sessionUser(req); return json(res, 200, { user: user && { email: user.email }, credits: user ? credits(user.id) : 0 }); }
  if (req.method === 'GET' && pathname === '/api/plans') return json(res, 200, db.prepare('SELECT id,name,price,credits FROM plans WHERE active=1 ORDER BY price').all());
  const user = requireUser(req, res); if (!user) return;
  if (req.method === 'POST' && pathname === '/api/analyses') { const { fileName, csv } = await readBody(req); const reviews = parseCsv(csv || ''); if (credits(user.id) < 1) return fail(res, 402, '분석 크레딧이 부족합니다.'); const result = await aiProvider.analyze(reviews); db.exec('BEGIN IMMEDIATE'); try { const info = db.prepare('INSERT INTO analyses (user_id, file_name, review_count, result_json, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, String(fileName || 'reviews.csv').slice(0, 200), reviews.length, JSON.stringify(result), now()); db.prepare('INSERT INTO credit_ledger (user_id, amount, reason, analysis_id, created_at) VALUES (?, -1, ?, ?, ?)').run(user.id, '리뷰 분석', Number(info.lastInsertRowid), now()); db.exec('COMMIT'); return json(res, 201, { id: Number(info.lastInsertRowid), result, credits: credits(user.id) }); } catch (error) { db.exec('ROLLBACK'); throw error; } }
  if (req.method === 'GET' && pathname === '/api/analyses') { const records = db.prepare('SELECT id,file_name,review_count,created_at,result_json FROM analyses WHERE user_id=? ORDER BY id DESC').all(user.id).map((item) => ({ ...item, result: JSON.parse(item.result_json), result_json: undefined })); return json(res, 200, records); }
  if (req.method === 'POST' && pathname === '/api/payments/checkout') { const { planId } = await readBody(req); const plan = db.prepare('SELECT * FROM plans WHERE id=? AND active=1').get(planId); if (!plan) return fail(res, 404, '요금제를 찾을 수 없습니다.'); const paymentId = crypto.randomUUID(); db.prepare('INSERT INTO payments (id,user_id,plan_id,amount,status,created_at) VALUES (?,?,?,?,?,?)').run(paymentId, user.id, plan.id, plan.price, 'PENDING', now()); return json(res, 201, await paymentProvider.createCheckout({ paymentId, amount: plan.price, planName: plan.name, customerKey: customerKey(user.id) })); }
  if (req.method === 'POST' && pathname === '/api/payments/confirm') { const { paymentId, approvalToken, paymentKey } = await readBody(req); const payment = db.prepare('SELECT payments.*, plans.credits FROM payments JOIN plans ON plans.id=payments.plan_id WHERE payments.id=? AND payments.user_id=?').get(paymentId, user.id); if (!payment) return fail(res, 404, '결제 정보를 찾을 수 없습니다.'); if (payment.status === 'PAID') return json(res, 200, { ok: true, credits: credits(user.id), duplicate: true }); const verified = await paymentProvider.verify({ paymentId, amount: payment.amount, approvalToken, paymentKey }); if (verified.amount !== payment.amount || verified.status !== 'PAID') return fail(res, 400, '결제 금액 또는 상태가 일치하지 않습니다.'); db.exec('BEGIN IMMEDIATE'); try { const current = db.prepare('SELECT status FROM payments WHERE id=?').get(paymentId); if (current.status === 'PAID') { db.exec('COMMIT'); return json(res, 200, { ok: true, credits: credits(user.id), duplicate: true }); } db.prepare('UPDATE payments SET status=?, provider_payment_id=?, credited_at=? WHERE id=?').run('PAID', verified.providerPaymentId, now(), paymentId); db.prepare('INSERT INTO credit_ledger (user_id, amount, reason, payment_id, created_at) VALUES (?, ?, ?, ?, ?)').run(user.id, payment.credits, '결제 크레딧 지급', paymentId, now()); db.exec('COMMIT'); return json(res, 200, { ok: true, credits: credits(user.id) }); } catch (error) { db.exec('ROLLBACK'); throw error; } }
  if (req.method === 'GET' && pathname === '/api/billing') { return json(res, 200, { credits: credits(user.id), ledger: db.prepare('SELECT amount,reason,created_at FROM credit_ledger WHERE user_id=? ORDER BY id DESC').all(user.id), payments: db.prepare('SELECT id,amount,status,created_at FROM payments WHERE user_id=? ORDER BY created_at DESC').all(user.id) }); }
  return fail(res, 404, '요청을 찾을 수 없습니다.');
}

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };
http.createServer(async (req, res) => { const pathname = new URL(req.url, `http://${req.headers.host}`).pathname; try { if (pathname.startsWith('/api/')) return await api(req, res, pathname); const file = pathname === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, pathname); if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return fail(res, 404, '페이지를 찾을 수 없습니다.'); res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff' }); fs.createReadStream(file).pipe(res); } catch (error) { console.error(error.message); fail(res, 500, error.message === '요청이 너무 큽니다.' ? error.message : '처리 중 오류가 발생했습니다.'); } }).listen(PORT, () => console.log(`Review Insight running at http://localhost:${PORT}`));
