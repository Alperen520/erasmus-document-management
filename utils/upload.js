// Multer yapılandırması — belge dosyalarını uploads/<mobilityId>/<userId>/ altına kaydeder.
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const config = require('../config');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_ROOT, String(req.params.id), String(req.session.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `belge_${Date.now()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (config.ALLOWED_FILE_TYPES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Sadece PDF, JPG veya PNG dosyaları yükleyebilirsiniz.'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
});

module.exports = { upload, UPLOAD_ROOT };
