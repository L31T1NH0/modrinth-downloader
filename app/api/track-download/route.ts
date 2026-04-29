import { NextRequest, NextResponse } from 'next/server';
import { kvPipeline, kvAvailable } from '@/lib/kvClient';
import { checkRateLimit } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';

interface TrackedMod {
  id:           string;
  name:         string;
  source:       string;
  iconUrl?:     string;
  contentType?: string;
  version?:     string;
}

interface TrackDownloadBody {
  mods: TrackedMod[];
}

const LEADERBOARD_KEY = 'downloads:leaderboard';

function metaKey(source: string, id: string): string {
  return `downloads:meta:${source}:${id}`;
}

function member(source: string, id: string): string {
  return `${source}:${id}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getRequestIp(req);
  const rateLimit = await checkRateLimit(ip, '/api/track-download');
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: TrackDownloadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const mods = body?.mods;
  if (!Array.isArray(mods) || mods.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!kvAvailable()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const commands: Array<string[]> = [];
    for (const mod of mods) {
      if (!mod.id || !mod.source) continue;
      commands.push(['ZINCRBY', LEADERBOARD_KEY, '1', member(mod.source, mod.id)]);
      if (mod.contentType) {
        commands.push(['ZINCRBY', `downloads:leaderboard:${mod.contentType}`, '1', member(mod.source, mod.id)]);
        if (mod.version) {
          commands.push(['ZINCRBY', `downloads:leaderboard:${mod.contentType}:${mod.version}`, '1', member(mod.source, mod.id)]);
        }
      }
      commands.push(['HSET', metaKey(mod.source, mod.id),
        'name',    mod.name    ?? '',
        'iconUrl', mod.iconUrl ?? '',
      ]);
    }
    const validCount = mods.filter(m => m.id && m.source).length;
    if (validCount > 0) commands.push(['INCRBY', 'downloads:total', String(validCount)]);
    if (commands.length > 0) {
      await kvPipeline(commands);
    }
  } catch (err) {
    console.error('[track-download] KV error:', err);
  }

  return NextResponse.json({ ok: true });
}
