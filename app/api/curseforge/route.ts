import { type NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';

const CF_BASE = 'https://api.curseforge.com/v1';

const NUMERIC_ID = /^\d+$/;

const SEARCH_ALLOWED_PARAMS = new Set([
  'gameId',
  'classId',
  'index',
  'pageSize',
  'sortField',
  'sortOrder',
  'gameVersion',
  'searchFilter',
  'modLoaderType',
]);

const MOD_FILES_ALLOWED_PARAMS = new Set([
  'pageSize',
  'index',
  'gameVersion',
  'modLoaderType',
]);

function invalidPathResponse(reason: string) {
  return NextResponse.json(
    {
      error: 'Invalid CurseForge path.',
      code: 'INVALID_CURSEFORGE_PATH',
      reason,
    },
    { status: 400 },
  );
}

function hasOnlyAllowedParams(params: URLSearchParams, allowed: Set<string>): boolean {
  return [...params.keys()].every(key => allowed.has(key));
}

function isPathAllowed(path: string): { valid: true } | { valid: false; reason: string } {
  if (!path.startsWith('/')) return { valid: false, reason: 'Path must start with "/".' };

  let parsed: URL;
  try {
    parsed = new URL(path, CF_BASE);
  } catch {
    return { valid: false, reason: 'Path is not a valid URL path.' };
  }

  if (parsed.origin !== new URL(CF_BASE).origin) {
    return { valid: false, reason: 'Cross-origin URLs are not allowed.' };
  }

  const pathname = parsed.pathname;
  const params = parsed.searchParams;

  if (pathname === '/mods/search') {
    return hasOnlyAllowedParams(params, SEARCH_ALLOWED_PARAMS)
      ? { valid: true }
      : { valid: false, reason: 'Disallowed query parameter for /mods/search.' };
  }

  if (pathname === '/minecraft/version' || pathname === '/games/78022/versions') {
    return [...params.keys()].length === 0
      ? { valid: true }
      : { valid: false, reason: `Query parameters are not allowed for ${pathname}.` };
  }

  const modPathMatch = pathname.match(/^\/mods\/([^/]+)(?:\/(files))?$/);
  if (!modPathMatch) {
    return { valid: false, reason: 'Path is outside the allowed endpoint contract.' };
  }

  const [, modId, suffix] = modPathMatch;
  if (!NUMERIC_ID.test(modId)) {
    return { valid: false, reason: 'Mod id must be numeric.' };
  }

  if (suffix === 'files') {
    return hasOnlyAllowedParams(params, MOD_FILES_ALLOWED_PARAMS)
      ? { valid: true }
      : { valid: false, reason: 'Disallowed query parameter for /mods/{id}/files.' };
  }

  return [...params.keys()].length === 0
    ? { valid: true }
    : { valid: false, reason: 'Query parameters are not allowed for /mods/{id}.' };
}

export async function GET(request: NextRequest) {
  const ip = getRequestIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  const apiKey = process.env.CURSEFORGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CurseForge API key is not configured on this server.' },
      { status: 503 },
    );
  }

  const path = new URL(request.url).searchParams.get('path');

  if (!path) {
    return invalidPathResponse('Missing "path" query parameter.');
  }

  const validation = isPathAllowed(path);
  if (!validation.valid) {
    return invalidPathResponse(validation.reason);
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
