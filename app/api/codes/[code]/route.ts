import { NextRequest, NextResponse } from 'next/server';
import { kvAvailable, kvGet } from '@/lib/kvClient';
import { validateCode, codeKey } from '@/lib/codes';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code: raw } = await params;

  const code = validateCode(raw);
  if (!code) {
    return NextResponse.json({ error: 'invalid code' }, { status: 400 });
  }

  if (!kvAvailable()) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const stored = await kvGet(codeKey(code));
  if (!stored) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  let state: unknown;
  try {
    state = JSON.parse(stored);
  } catch {
    return NextResponse.json({ error: 'corrupt' }, { status: 500 });
  }

  return NextResponse.json(state, {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
