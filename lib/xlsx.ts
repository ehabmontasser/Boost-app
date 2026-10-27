// Minimal .xlsx reader (no dependencies). Reads the first-class cases BOOST needs:
// zip container, shared strings, inline strings, numbers, booleans. Formulas are read as cached values.
import { deflateRawSync, inflateRawSync } from "node:zlib";

export type Cell = string | number | boolean | null;
export type Sheet = Cell[][];

type ZipEntry = { name: string; method: number; compSize: number; offset: number };

export function readZip(buf: Buffer): Map<string, Buffer> {
  // locate end of central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (zip directory not found)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt zip directory");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const files = new Map<string, Buffer>();
  for (const e of entries) {
    if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error("Corrupt zip entry");
    const nameLen = buf.readUInt16LE(e.offset + 26);
    const extraLen = buf.readUInt16LE(e.offset + 28);
    const start = e.offset + 30 + nameLen + extraLen;
    const raw = buf.subarray(start, start + e.compSize);
    if (e.method === 0) files.set(e.name, Buffer.from(raw));
    else if (e.method === 8) files.set(e.name, inflateRawSync(raw));
    else throw new Error(`Unsupported zip compression (${e.method})`);
  }
  return files;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Minimal zip writer (deflate, no zip64): used to re-pack templates and bundle them for download. */
export function writeZip(files: [string, Buffer][]): Buffer {
  const parts: Buffer[] = [];
  const dir: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0x00210000, 10); // fixed date 1 Jan 1980, time 00:00
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0x00210000, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, comp);
    dir.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const dirBuf = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dirBuf, end]);
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

function textOf(xml: string): string {
  // concatenates all <t> nodes (handles rich text runs)
  let out = "";
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1];
  return unescapeXml(out);
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

export function readWorkbook(buf: Buffer): Record<string, Sheet> {
  const files = readZip(buf);
  const get = (name: string) => {
    const f = files.get(name);
    if (!f) throw new Error(`Missing part ${name}`);
    return f.toString("utf8");
  };
  const wb = get("xl/workbook.xml");
  const rels = get("xl/_rels/workbook.xml.rels");
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    if (id && target) relMap.set(id, target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, ""));
  }
  const shared: string[] = [];
  if (files.has("xl/sharedStrings.xml")) {
    const sst = get("xl/sharedStrings.xml");
    for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }
  const out: Record<string, Sheet> = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const tag = m[0];
    const name = unescapeXml(/\bname="([^"]*)"/.exec(tag)?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(tag)?.[1] ?? "";
    const path = relMap.get(rid);
    if (!path || !files.has(path)) continue;
    const xml = get(path);
    const rows: Sheet = [];
    for (const rm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowTag = rm[0];
      const rIdx = Number(/\br="(\d+)"/.exec(rowTag)?.[1] ?? rows.length + 1) - 1;
      const cells: Cell[] = [];
      const body = rm[1] ?? "";
      for (const cm of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const inner = cm[2] ?? "";
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
        const t = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
        const ci = ref ? colIndex(ref) : cells.length;
        let val: Cell = null;
        if (t === "inlineStr") val = textOf(inner);
        else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (v !== undefined) {
            if (t === "s") val = shared[Number(v)] ?? "";
            else if (t === "str" || t === "e") val = unescapeXml(v);
            else if (t === "b") val = v === "1";
            else val = Number(v);
          }
        }
        while (cells.length < ci) cells.push(null);
        cells[ci] = val;
      }
      while (rows.length < rIdx) rows.push([]);
      rows[rIdx] = cells;
    }
    out[name] = rows;
  }
  return out;
}

/** Excel serial date (1900 system) to yyyy-mm-dd. */
export function serialToIso(n: number): string {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}
