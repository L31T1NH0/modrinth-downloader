import { NextRequest, NextResponse } from 'next/server';
import { kvPipeline, kvAvailable } from '@/lib/kvClient';

const ONLINE_KEY  = 'users:online';
const TOTAL_KEY   = 'downloads:total';
const WINDOW_SECS = 90;

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (!kvAvailable()) return NextResponse.json({ usersOnline: null, totalDownloads: null });

  try {
    const now = Math.floor(Date.now() / 1000);
    const results = await kvPipeline([
      ['ZREMRANGEBYSCORE', ONLINE_KEY, '-inf', String(now - WINDOW_SECS)],
      ['ZCARD', ONLINE_KEY],
      ['GET', TOTAL_KEY],
    ]);
    const usersOnline    = typeof results[1]?.result === 'number' ? results[1].result : null;
    const totalRaw       = results[2]?.result;
    const totalDownloads = typeof totalRaw === 'string' ? (parseInt(totalRaw, 10) || null) : null;

    return NextResponse.json(
      { usersOnline, totalDownloads },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ usersOnline: null, totalDownloads: null });
  }
}
