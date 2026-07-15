// Ortak yardımcı fonksiyonlar.
const { SCHOOL_DOMAIN } = require('../config');

// Girilen değeri tam okul e-postasına çevirir.
// "220502034" -> "220502034@kocaelisaglik.edu.tr"
// "220502034@kocaelisaglik.edu.tr" -> aynısı (küçük harfe çevrilir)
function normalizeSchoolEmail(input) {
  const v = String(input || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('@')) return v;
  return v + SCHOOL_DOMAIN;
}

// Okul uzantılı geçerli e-posta mı?
function isValidSchoolEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  const re = new RegExp('^[a-z0-9._-]+' + escapeRegex(SCHOOL_DOMAIN) + '$');
  return re.test(v);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Hibe ödeme dekontu mu? (Hibe İlk/Son Ödemesi) — bu belgelerde yönetici de yükleyip silebilir.
function isDekontBelge(ad) {
  const s = String(ad || '').toLocaleLowerCase('tr');
  return s.includes('hibe') && s.includes('öde');
}

// "2026-02-15" -> "15.02.2026"
function formatDateTR(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

// Virgülle ayrılmış kullanıcı girdisini ayrıştırır.
// Döner: { valid: [email...], invalid: [ham girdi...] }
function parseUserEmails(raw) {
  const tokens = String(raw || '')
    .split(/[,\n;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const valid = [];
  const invalid = [];
  for (const t of tokens) {
    const email = normalizeSchoolEmail(t);
    if (isValidSchoolEmail(email)) valid.push(email);
    else invalid.push(t);
  }
  return { valid: [...new Set(valid)], invalid };
}

// Belge adını güvenli HTML'e çevirir:
//  - HTML kaçışı yapar (XSS koruması)
//  - **...** -> <strong>...</strong>
//  - parantez içleri -> kalın
function docNameHtml(name) {
  let s = escapeHtml(String(name || ''));
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\(([^)]*)\)/g, '(<strong>$1</strong>)');
  return s;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  normalizeSchoolEmail,
  isValidSchoolEmail,
  formatDateTR,
  parseUserEmails,
  docNameHtml,
  isDekontBelge,
};
