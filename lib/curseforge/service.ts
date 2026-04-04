import type {
  Filters,
  ModFile,
  ProjectInfo,
  ResolveResult,
  SearchPage,
  Source,
  VersionDependency,
} from '@/lib/modrinth/types';
import type {
  CfBedrockVersionsResponse,
  CfFile,
  CfFilesResponse,
  CfMod,
  CfModResponse,
  CfSearchResponse,
  CfVersionsResponse,
} from './types';

const JAVA_GAME_ID    = 432;
const BEDROCK_GAME_ID = 78022;

/** Results per page — matches the Modrinth service constant. */
export const PAGE_SIZE = 20;

/** Build a URL for the server-side CurseForge proxy. */
function cfProxy(path: string): string {
  return `/api/curseforge?path=${encodeURIComponent(path)}`;
}

// ─── Internal mappings ────────────────────────────────────────────────────────

const JAVA_CLASS_IDS: Partial<Record<Filters['contentType'], number>> = {
  mod:          6,
  plugin:       5,
  datapack:     6945,
  resourcepack: 12,
  shader:       6552,
};

const BEDROCK_CLASS_IDS: Partial<Record<Filters['contentType'], number>> = {
  addon:          4984,
  map:            6913,
  'texture-pack': 6929,
  script:         6940,
  skin:           6925,
};

function getClassId(source: Source, contentType: Filters['contentType']): number {
  const map = source === 'curseforge-bedrock' ? BEDROCK_CLASS_IDS : JAVA_CLASS_IDS;
  return map[contentType] ?? 0;
}

/**
 * CurseForge modLoaderType integers.
 * Only Fabric and Forge are present in the app's Loader union.
 */
const LOADER_TYPES: Partial<Record<Filters['loader'], number>> = {
  fabric: 4,
  forge:  1,
};

function mapCfModToSearchResult(mod: CfMod) {
  return {
    project_id:  String(mod.id),
    title:       mod.name,
    description: mod.summary,
    icon_url:    mod.logo?.thumbnailUrl ?? null,
    downloads:   mod.downloadCount,
    categories:  mod.categories.map(c => c.name),
    page_url:    mod.links?.websiteUrl,
  };
}

function cfDownloadProxy(url: string): string {
  return `/api/curseforge/download?url=${encodeURIComponent(url)}`;
}

function mapCfFileToModFile(file: CfFile): ModFile {
  return {
    url:      cfDownloadProxy(file.downloadUrl!),
    filename: file.fileName,
    primary:  true,
    size:     file.fileLength,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch available game versions from CurseForge, newest first.
 * Uses the Minecraft Java endpoint for Java edition and the generic game
 * versions endpoint for Bedrock. Throws on network error or non-OK HTTP status.
 */
export async function fetchGameVersions(source: Source): Promise<string[]> {
  if (source === 'curseforge-bedrock') {
    const r = await fetch(cfProxy('/games/78022/versions'));
    if (!r.ok) throw new Error(`CF fetchGameVersions (Bedrock): HTTP ${r.status}`);
    const data: CfBedrockVersionsResponse = await r.json();
    const all = [...new Set(data.data.flatMap(g => g.versions))];
    return all.sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
        if (diff) return diff;
      }
      return 0;
    });
  }
  const r = await fetch(cfProxy('/minecraft/version'));
  if (!r.ok) throw new Error(`CF fetchGameVersions: HTTP ${r.status}`);
  const data: CfVersionsResponse = await r.json();
  return data.data
    .filter(v => /^\d+\.\d+(\.\d+)?$/.test(v.versionString))
    .map(v => v.versionString);
}

/**
 * Search CurseForge mods/content matching the given query and filters.
 * Throws on network error or non-OK HTTP status.
 */
export async function searchProjects(
  query:   string,
  filters: Filters,
  offset:  number,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const params = new URLSearchParams({
    gameId:    String(filters.source === 'curseforge-bedrock' ? BEDROCK_GAME_ID : JAVA_GAME_ID),
    classId:   String(getClassId(filters.source, filters.contentType)),
    index:     String(offset),
    pageSize:  String(PAGE_SIZE),
    sortField: '2', // Popularity
    sortOrder: 'desc',
  });

  if (filters.version) params.set('gameVersion', filters.version);
  if (query)           params.set('searchFilter', query);

  if (filters.contentType === 'mod' && filters.source !== 'curseforge-bedrock') {
    const loaderType = LOADER_TYPES[filters.loader];
    if (loaderType !== undefined) params.set('modLoaderType', String(loaderType));
  }

  const r = await fetch(cfProxy(`/mods/search?${params}`), { signal });
  if (!r.ok) throw new Error(`CF searchProjects: HTTP ${r.status}`);

  const data: CfSearchResponse = await r.json();
  return {
    hits:      data.data.map(mapCfModToSearchResult),
    totalHits: data.pagination.totalCount,
  };
}

/**
 * Resolve the best matching file for a CurseForge mod under the given filters.
 *
 * Returns a typed ResolveResult — never throws:
 *  { ok: true, version }  — file found and downloadUrl is non-null
 *  { ok: false, reason }  — 'no_compatible_version' or inferred failure reason
 */
export async function resolveProjectVersion(
  projectId: string,
  filters:   Filters,
): Promise<ResolveResult> {
  try {
    const params = new URLSearchParams({
      pageSize: '1',
      index:    '0',
    });

    if (filters.version) params.set('gameVersion', filters.version);

    if (filters.contentType === 'mod' && filters.source !== 'curseforge-bedrock') {
      const loaderType = LOADER_TYPES[filters.loader];
      if (loaderType !== undefined) params.set('modLoaderType', String(loaderType));
    }

    const r = await fetch(cfProxy(`/mods/${projectId}/files?${params}`));
    if (!r.ok) {
      if (r.status === 404) return { ok: false, reason: 'not_found' };
      if (r.status === 429) return { ok: false, reason: 'rate_limited' };
      return { ok: false, reason: 'network' };
    }

    const data: CfFilesResponse = await r.json();
    if (!data.data.length) return { ok: false, reason: 'no_compatible_version' };

    const file = data.data[0];
    if (!file.downloadUrl) return { ok: false, reason: 'no_compatible_version' };

    const dependencies: VersionDependency[] = file.dependencies
      .filter(d => d.relationType === 3) // 3 = RequiredDependency
      .map(d => ({
        projectId:      String(d.modId),
        dependencyType: 'required' as const,
      }));

    return {
      ok: true,
      version: {
        versionNumber: String(file.id),
        file:          mapCfFileToModFile(file),
        sizeKb:        file.fileLength ? Math.round(file.fileLength / 1024) : null,
        dependencies,
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Fetch lightweight mod metadata (title + icon) for dependency display.
 * Throws on network error or non-OK HTTP status.
 */
export async function fetchProjectInfo(projectId: string): Promise<ProjectInfo> {
  const r = await fetch(cfProxy(`/mods/${projectId}`));
  if (!r.ok) throw new Error(`CF fetchProjectInfo: HTTP ${r.status}`);
  const data: CfModResponse = await r.json();
  return {
    title:   data.data.name,
    iconUrl: data.data.logo?.thumbnailUrl ?? null,
  };
}
