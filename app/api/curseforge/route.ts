import { type NextRequest, NextResponse } from 'next/server';

const CF_BASE = 'https://api.curseforge.com/v1';

/** Allowlist of path prefixes this proxy will forward to CurseForge. */
const ALLOWED_PREFIXES = [
  '/minecraft/version',
  '/mods/search',
  '/mods/',
];

export async function GET(request: NextRequest) {
  const apiKey = process.env.CURSEFORGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CurseForge API key is not configured on this server.' },
      { status: 503 },
    );
  }

  const path = new URL(request.url).searchParams.get('path');

  if (!path || !ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return NextResponse.json({ error: 'Invalid or disallowed path.' }, { status: 400 });
  }

  const upstream = await fetch(`${CF_BASE}${path}`, {
    headers: { 'x-api-key': apiKey },
  });

  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    // CurseForge returns plain-text errors (e.g. "Forbidden: ...") for bad keys.
    const text = await upstream.text();
    return NextResponse.json(
      { error: `CurseForge error (HTTP ${upstream.status}): ${text}` },
      { status: upstream.status },
    );
  }

  const body = await upstream.json();
  return NextResponse.json(body, { status: upstream.status });
}
