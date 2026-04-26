import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';

const OPTIFINE_BASE      = 'https://optifine.net';
const OPTIFINE_DOWNLOADS = `${OPTIFINE_BASE}/downloads`;
const PAGE_SIZE          = 20;

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

interface OptiFineEntry {
  id:        string;  // jar filename, e.g. "OptiFine_1.21.4_HD_U_J4.jar"
  label:     string;  // display name, e.g. "OptiFine HD U J4"
  mcVersion: string;  // "1.21.4"
  mirrorUrl: string;  // full mirror URL
}

/**
 * Parse all OptiFine mirror links from the downloads page HTML.
 *
 * OptiFine's downloads page contains mirror links in the form:
 *   href="/downloadx?f=OptiFine_1.21.4_HD_U_J4.jar&x=<token>"
 *
 * Adjust this regex if the site's HTML structure changes.
 */
function parseDownloadsPage(html: string): OptiFineEntry[] {
  const entries: OptiFineEntry[] = [];
  const pattern = /href="\/downloadx\?f=(OptiFine_[^"&]+\.jar)&(?:amp;)?x=([^"]+)"/gi;

  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const filename = m[1];
    const token    = m[2];

    const mcMatch    = filename.match(/OptiFine_(\d+\.\d+(?:\.\d+)?)_/);
    const buildMatch = filename.match(/OptiFine_\d+\.\d+(?:\.\d+)?_(HD_U_[^.]+)\.jar/i);
    if (!mcMatch) continue;

    const mcVersion = mcMatch[1];
    const buildLabel = buildMatch ? buildMatch[1].replace(/_/g, ' ') : filename.replace('.jar', '');

    entries.push({
      id:        filename,
      label:     `OptiFine ${buildLabel}`,
      mcVersion,
      mirrorUrl: `${OPTIFINE_BASE}/downloadx?f=${filename}&x=${token}`,
    });
  }

  return entries;
}

async function fetchEntries(): Promise<OptiFineEntry[]> {
  const r = await fetch(OPTIFINE_DOWNLOADS, { headers: BROWSER_HEADERS });
  if (!r.ok) throw new Error(`optifine.net HTTP ${r.status}`);
  const html = await r.text();
  return parseDownloadsPage(html);
}

export async function GET(request: NextRequest) {
  const ip    = getRequestIp(request);
  const limit = await checkRateLimit(ip, '/api/scraper/optifine');
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    const entries = await fetchEntries();

    if (action === 'versions') {
      const versions = [...new Set(entries.map(e => e.mcVersion))];
      return NextResponse.json(versions);
    }

    if (action === 'search') {
      const version = searchParams.get('version') ?? '';
      const query   = (searchParams.get('query') ?? '').toLowerCase();
      const offset  = parseInt(searchParams.get('offset') ?? '0', 10);

      let filtered = version ? entries.filter(e => e.mcVersion === version) : entries;
      if (query) filtered = filtered.filter(
        e => e.label.toLowerCase().includes(query) || e.id.toLowerCase().includes(query),
      );

      const hits = filtered.slice(offset, offset + PAGE_SIZE).map(e => ({
        project_id:  e.id,
        title:       e.label,
        description: `OptiFine for Minecraft ${e.mcVersion}`,
        icon_url:    null,
        downloads:   0,
        categories:  ['optimization'],
        page_url:    OPTIFINE_DOWNLOADS,
      }));

      return NextResponse.json({ hits, totalHits: filtered.length });
    }

    if (action === 'resolve') {
      const id    = searchParams.get('id') ?? '';
      const entry = entries.find(e => e.id === id);
      if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ url: entry.mirrorUrl, filename: entry.id, size: 0 });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: `OptiFine scrape failed: ${message}` }, { status: 502 });
  }
}
