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
  if (entry.source === 'modrinth') {
    return `https://modrinth.com/project/${entry.id}`;
  }
  return `https://www.curseforge.com/minecraft/mc-mods/${entry.id}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function RankingsPage() {
  const { rankings, total } = await getRankings();

  return (
    <div className="min-h-screen bg-bg-base text-ink-primary font-sans">

      {/* Header */}
      <header className="border-b border-line-subtle">
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

        <div className="mb-6">
          <h1 className="text-lg font-semibold mb-1">Most Downloaded Mods</h1>
          <p className="text-xs text-ink-secondary">
            {total > 0
              ? `${total.toLocaleString()} unique mod${total === 1 ? '' : 's'} downloaded via Dynrinth`
              : 'No downloads tracked yet.'}
          </p>
        </div>

        {rankings.length === 0 ? (
          <div className="rounded-xl border border-line-subtle bg-bg-surface px-5 py-10 text-center text-sm text-ink-tertiary">
            No data yet — download some mods to get the rankings started!
          </div>
        ) : (
          <ol className="space-y-1.5">
            {rankings.map(entry => (
              <li key={entry.member}>
                <a
                  href={modPageUrl(entry)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-line-subtle bg-bg-surface px-4 py-2.5 hover:bg-bg-hover hover:border-line transition-all group"
                >
                  {/* Rank */}
                  <span className="w-6 text-right text-xs font-mono text-ink-muted shrink-0">
                    {entry.rank}
                  </span>

                  {/* Icon */}
                  <div className="w-8 h-8 rounded-lg bg-bg-base border border-line-subtle flex items-center justify-center shrink-0 overflow-hidden">
                    {entry.iconUrl ? (
                      <Image
                        src={entry.iconUrl}
                        alt=""
                        width={32}
                        height={32}
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
                    <p className="text-sm font-medium truncate group-hover:text-brand transition-colors">
                      {entry.name ?? entry.id}
                    </p>
                    <p className="text-[10px] text-ink-tertiary capitalize">{entry.source}</p>
                  </div>

                  {/* Count */}
                  <span className="text-xs font-mono text-brand shrink-0">
                    ⬇ {fmtCount(entry.count)}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}
