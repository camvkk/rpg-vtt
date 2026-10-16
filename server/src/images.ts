// Magic-byte sniffing (never trust Content-Type) and image dimension parsing.

export interface Sniffed {
  mime: string;
  ext: string;
  kind: 'image' | 'audio' | 'document';
}

export function sniff(buf: Buffer): Sniffed | null {
  const b = buf;
  const ascii = (start: number, len: number) => b.subarray(start, start + len).toString('latin1');
  if (b.length < 12) return null;
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (ascii(0, 4) === 'GIF8') return { mime: 'image/gif', ext: 'gif', kind: 'image' };
  if (ascii(4, 8) === 'ftypavif' || ascii(4, 8) === 'ftypavis') return { mime: 'image/avif', ext: 'avif', kind: 'image' };
  if (ascii(0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3', kind: 'audio' };
  if (ascii(0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg', kind: 'audio' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return { mime: 'audio/wav', ext: 'wav', kind: 'audio' };
  if (ascii(0, 4) === 'fLaC') return { mime: 'audio/flac', ext: 'flac', kind: 'audio' };
  if (ascii(4, 4) === 'ftyp' && /^(M4A |isom|mp42|M4B )/.test(ascii(8, 4))) return { mime: 'audio/mp4', ext: 'm4a', kind: 'audio' };
  if (ascii(0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf', kind: 'document' };
  return null;
}

export function imageSize(b: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === 'image/gif') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const marker = b[i + 1]!;
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    if (mime === 'image/webp') {
      const chunk = b.subarray(12, 16).toString('latin1');
      if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {
    return null;
  }
  return null;
}
