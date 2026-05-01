import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';

/** Allowlist of hostnames for CurseForge file downloads. */
const ALLOWED_HOSTS = new Set([
  'edge.forgecdn.net',
  'mediafilez.forgecdn.net',
  'media.forgecdn.net',
  'cdn.forgecdn.net',
]);
const MAX_REDIRECTS = 5;

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function isAllowedDownloadUrl(url: URL): boolean {
  return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname);
}

async function fetchAllowedDownload(url: URL, redirectsRemaining = MAX_REDIRECTS): Promise<Response> {
  const response = await fetch(url, { redirect: 'manual' });

  if (!isRedirect(response.status)) return response;
  if (redirectsRemaining <= 0) throw new Error('Too many redirects.');

  const location = response.headers.get('location');
  if (!location) throw new Error('Missing redirect location.');

  const nextUrl = new URL(location, url);
  if (!isAllowedDownloadUrl(nextUrl)) throw new Error('Redirect host not allowed.');

  return fetchAllowedDownload(nextUrl, redirectsRemaining - 1);
}

export async function GET(request: NextRequest) {
  const ip = getRequestIp(request);
  const limit = await checkRateLimit(ip, '/api/curseforge/download');
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const rawUrl = new URL(request.url).searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url parameter.' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 });
  }

  if (!isAllowedDownloadUrl(parsed)) {
    return NextResponse.json({ error: 'URL host not allowed.' }, { status: 400 });
  }

  try {
    const upstream = await fetchAllowedDownload(parsed);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream download failed with HTTP ${upstream.status}.` },
        { status: 502 },
      );
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    const contentLength = upstream.headers.get('content-length');
    const contentDisposition = upstream.headers.get('content-disposition');
    const cacheControl = upstream.headers.get('cache-control');
    const lastModified = upstream.headers.get('last-modified');
    const etag = upstream.headers.get('etag');

    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (contentDisposition) headers.set('Content-Disposition', contentDisposition);
    if (cacheControl) headers.set('Cache-Control', cacheControl);
    if (lastModified) headers.set('Last-Modified', lastModified);
    if (etag) headers.set('ETag', etag);

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch the download file.' }, { status: 502 });
  }
}
