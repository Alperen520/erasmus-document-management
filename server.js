// KOSTÜ Erasmus Belge Yönetim Sistemi — ana sunucu.
const path = require('path');
const express = require('express');
const session = require('express-session');

const config = require('./config');
require('./db/database'); // şemayı başlatır

const { router: authRouter, homeFor } = require('./routes/auth');
const { requireAuth, requireRole } = require('./middleware/auth');
const { formatDateTR, docNameHtml, isDekontBelge } = require('./utils/helpers');
const { logError } = require('./utils/audit');
const q = require('./utils/queries');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8 saat
  })
);

// Tüm view'lara ortak değişkenler
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.appName = 'Erasmus Belge Yönetim Sistemi';
  res.locals.formatDateTR = formatDateTR;
  res.locals.docNameHtml = docNameHtml;
  res.locals.isDekont = isDekontBelge;
  res.locals.mobilityTitle = q.mobilityTitle;
  // Role göre ana panel adresi (geri/iptal/logo bağlantıları için)
  res.locals.homeUrl = req.session.user ? homeFor(req.session.user.role) : '/giris';
  next();
});

// Rotalar
app.use('/', authRouter);
app.use('/', require('./routes/admin'));
app.use('/', require('./routes/coordinator'));
app.use('/', require('./routes/sablon'));
const { router: duyuruRouter, duyurularForUser, markYeni } = require('./routes/duyurular');
app.use('/', duyuruRouter);
app.use('/', require('./routes/user'));

// Kök -> role göre yönlendir
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect(homeFor(req.session.user.role));
  res.redirect('/giris');
});

// Yardımcı: hareketlilik listesi için özetleri hazırla
function withSummaries(mobilities) {
  const summaries = {};
  mobilities.forEach((m) => (summaries[m.id] = q.mobilitySummary(m.id)));
  return summaries;
}

// Yardımcı: hareketlilikleri aktif / geçmiş (bitiş tarihi geçmiş) olarak ayır
function splitArchive(mobilities) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    active: mobilities.filter((m) => m.bitis_tarih >= today),
    past: mobilities.filter((m) => m.bitis_tarih < today),
  };
}

// Kullanıcı paneli
app.get('/panel', requireRole('user'), (req, res) => {
  const all = q.mobilitiesForUser(req.session.user.id);
  const { active, past } = splitArchive(all);
  const progress = {};
  all.forEach((m) => (progress[m.id] = q.userProgress(m.id, req.session.user.id)));
  res.render('dashboard-user', {
    mobilities: active,
    pastMobilities: past,
    summaries: withSummaries(all),
    progress,
    duyurular: markYeni(duyurularForUser(req.session.user.id)),
  });
});

// Koordinatör paneli — koordinatörler de tüm hareketlilikleri görür/yönetir
app.get('/koordinator', requireRole('coordinator', 'admin'), (req, res) => {
  const all = q.allMobilities();
  const { active, past } = splitArchive(all);
  res.render('dashboard-coordinator', {
    mobilities: active,
    pastMobilities: past,
    summaries: withSummaries(all),
    stats: q.globalStats(),
  });
});

// Admin paneli
app.get('/admin', requireRole('admin'), (req, res) => {
  const all = q.allMobilities();
  const { active, past } = splitArchive(all);
  res.render('dashboard-admin', {
    mobilities: active,
    pastMobilities: past,
    summaries: withSummaries(all),
    stats: q.globalStats(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    user: req.session.user || null,
    title: 'Sayfa Bulunamadı',
    message: 'Aradığınız sayfa bulunamadı.',
  });
});

// Beklenmedik hatalar — logs/error.log'a yaz ve hata sayfası göster
app.use((err, req, res, next) => {
  logError(err, req.method + ' ' + req.originalUrl);
  if (res.headersSent) return next(err);
  res.status(500).render('error', {
    user: (req.session && req.session.user) || null,
    title: 'Hata',
    message: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
  });
});

app.listen(config.PORT, () => {
  console.log(`KOSTÜ Erasmus modülü çalışıyor: http://localhost:${config.PORT}`);
});
