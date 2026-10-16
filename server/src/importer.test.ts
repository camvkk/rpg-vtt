import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createCampaign, createCharacter } from '../../shared/src/defaults.ts';
import type { CampaignState } from '../../shared/src/types.ts';

// Isolated data dir (config reads env at import time).
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-import-test-'));

const { detectDocKind, extractDocumentText, DocumentError } = await import('./documents.ts');
const { parseJsonLoose } = await import('./ai.ts');
const { systemDocsFrom } = await import('./socket.ts');
const { migrateState, saveSystemSources, loadSystemSources } = await import('./store.ts');

/** Smallest PDF pdf.js accepts: one page, Helvetica, one text line per entry. */
function minimalPdf(lines: string[]): Buffer {
  const content = `BT /F1 12 Tf 72 720 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Deflated zip archive (enough of the format for a .docx). */
function zip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, comp);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length / 2, 8);
  eocd.writeUInt16LE(central.length / 2, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

test('extracts text from PDF, DOCX and plain text', async () => {
  const pdf = await extractDocumentText(minimalPdf(['Sistema Brasas', 'Atributos: Vigor e Astucia']));
  assert.equal(pdf.kind, 'pdf');
  assert.match(pdf.text, /Sistema Brasas\s+Atributos: Vigor e Astucia/);

  const xml = '<?xml version="1.0"?><w:document><w:body>'
    + '<w:p><w:r><w:t>Força &amp; Vigor</w:t></w:r></w:p>'
    + '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Teste:</w:t><w:tab/><w:t>1d20</w:t><w:br/><w:t xml:space="preserve">linha &#233; nova</w:t></w:r></w:p>'
    + '</w:body></w:document>';
  const docx = await extractDocumentText(zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': xml }));
  assert.equal(docx.kind, 'docx');
  assert.equal(docx.text, 'Força & Vigor\nTeste:\t1d20\nlinha é nova');

  const txt = await extractDocumentText(Buffer.from('﻿# Regras\r\n\r\n\r\n\r\nUse 2d6.', 'utf8'));
  assert.equal(txt.kind, 'text');
  assert.equal(txt.text, '# Regras\n\nUse 2d6.');
});

test('rejects unreadable documents with friendly errors', async () => {
  assert.equal(detectDocKind(Buffer.from([0, 1, 2, 3, 4, 5])), null);
  await assert.rejects(extractDocumentText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), DocumentError);
  await assert.rejects(extractDocumentText(zip({ 'outro.xml': '<x/>' })), /DOCX/);
  await assert.rejects(extractDocumentText(Buffer.from('%PDF-1.4 lixo', 'latin1')), DocumentError);
  await assert.rejects(extractDocumentText(Buffer.from('   \n  ', 'utf8')), /vazio/);
});

test('parseJsonLoose: fences, prose, trailing commas and truncated answers', () => {
  assert.deepEqual(parseJsonLoose('Aqui está:\n```json\n{"a": 1, "b": [1, 2,],}\n```\nBom jogo!'), { a: 1, b: [1, 2] });
  assert.deepEqual(parseJsonLoose('{"name": "X"} e mais texto {"outro": 1}'), { name: 'X' });
  const truncated = '{"name": "Brasas", "stats": [{"key": "vigor", "name": "Vigor"}, {"key": "astucia", "na';
  // Complete key/value pairs of the cut-off entry survive; the normalizer drops entries without a name.
  assert.deepEqual(parseJsonLoose(truncated), { name: 'Brasas', stats: [{ key: 'vigor', name: 'Vigor' }, { key: 'astucia' }] });
  assert.deepEqual(parseJsonLoose('```json\n{"rules": [{"name": "A", "description": "texto com } e ] dentro"}, {"name": "B"'), {
    rules: [{ name: 'A', description: 'texto com } e ] dentro' }, { name: 'B' }],
  });
  assert.equal(parseJsonLoose('sem json nenhum'), null);
});

test('importer requests are validated before reaching the AI', () => {
  assert.equal(typeof systemDocsFrom(undefined), 'string');
  assert.equal(typeof systemDocsFrom({ documents: [{ name: 'a', text: '   ' }] }), 'string');
  assert.equal(typeof systemDocsFrom({ documents: Array.from({ length: 13 }, (_, i) => ({ name: `d${i}`, text: 'x' })) }), 'string');
  assert.equal(typeof systemDocsFrom({ documents: [{ name: 'a', text: 'x'.repeat(150_001) }] }), 'string');
  const ok = systemDocsFrom({ documents: [{ name: '  Regras.md ', text: ' Use 2d6. ' }, { name: '', text: 'Extra' }] });
  assert.deepEqual(ok, [{ name: 'Regras.md', text: 'Use 2d6.' }, { name: 'Documento 2', text: 'Extra' }]);
});

test('source documents are kept per campaign for re-processing', () => {
  assert.equal(loadSystemSources('c-sources'), null);
  saveSystemSources('c-sources', [{ name: 'a.md', text: 'um' }]);
  saveSystemSources('c-sources', [{ name: 'b.md', text: 'dois' }]);
  assert.deepEqual(loadSystemSources('c-sources')?.documents, [{ name: 'b.md', text: 'dois' }]);
});

test('migrates v1 campaign state to custom-system fields', () => {
  const fresh = createCampaign({ id: 'c1', code: 'ABC123', name: 'Velha' });
  const c = createCharacter({ name: 'Antigo' });
  const old = JSON.parse(JSON.stringify({ ...fresh, version: 1, characters: { [c.id]: c } })) as Record<string, unknown>;
  delete old.customSystem;
  delete (old.characters as Record<string, Record<string, unknown>>)[c.id]!.custom;
  (old.settings as Record<string, unknown>).system = undefined;
  const migrated = migrateState(old as unknown as CampaignState);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.customSystem, null);
  assert.equal(migrated.settings.system, 'dnd5e');
  assert.equal(migrated.characters[c.id]!.custom, null);
});
