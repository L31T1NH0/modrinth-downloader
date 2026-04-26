import type { Filters, ModFile, ProjectInfo, ResolveResult, SearchPage } from '@/lib/modrinth/types';

export const PAGE_SIZE = 20;

// PvP-popular Minecraft versions, newest first.
// Adjust this list based on what pvprp.com actually supports.
const PVP_VERSIONS = [
  '1.21.4', '1.21.1', '1.20.4', '1.20.1',
  '1.19.4', '1.18.2', '1.17.1', '1.16.5',
  '1.12.2', '1.8.9',
];

function proxy(action: string, params: Record<string, string>): string {
  const p = new URLSearchParams({ action, ...params });
  return `/api/scraper/pvprp?${p}`;
}

export async function fetchGameVersions(): Promise<string[]> {
  return PVP_VERSIONS;
}

export async function searchProjects(
  query:   string,
  filters: Filters,
  offset:  number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const params: Record<string, string> = { offset: String(offset) };
  if (query)           params.query   = query;
  if (filters.version) params.version = filters.version;
  const r = await fetch(proxy('search', params), { signal });
  if (!r.ok) throw new Error(`pvprp searchProjects: HTTP ${r.status}`);
  return r.json();
}

export async function resolveProjectVersion(
  projectId: string,
  _filters:  Filters,
): Promise<ResolveResult> {
  try {
    const r = await fetch(proxy('resolve', { id: projectId }));
    if (!r.ok) {
      if (r.status === 404) return { ok: false, reason: 'not_found' };
      if (r.status === 429) return { ok: false, reason: 'rate_limited' };
      return { ok: false, reason: 'network' };
    }
    const data: { url: string; filename: string; size: number } = await r.json();
    const file: ModFile = { url: data.url, filename: data.filename, primary: true, size: data.size };
    return {
      ok: true,
      version: {
        versionNumber: projectId,
        file,
        sizeKb:       data.size ? Math.round(data.size / 1024) : null,
        dependencies: [],
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function fetchProjectInfo(projectId: string): Promise<ProjectInfo> {
  try {
    const r = await fetch(proxy('info', { id: projectId }));
    if (!r.ok) return { title: projectId, iconUrl: null };
    return r.json();
  } catch {
    return { title: projectId, iconUrl: null };
  }
}
