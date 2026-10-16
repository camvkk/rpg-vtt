// Text extraction for the custom-system importer: PDF (pdf.js through unpdf), DOCX (zip + XML, no extra
// dependency) and plain UTF-8 text. Inputs are sniffed by content, never by extension or Content-Type.
import zlib from 'node:zlib';

/** Per-document cap; the AI prompt has its own (smaller) cap across all documents. */
export const MAX_DOC_CHARS = 150_000;

export class DocumentError extends Error {}

export type DocKind = 'pdf' | 'docx' | 'text';

export function detectDocKind(buf: Buffer): DocKind | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return 'docx';
  const head = buf.subarray(0, 8192);
  if (head.includes(0)) return null;
  try {
    // Valid UTF-8 (stream mode tolerates a character cut at the end of the sample).
    new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true });
    return 'text';
  } catch {
    return null;
  }
}

export async function extractDocumentText(buf: Buffer): Promise<{ text: string; kind: DocKind; truncated: boolean }> {
  const kind = detectDocKind(buf);
  if (!kind) throw new DocumentError('Formato não suportado. Envie PDF, DOCX, TXT ou MD.');
  let text: string;
  if (kind === 'pdf') text = await pdfText(buf);
  else if (kind === 'docx') text = docxText(buf);
  else text = buf.toString('utf8').replace(/^﻿/, '');
  text = tidy(text);
  if (!text) {
    throw new DocumentError(kind === 'pdf'
      ? 'Esse PDF não tem texto selecionável (parece escaneado). Copie o texto e cole no importador.'
      : 'O documento está vazio.');
  }
  const truncated = text.length > MAX_DOC_CHARS;
  return { text: truncated ? text.slice(0, MAX_DOC_CHARS) : text, kind, truncated };
}

function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/[ \t ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

async function pdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.join('\n\n');
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'PasswordException') throw new DocumentError('Esse PDF é protegido por senha.');
    console.error('[documents] pdf extraction failed', e);
    throw new DocumentError('Não consegui ler esse PDF. Tente exportá-lo de novo ou cole o texto.');
  }
}

// ---------------------------------------------------------------------------
// DOCX (a zip; the body lives in word/document.xml)
// ---------------------------------------------------------------------------

const MAX_XML_BYTES = 40 * 1024 * 1024;

/** Read one file out of a zip archive using the central directory (sizes there are always right). */
export function unzipEntry(buf: Buffer, wanted: string): Buffer | null {
  const minEocd = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocumentError('Arquivo DOCX corrompido.');
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== wanted) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new DocumentError('Arquivo DOCX corrompido.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compSize);
    if (method === 0) return data;
    if (method === 8) {
      try {
        return zlib.inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
      } catch {
        throw new DocumentError('Não consegui descompactar o DOCX.');
      }
    }
    throw new DocumentError('Compressão de DOCX não suportada.');
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

function docxText(buf: Buffer): string {
  const xml = unzipEntry(buf, 'word/document.xml');
  if (!xml) throw new DocumentError('Esse arquivo não é um DOCX do Word.');
  return docxXmlToText(xml.toString('utf8'));
}
