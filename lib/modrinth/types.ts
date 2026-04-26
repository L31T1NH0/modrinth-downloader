// ─── Filter domain ────────────────────────────────────────────────────────────

export type Source       = 'modrinth' | 'curseforge' | 'curseforge-bedrock' | 'pvprp' | 'optifine';
export type Loader       = 'fabric' | 'forge';
export type ShaderLoader = 'iris' | 'optifine';
export type PluginLoader = 'bukkit' | 'spigot' | 'paper';
export type ContentType  =
  | 'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'shader'  // Java / Modrinth
  | 'addon' | 'map' | 'texture-pack' | 'script' | 'skin';      // Bedrock (CurseForge)

/**
 * Single source of truth for all active filters.
 * Every operation — search, load-more, version resolution, queue display —
 * reads from a snapshot of this object so they can never diverge.
 *
 * Fields are always present; irrelevant ones are ignored by the service
 * based on `contentType` (e.g. `loader` is ignored unless contentType==='mod').
 */
export interface Filters {
  source:       Source;
  version:      string;
  contentType:  ContentType;
  loader:       Loader;              // applied when contentType === 'mod'
  shaderLoader: ShaderLoader | null; // applied when contentType === 'shader'
  pluginLoader: PluginLoader | null; // applied when contentType === 'plugin'
}

// ─── API response shapes ──────────────────────────────────────────────────────

/** One project returned by the Modrinth search API. */
export interface SearchResult {
  project_id:  string;
  title:       string;
  description: string;
  icon_url:    string | null;
  downloads:   number;
  categories:  string[];
  page_url?:   string;
}

/** A downloadable file attached to a project version. */
export interface ModFile {
  url:      string;
  filename: string;
  primary:  boolean;
  size:     number;
}

/** A dependency declared by a project version. */
export interface VersionDependency {
  projectId:      string;
  dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded';
}

// ─── Service return types ─────────────────────────────────────────────────────

/** A page of search results with the server-reported total. */
export interface SearchPage {
  hits:      SearchResult[];
  totalHits: number;
}

/** The resolved version info for a project ready to be queued. */
export interface ResolvedVersion {
  versionNumber: string;
  file:          ModFile;
  sizeKb:        number | null;
  dependencies:  VersionDependency[];
}

/** Basic project metadata used when resolving dependency display info. */
export interface ProjectInfo {
  title:   string;
  iconUrl: string | null;
}

export type FailureReason =
  | 'network'
  | 'not_found'
  | 'rate_limited';

/**
 * Discriminated union returned by `resolveProjectVersion`.
 * Using a typed result (instead of throwing) for predictable failure modes
 * so callers can express resolution logic without try/catch.
 */
export type ResolveResult =
  | { ok: true;  version: ResolvedVersion }
  | { ok: false; reason: 'no_compatible_version' | FailureReason };
