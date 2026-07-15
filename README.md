# Erasmus Document Management System · Erasmus Belge Yönetim Sistemi

**Language / Dil:** [English](#english) · [Türkçe](#türkçe)

---

## English

A web application that digitizes and streamlines the document workflow for Erasmus+ mobility programs. Coordinators create mobility records, students upload the required documents, and the system enforces the correct approval order — locking "after-return" documents until every "before-departure" document has been approved.

Built as a full-stack Node.js project with server-side rendering, role-based access control, secure file uploads, and an audit log.

> Originally developed for a university Erasmus office (Turkish UI). Personal data, the live database, and filled document templates are intentionally excluded from this repository.

### Features

- **Three roles** — Admin, Coordinator, and Student, each with a dedicated dashboard and permissions.
- **Mobility management** — Coordinators create mobilities (Student Study/Traineeship, Staff Teaching/Training); document checklists are auto-populated per mobility type from a central config.
- **Ordered document workflow** — "Before departure" documents lock the "after return" group; students cannot upload the second stage until the first is fully approved.
- **Secure file uploads** — PDF/JPG/PNG only, size-limited (Multer), stored per-user outside the web root.
- **Document templates** — Coordinators mark fields on `.docx` templates; students fill a form and download the completed file.
- **Announcements** — Coordinators/admins post announcements targeted at an audience; students see the latest ones with a "NEW" badge.
- **Authentication** — Session-based login with `bcrypt`-hashed passwords; students log in with their school number, staff with their institutional e-mail.
- **Audit logging** — Unexpected errors are written to `logs/error.log`.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Web framework | Express |
| Views | EJS (server-side rendering) |
| Database | SQLite (`better-sqlite3`) |
| Auth | `express-session` + `bcryptjs` |
| File uploads | `multer` |

### Getting Started

```bash
# 1. Install dependencies
npm install

# 2. (Optional) configure environment variables
cp .env.example .env      # then edit values

# 3. Seed the initial admin + coordinator accounts
npm run seed

# 4. Start the server
npm start                 # http://localhost:1904
```

#### Default seed accounts

`npm run seed` creates two demo accounts. **Change these credentials before any production use.**

| Role | E-mail | Password |
|------|--------|----------|
| Admin | `admin@<school-domain>` | `Admin123!` |
| Coordinator | `koordinator@<school-domain>` | `Koordinator123!` |

> **Note:** `.docx` document templates are not included in the repository because the originals contained real personal data. Drop your own template files into `templates/` to enable document generation.

### Project Structure

```
config.js          Central configuration (document templates, file rules)
server.js          Express app entry point, routing, dashboards
db/                Database schema (database.js) and seed script (seed.js)
routes/            Route handlers per role (auth, admin, coordinator, user, ...)
middleware/        Authentication / authorization guards
views/             EJS templates
public/            Static assets (CSS, client JS)
templates/         .docx document templates (excluded — add your own)
utils/             Helpers, queries, audit log
```

### Security & Privacy

- The SQLite database (`erasmus.db*`), all user-uploaded files (`uploads/`), and document templates (`templates/*.docx`) are **git-ignored** — no real personal data (student numbers, names, e-mails, documents) is ever committed.
- Secrets are read from environment variables (`.env`, also git-ignored); `config.js` only holds safe fallback placeholders.
- Passwords are stored as `bcrypt` hashes, never in plain text.

### License

Released under the MIT License. See [LICENSE](LICENSE).

---

## Türkçe

Erasmus+ hareketlilik programlarındaki belge sürecini dijitalleştiren ve kolaylaştıran bir web uygulaması. Koordinatörler hareketlilik kayıtları oluşturur, öğrenciler gerekli belgeleri yükler ve sistem doğru onay sırasını zorunlu kılar — "gitmeden önce" belgelerinin tamamı onaylanmadan "döndükten sonra" belgeleri kilitli kalır.

Sunucu taraflı render, rol bazlı erişim kontrolü, güvenli dosya yükleme ve denetim (audit) günlüğü içeren tam yığın (full-stack) bir Node.js projesi olarak geliştirildi.

> Başlangıçta bir üniversitenin Erasmus ofisi için geliştirildi (Türkçe arayüz). Kişisel veriler, canlı veritabanı ve doldurulmuş belge şablonları bu depoya bilerek dahil edilmemiştir.

### Özellikler

- **Üç rol** — Yönetici (Admin), Koordinatör ve Öğrenci; her biri kendine ait panel ve yetkilere sahiptir.
- **Hareketlilik yönetimi** — Koordinatörler hareketlilik oluşturur (Öğrenci Öğrenim/Staj, Personel Eğitim Alma/Verme); belge listeleri türe göre merkezi yapılandırmadan otomatik dolar.
- **Sıralı belge akışı** — "Gitmeden önce" belgeleri "döndükten sonra" grubunu kilitler; öğrenci ilk grup tamamen onaylanmadan ikinci grubu yükleyemez.
- **Güvenli dosya yükleme** — Yalnızca PDF/JPG/PNG, boyut sınırlı (Multer), kullanıcı bazında ve web kök dizininin dışında saklanır.
- **Belge şablonları** — Koordinatör `.docx` şablonlarında alanları işaretler; öğrenci formu doldurup tamamlanmış dosyayı indirir.
- **Duyurular** — Koordinatör/yönetici hedef kitleye yönelik duyuru yayınlar; öğrenciler en yenileri "YENİ" rozetiyle görür.
- **Kimlik doğrulama** — `bcrypt` ile hash'lenmiş şifrelerle oturum bazlı giriş; öğrenciler okul numarasıyla, personel kurumsal e-postasıyla giriş yapar.
- **Denetim günlüğü** — Beklenmeyen hatalar `logs/error.log` dosyasına yazılır.

### Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Çalışma ortamı | Node.js |
| Web çatısı | Express |
| Görünümler | EJS (sunucu taraflı render) |
| Veritabanı | SQLite (`better-sqlite3`) |
| Kimlik doğrulama | `express-session` + `bcryptjs` |
| Dosya yükleme | `multer` |

### Kurulum

```bash
# 1. Bağımlılıkları yükleyin
npm install

# 2. (İsteğe bağlı) ortam değişkenlerini ayarlayın
cp .env.example .env      # sonra değerleri düzenleyin

# 3. Başlangıç admin + koordinatör hesaplarını oluşturun
npm run seed

# 4. Sunucuyu başlatın
npm start                 # http://localhost:1904
```

#### Varsayılan başlangıç hesapları

`npm run seed` iki demo hesap oluşturur. **Üretimde kullanmadan önce bu bilgileri mutlaka değiştirin.**

| Rol | E-posta | Şifre |
|-----|---------|-------|
| Admin | `admin@<okul-alan-adı>` | `Admin123!` |
| Koordinatör | `koordinator@<okul-alan-adı>` | `Koordinator123!` |

> **Not:** `.docx` belge şablonları, orijinalleri gerçek kişisel veri içerdiği için depoya dahil edilmemiştir. Belge üretimini etkinleştirmek için kendi şablon dosyalarınızı `templates/` klasörüne ekleyin.

### Proje Yapısı

```
config.js          Merkezi yapılandırma (belge şablonları, dosya kuralları)
server.js          Express uygulama girişi, yönlendirme, paneller
db/                Veritabanı şeması (database.js) ve seed betiği (seed.js)
routes/            Role göre rota işleyicileri (auth, admin, coordinator, user, ...)
middleware/        Kimlik doğrulama / yetkilendirme koruyucuları
views/             EJS şablonları
public/            Statik varlıklar (CSS, istemci JS)
templates/         .docx belge şablonları (hariç tutuldu — kendinizinkini ekleyin)
utils/             Yardımcılar, sorgular, denetim günlüğü
```

### Güvenlik ve Gizlilik

- SQLite veritabanı (`erasmus.db*`), tüm kullanıcı yüklemeleri (`uploads/`) ve belge şablonları (`templates/*.docx`) **git tarafından yok sayılır** — gerçek kişisel veri (öğrenci numarası, isim, e-posta, belgeler) asla depoya işlenmez.
- Gizli anahtarlar ortam değişkenlerinden okunur (`.env`, o da yok sayılır); `config.js` yalnızca güvenli yedek placeholder değerler tutar.
- Şifreler düz metin olarak değil, `bcrypt` hash'i olarak saklanır.

### Lisans

MIT Lisansı altında yayımlanmıştır. Bkz. [LICENSE](LICENSE).
