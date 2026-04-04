import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';

/** Allowlist of hostnames from which we will proxy CurseForge file downloads. */
const ALLOWED_HOSTS = ['edge.forgecdn.net', 'mediafilez.forgecdn.net'];

export async function GET(request: NextRequest) {
  const ip = request.ip ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const limit = checkRateLimit(ip);
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

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: 'URL host not allowed.' }, { status: 400 });
  }

  const upstream = await fetch(rawUrl);
  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const headers = new Headers();
  const ct = upstream.headers.get('Content-Type');
  if (ct) headers.set('Content-Type', ct);
  const cl = upstream.headers.get('Content-Length');
  if (cl) headers.set('Content-Length', cl);

  return new NextResponse(upstream.body, { status: 200, headers });
}
