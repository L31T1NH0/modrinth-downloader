import { NextRequest, NextResponse } from 'next/server';

const CF_BASE = 'https://api.curseforge.com/v1';

/**
 * Transparent proxy for the CurseForge API.
 * Keeps the API key server-side — never exposed to the browser bundle.
 *
 * Usage (client): GET /api/curseforge/mods/search?gameId=432&...
 * Proxied to:     GET https://api.curseforge.com/v1/mods/search?gameId=432&...
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const apiKey = process.env.CURSEFORGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CURSEFORGE_API_KEY is not configured' },
      { status: 503 },
    );
  }

  const { path } = await params;
  const search   = request.nextUrl.search;
  const upstream = `${CF_BASE}/${path.join('/')}${search}`;

  const response = await fetch(upstream, {
    headers: { 'x-api-key': apiKey },
  });

  const body = await response.arrayBuffer();
  return new NextResponse(body, {
    status:  response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}
