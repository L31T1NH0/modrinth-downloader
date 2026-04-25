import { NextRequest, NextResponse } from 'next/server';
import { kvAvailable, kvGet, kvSet } from '@/lib/kvClient';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';
import { generateCode, codeKey } from '@/lib/codes';
import { migrate } from '@/lib/stateSchema';
import type { ModListState } from '@/lib/stateSchema';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getRequestIp(req);
  const rateLimit = await checkRateLimit(ip, '/api/codes');
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: { state?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const state: ModListState | null = migrate(body?.state);
  if (!state) {
    return NextResponse.json({ ok: false, error: 'invalid state' }, { status: 400 });
  }

  const code = generateCode(state);
  const key  = codeKey(code);

  if (kvAvailable()) {
    const existing = await kvGet(key);
    if (!existing) {
      await kvSet(key, JSON.stringify(state));
    }
  }

  return NextResponse.json({ code });
}
