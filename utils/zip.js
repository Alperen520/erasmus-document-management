// Bağımlılıksız ZIP üreteci (STORE yöntemi — sıkıştırmasız).
// PDF/JPG/PNG gibi belgeler zaten sıkışık olduğundan store yeterli ve güvenilir.

// CRC32 tablosu
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * files: [{ name: string, data: Buffer }]
 * return: Buffer (tam .zip içeriği)
 */
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = crc32(data);
    const size = data.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0); // local file header imzası
    lfh.writeUInt16LE(20, 4); // gereken sürüm
    lfh.writeUInt16LE(0x0800, 6); // bayrak: UTF-8 dosya adı
    lfh.writeUInt16LE(0, 8); // yöntem: store
    lfh.writeUInt16LE(0, 10); // saat
    lfh.writeUInt16LE(0, 12); // tarih
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18); // sıkıştırılmış boyut
    lfh.writeUInt32LE(size, 22); // gerçek boyut
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28); // extra uzunluğu
    chunks.push(lfh, nameBuf, data);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0); // central directory imzası
    cdh.writeUInt16LE(20, 4); // oluşturan sürüm
    cdh.writeUInt16LE(20, 6); // gereken sürüm
    cdh.writeUInt16LE(0x0800, 8); // bayrak
    cdh.writeUInt16LE(0, 10); // yöntem
    cdh.writeUInt16LE(0, 12); // saat
    cdh.writeUInt16LE(0, 14); // tarih
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(size, 20);
    cdh.writeUInt32LE(size, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30); // extra
    cdh.writeUInt16LE(0, 32); // yorum
    cdh.writeUInt16LE(0, 34); // disk no
    cdh.writeUInt16LE(0, 36); // iç öznitelik
    cdh.writeUInt32LE(0, 38); // dış öznitelik
    cdh.writeUInt32LE(offset, 42); // local header ofseti
    central.push(Buffer.concat([cdh, nameBuf]));

    offset += lfh.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory imzası
  eocd.writeUInt16LE(0, 4); // disk no
  eocd.writeUInt16LE(0, 6); // central dir başlangıç diski
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16); // central dir ofseti
  eocd.writeUInt16LE(0, 20); // yorum uzunluğu

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

module.exports = { buildZip, crc32 };
