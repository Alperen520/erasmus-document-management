// Admin: koordinatör hesabı yönetimi.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');
const { isValidSchoolEmail, normalizeSchoolEmail } = require('../utils/helpers');
const config = require('../config');
const { logAction } = require('../utils/audit');

const router = express.Router();

function listCoordinators() {
  return db
    .prepare("SELECT * FROM users WHERE role = 'coordinator' ORDER BY created_at DESC, id DESC")
    .all();
}

// Koordinatör listesi + oluşturma formu
router.get('/admin/koordinatorler', requireRole('admin'), (req, res) => {
  res.render('admin-coordinators', {
    title: 'Koordinatör Yönetimi',
    schoolDomain: config.SCHOOL_DOMAIN,
    coordinators: listCoordinators(),
    error: null,
    success: req.query.ok ? 'İşlem başarıyla tamamlandı.' : null,
    form: {},
  });
});

// Koordinatör oluştur
router.post('/admin/koordinatorler', requireRole('admin'), (req, res) => {
  const full_name = String(req.body.full_name || '').trim();
  const email = normalizeSchoolEmail(req.body.eposta);
  const sifre = String(req.body.sifre || '');

  const rerender = (error) =>
    res.status(400).render('admin-coordinators', {
      title: 'Koordinatör Yönetimi',
      schoolDomain: config.SCHOOL_DOMAIN,
      coordinators: listCoordinators(),
      error,
      success: null,
      form: req.body,
    });

  if (!full_name || !email || !sifre) {
    return rerender('Lütfen ad, e-posta ve şifre alanlarını doldurun.');
  }
  if (!isValidSchoolEmail(email)) {
    return rerender(`E-posta ${config.SCHOOL_DOMAIN} uzantılı olmalıdır.`);
  }
  if (sifre.length < 6) {
    return rerender('Şifre en az 6 karakter olmalıdır.');
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return rerender('Bu e-posta adresi zaten kayıtlı.');
  }

  const hash = bcrypt.hashSync(sifre, 10);
  db.prepare(
    "INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, 'coordinator', ?)"
  ).run(email, hash, full_name);

  logAction(req, 'koordinator_ekle', `${full_name} <${email}>`);
  res.redirect('/admin/koordinatorler?ok=1');
});

// Koordinatör sil
router.post('/admin/koordinatorler/:id/sil', requireRole('admin'), (req, res) => {
  const user = db
    .prepare("SELECT * FROM users WHERE id = ? AND role = 'coordinator'")
    .get(req.params.id);
  if (user) {
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    logAction(req, 'koordinator_sil', `${user.full_name || ''} <${user.email}>`);
  }
  res.redirect('/admin/koordinatorler?ok=1');
});

// İşlem Kayıtları (audit log) görüntüleme — yalnız admin
router.get('/admin/kayitlar', requireRole('admin'), (req, res) => {
  const PAGE_SIZE = 100;
  const page = Math.max(parseInt(req.query.sayfa, 10) || 1, 1);
  const ara = String(req.query.ara || '').trim();

  let where = '';
  const params = [];
  if (ara) {
    where = 'WHERE user_email LIKE ? OR islem LIKE ? OR detay LIKE ?';
    const like = '%' + ara + '%';
    params.push(like, like, like);
  }
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_log ${where}`).get(...params).c;
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);

  res.render('admin-logs', {
    title: 'İşlem Kayıtları',
    rows,
    ara,
    page,
    hasNext: page * PAGE_SIZE < total,
    total,
  });
});

module.exports = router;
