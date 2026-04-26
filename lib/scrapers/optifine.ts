import type { Filters, ModFile, ProjectInfo, ResolveResult, SearchPage } from '@/lib/modrinth/types';

export const PAGE_SIZE = 20;

function proxy(action: string, params: Record<string, string>): string {
  const p = new URLSearchParams({ action, ...params });
  return `/api/scraper/optifine?${p}`;
}

export async function fetchGameVersions(): Promise<string[]> {
  const r = await fetch(proxy('versions', {}));
  if (!r.ok) throw new Error(`OptiFine fetchGameVersions: HTTP ${r.status}`);
  return r.json();
}

export async function searchProjects(
  query:   string,
  filters: Filters,
  offset:  number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const params: Record<string, string> = { offset: String(offset) };
  if (filters.version) params.version = filters.version;
  if (query)           params.query   = query;
  const r = await fetch(proxy('search', params), { signal });
  if (!r.ok) throw new Error(`OptiFine searchProjects: HTTP ${r.status}`);
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

export async function fetchProjectInfo(_projectId: string): Promise<ProjectInfo> {
  return { title: 'OptiFine', iconUrl: null };
}
