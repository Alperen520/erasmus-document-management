// Bağımlılıksız .docx okuma + [[Alan Adı]] işaretlerini doldurma.
// .docx bir ZIP'tir; girdileri açar, word/document.xml içindeki [[...]] işaretlerini
// (Word bunları birden çok "run"a bölse bile, paragraf düzeyinde) değerlerle değiştirir.
const zlib = require('zlib');
const { buildZip } = require('./zip');

// --- ZIP okuyucu: tüm girdileri {name, data(Buffer)} olarak döndürür ---
function readZipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Geçersiz ZIP: EOCD bulunamadı');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('ZIP central directory imza hatası');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const lhNameLen = buf.readUInt16LE(lho + 26);
    const lhExtraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(comp);
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error('Desteklenmeyen ZIP sıkıştırma yöntemi: ' + method);
    entries.push({ name, data });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Bir paragraf XML'i içindeki [[Alan]] işaretlerini run'lara bölünmüş olsa bile değiştir.
function fillParagraph(para, values) {
  const runRe = /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g;
  const runs = [];
  let m;
  while ((m = runRe.exec(para))) {
    runs.push({ open: m[1], text: m[2], close: m[3], index: m.index, full: m[0] });
  }
  if (!runs.length) return para;
  if (runs.map((r) => r.text).join('').indexOf('[[') === -1) return para;

  let guard = 0;
  while (guard++ < 1000) {
    const starts = [];
    let pos = 0;
    for (const r of runs) { starts.push(pos); pos += r.text.length; }
    const concat = runs.map((r) => r.text).join('');
    const mm = /\[\[([^\]]+)\]\]/.exec(concat);
    if (!mm) break;

    const label = mm[1].trim();
    const val = xmlEscape(values[label] != null ? values[label] : '');
    const mStart = mm.index;
    const mEnd = mm.index + mm[0].length;

    let firstRun = -1, lastRun = -1;
    for (let i = 0; i < runs.length; i++) {
      const s = starts[i], e = starts[i] + runs[i].text.length;
      if (firstRun === -1 && mStart >= s && mStart < e) firstRun = i;
      if (mEnd > s && mEnd <= e) { lastRun = i; break; }
    }
    if (firstRun === -1 || lastRun === -1) break; // güvenlik

    const offFirst = mStart - starts[firstRun];
    const offLast = mEnd - starts[lastRun];
    if (firstRun === lastRun) {
      runs[firstRun].text = runs[firstRun].text.slice(0, offFirst) + val + runs[firstRun].text.slice(offLast);
    } else {
      runs[firstRun].text = runs[firstRun].text.slice(0, offFirst) + val;
      for (let i = firstRun + 1; i < lastRun; i++) runs[i].text = '';
      runs[lastRun].text = runs[lastRun].text.slice(offLast);
    }
  }

  // Paragrafı yeniden kur (run metinlerini değiştirilmiş halleriyle)
  let result = '';
  let cursor = 0;
  for (const r of runs) {
    result += para.slice(cursor, r.index) + r.open + r.text + r.close;
    cursor = r.index + r.full.length;
  }
  result += para.slice(cursor);
  return result;
}

function fillXml(xml, values) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => fillParagraph(para, values));
}

// Şablon .docx buffer'ını verilen değerlerle doldur → yeni .docx buffer.
function fillDocx(templateBuf, values) {
  const entries = readZipEntries(templateBuf);
  for (const e of entries) {
    if (e.name === 'word/document.xml') {
      e.data = Buffer.from(fillXml(e.data.toString('utf8'), values), 'utf8');
    }
  }
  return buildZip(entries);
}

// Belgedeki [[Alan]] etiketlerini (sıralı, benzersiz) çıkar — formu üretmek için.
function extractFields(templateBuf) {
  const entries = readZipEntries(templateBuf);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) return [];
  const xml = doc.data.toString('utf8');
  const fields = [];
  const seen = new Set();
  const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) || [];
  for (const p of paras) {
    const text = (p.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, ''))
      .join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const re = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(text))) {
      const label = m[1].trim();
      if (!seen.has(label)) { seen.add(label); fields.push(label); }
    }
  }
  return fields;
}

module.exports = { readZipEntries, fillDocx, fillXml, extractFields, xmlEscape };
