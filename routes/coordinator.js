// Koordinatör/Admin: hareketlilik oluşturma + tablo görüntüleme.
const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireRole, requireAuth } = require('../middleware/auth');
const { parseUserEmails, normalizeSchoolEmail } = require('../utils/helpers');
const q = require('../utils/queries');
const config = require('../config');
const { buildZip } = require('../utils/zip');
const { logAction } = require('../utils/audit');

const router = express.Router();

// Dosya/sütun adını ZIP içi güvenli hale getir
function sanitizeName(s) {
  return String(s || '')
    .replace(/[\/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// Yeni hareketlilik formu
router.get('/hareketlilik/yeni', requireRole('coordinator', 'admin'), (req, res) => {
  const ilkTur = config.MOBILITY_TYPES[0];
  const tpl = config.getTemplate(ilkTur);
  res.render('mobility-new', {
    types: config.MOBILITY_TYPES,
    templates: config.DOCUMENT_TEMPLATES,
    defaultTemplate: config.DEFAULT_TEMPLATE,
    defaultPreDocs: tpl.once.map((ad) => ({ id: '', ad })),
    defaultDocs: tpl.sonra.map((ad) => ({ id: '', ad })),
    error: null,
    editId: null,
    form: { tur: ilkTur },
  });
});

// Yeni hareketlilik kaydet
router.post('/hareketlilik/yeni', requireRole('coordinator', 'admin'), (req, res) => {
  const {
    donem,
    tur,
    baslangic_tarih,
    bitis_tarih,
    yukleme_baslangic,
    yukleme_bitis,
    kullanicilar,
  } = req.body;

  // Belge listeleri (boşları ele, kırp) — iki grup
  const cleanList = (v) => {
    let a = v || [];
    if (!Array.isArray(a)) a = [a];
    return a.map((d) => String(d).trim()).filter(Boolean);
  };
  const preDocs = cleanList(req.body.belgelerOncesi);
  const docs = cleanList(req.body.belgeler);

  const rerender = (error) => {
    const tpl = config.getTemplate(req.body.tur);
    return res.status(400).render('mobility-new', {
      types: config.MOBILITY_TYPES,
      templates: config.DOCUMENT_TEMPLATES,
      defaultTemplate: config.DEFAULT_TEMPLATE,
      defaultPreDocs: (preDocs.length ? preDocs : tpl.once).map((ad) => ({ id: '', ad })),
      defaultDocs: (docs.length ? docs : tpl.sonra).map((ad) => ({ id: '', ad })),
      error,
      editId: null,
      form: req.body,
    });
  };

  // Zorunlu alan kontrolü
  if (!donem || !tur || !baslangic_tarih || !bitis_tarih || !yukleme_baslangic || !yukleme_bitis) {
    return rerender('Lütfen tüm zorunlu alanları doldurun.');
  }
  if (!config.MOBILITY_TYPES.includes(tur)) {
    return rerender('Geçersiz hareketlilik türü.');
  }
  if (bitis_tarih < baslangic_tarih) {
    return rerender('Hareketlilik bitiş tarihi başlangıçtan önce olamaz.');
  }
  if (yukleme_bitis < yukleme_baslangic) {
    return rerender('Belge yükleme bitiş tarihi başlangıçtan önce olamaz.');
  }
  if (docs.length === 0 && preDocs.length === 0) {
    return rerender('En az bir belge adı girmelisiniz.');
  }

  // Kullanıcı e-postalarını ayrıştır
  const { valid, invalid } = parseUserEmails(kullanicilar);
  if (invalid.length > 0) {
    return rerender(
      'Geçersiz kullanıcı girdileri: ' +
        invalid.join(', ') +
        `. Sadece okul numarası veya ${config.SCHOOL_DOMAIN} uzantılı e-posta girin.`
    );
  }
  if (valid.length === 0) {
    return rerender('En az bir kullanıcı eklemelisiniz.');
  }

  // İşlemi transaction içinde yap
  const userPassHash = bcrypt.hashSync(config.USER_DEFAULT_PASSWORD, 10);

  const tx = db.transaction(() => {
    const mob = db
      .prepare(
        `INSERT INTO mobilities
         (donem, tur, baslangic_tarih, bitis_tarih, yukleme_baslangic, yukleme_bitis, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        donem.trim(),
        tur,
        baslangic_tarih,
        bitis_tarih,
        yukleme_baslangic,
        yukleme_bitis,
        req.session.user.id
      );
    const mobilityId = mob.lastInsertRowid;

    // Belgeler (sütunlar) — önce zorunlu grup, sonra ön onay gerekmeyen grup
    const insDoc = db.prepare(
      'INSERT INTO mobility_documents (mobility_id, ad, sira, kategori) VALUES (?, ?, ?, ?)'
    );
    let sira = 0;
    preDocs.forEach((ad) => insDoc.run(mobilityId, ad, sira++, 'oncesi'));
    docs.forEach((ad) => insDoc.run(mobilityId, ad, sira++, 'normal'));

    // Kullanıcılar (satırlar) — yoksa oluştur, hareketliliğe ata
    const findUser = db.prepare('SELECT id FROM users WHERE email = ?');
    const insUser = db.prepare(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')"
    );
    const linkUser = db.prepare(
      'INSERT OR IGNORE INTO mobility_users (mobility_id, user_id) VALUES (?, ?)'
    );
    for (const email of valid) {
      let u = findUser.get(email);
      let uid;
      if (u) {
        uid = u.id;
      } else {
        uid = insUser.run(email, userPassHash).lastInsertRowid;
      }
      linkUser.run(mobilityId, uid);
    }

    return mobilityId;
  });

  const mobilityId = tx();
  logAction(req, 'hareketlilik_olustur', `${donem.trim()} ${tur} (id ${mobilityId})`);
  res.redirect('/hareketlilik/' + mobilityId);
});

// Hareketlilik düzenleme formu (yeni hareketlilik ekranının dolu hali)
router.get('/hareketlilik/:id/duzenle', requireRole('coordinator', 'admin'), (req, res) => {
  const m = q.getMobility(req.params.id);
  if (!m) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Hareketlilik bulunamadı.',
    });
  }
  const docs = db
    .prepare('SELECT id, ad, kategori FROM mobility_documents WHERE mobility_id = ? ORDER BY sira, id')
    .all(m.id);
  const users = db
    .prepare(
      `SELECT u.email FROM users u JOIN mobility_users mu ON mu.user_id = u.id
       WHERE mu.mobility_id = ? ORDER BY u.email`
    )
    .all(m.id);
  res.render('mobility-new', {
    types: config.MOBILITY_TYPES,
    templates: config.DOCUMENT_TEMPLATES,
    defaultTemplate: config.DEFAULT_TEMPLATE,
    defaultPreDocs: docs.filter((d) => d.kategori === 'oncesi').map((d) => ({ id: d.id, ad: d.ad })),
    defaultDocs: docs.filter((d) => d.kategori === 'normal').map((d) => ({ id: d.id, ad: d.ad })),
    error: null,
    editId: m.id,
    form: {
      donem: m.donem, tur: m.tur,
      baslangic_tarih: m.baslangic_tarih, bitis_tarih: m.bitis_tarih,
      yukleme_baslangic: m.yukleme_baslangic, yukleme_bitis: m.yukleme_bitis,
      kullanicilar: users.map((u) => u.email).join(', '),
    },
  });
});

// Hareketlilik düzenleme kaydet — belgeleri id ile eşleştirir (ad değişse de yüklemeler korunur)
router.post('/hareketlilik/:id/duzenle', requireRole('coordinator', 'admin'), (req, res) => {
  const m = q.getMobility(req.params.id);
  if (!m) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Hareketlilik bulunamadı.',
    });
  }
  const { donem, tur, baslangic_tarih, bitis_tarih, yukleme_baslangic, yukleme_bitis, kullanicilar } = req.body;

  const toArr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const buildRows = (names, ids, kategori) =>
    toArr(names)
      .map((n, i) => ({ ad: String(n).trim(), id: String(toArr(ids)[i] || '').trim(), kategori }))
      .filter((r) => r.ad);
  const preRows = buildRows(req.body.belgelerOncesi, req.body.belgelerOncesiId, 'oncesi');
  const norRows = buildRows(req.body.belgeler, req.body.belgelerId, 'normal');
  const desiredDocs = [...preRows, ...norRows];

  const rerender = (error) =>
    res.status(400).render('mobility-new', {
      types: config.MOBILITY_TYPES,
      templates: config.DOCUMENT_TEMPLATES,
      defaultTemplate: config.DEFAULT_TEMPLATE,
      defaultPreDocs: preRows.map((r) => ({ id: r.id, ad: r.ad })),
      defaultDocs: norRows.map((r) => ({ id: r.id, ad: r.ad })),
      error,
      editId: m.id,
      form: req.body,
    });

  if (!donem || !tur || !baslangic_tarih || !bitis_tarih || !yukleme_baslangic || !yukleme_bitis) {
    return rerender('Lütfen tüm zorunlu alanları doldurun.');
  }
  if (!config.MOBILITY_TYPES.includes(tur)) return rerender('Geçersiz hareketlilik türü.');
  if (bitis_tarih < baslangic_tarih) return rerender('Hareketlilik bitiş tarihi başlangıçtan önce olamaz.');
  if (yukleme_bitis < yukleme_baslangic) return rerender('Belge yükleme bitiş tarihi başlangıçtan önce olamaz.');
  if (desiredDocs.length === 0) return rerender('En az bir belge adı girmelisiniz.');

  const { valid, invalid } = parseUserEmails(kullanicilar);
  if (invalid.length > 0) {
    return rerender('Geçersiz kullanıcı girdileri: ' + invalid.join(', ') + `. Sadece okul numarası veya ${config.SCHOOL_DOMAIN} uzantılı e-posta girin.`);
  }
  if (valid.length === 0) return rerender('En az bir kullanıcı eklemelisiniz.');

  const userPassHash = bcrypt.hashSync(config.USER_DEFAULT_PASSWORD, 10);
  const removedFiles = [];

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE mobilities SET donem = ?, tur = ?, baslangic_tarih = ?, bitis_tarih = ?,
       yukleme_baslangic = ?, yukleme_bitis = ? WHERE id = ?`
    ).run(donem.trim(), tur, baslangic_tarih, bitis_tarih, yukleme_baslangic, yukleme_bitis, m.id);

    // --- Belgeler: id ile eşleştir (kalan korunur, çıkarılan silinir, yeni eklenir) ---
    const existingIds = db.prepare('SELECT id FROM mobility_documents WHERE mobility_id = ?').all(m.id).map((r) => r.id);
    const desiredIds = new Set(desiredDocs.filter((d) => d.id).map((d) => Number(d.id)));
    for (const did of existingIds) {
      if (!desiredIds.has(did)) {
        db.prepare('SELECT file_path FROM submissions WHERE document_id = ?').all(did)
          .forEach((s) => s.file_path && removedFiles.push(s.file_path));
        db.prepare('DELETE FROM mobility_documents WHERE id = ?').run(did); // cascade: submissions
      }
    }
    const updDoc = db.prepare('UPDATE mobility_documents SET ad = ?, kategori = ?, sira = ? WHERE id = ? AND mobility_id = ?');
    const insDoc = db.prepare('INSERT INTO mobility_documents (mobility_id, ad, sira, kategori) VALUES (?, ?, ?, ?)');
    let sira = 0;
    for (const d of desiredDocs) {
      if (d.id && existingIds.includes(Number(d.id))) updDoc.run(d.ad, d.kategori, sira++, Number(d.id), m.id);
      else insDoc.run(m.id, d.ad, sira++, d.kategori);
    }

    // --- Kullanıcılar: ekle / çıkar ---
    const findUser = db.prepare('SELECT id FROM users WHERE email = ?');
    const insUser = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')");
    const linkUser = db.prepare('INSERT OR IGNORE INTO mobility_users (mobility_id, user_id) VALUES (?, ?)');
    const desiredUserIds = new Set();
    for (const email of valid) {
      const u = findUser.get(email);
      const uid = u ? u.id : insUser.run(email, userPassHash).lastInsertRowid;
      desiredUserIds.add(uid);
      linkUser.run(m.id, uid);
    }
    const current = db.prepare("SELECT u.id FROM users u JOIN mobility_users mu ON mu.user_id = u.id WHERE mu.mobility_id = ? AND u.role = 'user'").all(m.id).map((r) => r.id);
    const stillLinked = db.prepare('SELECT 1 FROM mobility_users WHERE user_id = ? LIMIT 1');
    const delUser = db.prepare("DELETE FROM users WHERE id = ? AND role = 'user'");
    for (const uid of current) {
      if (!desiredUserIds.has(uid)) {
        db.prepare('SELECT file_path FROM submissions WHERE mobility_id = ? AND user_id = ?').all(m.id, uid)
          .forEach((s) => s.file_path && removedFiles.push(s.file_path));
        db.prepare('DELETE FROM submissions WHERE mobility_id = ? AND user_id = ?').run(m.id, uid);
        db.prepare('DELETE FROM mobility_users WHERE mobility_id = ? AND user_id = ?').run(m.id, uid);
        if (!stillLinked.get(uid)) delUser.run(uid);
      }
    }
  });
  tx();

  // Silinen belge/kullanıcı dosyalarını diskten temizle (tx sonrası)
  removedFiles.forEach((fp) => fs.unlink(path.join(__dirname, '..', fp), () => {}));

  logAction(req, 'hareketlilik_duzenle', `${donem.trim()} ${tur} (id ${m.id})`);
  res.redirect('/hareketlilik/' + m.id);
});

// Hareketlilik tablosu (admin, oluşturan koordinatör veya atanmış kullanıcı erişebilir)
router.get('/hareketlilik/:id', requireAuth, (req, res) => {
  const mobility = q.getMobility(req.params.id);
  if (!mobility) {
    return res.status(404).render('error', {
      user: req.session.user,
      title: 'Bulunamadı',
      message: 'Hareketlilik bulunamadı.',
    });
  }

  const me = req.session.user;
  const isAssigned = db
    .prepare('SELECT 1 FROM mobility_users WHERE mobility_id = ? AND user_id = ?')
    .get(mobility.id, me.id);
  const canManage = me.role === 'admin' || me.role === 'coordinator';
  if (!canManage && !isAssigned) {
    return res.status(403).render('error', {
      user: me,
      title: 'Yetkisiz Erişim',
      message: 'Bu hareketliliğe erişim yetkiniz yok.',
    });
  }

  const documents = db
    .prepare('SELECT * FROM mobility_documents WHERE mobility_id = ? ORDER BY sira, id')
    .all(mobility.id);

  // Kullanıcı sadece kendini görür; yönetici tüm kullanıcıları görür.
  const users = canManage
    ? db
        .prepare(
          `SELECT u.* FROM users u JOIN mobility_users mu ON mu.user_id = u.id
           WHERE mu.mobility_id = ? ORDER BY u.email`
        )
        .all(mobility.id)
    : db.prepare('SELECT * FROM users WHERE id = ?').all(me.id);

  // Gönderim haritası: subMap[userId][documentId] = submission
  const subs = db
    .prepare('SELECT * FROM submissions WHERE mobility_id = ?')
    .all(mobility.id);
  const subMap = {};
  for (const s of subs) {
    (subMap[s.user_id] = subMap[s.user_id] || {})[s.document_id] = s;
  }

  const today = new Date().toISOString().slice(0, 10);
  const uploadOpen = today >= mobility.yukleme_baslangic && today <= mobility.yukleme_bitis;

  // Belgeleri iki gruba ayır
  const preDocs = documents.filter((d) => d.kategori === 'oncesi');
  const normalDocs = documents.filter((d) => d.kategori === 'normal');

  // Her kullanıcı için zorunlu belgelerin tamamı onaylandı mı (kilit durumu)
  const preApprovedByUser = {};
  users.forEach((u) => {
    preApprovedByUser[u.id] = q.preApprovedForUser(mobility.id, u.id);
  });

  // Her kullanıcı için TÜM belgeler onaylandı mı (ZIP indirme uygunluğu)
  const allApprovedByUser = {};
  users.forEach((u) => {
    const m = subMap[u.id] || {};
    allApprovedByUser[u.id] =
      documents.length > 0 &&
      documents.every((d) => m[d.id] && m[d.id].status === 'onaylandi');
  });

  res.render('mobility-table', {
    title: 'Hareketlilik Tablosu',
    mobility,
    documents,
    preDocs,
    normalDocs,
    preApprovedByUser,
    allApprovedByUser,
    users,
    subMap,
    canManage,
    uploadOpen,
    msg: req.query.yuklendi ? 'Belge başarıyla yüklendi.' : null,
    err: req.query.hata || null,
  });
});

// Bir öğrencinin TÜM onaylı belgelerini ZIP olarak indir (yalnız koordinatör/admin).
// ZIP adı = öğrenci numarası (e-posta yerel kısmı).
router.get(
  '/hareketlilik/:id/kullanici/:userId/zip',
  requireRole('coordinator', 'admin'),
  (req, res) => {
    const me = req.session.user;
    const mobility = q.getMobility(req.params.id);
    if (!mobility) {
      return res.status(404).render('error', {
        user: me, title: 'Bulunamadı', message: 'Hareketlilik bulunamadı.',
      });
    }

    // Kullanıcı bu hareketliliğe atanmış mı?
    const user = db
      .prepare(
        `SELECT u.* FROM users u JOIN mobility_users mu ON mu.user_id = u.id
         WHERE mu.mobility_id = ? AND u.id = ?`
      )
      .get(mobility.id, req.params.userId);
    if (!user) {
      return res.status(404).render('error', {
        user: me, title: 'Bulunamadı', message: 'Bu hareketliliğe atanmış kullanıcı bulunamadı.',
      });
    }

    const documents = db
      .prepare('SELECT * FROM mobility_documents WHERE mobility_id = ? ORDER BY sira, id')
      .all(mobility.id);

    const subs = db
      .prepare('SELECT * FROM submissions WHERE mobility_id = ? AND user_id = ?')
      .all(mobility.id, user.id);
    const subByDoc = {};
    subs.forEach((s) => (subByDoc[s.document_id] = s));

    // Sunucu tarafı güvence: tüm belgeler onaylanmadan indirme yok.
    const allApproved =
      documents.length > 0 &&
      documents.every((d) => subByDoc[d.id] && subByDoc[d.id].status === 'onaylandi');
    if (!allApproved) {
      return res.redirect(
        '/hareketlilik/' + mobility.id +
          '?hata=' + encodeURIComponent('Bu öğrencinin tüm belgeleri onaylanmadan ZIP indirilemez.')
      );
    }

    // Onaylı dosyaları topla; kategoriye göre klasörle:
    //   'oncesi' -> "Gitmeden Önce/", 'normal' -> "Döndükten Sonra/"
    const files = [];
    const counts = {};
    documents.forEach((d, idx) => {
      const s = subByDoc[d.id];
      if (!s || !s.file_path) return;
      const abs = path.join(__dirname, '..', s.file_path);
      if (!fs.existsSync(abs)) return;
      const ext = path.extname(s.original_name || s.file_path) || '';
      const folder = d.kategori === 'oncesi' ? 'Gitmeden Önce' : 'Döndükten Sonra';
      const base = sanitizeName(d.ad) || 'belge-' + (idx + 1);
      const fkey = folder + '/' + base;
      counts[fkey] = (counts[fkey] || 0) + 1;
      const fname = (counts[fkey] === 1 ? base : base + '-' + counts[fkey]) + ext;
      files.push({ name: folder + '/' + fname, data: fs.readFileSync(abs) });
    });

    if (files.length === 0) {
      return res.redirect(
        '/hareketlilik/' + mobility.id +
          '?hata=' + encodeURIComponent('Diskte indirilebilir belge bulunamadı.')
      );
    }

    const ogrNo = String(user.email).split('@')[0];
    const zipName = (sanitizeName(ogrNo) || 'belgeler') + '.zip';
    const zip = buildZip(files);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + zipName + '"');
    res.setHeader('Content-Length', zip.length);
    logAction(req, 'zip_indir', `kullanıcı ${user.email} (hareketlilik ${mobility.id})`);
    return res.end(zip);
  }
);

// Belge açıklaması kaydet (koordinatör/admin) — öğrenci tablosunda görünür
router.post('/hareketlilik/:id/belge/:docId/aciklama', requireRole('coordinator', 'admin'), (req, res) => {
  const ajax =
    req.xhr || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
  const doc = db
    .prepare('SELECT id FROM mobility_documents WHERE id = ? AND mobility_id = ?')
    .get(req.params.docId, req.params.id);
  let a = '';
  if (doc) {
    a = String(req.body.aciklama || '').trim();
    db.prepare('UPDATE mobility_documents SET aciklama = ? WHERE id = ?').run(a || null, doc.id);
    logAction(req, 'aciklama_guncelle', 'belge ' + doc.id);
  }
  if (ajax) return res.json({ ok: !!doc, aciklama: a });
  res.redirect('/hareketlilik/' + req.params.id);
});

// Belge onaylama / reddetme (oluşturan koordinatör veya admin)
router.post('/hareketlilik/:id/inceleme', requireRole('coordinator', 'admin'), (req, res) => {
  const mobility = q.getMobility(req.params.id);
  const me = req.session.user;
  if (!mobility) {
    return res.status(404).render('error', { user: me, title: 'Bulunamadı', message: 'Hareketlilik bulunamadı.' });
  }
  // requireRole zaten admin/coordinator'a kısıtlıyor; her ikisi de yönetebilir.

  const { submissionId, action } = req.body;
  const sub = db
    .prepare('SELECT * FROM submissions WHERE id = ? AND mobility_id = ?')
    .get(submissionId, mobility.id);
  if (!sub || !sub.file_path) {
    return res.redirect('/hareketlilik/' + mobility.id + '?hata=' + encodeURIComponent('Yüklenmiş belge bulunamadı.'));
  }

  if (action === 'onayla') {
    db.prepare(
      `UPDATE submissions SET status = 'onaylandi', reject_reason = NULL,
       reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
    ).run(me.id, sub.id);
  } else if (action === 'reddet') {
    const reason = String(req.body.reason || '').trim();
    db.prepare(
      `UPDATE submissions SET status = 'reddedildi', reject_reason = ?,
       reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?`
    ).run(reason || 'Belirtilmedi', me.id, sub.id);
  }
  logAction(req, action === 'onayla' ? 'belge_onayla' : 'belge_reddet', `gönderim ${sub.id} (hareketlilik ${mobility.id})`);
  res.redirect('/hareketlilik/' + mobility.id);
});

// Hareketlilik silme (admin + koordinatör). İlişkili belge/atama/gönderim kayıtları
// ON DELETE CASCADE ile, diskteki yüklenen dosyalar da elle silinir.
router.post('/hareketlilik/:id/sil', requireRole('coordinator', 'admin'), (req, res) => {
  const mobility = q.getMobility(req.params.id);
  if (!mobility) {
    return res.status(404).render('error', {
      user: req.session.user, title: 'Bulunamadı', message: 'Hareketlilik bulunamadı.',
    });
  }

  // Bu hareketliliğe atanmış öğrencileri (role='user') silmeden ÖNCE yakala
  const affected = db
    .prepare(
      `SELECT u.id FROM users u
       JOIN mobility_users mu ON mu.user_id = u.id
       WHERE mu.mobility_id = ? AND u.role = 'user'`
    )
    .all(mobility.id);

  const tx = db.transaction(() => {
    // Hareketliliği sil (cascade: belgeler, atamalar, gönderimler)
    db.prepare('DELETE FROM mobilities WHERE id = ?').run(mobility.id);

    // Başka hiçbir hareketliliğe atanmamış öğrenci hesaplarını temizle (yetim kayıt)
    const stillLinked = db.prepare('SELECT 1 FROM mobility_users WHERE user_id = ? LIMIT 1');
    const delUser = db.prepare("DELETE FROM users WHERE id = ? AND role = 'user'");
    for (const u of affected) {
      if (!stillLinked.get(u.id)) delUser.run(u.id);
    }
  });
  tx();

  // Diskteki yüklenmiş dosyaları temizle (uploads/<mobilityId>)
  const dir = path.join(__dirname, '..', 'uploads', String(mobility.id));
  fs.rm(dir, { recursive: true, force: true }, () => {});

  logAction(req, 'hareketlilik_sil', `${mobility.donem} ${mobility.tur} (id ${mobility.id})`);
  const home = req.session.user.role === 'admin' ? '/admin' : '/koordinator';
  res.redirect(home);
});

module.exports = router;
