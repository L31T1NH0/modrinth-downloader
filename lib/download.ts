import { zip, gzip } from 'fflate';

export interface DownloadItem {
  id:       string;
  filename: string;
  url:      string;
  sizeBytes?: number | null;
}

interface FetchedFile {
  id:       string;
  filename: string;
  data:     Uint8Array;
}

/**
 * Fetch a single file with per-byte progress reporting.
 * Falls back to a single ArrayBuffer read when Content-Length is unavailable.
 */
async function fetchFile(
  item:       DownloadItem,
  onProgress: (pct: number) => void,
): Promise<FetchedFile> {
  const r = await fetch(item.url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${item.filename}`);

  const contentLength = Number(r.headers.get('Content-Length') ?? 0);

  if (!r.body || !contentLength) {
    onProgress(50);
    const buf = await r.arrayBuffer();
    onProgress(100);
    return { id: item.id, filename: item.filename, data: new Uint8Array(buf) };
  }

  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.round((received / contentLength) * 100));
  }

  const merged = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return { id: item.id, filename: item.filename, data: merged };
}

/**
 * Fetch and trigger a direct browser download for a single file.
 * @returns true on success, false on network failure.
 */
export async function downloadSingleFile(
  item:       DownloadItem,
  onProgress: (id: string, pct: number) => void,
): Promise<boolean> {
  try {
    const f    = await fetchFile(item, pct => onProgress(item.id, pct));
    const blob = new Blob([f.data.buffer as ArrayBuffer]);
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: f.filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download all items, bundle them into a single ZIP, and trigger a browser
 * download for that ZIP — one confirmation instead of N.
 *
 * .jar/.zip files are already compressed, so we use STORE (level 0) to avoid
 * wasting CPU on pointless re-compression.
 *
 * Progress is reported in two phases:
 *   0 – 85 %  → fetching files (split evenly across items)
 *   85 – 100% → bundling ZIP
 *
 * @returns IDs of items that failed to fetch (ZIP still created from the rest).
 */
export async function downloadAsZip(
  items:             DownloadItem[],
  zipName:           string,
  onItemProgress:    (id: string, pct: number) => void,
  onOverallProgress: (pct: number) => void,
): Promise<string[]> {
  const prioritizedItems = [...items].sort(
    (a, b) => (a.sizeBytes ?? Number.POSITIVE_INFINITY) - (b.sizeBytes ?? Number.POSITIVE_INFINITY),
  );
  const succeeded: FetchedFile[] = [];
  const failed:    string[]      = [];

  for (let i = 0; i < prioritizedItems.length; i++) {
    const item = prioritizedItems[i];
    try {
      const f = await fetchFile(item, pct => onItemProgress(item.id, pct));
      succeeded.push(f);
    } catch {
      failed.push(item.id);
    }
    onOverallProgress(Math.round(((i + 1) / prioritizedItems.length) * 85));
  }

  if (succeeded.length === 0) return failed;

  // Build the fflate Zippable map, deduplicating filenames.
  const used    = new Set<string>();
  const zippable: Record<string, [Uint8Array, { level: 0 }]> = {};

  for (const f of succeeded) {
    let name = f.filename;
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      name = dot > 0
        ? `${name.slice(0, dot)}_${f.id.slice(0, 6)}${name.slice(dot)}`
        : `${name}_${f.id.slice(0, 6)}`;
    }
    used.add(name);
    zippable[name] = [f.data, { level: 0 }];
  }

  onOverallProgress(88);

  const zipData = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zippable, (err, data) => (err ? reject(err) : resolve(data)));
  });

  onOverallProgress(98);

  const filename = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  const blob     = new Blob([zipData.buffer as ArrayBuffer], { type: 'application/zip' });
  const url      = URL.createObjectURL(blob);
  const a        = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15_000);

  onOverallProgress(100);
  return failed;
}

// ── tar.gz support ────────────────────────────────────────────────────────────

function buildTar(files: FetchedFile[]): Uint8Array {
  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const blocks: Uint8Array[] = [];

  for (const f of files) {
    const header = new Uint8Array(512);

    // name (100 bytes)
    header.set(enc.encode(f.filename.slice(0, 99)), 0);
    // mode
    header.set(enc.encode('0000644\0'), 100);
    // uid / gid
    header.set(enc.encode('0000000\0'), 108);
    header.set(enc.encode('0000000\0'), 116);
    // size (11 octal digits + null)
    header.set(enc.encode(f.data.length.toString(8).padStart(11, '0') + '\0'), 124);
    // mtime
    header.set(enc.encode(now.toString(8).padStart(11, '0') + '\0'), 136);
    // checksum field: fill with spaces for calculation
    header.fill(32, 148, 156);
    // typeflag: regular file
    header[156] = 48; // '0'
    // ustar magic + version
    header.set(enc.encode('ustar\0'), 257);
    header.set(enc.encode('00'), 263);

    // compute checksum over all 512 bytes (checksum field = spaces)
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    header.set(enc.encode(checksum.toString(8).padStart(6, '0') + '\0 '), 148);

    blocks.push(header);

    // file data padded to 512-byte boundary
    const padded = new Uint8Array(Math.ceil(f.data.length / 512) * 512);
    padded.set(f.data);
    blocks.push(padded);
  }

  // end-of-archive: two zero blocks
  blocks.push(new Uint8Array(1024));

  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of blocks) { out.set(b, off); off += b.length; }
  return out;
}

/**
 * Same as downloadAsZip but bundles files into a gzipped tar archive (.tar.gz).
 */
export async function downloadAsTarGz(
  items:             DownloadItem[],
  archiveName:       string,
  onItemProgress:    (id: string, pct: number) => void,
  onOverallProgress: (pct: number) => void,
): Promise<string[]> {
  const prioritizedItems = [...items].sort(
    (a, b) => (a.sizeBytes ?? Number.POSITIVE_INFINITY) - (b.sizeBytes ?? Number.POSITIVE_INFINITY),
  );
  const succeeded: FetchedFile[] = [];
  const failed:    string[]      = [];

  for (let i = 0; i < prioritizedItems.length; i++) {
    const item = prioritizedItems[i];
    try {
      const f = await fetchFile(item, pct => onItemProgress(item.id, pct));
      succeeded.push(f);
    } catch {
      failed.push(item.id);
    }
    onOverallProgress(Math.round(((i + 1) / prioritizedItems.length) * 85));
  }

  if (succeeded.length === 0) return failed;

  // Deduplicate filenames
  const used = new Set<string>();
  const deduped = succeeded.map(f => {
    let name = f.filename;
    if (used.has(name)) {
      const dot = name.lastIndexOf('.');
      name = dot > 0
        ? `${name.slice(0, dot)}_${f.id.slice(0, 6)}${name.slice(dot)}`
        : `${name}_${f.id.slice(0, 6)}`;
    }
    used.add(name);
    return { ...f, filename: name };
  });

  onOverallProgress(88);

  const tarData = buildTar(deduped);
  const gzData  = await new Promise<Uint8Array>((resolve, reject) => {
    gzip(tarData, (err, data) => (err ? reject(err) : resolve(data)));
  });

  onOverallProgress(98);

  const filename = archiveName.endsWith('.tar.gz') ? archiveName : `${archiveName}.tar.gz`;
  const blob = new Blob([gzData.buffer as ArrayBuffer], { type: 'application/gzip' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15_000);

  onOverallProgress(100);
  return failed;
}
