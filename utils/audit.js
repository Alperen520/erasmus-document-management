// İşlem (audit) ve hata loglama.
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const insLog = db.prepare(
  `INSERT INTO audit_log (user_id, user_email, role, islem, detay, ip, created_at)
   VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
);

function clientIp(req) {
  if (!req) return null;
  const fwd = req.headers && req.headers['x-forwarded-for'];
  const ip = (fwd ? String(fwd).split(',')[0] : '') ||
    (req.socket && req.socket.remoteAddress) || '';
  return String(ip).trim() || null;
}

// İşlem kaydı yaz. Oturumdaki kullanıcıyı otomatik alır.
// extra ile kullanıcı bilgisini elle geçebilirsin (örn. başarısız giriş).
function logAction(req, islem, detay, extra) {
  try {
    const u = (extra && extra.user) || (req && req.session && req.session.user) || {};
    insLog.run(
      u.id || null,
      u.email || (extra && extra.email) || null,
      u.role || null,
      String(islem),
      detay != null ? String(detay) : null,
      clientIp(req)
    );
  } catch (e) {
    console.error('audit log yazılamadı:', e.message);
  }
}

// Beklenmedik hataları logs/error.log dosyasına yaz.
const logsDir = path.join(__dirname, '..', 'logs');
function logError(err, context) {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const line =
      `[${new Date().toISOString()}] ${context || ''}\n` +
      (err && err.stack ? err.stack : String(err)) + '\n\n';
    fs.appendFileSync(path.join(logsDir, 'error.log'), line);
  } catch (e) {
    console.error('error log yazılamadı:', e.message);
  }
}

module.exports = { logAction, logError };
