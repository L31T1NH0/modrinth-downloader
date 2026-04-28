import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { validateCode, codeKey } from '@/lib/codes';
import { kvGet } from '@/lib/kvClient';
import { migrate } from '@/lib/stateSchema';
import CopyButton from './CopyButton';
import { CubeIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { fmtCount as fmtDownloads } from '@/lib/format';

interface ModrinthProject {
  id:          string;
  slug:        string;
  title:       string;
  description: string;
  icon_url:    string | null;
  downloads:   number;
}

async function fetchProjects(ids: string[]): Promise<ModrinthProject[]> {
  if (ids.length === 0) return [];
  try {
    const res = await fetch(
      `https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`,
      {
        headers: { 'User-Agent': 'dynrinth/1.0 (dynrinth.vercel.app)' },
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as ModrinthProject[]) : [];
  } catch {
    return [];
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> },
): Promise<Metadata> {
  const { code: raw } = await params;
  const code = validateCode(raw);
  if (!code) return {};
  const stored = await kvGet(codeKey(code));
  if (!stored) return {};
  const state = migrate(JSON.parse(stored));
  if (!state) return {};
  return {
    title: `Modpack ${code} — Dynrinth`,
    description: `${state.mods.length} mods for MC ${state.version} (${state.loader ?? 'fabric'})`,
  };
}

export default async function PackPage(
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = validateCode(raw);
  if (!code) notFound();

  const stored = await kvGet(codeKey(code!));
  if (!stored) notFound();

  const state = migrate(JSON.parse(stored!));
  if (!state) notFound();

  const projects = await fetchProjects(state!.mods);
  const byId     = new Map(projects.map(p => [p.id, p]));
  const command  = `/dynrinth ${code}`;
  const loader   = state.loader ?? 'fabric';

  return (
    <main className="min-h-dvh bg-bg-base text-ink-primary font-sans">
      <div className="mx-auto w-full max-w-4xl px-2 sm:px-4 py-2 sm:py-4">
        <div className="rounded-2xl border border-line-subtle bg-gradient-to-b from-bg-card/55 to-bg-base/70 shadow-[0_20px_60px_rgba(0,0,0,0.35)] overflow-hidden">

      {/* ── Header ── */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-3.5 sm:px-4 h-13 border-b border-line-subtle bg-bg-base/85 backdrop-blur-sm">
        <div className="flex items-center gap-3 sm:gap-2 min-w-0">
          <Link href="/" title="Back to Dynrinth" className="shrink-0 opacity-95 hover:opacity-100 transition-opacity">
            <Image src="/dynrinth-icon.svg" alt="Dynrinth" width={28} height={28} className="rounded-md border border-line-subtle" />
          </Link>

          <span className="text-line-strong hidden sm:block">·</span>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-hidden">
            <code className="text-ink-primary font-mono text-[12px] sm:text-[13px] font-semibold tracking-wide">{code}</code>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-bg-surface text-ink-secondary border border-line-subtle font-mono">
              MC {state.version}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-bg-surface text-ink-secondary border border-line-subtle capitalize">
              {loader}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-glow text-brand border border-brand/30 font-mono">
              {state.mods.length} mod{state.mods.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <CopyButton command={command} />
      </header>

      {/* ── Mod list ── */}
      <div className="w-full px-0 py-1.5 sm:py-3">
        {state.mods.map(id => {
          const p = byId.get(id);
          return (
            <div key={id} className="group flex items-start gap-3 sm:gap-3.5 px-3.5 sm:px-4 py-3 sm:py-3.5 border-b border-line-subtle/80 hover:bg-bg-surface/50 transition-colors duration-150 first:rounded-t-xl last:border-b-0 last:rounded-b-xl">

              {/* Icon */}
              {p?.icon_url ? (
                <Image
                  src={p.icon_url}
                  alt={p.title}
                  width={44}
                  height={44}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-line-subtle object-cover shrink-0 bg-bg-surface mt-0.5 shadow-sm"
                  unoptimized
                />
              ) : (
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-bg-surface border border-line-subtle flex items-center justify-center shrink-0 mt-0.5">
                  <CubeIcon className="w-5 h-5 text-ink-tertiary" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                {p ? (
                  <>
                    <a
                      href={`https://modrinth.com/project/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] sm:text-sm font-semibold leading-tight text-ink-primary hover:text-brand transition-colors"
                    >
                      {p.title}
                    </a>
                    <p className="text-xs text-ink-secondary mt-0.5 leading-snug line-clamp-2 max-w-[52ch]">
                      {p.description}
                    </p>
                    <div className="flex gap-1.5 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-glow text-brand border border-brand/30 font-mono">
                        ⬇ {fmtDownloads(p.downloads)}
                      </span>
                    </div>
                  </>
                ) : (
                  <span className="text-ink-tertiary text-[13px] font-mono">{id}</span>
                )}
              </div>

              {/* External link */}
              {p && (
                <a
                  href={`https://modrinth.com/project/${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-bg-card/90 border border-line-subtle text-ink-secondary flex items-center justify-center shrink-0 self-center hover:text-brand hover:border-brand/35 hover:bg-brand-glow transition-all duration-150"
                  title={`Open ${p.title} on Modrinth`}
                >
                  <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>
        </div>
      </div>
    </main>
  );
}
