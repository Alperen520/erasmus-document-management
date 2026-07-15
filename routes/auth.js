// Giriş / çıkış işlemleri (kullanıcı + yönetici).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { normalizeSchoolEmail } = require('../utils/helpers');
const { SCHOOL_DOMAIN } = require('../config');
const { logAction } = require('../utils/audit');

const router = express.Router();

// Role göre yönlendirme hedefi
function homeFor(role) {
  if (role === 'admin') return '/admin';
  if (role === 'coordinator') return '/koordinator';
  return '/panel';
}

// Giriş ekranı
router.get('/giris', (req, res) => {
  if (req.session.user) return res.redirect(homeFor(req.session.user.role));
  res.render('login', {
    schoolDomain: SCHOOL_DOMAIN,
    error: null,
    mode: req.query.mod === 'yonetici' ? 'yonetici' : 'kullanici',
  });
});

// Kullanıcı girişi (okul numarası + uzantı)
router.post('/giris/kullanici', (req, res) => {
  const email = normalizeSchoolEmail(req.body.okulNo);
  const { sifre } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'user'").get(email);
  if (!user || !user.password_hash || !bcrypt.compareSync(sifre || '', user.password_hash)) {
    logAction(req, 'giris_basarisiz', email, { email });
    return res.status(401).render('login', {
      schoolDomain: SCHOOL_DOMAIN,
      error: 'Okul numarası veya şifre hatalı.',
      mode: 'kullanici',
    });
  }
  setSession(req, user);
  logAction(req, 'giris', 'öğrenci girişi');
  res.redirect(homeFor(user.role));
});

// Yönetici girişi (admin & koordinatör)
router.post('/giris/yonetici', (req, res) => {
  const email = normalizeSchoolEmail(req.body.eposta);
  const { sifre } = req.body;
  const user = db
    .prepare("SELECT * FROM users WHERE email = ? AND role IN ('admin','coordinator')")
    .get(email);
  if (!user || !user.password_hash || !bcrypt.compareSync(sifre || '', user.password_hash)) {
    logAction(req, 'giris_basarisiz', email, { email });
    return res.status(401).render('login', {
      schoolDomain: SCHOOL_DOMAIN,
      error: 'E-posta veya şifre hatalı.',
      mode: 'yonetici',
    });
  }
  setSession(req, user);
  logAction(req, 'giris', 'yönetici girişi');
  res.redirect(homeFor(user.role));
});

router.get('/cikis', (req, res) => {
  logAction(req, 'cikis', null);
  req.session.destroy(() => res.redirect('/giris'));
});

function setSession(req, user) {
  req.session.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
  };
}

module.exports = { router, homeFor };
