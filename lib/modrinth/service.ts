import type {
  Filters,
  ModFile,
  ProjectInfo,
  ResolveResult,
  SearchPage,
  VersionDependency,
} from './types';

const BASE = 'https://api.modrinth.com/v2';

/** Results per page. Exported so the UI can use it for pagination math. */
export const PAGE_SIZE = 20;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build Modrinth search facets from a filter snapshot.
 *
 * Each top-level array is an AND group (one value = exact match).
 * Rules per content type:
 *   mod         → project_type + mod-loader category + game version
 *   shader      → project_type + shader-renderer category (if set) + game version
 *   plugin      → project_type + plugin-platform category (if set) + game version
 *   others      → project_type + game version only
 */
function buildFacets(f: Filters): string[][] {
  const groups: string[][] = [
    [`project_type:${f.contentType}`],
    [`versions:${f.version}`],
  ];
  if (f.contentType === 'mod')
    groups.splice(1, 0, [`categories:${f.loader}`]);
  if (f.contentType === 'shader' && f.shaderLoader)
    groups.splice(1, 0, [`categories:${f.shaderLoader}`]);
  if (f.contentType === 'plugin' && f.pluginLoader)
    groups.splice(1, 0, [`categories:${f.pluginLoader}`]);
  return groups;
}

/**
 * Build query-string params for the project-version endpoint.
 *
 * Modrinth's `loaders` param accepts loader names:
 *   mod     → fabric | forge
 *   shader  → iris | optifine  (these ARE loader names in the version API)
 *   plugin  → bukkit | spigot | paper (server-platform loader names)
 *   others  → no loader filter
 */
function buildVersionParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams({ game_versions: JSON.stringify([f.version]) });
  if (f.contentType === 'mod') {
    p.set('loaders', JSON.stringify([f.loader]));
  } else if (f.contentType === 'shader' && f.shaderLoader) {
    p.set('loaders', JSON.stringify([f.shaderLoader]));
  } else if (f.contentType === 'plugin' && f.pluginLoader) {
    p.set('loaders', JSON.stringify([f.pluginLoader]));
  }
  return p;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all stable Minecraft release versions, newest first.
 * Throws on network error or non-OK HTTP status.
 */
export async function fetchGameVersions(): Promise<string[]> {
  const r = await fetch(`${BASE}/tag/game_version`);
  if (!r.ok) throw new Error(`fetchGameVersions: HTTP ${r.status}`);
  const data: Array<{ version: string; version_type: string }> = await r.json();
  return data.filter(v => v.version_type === 'release').map(v => v.version);
}

/**
 * Search for projects matching the given query and filter snapshot.
 *
 * @param query   Free-text. Empty string returns top results by downloads.
 * @param filters Active filter snapshot.
 * @param offset  Zero-based result offset for pagination.
 * @param signal  Optional AbortSignal; rejects with AbortError when triggered.
 *
 * Throws on network error or non-OK HTTP status.
 * Callers should ignore AbortError (name === 'AbortError').
 */
export async function searchProjects(
  query:   string,
  filters: Filters,
  offset:  number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const params = new URLSearchParams({
    facets: JSON.stringify(buildFacets(filters)),
    limit:  String(PAGE_SIZE),
    offset: String(offset),
    index:  query ? 'relevance' : 'downloads',
  });
  if (query) params.set('query', query);

  const r = await fetch(`${BASE}/search?${params}`, { signal });
  if (!r.ok) throw new Error(`searchProjects: HTTP ${r.status}`);

  const data = await r.json();
  return {
    hits: (data.hits ?? []).map((hit: {
      project_id: string; title: string; description: string;
      icon_url: string | null; downloads: number; categories: string[];
      slug: string; project_type: string;
    }) => ({
      project_id:  hit.project_id,
      title:       hit.title,
      description: hit.description,
      icon_url:    hit.icon_url,
      downloads:   hit.downloads,
      categories:  hit.categories,
      page_url:    `https://modrinth.com/${hit.project_type}/${hit.slug}`,
    })),
    totalHits: data.total_hits ?? 0,
  };
}

/**
 * Resolve the best matching file for a project under the given filters.
 *
 * Returns a typed ResolveResult — never throws:
 *  { ok: true, version }  — file resolved; version includes dependency list
 *  { ok: false, reason }  — 'no_compatible_version' or inferred failure reason
 */
export async function resolveProjectVersion(
  projectId: string,
  filters:   Filters,
): Promise<ResolveResult> {
  try {
    const params = buildVersionParams(filters);
    const r = await fetch(`${BASE}/project/${projectId}/version?${params}`);
    if (!r.ok) {
      if (r.status === 404) return { ok: false, reason: 'not_found' };
      if (r.status === 429) return { ok: false, reason: 'rate_limited' };
      return { ok: false, reason: 'network' };
    }

    const vers: Array<{
      version_number: string;
      files:          ModFile[];
      dependencies:   Array<{ project_id: string; dependency_type: string }>;
    }> = await r.json();

    if (!Array.isArray(vers) || vers.length === 0)
      return { ok: false, reason: 'no_compatible_version' };

    const latest = vers[0];
    const file: ModFile | undefined =
      latest.files.find(f => f.primary) ?? latest.files[0];
    if (!file)
      return { ok: false, reason: 'no_compatible_version' };

    const dependencies: VersionDependency[] = (latest.dependencies ?? [])
      .filter((d): d is { project_id: string; dependency_type: string } => !!d.project_id)
      .map(d => ({
        projectId:      d.project_id,
        dependencyType: d.dependency_type as VersionDependency['dependencyType'],
      }));

    return {
      ok: true,
      version: {
        versionNumber: latest.version_number,
        file,
        sizeKb:        file.size ? Math.round(file.size / 1024) : null,
        dependencies,
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Fetch lightweight project metadata (title + icon) for dependency display.
 * Throws on network error or non-OK HTTP status.
 */
export async function fetchProjectInfo(projectId: string): Promise<ProjectInfo> {
  const r = await fetch(`${BASE}/project/${projectId}`);
  if (!r.ok) throw new Error(`fetchProjectInfo: HTTP ${r.status}`);
  const data = await r.json();
  return { title: data.title, iconUrl: data.icon_url ?? null };
}
