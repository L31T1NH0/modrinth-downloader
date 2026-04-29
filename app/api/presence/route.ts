import { NextRequest, NextResponse } from 'next/server';
import { kvPipeline, kvAvailable } from '@/lib/kvClient';

const ONLINE_KEY  = 'users:online';
const WINDOW_SECS = 90;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { sessionId: string };
  try { body = await req.json(); } catch { return NextResponse.json({ usersOnline: null }); }

  const { sessionId } = body;
  if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 64) {
    return NextResponse.json({ usersOnline: null });
  }

  if (!kvAvailable()) return NextResponse.json({ usersOnline: null });

  try {
    const now = Math.floor(Date.now() / 1000);
    const results = await kvPipeline([
      ['ZADD', ONLINE_KEY, String(now), sessionId],
      ['ZREMRANGEBYSCORE', ONLINE_KEY, '-inf', String(now - WINDOW_SECS)],
      ['ZCARD', ONLINE_KEY],
    ]);
    const count = typeof results[2]?.result === 'number' ? results[2].result : null;
    return NextResponse.json({ usersOnline: count });
  } catch {
    return NextResponse.json({ usersOnline: null });
  }
}
