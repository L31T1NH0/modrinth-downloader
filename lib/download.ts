import { zip } from 'fflate';

export interface DownloadItem {
  id:       string;
  filename: string;
  url:      string;
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
  const succeeded: FetchedFile[] = [];
  const failed:    string[]      = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const f = await fetchFile(item, pct => onItemProgress(item.id, pct));
      succeeded.push(f);
    } catch {
      failed.push(item.id);
    }
    onOverallProgress(Math.round(((i + 1) / items.length) * 85));
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
