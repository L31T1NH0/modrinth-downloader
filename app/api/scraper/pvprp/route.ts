import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';

// ─── TODO: fill these in after reverse-engineering pvprp.com ─────────────────
//
// How to find the internal API:
//   1. Open pvprp.com in Chrome/Firefox
//   2. Open DevTools → Network tab → filter by "Fetch/XHR"
//   3. Browse/search the site and watch for JSON requests
//   4. If no JSON API exists, switch to "Doc" filter and inspect the HTML pages
//
// Fill in the constants below once you know the endpoint patterns.

const PVPRP_BASE = 'https://pvprp.com';

// Example: if the site has a JSON search endpoint like /api/packs?q=...
// const SEARCH_ENDPOINT = `${PVPRP_BASE}/api/packs`;
// If it's HTML scraping, set the page URL:
const SEARCH_PAGE = `${PVPRP_BASE}/packs`;

const PAGE_SIZE = 20;

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer':         PVPRP_BASE,
};

// ─── TODO: implement parsing ──────────────────────────────────────────────────
//
// After inspecting the site, replace the stub functions below.

interface PvprpPack {
  id:          string;
  title:       string;
  description: string;
  icon_url:    string | null;
  downloadUrl: string;
  filename:    string;
  pageUrl?:    string;
  isFree:      boolean;  // false = requires visiting a YouTube channel
}

/**
 * TODO: Replace with actual parsing logic once you know the site's structure.
 *
 * Options:
 *   A) If the site has a JSON API:
 *      const data = await response.json();
 *      return data.packs.map(p => ({ id: p.id, title: p.name, ... }));
 *
 *   B) If the site is server-rendered HTML:
 *      const html = await response.text();
 *      // Use regex or DOM parsing to extract pack cards
 *      const matches = html.matchAll(/<div class="pack-card"[^>]*data-id="([^"]+)">(.*?)<\/div>/gs);
 *      ...
 */
function parsePacks(_html: string): PvprpPack[] {
  // Stub: return empty until parsing is implemented
  return [];
}

async function searchPacks(query: string, _version: string, offset: number): Promise<{ packs: PvprpPack[]; total: number }> {
  // TODO: adjust URL/params to match what pvprp.com actually uses for search
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  params.set('page', String(Math.floor(offset / PAGE_SIZE) + 1));

  const url = `${SEARCH_PAGE}${params.toString() ? `?${params}` : ''}`;
  const r = await fetch(url, { headers: BROWSER_HEADERS });
  if (!r.ok) throw new Error(`pvprp.com HTTP ${r.status}`);

  const html  = await r.text();
  const packs = parsePacks(html).filter(p => p.isFree);
  return { packs, total: packs.length };
}

async function resolvePack(id: string): Promise<PvprpPack | null> {
  // TODO: adjust to fetch the pack detail page or use an API endpoint
  const r = await fetch(`${PVPRP_BASE}/pack/${encodeURIComponent(id)}`, { headers: BROWSER_HEADERS });
  if (!r.ok) return null;
  const html  = await r.text();
  const packs = parsePacks(html);
  return packs[0] ?? null;
}
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const ip    = getRequestIp(request);
  const limit = await checkRateLimit(ip, '/api/scraper/pvprp');
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    if (action === 'search') {
      const query   = searchParams.get('query')   ?? '';
      const version = searchParams.get('version') ?? '';
      const offset  = parseInt(searchParams.get('offset') ?? '0', 10);

      const { packs, total } = await searchPacks(query, version, offset);

      const hits = packs.map(p => ({
        project_id:  p.id,
        title:       p.title,
        description: p.description,
        icon_url:    p.icon_url,
        downloads:   0,
        categories:  ['resourcepack'],
        page_url:    p.pageUrl,
      }));

      return NextResponse.json({ hits, totalHits: total });
    }

    if (action === 'resolve') {
      const id   = searchParams.get('id') ?? '';
      const pack = await resolvePack(id);
      if (!pack) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ url: pack.downloadUrl, filename: pack.filename, size: 0 });
    }

    if (action === 'info') {
      const id   = searchParams.get('id') ?? '';
      const pack = await resolvePack(id);
      if (!pack) return NextResponse.json({ title: id, iconUrl: null });
      return NextResponse.json({ title: pack.title, iconUrl: pack.icon_url });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: `pvprp scrape failed: ${message}` }, { status: 502 });
  }
}
