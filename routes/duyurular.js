// Duyurular — koordinatör/admin ekler ve siler; öğrenci kendine uygun olanları görür.
const express = require('express');
const db = require('../db/database');
const { requireRole, requireAuth } = require('../middleware/auth');
const config = require('../config');
const { logAction } = require('../utils/audit');

const router = express.Router();
const yetkili = requireRole('coordinator', 'admin');

// Öğrenciye görünecek duyurular: herkese açık + kendi hareketlilik türlerine ait
function duyurularForUser(userId) {
  return db
    .prepare(
      `SELECT d.* FROM duyurular d
       WHERE d.tur IS NULL
          OR d.tur IN (SELECT DISTINCT m.tur FROM mobilities m
                       JOIN mobility_users mu ON mu.mobility_id = m.id
                       WHERE mu.user_id = ?)
       ORDER BY d.id DESC`
    )
    .all(userId);
}

// --- Yönetim: liste + ekleme formu (koordinatör/admin) ---
router.get('/duyurular', yetkili, (req, res) => {
  const rows = db
    .prepare(
      `SELECT d.*, u.full_name AS ekleyen_ad, u.email AS ekleyen_eposta
       FROM duyurular d LEFT JOIN users u ON u.id = d.created_by
       ORDER BY d.id DESC`
    )
    .all();
  res.render('duyurular', {
    rows,
    types: config.MOBILITY_TYPES,
    err: req.query.hata || null,
    msg: req.query.ok ? 'İşlem başarıyla tamamlandı.' : null,
  });
});

// --- Duyuru ekle ---
router.post('/duyurular/ekle', yetkili, (req, res) => {
  const baslik = String(req.body.baslik || '').trim();
  const icerik = String(req.body.icerik || '').trim();
  let tur = String(req.body.tur || '').trim();
  if (!baslik || !icerik) {
    return res.redirect('/duyurular?hata=' + encodeURIComponent('Başlık ve içerik zorunludur.'));
  }
  if (tur && !config.MOBILITY_TYPES.includes(tur)) tur = '';
  db.prepare('INSERT INTO duyurular (baslik, icerik, tur, created_by) VALUES (?, ?, ?, ?)')
    .run(baslik, icerik, tur || null, req.session.user.id);
  logAction(req, 'duyuru_ekle', `${baslik} (${tur || 'Herkes'})`);
  res.redirect('/duyurular?ok=1');
});

// --- Duyuru sil ---
router.post('/duyurular/:id/sil', yetkili, (req, res) => {
  const d = db.prepare('SELECT * FROM duyurular WHERE id = ?').get(req.params.id);
  if (d) {
    db.prepare('DELETE FROM duyurular WHERE id = ?').run(d.id);
    logAction(req, 'duyuru_sil', `${d.baslik} (id ${d.id})`);
  }
  res.redirect('/duyurular?ok=1');
});

// Son 3 gün içindeki duyuruları "YENİ" olarak işaretle
function markYeni(rows) {
  const sinir = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  rows.forEach((d) => { d.yeni = (d.created_at || '').slice(0, 10) >= sinir; });
  return rows;
}

// --- Öğrenci: tüm duyurular listesi ---
router.get('/duyurular/tum', requireAuth, (req, res) => {
  const me = req.session.user;
  const rows =
    me.role === 'user'
      ? duyurularForUser(me.id)
      : db.prepare('SELECT * FROM duyurular ORDER BY id DESC').all();
  res.render('duyurular-liste', { rows: markYeni(rows) });
});

module.exports = { router, duyurularForUser, markYeni };
