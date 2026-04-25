import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { validateCode, codeKey } from '@/lib/codes';
import { kvGet } from '@/lib/kvClient';
import { migrate } from '@/lib/stateSchema';
import CopyButton from './CopyButton';

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

  const projects  = await fetchProjects(state.mods);
  const byId      = new Map(projects.map(p => [p.id, p]));
  const command   = `/dynrinth ${code}`;
  const loader    = state.loader ?? 'fabric';

  return (
    <main className="min-h-full bg-bg-base text-ink-primary font-sans">
      {/* ── header ── */}
      <div className="border-b border-line bg-bg-surface px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-brand font-semibold text-[13px] tracking-wide">dynrinth</span>
            <span className="text-ink-tertiary text-[13px]">·</span>
            <span className="text-ink-secondary text-[13px]">modpack preview</span>
          </div>
          <h1 className="text-ink-primary text-xl font-semibold leading-tight font-mono">{code}</h1>
          <p className="text-ink-secondary text-[13px] mt-1">
            MC {state.version} · {loader} · {state.mods.length} mod{state.mods.length !== 1 ? 's' : ''}
          </p>
        </div>
        <CopyButton command={command} />
      </div>

      {/* ── mod list ── */}
      <ul className="divide-y divide-line max-w-2xl mx-auto px-4 py-2">
        {state.mods.map(id => {
          const p = byId.get(id);
          return (
            <li key={id} className="flex items-start gap-3 py-4">
              {p?.icon_url ? (
                <Image
                  src={p.icon_url}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-lg shrink-0 mt-0.5"
                  unoptimized
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-bg-card border border-line shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                {p ? (
                  <>
                    <a
                      href={`https://modrinth.com/project/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-primary font-semibold text-[14px] hover:text-brand transition-colors"
                    >
                      {p.title}
                    </a>
                    <p className="text-ink-secondary text-[12px] mt-0.5 leading-snug line-clamp-2">
                      {p.description}
                    </p>
                  </>
                ) : (
                  <span className="text-ink-tertiary text-[13px] font-mono">{id}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
