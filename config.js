// .env dosyasını yükler (varsa). Yoksa aşağıdaki yedek değerler kullanılır.
require('dotenv').config();

// Merkezi yapılandırma — sonradan kolayca değiştirilebilir.
//
// BELGE GRUPLARI / KİLİT MANTIĞI:
//   "Gitmeden Önce"   -> DB kategori 'oncesi' (kilitleyen grup)
//   "Döndükten Sonra" -> DB kategori 'normal' (kilitli grup)
//   Kullanıcı "Gitmeden Önce" belgelerinin TAMAMI onaylanmadan
//   "Döndükten Sonra" belgelerini yükleyemez.
//
// Belge adlarında **...** ile işaretlenen kısımlar tablo başlığında kalın gösterilir;
// ayrıca parantez içleri de otomatik kalınlaştırılır.
const config = {
  PORT: process.env.PORT || 1904,
  SESSION_SECRET: process.env.SESSION_SECRET || 'kostu-erasmus-gizli-anahtar-degistir',

  // Okul e-posta uzantısı (kullanıcı ve koordinatör e-postaları bu uzantıyı taşır)
  SCHOOL_DOMAIN: '@kocaelisaglik.edu.tr',

  // Kullanıcılar için sabit ortak şifre (okul numarası ile giriş yaparlar).
  // Koordinatör hareketliliğe kullanıcı eklediğinde otomatik bu şifre atanır.
  USER_DEFAULT_PASSWORD: process.env.USER_DEFAULT_PASSWORD || 'Erasmus2026',

  // Hareketlilik türleri (dropdown seçenekleri)
  MOBILITY_TYPES: [
    'Öğrenci Öğrenim',
    'Öğrenci Staj',
    'Personel Eğitim Alma',
    'Personel Eğitim Verme',
  ],

  // Hareketlilik türüne göre varsayılan belge şablonları.
  // once  = "Gitmeden Önce"   belgeleri (kilitleyen grup)
  // sonra = "Döndükten Sonra" belgeleri (kilitli grup)
  // Koordinatör hareketlilik oluştururken bu liste otomatik dolar, düzenlenebilir.
  DOCUMENT_TEMPLATES: {
    'Öğrenci Öğrenim': {
      once: [
        'Başvuru Formu',
        'Kabul Mektubu',
        'Yabancı Dil Belgesi',
        'KOSTÜ Transkript',
        'OLA (Online Learning Agreement)',
        'Pasaport İlk Sayfası ve Vize Sayfası',
        'Seyahat Belgeleri (Uçak/Tren/Otobüs Biletleri)',
        'Kalınacak Yer',
        'Hibe Sözleşmesi',
        'Denizbank Euro Hesabı (Ad Soyad, IBAN, Banka ve Şube Adı)',
        'Sağlık Sigortası',
        'Hibe İlk Ödemesi %70',
      ],
      sonra: [
        'Arrival Certificate',
        'Katılım Sertifikası',
        'Transkript (Karşı Kurumdan imza ve kaşeli)',
        'Pasaport İlk Sayfası ve Giriş Çıkış Mühür Sayfası (e-devletten giriş çıkış yazısı)',
        'EU Anketi (BM Anket Doldurulması)',
        'Hibe Son Ödemesi %30',
      ],
    },
    'Öğrenci Staj': {
      once: [
        'Başvuru Formu',
        'Kabul Mektubu',
        'Yabancı Dil Belgesi',
        'Transkript',
        'Öğrenci Staj Hareketliliği Anlaşması -LA (Taraflarca Onaylı)',
        'Pasaport İlk Sayfası ve Vize Sayfası',
        'Seyahat Belgeleri (Uçak/Tren/Otobüs Biletleri)',
        'Kalınacak Yer',
        'Hibe Sözleşmesi',
        'Denizbank Euro Hesabı (Ad Soyad, IBAN, Banka ve Şube Adı)',
        'Sağlık + Kaza + Mesuliyet Sigortası',
        'Hibe İlk Ödemesi %70',
      ],
      sonra: [
        'Katılım Sertifikası',
        'Öğrenci Staj Hareketliliği Anlaşması -LA (Taraflarca Onaylı-tamamı doldurulmuş)',
        'Pasaport İlk Sayfası ve Giriş Çıkış Mühür Sayfası (e-devletten giriş çıkış yazısı)',
        'EU Anketi (BM Anket Doldurulması)',
        'Hibe Son Ödemesi %30',
      ],
    },

    'Personel Eğitim Alma': {
      once: [
        'Başvuru Formu',
        'Çalışma Belgesi',
        'Davet Mektubu',
        'Yabancı Dil Belgesi (Varsa)',
        'Personel Hareketliliği Anlaşması (Taraflarca Onaylı) staff mobility agreement',
        'Pasaport İlk Sayfası ve Vize Sayfası',
        'Seyahat Belgeleri (Uçak/Tren/Otobüs Biletleri)',
        'Hibe Sözleşmesi',
        'Denizbank Euro Hesabı (Ad Soyad, IBAN, Banka ve Şube Adı)',
        'Sağlık Sigortası',
        'Hibe İlk Ödemesi %70',
      ],
      sonra: [
        'Katılım Sertifikası',
        'Pasaport İlk Sayfası ve Giriş Çıkış Mühür Sayfası',
        'Personel Raporu (BM Anket Doldurulması)',
        'Hibe Son Ödemesi %30',
      ],
    },

    // Eğitim Verme süreci Eğitim Alma ile aynı belge akışını izler.
    'Personel Eğitim Verme': {
      once: [
        'Başvuru Formu',
        'Çalışma Belgesi',
        'Davet Mektubu',
        'Yabancı Dil Belgesi (Varsa)',
        'Personel Hareketliliği Anlaşması (Taraflarca Onaylı) staff mobility agreement',
        'Pasaport İlk Sayfası ve Vize Sayfası',
        'Seyahat Belgeleri (Uçak/Tren/Otobüs Biletleri)',
        'Hibe Sözleşmesi',
        'Denizbank Euro Hesabı (Ad Soyad, IBAN, Banka ve Şube Adı)',
        'Sağlık Sigortası',
        'Hibe İlk Ödemesi %70',
      ],
      sonra: [
        'Katılım Sertifikası',
        'Pasaport İlk Sayfası ve Giriş Çıkış Mühür Sayfası',
        'Personel Raporu (BM Anket Doldurulması)',
        'Hibe Son Ödemesi %30',
      ],
    },
  },

  // Tanımlı şablonu olmayan tür kalırsa liste boş başlar; koordinatör elle girer.
  DEFAULT_TEMPLATE: {
    once: [],
    sonra: [],
  },

  // İzin verilen belge dosya türleri
  ALLOWED_FILE_TYPES: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'],
  MAX_FILE_SIZE_MB: 10,
};

// Bir hareketlilik türü için belge şablonunu döndürür (yoksa yedek şablon).
config.getTemplate = function (tur) {
  return config.DOCUMENT_TEMPLATES[tur] || config.DEFAULT_TEMPLATE;
};

module.exports = config;
