import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import type { RankingsResponse, RankingEntry } from '@/app/api/rankings/route';

export const metadata: Metadata = {
  title: 'Rankings – Dynrinth',
  description: 'Most downloaded Minecraft mods through Dynrinth',
};

async function getRankings(): Promise<RankingsResponse> {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const res  = await fetch(`${base}/api/rankings`, { next: { revalidate: 60 } });
    if (!res.ok) return { rankings: [], total: 0 };
    return res.json();
  } catch {
    return { rankings: [], total: 0 };
  }
}

function modPageUrl(entry: RankingEntry): string {
  if (entry.source === 'modrinth') return `https://modrinth.com/project/${entry.id}`;
  return `https://www.curseforge.com/minecraft/mc-mods/${entry.id}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const RANK_STYLES: Record<number, { medal: string; ring: string; label: string }> = {
  1: { medal: '🥇', ring: 'ring-1 ring-amber-400/40',  label: 'text-amber-400' },
  2: { medal: '🥈', ring: 'ring-1 ring-slate-400/40',  label: 'text-slate-400' },
  3: { medal: '🥉', ring: 'ring-1 ring-orange-400/40', label: 'text-orange-400' },
};

function RankBadge({ rank }: { rank: number }) {
  const style = RANK_STYLES[rank];
  if (style) {
    return (
      <span className="text-base leading-none w-7 text-center shrink-0" title={`#${rank}`}>
        {style.medal}
      </span>
    );
  }
  return (
    <span className="w-7 text-right text-xs font-mono text-ink-muted shrink-0">
      {rank}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const isModrinth = source === 'modrinth';
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
        isModrinth
          ? 'bg-brand/10 text-brand'
          : 'bg-orange-400/10 text-orange-400',
      ].join(' ')}
    >
      {isModrinth ? (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2c4.418 0 8 3.582 8 8s-3.582 8-8 8-8-3.582-8-8 3.582-8 8-8zm-1 3v2H9v2h2v2H9v2h2v2h2v-2h2v-2h-2v-2h2V9h-2V7h-2z"/>
        </svg>
      ) : (
        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      )}
      {source}
    </span>
  );
}

function BarFill({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
      <div
        className="h-full bg-brand/[0.04] transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ModRow({ entry, max, position }: { entry: RankingEntry; max: number; position: number }) {
  const style = RANK_STYLES[entry.rank];
  return (
    <li
      className="animate-fadeIn"
      style={{ animationDelay: `${position * 30}ms` }}
    >
      <a
        href={modPageUrl(entry)}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          'relative flex items-center gap-3 rounded-xl border bg-bg-surface px-4 py-3',
          'hover:bg-bg-hover hover:border-line transition-all group',
          style?.ring ?? 'border-line-subtle',
        ].join(' ')}
      >
        <BarFill count={entry.count} max={max} />

        <RankBadge rank={entry.rank} />

        {/* Icon */}
        <div className="w-9 h-9 rounded-lg bg-bg-base border border-line-subtle flex items-center justify-center shrink-0 overflow-hidden">
          {entry.iconUrl ? (
            <Image
              src={entry.iconUrl}
              alt=""
              width={36}
              height={36}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <svg className="w-4 h-4 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
          )}
        </div>

        {/* Name + source */}
        <div className="flex-1 min-w-0">
          <p className={[
            'text-sm font-medium truncate transition-colors',
            style ? style.label : 'group-hover:text-brand',
          ].join(' ')}>
            {entry.name ?? entry.id}
          </p>
          <SourceBadge source={entry.source} />
        </div>

        {/* Count */}
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold font-mono text-ink-primary">
            {fmtCount(entry.count)}
          </p>
          <p className="text-[10px] text-ink-tertiary">downloads</p>
        </div>
      </a>
    </li>
  );
}

export default async function RankingsPage() {
  const { rankings, total } = await getRankings();
  const max = rankings[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary font-sans">

      {/* Header */}
      <header className="border-b border-line-subtle sticky top-0 z-10 bg-bg-base/90 backdrop-blur">
        <div className="max-w-2xl mx-auto px-5 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-6 h-6 rounded-md bg-brand flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-brand-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </div>
            <span className="text-[14px] font-semibold tracking-tight group-hover:text-brand transition-colors">dynrinth</span>
          </Link>
          <span className="text-ink-muted text-xs">/</span>
          <span className="text-xs font-medium text-ink-secondary">Rankings</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-5 py-8">

        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold mb-1 tracking-tight">Most Downloaded Mods</h1>
              <p className="text-sm text-ink-secondary">
                {total > 0
                  ? `${total.toLocaleString()} unique mod${total === 1 ? '' : 's'} tracked via Dynrinth`
                  : 'No downloads tracked yet.'}
              </p>
            </div>

            {rankings.length > 0 && (
              <div className="shrink-0 rounded-xl border border-line-subtle bg-bg-surface px-4 py-2.5 text-center">
                <p className="text-lg font-bold font-mono text-brand leading-none">
                  {fmtCount(rankings.reduce((s, e) => s + e.count, 0))}
                </p>
                <p className="text-[10px] text-ink-tertiary mt-0.5">total downloads</p>
              </div>
            )}
          </div>

          {/* Top-3 podium */}
          {rankings.length >= 3 && (
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[rankings[1], rankings[0], rankings[2]].map((entry, i) => {
                const heights = ['h-16', 'h-20', 'h-14'];
                const delay   = [60, 0, 120];
                const style   = RANK_STYLES[entry.rank];
                return (
                  <a
                    key={entry.member}
                    href={modPageUrl(entry)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col items-center gap-1.5 animate-fadeIn"
                    style={{ animationDelay: `${delay[i]}ms` }}
                  >
                    <div className={[
                      'w-full rounded-xl border bg-bg-surface flex flex-col items-center justify-center gap-1.5 transition-all group-hover:bg-bg-hover group-hover:border-line',
                      heights[i],
                      style?.ring ?? 'border-line-subtle',
                    ].join(' ')}>
                      <span className="text-xl leading-none">{style.medal}</span>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-bg-base border border-line-subtle overflow-hidden mx-auto">
                      {entry.iconUrl ? (
                        <Image src={entry.iconUrl} alt="" width={32} height={32} className="w-full h-full object-cover" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className={['text-[11px] font-semibold truncate w-full px-1', style.label].join(' ')}>
                      {entry.name ?? entry.id}
                    </p>
                    <p className="text-[10px] font-mono text-ink-secondary">{fmtCount(entry.count)}</p>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* List */}
        {rankings.length === 0 ? (
          <div className="rounded-xl border border-line-subtle bg-bg-surface px-5 py-12 text-center">
            <svg className="w-8 h-8 text-ink-muted mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <p className="text-sm text-ink-tertiary">No data yet — download some mods to get the rankings started!</p>
          </div>
        ) : (
          <>
            {rankings.length >= 3 && (
              <h2 className="text-xs font-semibold text-ink-tertiary uppercase tracking-widest mb-3">Full leaderboard</h2>
            )}
            <ol className="space-y-1.5">
              {rankings.map((entry, i) => (
                <ModRow key={entry.member} entry={entry} max={max} position={i} />
              ))}
            </ol>
            <p className="mt-6 text-center text-[11px] text-ink-muted">
              Updates every 60 seconds · Tracking downloads through Dynrinth
            </p>
          </>
        )}
      </main>
    </div>
  );
}
