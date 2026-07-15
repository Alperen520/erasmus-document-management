// Ortak veritabanı sorguları ve gösterim yardımcıları.
const db = require('../db/database');
const { formatDateTR } = require('./helpers');

// Hareketlilik tablo başlığı:
// "2025-2026 Öğrenci Öğrenim 15.02.2026 - 15.06.2026 (01.03.2026 - 01.05.2026)"
function mobilityTitle(m) {
  return (
    `${m.donem} ${m.tur} ` +
    `${formatDateTR(m.baslangic_tarih)} - ${formatDateTR(m.bitis_tarih)}`
  );
}

// Bir hareketliliğe ait özet sayılar (kullanıcı sayısı, belge sayısı, onay durumu).
function mobilitySummary(mobilityId) {
  const userCount = db
    .prepare('SELECT COUNT(*) c FROM mobility_users WHERE mobility_id = ?')
    .get(mobilityId).c;
  const docCount = db
    .prepare('SELECT COUNT(*) c FROM mobility_documents WHERE mobility_id = ?')
    .get(mobilityId).c;
  const approved = db
    .prepare("SELECT COUNT(*) c FROM submissions WHERE mobility_id = ? AND status = 'onaylandi'")
    .get(mobilityId).c;
  const total = userCount * docCount;
  return { userCount, docCount, approved, total };
}

// Tüm hareketlilikler (admin için) — en yeni önce.
function allMobilities() {
  return db.prepare('SELECT * FROM mobilities ORDER BY created_at DESC, id DESC').all();
}

// Bir koordinatörün oluşturduğu hareketlilikler.
function mobilitiesByCreator(userId) {
  return db
    .prepare('SELECT * FROM mobilities WHERE created_by = ? ORDER BY created_at DESC, id DESC')
    .all(userId);
}

// Bir kullanıcıya atanmış hareketlilikler.
function mobilitiesForUser(userId) {
  return db
    .prepare(
      `SELECT m.* FROM mobilities m
       JOIN mobility_users mu ON mu.mobility_id = m.id
       WHERE mu.user_id = ?
       ORDER BY m.created_at DESC, m.id DESC`
    )
    .all(userId);
}

function getMobility(id) {
  return db.prepare('SELECT * FROM mobilities WHERE id = ?').get(id);
}

// Kullanıcının hareketlilik öncesi ZORUNLU belgelerinin hepsi onaylandı mı?
// Zorunlu belge yoksa true döner (kilit yok).
function preApprovedForUser(mobilityId, userId) {
  const preDocs = db
    .prepare("SELECT id FROM mobility_documents WHERE mobility_id = ? AND kategori = 'oncesi'")
    .all(mobilityId);
  if (preDocs.length === 0) return true;
  for (const d of preDocs) {
    const s = db
      .prepare(
        'SELECT status FROM submissions WHERE mobility_id = ? AND user_id = ? AND document_id = ?'
      )
      .get(mobilityId, userId, d.id);
    if (!s || s.status !== 'onaylandi') return false;
  }
  return true;
}

// Yönetici paneli özet sayıları (tüm sistem).
function globalStats() {
  const g = (sql) => db.prepare(sql).get().c;
  return {
    mobilityCount: g('SELECT COUNT(*) c FROM mobilities'),
    userCount: g("SELECT COUNT(*) c FROM users WHERE role = 'user'"),
    pending: g("SELECT COUNT(*) c FROM submissions WHERE status = 'bekliyor' AND file_path IS NOT NULL"),
    approved: g("SELECT COUNT(*) c FROM submissions WHERE status = 'onaylandi'"),
    rejected: g("SELECT COUNT(*) c FROM submissions WHERE status = 'reddedildi'"),
  };
}

// Bir kullanıcının bir hareketlilikteki belge ilerlemesi.
function userProgress(mobilityId, userId) {
  const total = db
    .prepare('SELECT COUNT(*) c FROM mobility_documents WHERE mobility_id = ?')
    .get(mobilityId).c;
  const approved = db
    .prepare("SELECT COUNT(*) c FROM submissions WHERE mobility_id = ? AND user_id = ? AND status = 'onaylandi'")
    .get(mobilityId, userId).c;
  const uploaded = db
    .prepare('SELECT COUNT(*) c FROM submissions WHERE mobility_id = ? AND user_id = ? AND file_path IS NOT NULL')
    .get(mobilityId, userId).c;
  return { total, approved, uploaded, missing: Math.max(total - uploaded, 0) };
}

module.exports = {
  mobilityTitle,
  mobilitySummary,
  allMobilities,
  mobilitiesByCreator,
  mobilitiesForUser,
  getMobility,
  preApprovedForUser,
  globalStats,
  userProgress,
};
