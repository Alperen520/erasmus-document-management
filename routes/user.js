// Kullanıcı: belge yükleme + dosya görüntüleme.
const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../utils/upload');
const q = require('../utils/queries');
const { isDekontBelge } = require('../utils/helpers');
const { logAction } = require('../utils/audit');

const router = express.Router();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Belge yükleme — öğrenci kendi belgesini; yönetici (admin/koordinatör) dekont belgelerini
// dönem kısıtı olmadan ilgili öğrenci için yükleyebilir.
router.post('/hareketlilik/:id/yukle', requireAuth, (req, res) => {
  const mobilityId = req.params.id;
  const me = req.session.user;
  const canManage = me.role === 'admin' || me.role === 'coordinator';

  const mobility = db.prepare('SELECT * FROM mobilities WHERE id = ?').get(mobilityId);
  if (!mobility) {
    return res.status(404).render('error', {
      user: me, title: 'Bulunamadı', message: 'Hareketlilik bulunamadı.',
    });
  }

  // Dosyayı al (multer hata yönetimiyle)
  upload.single('belge')(req, res, (err) => {
    if (err) return back(res, mobilityId, err.message, req);
    if (!req.file) return back(res, mobilityId, 'Lütfen bir dosya seçin.', req);

    const documentId = req.body.documentId;
    const doc = db
      .prepare('SELECT * FROM mobility_documents WHERE id = ? AND mobility_id = ?')
      .get(documentId, mobilityId);
    if (!doc) {
      fs.unlink(req.file.path, () => {});
      return back(res, mobilityId, 'Geçersiz belge.', req);
    }
    const dekont = isDekontBelge(doc.ad);

    // Hedef öğrenci + yetki/koşul kontrolü
    let targetUserId;
    if (canManage) {
      // Yönetici yalnızca dekont belgelerine, belirtilen öğrenci için yükleyebilir (dönem/kilit yok)
      if (!dekont) {
        fs.unlink(req.file.path, () => {});
        return back(res, mobilityId, 'Bu belgeye yönetici yükleyemez.', req);
      }
      targetUserId = req.body.userId;
      const ok = db
        .prepare('SELECT 1 FROM mobility_users WHERE mobility_id = ? AND user_id = ?')
        .get(mobilityId, targetUserId);
      if (!ok) {
        fs.unlink(req.file.path, () => {});
        return back(res, mobilityId, 'Geçersiz kullanıcı.', req);
      }
    } else {
      // Öğrenci: kendi belgesi, atanmış olmalı, dönem açık olmalı, kilit kuralı
      targetUserId = me.id;
      const assigned = db
        .prepare('SELECT 1 FROM mobility_users WHERE mobility_id = ? AND user_id = ?')
        .get(mobilityId, me.id);
      if (!assigned) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).render('error', {
          user: me, title: 'Yetkisiz', message: 'Bu hareketliliğe belge yükleyemezsiniz.',
        });
      }
      const today = todayISO();
      if (today < mobility.yukleme_baslangic) {
        fs.unlink(req.file.path, () => {});
        return back(res, mobilityId, 'Belge yükleme dönemi henüz başlamadı.', req);
      }
      if (today > mobility.yukleme_bitis) {
        fs.unlink(req.file.path, () => {});
        return back(res, mobilityId, 'Belge yükleme süresi sona erdi.', req);
      }
      if (doc.kategori === 'normal' && !q.preApprovedForUser(mobilityId, me.id)) {
        fs.unlink(req.file.path, () => {});
        return back(res, mobilityId, 'Önce "Gitmeden Önce" belgelerinizin tamamı onaylanmalı.', req);
      }
    }

    const relPath = path.relative(path.join(__dirname, '..'), req.file.path);
    const existing = db
      .prepare('SELECT * FROM submissions WHERE mobility_id = ? AND user_id = ? AND document_id = ?')
      .get(mobilityId, targetUserId, documentId);

    let submissionId;
    if (existing) {
      // Eski dosyayı sil, kaydı güncelle, durumu yeniden incelemeye al
      if (existing.file_path) {
        fs.unlink(path.join(__dirname, '..', existing.file_path), () => {});
      }
      db.prepare(
        `UPDATE submissions
         SET file_path = ?, original_name = ?, status = 'bekliyor',
             reject_reason = NULL, uploaded_at = datetime('now'),
             reviewed_by = NULL, reviewed_at = NULL
         WHERE id = ?`
      ).run(relPath, req.file.originalname, existing.id);
      submissionId = existing.id;
    } else {
      const ins = db.prepare(
        `INSERT INTO submissions
         (mobility_id, user_id, document_id, file_path, original_name, status, uploaded_at)
         VALUES (?, ?, ?, ?, ?, 'bekliyor', datetime('now'))`
      ).run(mobilityId, targetUserId, documentId, relPath, req.file.originalname);
      submissionId = ins.lastInsertRowid;
    }

    logAction(req, 'belge_yukle', `${doc.ad} (hareketlilik ${mobilityId}, kullanıcı ${targetUserId})`);
    if (wantsJson(req)) {
      return res.json({
        ok: true,
        submissionId,
        status: 'bekliyor',
        fileUrl: '/belge/' + submissionId,
        originalName: req.file.originalname,
      });
    }
    res.redirect('/hareketlilik/' + mobilityId + '?yuklendi=1');
  });
});

// Dekont belgesi silme — yönetici (admin/koordinatör) veya belgenin sahibi öğrenci
router.post('/hareketlilik/:id/belge-sil', requireAuth, (req, res) => {
  const mobilityId = req.params.id;
  const me = req.session.user;
  const canManage = me.role === 'admin' || me.role === 'coordinator';

  const sub = db
    .prepare('SELECT * FROM submissions WHERE id = ? AND mobility_id = ?')
    .get(req.body.submissionId, mobilityId);
  if (!sub) return back(res, mobilityId, 'Belge bulunamadı.', req);

  const doc = db.prepare('SELECT ad FROM mobility_documents WHERE id = ?').get(sub.document_id);
  if (!doc || !isDekontBelge(doc.ad)) {
    return back(res, mobilityId, 'Bu belge silinemez.', req);
  }
  if (!canManage && sub.user_id !== me.id) {
    return res.status(403).render('error', {
      user: me, title: 'Yetkisiz', message: 'Bu belgeyi silemezsiniz.',
    });
  }
  if (sub.file_path) fs.unlink(path.join(__dirname, '..', sub.file_path), () => {});
  db.prepare('DELETE FROM submissions WHERE id = ?').run(sub.id);
  logAction(req, 'belge_sil', `${doc.ad} (hareketlilik ${mobilityId}, gönderim ${sub.id})`);
  res.redirect('/hareketlilik/' + mobilityId);
});

// Yüklenen dosyayı görüntüle (sahibi veya yetkili yönetici)
router.get('/belge/:submissionId', requireAuth, (req, res) => {
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.submissionId);
  if (!sub || !sub.file_path) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Belge bulunamadı.',
    });
  }
  const mobility = db.prepare('SELECT * FROM mobilities WHERE id = ?').get(sub.mobility_id);
  const me = req.session.user;
  const canManage =
    me.role === 'admin' || (me.role === 'coordinator' && mobility.created_by === me.id);
  if (!canManage && sub.user_id !== me.id) {
    return res.status(403).render('error', {
      user: me, title: 'Yetkisiz', message: 'Bu belgeye erişim yetkiniz yok.',
    });
  }
  res.sendFile(path.join(__dirname, '..', sub.file_path));
});

function wantsJson(req) {
  return (
    req.xhr ||
    String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest'
  );
}

function back(res, mobilityId, msg, req) {
  if (req && wantsJson(req)) return res.status(400).json({ ok: false, error: msg });
  return res.redirect('/hareketlilik/' + mobilityId + '?hata=' + encodeURIComponent(msg));
}

// İlk girişte ad-soyad pop-up'ından gelen ismi kaydet (yalnız full_name)
router.post('/profil/ad-soyad', requireAuth, (req, res) => {
  const ad = String(req.body.full_name || '').trim();
  if (ad) {
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(ad, req.session.user.id);
    req.session.user.full_name = ad; // üst menü/tablolar anında güncellensin
    logAction(req, 'ad_soyad_guncelle', ad);
  }
  res.redirect('/panel');
});

// --- Belgeler sekmesi (öğrenci): kendi hareketlilik türüne ait belgeleri doldurup indir ---
const { fillDocx, extractFields } = require('../utils/docx');

function asciiName(s) {
  const tr = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  return (String(s || 'belge').replace(/[çÇğĞıİöÖşŞüÜ]/g, (m) => tr[m]).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '')) || 'belge';
}

// Öğrencinin içinde bulunduğu hareketlilik türleri
function userMobilityTypes(userId) {
  return db
    .prepare(
      `SELECT DISTINCT m.tur FROM mobilities m
       JOIN mobility_users mu ON mu.mobility_id = m.id WHERE mu.user_id = ?`
    )
    .all(userId)
    .map((r) => r.tur);
}

// Sistemin zaten bildiği bilgileri form alanlarıyla eşleştir (öğrenci elle yazmasın).
// Etiket adına göre gevşek eşleme yapar; eşleşmeyen alanlar boş kalır.
const { formatDateTR } = require('../utils/helpers');
function prefillValues(user, tur, fields) {
  const mob = db
    .prepare(
      `SELECT m.* FROM mobilities m JOIN mobility_users mu ON mu.mobility_id = m.id
       WHERE mu.user_id = ? AND m.tur = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 1`
    )
    .get(user.id, tur);
  const okulNo = String(user.email || '').split('@')[0];
  const out = {};
  fields.forEach((label) => {
    const l = String(label).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
    let v = '';
    if (/(isim soyisim|ad soyad|adı soyadı|hesap sahibi tam adı)/.test(l)) v = user.full_name || '';
    else if (/(öğrenci no|okul no|öğrenci numarası|personel no)/.test(l)) v = okulNo;
    else if (/mail/.test(l)) v = user.email;
    else if (mob && /başlangıç tarihi/.test(l)) v = formatDateTR(mob.baslangic_tarih);
    else if (mob && /bitiş tarihi/.test(l)) v = formatDateTR(mob.bitis_tarih);
    else if (mob && /(akademik yıl|dönem)/.test(l)) v = mob.donem;
    if (v) out[label] = v;
  });
  return out;
}

// Belge listesi
router.get('/belgeler', requireAuth, (req, res) => {
  const types = userMobilityTypes(req.session.user.id);
  const docs = types.length
    ? db
        .prepare(
          `SELECT * FROM belge_sablonlari WHERE tur IN (${types.map(() => '?').join(',')}) ORDER BY tur, ad`
        )
        .all(...types)
    : [];
  res.render('belgeler', { docs });
});

// Doldurma formu
router.get('/belgeler/:id', requireAuth, (req, res) => {
  const tpl = db.prepare('SELECT * FROM belge_sablonlari WHERE id = ?').get(req.params.id);
  const types = userMobilityTypes(req.session.user.id);
  if (!tpl || !types.includes(tpl.tur)) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Belge bulunamadı veya erişiminiz yok.',
    });
  }
  const abs = path.join(__dirname, '..', tpl.dosya_yolu);
  if (!fs.existsSync(abs)) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Belge şablon dosyası bulunamadı.',
    });
  }
  const fields = extractFields(fs.readFileSync(abs));
  const prefill = prefillValues(req.session.user, tpl.tur, fields);
  res.render('belge-doldur', { tpl, fields, prefill });
});

// Doldur + indir
router.post('/belgeler/:id', requireAuth, (req, res) => {
  const tpl = db.prepare('SELECT * FROM belge_sablonlari WHERE id = ?').get(req.params.id);
  const types = userMobilityTypes(req.session.user.id);
  if (!tpl || !types.includes(tpl.tur)) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Belge bulunamadı veya erişiminiz yok.',
    });
  }
  const abs = path.join(__dirname, '..', tpl.dosya_yolu);
  const buf = fs.readFileSync(abs);
  const fields = extractFields(buf); // sıra şablondan; istemciye güvenme
  const values = {};
  fields.forEach((label, i) => { values[label] = String(req.body['alan_' + i] || '').trim(); });

  const out = fillDocx(buf, values);
  const fname = asciiName(tpl.ad + '-' + (req.session.user.full_name || req.session.user.email.split('@')[0])) + '.docx';
  logAction(req, 'belge_doldur', `${tpl.ad} (${tpl.tur})`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fname + '"');
  res.setHeader('Content-Length', out.length);
  return res.end(out);
});

module.exports = router;
