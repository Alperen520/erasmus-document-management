// İlk verileri ekler: 1 admin + 1 koordinatör. (Tekrar çalıştırılabilir / idempotent.)
const bcrypt = require('bcryptjs');
const db = require('./database');
const { SCHOOL_DOMAIN } = require('../config');

function upsertUser({ email, password, role, full_name }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const hash = password ? bcrypt.hashSync(password, 10) : null;
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, full_name = ? WHERE email = ?')
      .run(hash, role, full_name, email);
    console.log(`Güncellendi: ${email} (${role})`);
  } else {
    db.prepare('INSERT INTO users (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)')
      .run(email, hash, role, full_name);
    console.log(`Eklendi: ${email} (${role})`);
  }
}

// --- Başlangıç hesapları ---
// Admin: okul uzantısı zorunlu değil (yönetici girişi). İstersen değiştir.
upsertUser({
  email: 'admin' + SCHOOL_DOMAIN,
  password: 'Admin123!',
  role: 'admin',
  full_name: 'Sistem Yöneticisi',
});

// Koordinatör: okul uzantılı e-posta + admin'in belirlediği şifre.
upsertUser({
  email: 'koordinator' + SCHOOL_DOMAIN,
  password: 'Koordinator123!',
  role: 'coordinator',
  full_name: 'Erasmus Koordinatörü',
});

console.log('\nSeed tamamlandı.');
console.log('Admin       :', 'admin' + SCHOOL_DOMAIN, '/ Admin123!');
console.log('Koordinatör :', 'koordinator' + SCHOOL_DOMAIN, '/ Koordinator123!');
