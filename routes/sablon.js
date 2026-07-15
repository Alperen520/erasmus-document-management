// Koordinatör/Admin: Belge Yönetimi — otomatik doldurulan .docx şablonlarını
// yükleme / güncelleme / silme / önizleme / test doldurma.
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');
const config = require('../config');
const { fillDocx, extractFields } = require('../utils/docx');
const { logAction } = require('../utils/audit');

const router = express.Router();
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

// .docx bellek üzerinden alınır; doğrulama başarılıysa diske yazılır.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const yetkili = requireRole('coordinator', 'admin');

function asciiName(s) {
  const tr = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  return (String(s || 'belge').replace(/[çÇğĞıİöÖşŞüÜ]/g, (m) => tr[m]).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')) || 'belge';
}

// Yüklenen dosyayı doğrula: .docx uzantısı + işaretler okunabiliyor mu.
// Dönüş: { fields } veya { error }.
function validateDocx(file) {
  if (!file) return { error: 'Lütfen bir .docx dosyası seçin.' };
  if (!/\.docx$/i.test(file.originalname)) {
    return { error: 'Sadece .docx dosyası yükleyebilirsiniz (.doc desteklenmez — Word\'de "Farklı Kaydet → .docx" yapın).' };
  }
  try {
    return { fields: extractFields(file.buffer) };
  } catch (e) {
    return { error: 'Dosya geçerli bir .docx olarak okunamadı. Word\'de .docx olarak yeniden kaydedip deneyin.' };
  }
}

function saveTemplateFile(buffer, ad) {
  const fname = 'tpl-' + Date.now() + '-' + asciiName(ad).toLowerCase().slice(0, 40) + '.docx';
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.writeFileSync(path.join(TEMPLATES_DIR, fname), buffer);
  return 'templates/' + fname;
}

// Şablon dosyasını güvenle sil (yalnız templates/ altındaysa)
function removeTemplateFile(relPath) {
  if (!relPath || !String(relPath).startsWith('templates/')) return;
  fs.unlink(path.join(__dirname, '..', relPath), () => {});
}

function getTpl(id) {
  return db.prepare('SELECT * FROM belge_sablonlari WHERE id = ?').get(id);
}

function tplFields(tpl) {
  try {
    const abs = path.join(__dirname, '..', tpl.dosya_yolu);
    return extractFields(fs.readFileSync(abs));
  } catch (e) {
    return null; // dosya eksik/bozuk
  }
}

// --- Liste + yükleme formu ---
router.get('/belge-yonetimi', yetkili, (req, res) => {
  const rows = db.prepare('SELECT * FROM belge_sablonlari ORDER BY tur, ad').all();
  rows.forEach((r) => {
    const f = tplFields(r);
    r.alanSayisi = f ? f.length : null;
  });
  res.render('belge-yonetimi', {
    rows,
    types: config.MOBILITY_TYPES,
    err: req.query.hata || null,
    msg: req.query.ok ? 'İşlem başarıyla tamamlandı.' : null,
  });
});

// --- Yeni şablon yükle ---
router.post('/belge-yonetimi/yukle', yetkili, (req, res) => {
  upload.single('dosya')(req, res, (mErr) => {
    const back = (hata) => res.redirect('/belge-yonetimi?hata=' + encodeURIComponent(hata));
    if (mErr) return back(mErr.message);

    const tur = String(req.body.tur || '').trim();
    const ad = String(req.body.ad || '').trim();
    if (!config.MOBILITY_TYPES.includes(tur)) return back('Geçersiz hareketlilik türü.');
    if (!ad) return back('Belge adı girmelisiniz.');

    const v = validateDocx(req.file);
    if (v.error) return back(v.error);
    if (v.fields.length === 0) {
      return back('Belgede hiç [[Alan Adı]] işareti bulunamadı. İşaretleri koyup tekrar yükleyin.');
    }

    const relPath = saveTemplateFile(req.file.buffer, ad);
    const ins = db
      .prepare('INSERT INTO belge_sablonlari (tur, ad, dosya_yolu) VALUES (?, ?, ?)')
      .run(tur, ad, relPath);
    logAction(req, 'sablon_yukle', `${ad} (${tur}, ${v.fields.length} alan)`);
    res.redirect('/belge-yonetimi/' + ins.lastInsertRowid + '?ok=1');
  });
});

// --- Şablon detayı: alan önizleme + güncelle/sil ---
router.get('/belge-yonetimi/:id', yetkili, (req, res) => {
  const tpl = getTpl(req.params.id);
  if (!tpl) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Şablon bulunamadı.',
    });
  }
  const fields = tplFields(tpl);
  res.render('belge-yonetimi-detay', {
    tpl,
    fields, // null => dosya okunamıyor
    types: config.MOBILITY_TYPES,
    err: req.query.hata || null,
    msg: req.query.ok ? 'İşlem başarıyla tamamlandı.' : null,
  });
});

// --- Şablon güncelle: ad/tür ve istenirse yeni dosya sürümü ---
router.post('/belge-yonetimi/:id/guncelle', yetkili, (req, res) => {
  const tpl = getTpl(req.params.id);
  if (!tpl) return res.redirect('/belge-yonetimi?hata=' + encodeURIComponent('Şablon bulunamadı.'));

  upload.single('dosya')(req, res, (mErr) => {
    const back = (hata) => res.redirect('/belge-yonetimi/' + tpl.id + '?hata=' + encodeURIComponent(hata));
    if (mErr) return back(mErr.message);

    const tur = String(req.body.tur || '').trim();
    const ad = String(req.body.ad || '').trim();
    if (!config.MOBILITY_TYPES.includes(tur)) return back('Geçersiz hareketlilik türü.');
    if (!ad) return back('Belge adı girmelisiniz.');

    let newPath = null;
    if (req.file) {
      const v = validateDocx(req.file);
      if (v.error) return back(v.error);
      if (v.fields.length === 0) return back('Yeni dosyada hiç [[Alan Adı]] işareti bulunamadı.');
      newPath = saveTemplateFile(req.file.buffer, ad);
    }

    const oldPath = tpl.dosya_yolu;
    db.prepare('UPDATE belge_sablonlari SET tur = ?, ad = ?, dosya_yolu = ? WHERE id = ?')
      .run(tur, ad, newPath || oldPath, tpl.id);
    if (newPath) removeTemplateFile(oldPath);

    logAction(req, 'sablon_guncelle', `${ad} (${tur}${newPath ? ', yeni dosya' : ''}) id ${tpl.id}`);
    res.redirect('/belge-yonetimi/' + tpl.id + '?ok=1');
  });
});

// --- Şablon sil ---
router.post('/belge-yonetimi/:id/sil', yetkili, (req, res) => {
  const tpl = getTpl(req.params.id);
  if (tpl) {
    db.prepare('DELETE FROM belge_sablonlari WHERE id = ?').run(tpl.id);
    removeTemplateFile(tpl.dosya_yolu);
    logAction(req, 'sablon_sil', `${tpl.ad} (${tpl.tur}) id ${tpl.id}`);
  }
  res.redirect('/belge-yonetimi?ok=1');
});

// --- Test doldur: her alana örnek değer yazıp indir (öğrenciye açmadan kontrol) ---
router.get('/belge-yonetimi/:id/test', yetkili, (req, res) => {
  const tpl = getTpl(req.params.id);
  if (!tpl) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Şablon bulunamadı.',
    });
  }
  const abs = path.join(__dirname, '..', tpl.dosya_yolu);
  if (!fs.existsSync(abs)) {
    return res.redirect('/belge-yonetimi/' + tpl.id + '?hata=' + encodeURIComponent('Şablon dosyası diskte bulunamadı.'));
  }
  const buf = fs.readFileSync(abs);
  const fields = extractFields(buf);
  const values = {};
  fields.forEach((label) => { values[label] = '«' + label + '»'; });
  const out = fillDocx(buf, values);
  const fname = 'TEST-' + asciiName(tpl.ad) + '.docx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
  res.setHeader('Content-Length', out.length);
  res.end(out);
});

module.exports = router;
