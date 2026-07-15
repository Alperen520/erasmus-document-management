// SQLite bağlantısı ve şema oluşturma (better-sqlite3).
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'erasmus.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT,                       -- kullanıcılarda dolu, koordinatör/admin dolu
      role          TEXT NOT NULL CHECK (role IN ('admin','coordinator','user')),
      full_name     TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mobilities (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      donem             TEXT NOT NULL,          -- örn "2025-2026"
      tur               TEXT NOT NULL,          -- hareketlilik türü
      baslangic_tarih   TEXT NOT NULL,          -- hareketlilik başlangıç (YYYY-MM-DD)
      bitis_tarih       TEXT NOT NULL,          -- hareketlilik bitiş
      yukleme_baslangic TEXT NOT NULL,          -- belge yükleme başlangıç
      yukleme_bitis     TEXT NOT NULL,          -- belge yükleme bitiş
      created_by        INTEGER REFERENCES users(id),
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mobility_documents (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      mobility_id INTEGER NOT NULL REFERENCES mobilities(id) ON DELETE CASCADE,
      ad          TEXT NOT NULL,                -- belge adı = tablo sütunu
      sira        INTEGER NOT NULL DEFAULT 0,
      kategori    TEXT NOT NULL DEFAULT 'normal' -- 'oncesi' (zorunlu) | 'normal' (ön onay gerekmeyen)
    );

    CREATE TABLE IF NOT EXISTS mobility_users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      mobility_id INTEGER NOT NULL REFERENCES mobilities(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (mobility_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      mobility_id   INTEGER NOT NULL REFERENCES mobilities(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      document_id   INTEGER NOT NULL REFERENCES mobility_documents(id) ON DELETE CASCADE,
      file_path     TEXT,
      original_name TEXT,
      status        TEXT NOT NULL DEFAULT 'bekliyor'
                      CHECK (status IN ('bekliyor','onaylandi','reddedildi')),
      reject_reason TEXT,
      uploaded_at   TEXT,
      reviewed_by   INTEGER REFERENCES users(id),
      reviewed_at   TEXT,
      UNIQUE (mobility_id, user_id, document_id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      user_email TEXT,
      role       TEXT,
      islem      TEXT NOT NULL,
      detay      TEXT,
      ip         TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS belge_sablonlari (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tur        TEXT NOT NULL,          -- hareketlilik türü
      ad         TEXT NOT NULL,          -- belge adı (ör. "Hibe Sözleşmesi")
      dosya_yolu TEXT NOT NULL,          -- .docx şablonun göreli yolu
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS duyurular (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      baslik     TEXT NOT NULL,
      icerik     TEXT NOT NULL,
      tur        TEXT,                   -- NULL = herkese; dolu = o hareketlilik türüne
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

init();

// --- Migration: mevcut veritabanına eksik sütunları ekle ---
function migrate() {
  const cols = db.prepare('PRAGMA table_info(mobility_documents)').all();
  if (!cols.some((c) => c.name === 'kategori')) {
    db.exec("ALTER TABLE mobility_documents ADD COLUMN kategori TEXT NOT NULL DEFAULT 'normal'");
  }
  if (!cols.some((c) => c.name === 'aciklama')) {
    db.exec('ALTER TABLE mobility_documents ADD COLUMN aciklama TEXT');
  }

  // users: kaldırılan profil sekmesinden kalan kullanılmayan sütunları temizle
  const ucols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  [
    'fakulte',
    'bolum',
    'gidilen_universite',
    'gidilen_ulke',
    'banka_adi',
    'sube_adresi',
    'hesap_sahibi',
    'iban',
  ].forEach((name) => {
    if (ucols.includes(name)) {
      try { db.exec(`ALTER TABLE users DROP COLUMN ${name}`); } catch (e) { /* eski SQLite ise dokunma */ }
    }
  });
}

migrate();

module.exports = db;
