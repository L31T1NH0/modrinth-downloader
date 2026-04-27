import type { ContentType, Loader, PluginLoader, ShaderLoader, Source } from '@/lib/modrinth/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModListStateV1 {
  formatVersion: 1;
  version:       string;
  loader:        string;
  source:        Source;
  mods:          string[];
}

export interface ContentGroup {
  contentType:   ContentType;
  loader?:       Loader;
  shaderLoader?: ShaderLoader;
  pluginLoader?: PluginLoader;
  mods:          string[];
}

export interface ModListStateV2 {
  formatVersion: 2;
  version:       string;
  source:        Source;
  contentType:   ContentType;
  loader?:       Loader;
  shaderLoader?: ShaderLoader;
  pluginLoader?: PluginLoader;
  mods:          string[];
  groups?:       ContentGroup[];
}

export type ModListState = ModListStateV2;

export const CURRENT_FORMAT_VERSION = 2;

const CONTENT_TYPE_COMPATIBILITY: Record<ContentType, Source[]> = {
  mod:            ['modrinth', 'curseforge'],
  plugin:         ['modrinth', 'curseforge'],
  datapack:       ['modrinth', 'curseforge'],
  resourcepack:   ['modrinth', 'curseforge'],
  shader:         ['modrinth', 'curseforge'],
  addon:          ['curseforge-bedrock'],
  map:            ['curseforge-bedrock'],
  'texture-pack': ['curseforge-bedrock'],
  script:         ['curseforge-bedrock'],
  skin:           ['curseforge-bedrock'],
};

const VALID_CONTENT_TYPES = new Set<ContentType>(Object.keys(CONTENT_TYPE_COMPATIBILITY) as ContentType[]);
const VALID_LOADERS = new Set<Loader>(['fabric', 'forge', 'neoforge', 'quilt']);
const VALID_PLUGIN_LOADERS = new Set<PluginLoader>(
  ['bukkit', 'spigot', 'paper', 'purpur', 'folia', 'velocity', 'bungeecord', 'sponge'],
);

function normalizeGroups(groups: unknown, source: Source): { groups?: ContentGroup[]; error?: string } {
  if (groups === undefined) return {};
  if (!Array.isArray(groups)) return { error: 'v2 "groups" must be ContentGroup[] when present' };

  const normalized: ContentGroup[] = [];

  for (let i = 0; i < groups.length; i++) {
    const rawGroup = groups[i];
    if (typeof rawGroup !== 'object' || rawGroup === null) {
      return { error: `v2 "groups"[${i}] must be an object` };
    }

    const group = rawGroup as Record<string, unknown>;
    if (typeof group.contentType !== 'string' || !VALID_CONTENT_TYPES.has(group.contentType as ContentType)) {
      return { error: `v2 "groups"[${i}] has unsupported "contentType": ${String(group.contentType)}` };
    }

    if (!Array.isArray(group.mods) || !(group.mods as unknown[]).every(mod => typeof mod === 'string')) {
      return { error: `v2 "groups"[${i}] requires "mods" as string[]` };
    }

    const contentType = group.contentType as ContentType;
    const allowedSources = CONTENT_TYPE_COMPATIBILITY[contentType];
    if (!allowedSources.includes(source)) {
      return {
        error: `v2 "groups"[${i}] invalid combination: source="${source}" + contentType="${contentType}". Allowed: ${allowedSources.join(', ')}`,
      };
    }

    const normalizedGroup: ContentGroup = {
      contentType,
      mods: group.mods as string[],
    };

    if (contentType === 'mod') {
      normalizedGroup.loader = VALID_LOADERS.has(group.loader as Loader) ? group.loader as Loader : 'fabric';
    }
    if (contentType === 'shader') {
      normalizedGroup.shaderLoader = group.shaderLoader === 'optifine' ? 'optifine' : 'iris';
    }
    if (contentType === 'plugin') {
      normalizedGroup.pluginLoader = VALID_PLUGIN_LOADERS.has(group.pluginLoader as PluginLoader)
        ? group.pluginLoader as PluginLoader
        : 'paper';
    }

    normalized.push(normalizedGroup);
  }

  return normalized.length > 0 ? { groups: normalized } : {};
}

// ─── Validation & migration ───────────────────────────────────────────────────

export function migrate(raw: unknown): ModListState | null {
  return migrateWithDetails(raw).state;
}

export function migrateWithDetails(
  raw:      unknown,
  options?: { autoCorrectInvalidPair?: boolean },
): { state: ModListState | null; error?: string; warning?: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { state: null, error: 'payload must be a JSON object' };
  }

  const obj = { ...(raw as Record<string, unknown>) };

  // Normalize common aliases before explicit version blocks.
  if (!Array.isArray(obj.mods) && Array.isArray(obj.projects)) obj.mods = obj.projects;
  if (typeof obj.version !== 'string' && typeof obj.mcVersion === 'string') obj.version = obj.mcVersion;
  if (obj.contentType === undefined) obj.contentType = 'mod';

  // Infer v2 when formatVersion is omitted but core keys are present.
  if (
    obj.formatVersion === undefined &&
    typeof obj.version === 'string' &&
    typeof obj.source === 'string' &&
    Array.isArray(obj.mods) &&
    (obj.contentType === undefined || typeof obj.contentType === 'string')
  ) {
    obj.formatVersion = 2;
  }

  if (obj.formatVersion === 1) {
    if (typeof obj.version !== 'string') return { state: null, error: 'v1 requires "version" as string' };
    if (typeof obj.loader  !== 'string') return { state: null, error: 'v1 requires "loader" as string' };
    if (typeof obj.source  !== 'string') return { state: null, error: 'v1 requires "source" as string' };
    if (!(obj.source === 'modrinth' || obj.source === 'curseforge' || obj.source === 'curseforge-bedrock')) {
      return { state: null, error: `v1 has unsupported "source": ${String(obj.source)}` };
    }
    if (!Array.isArray(obj.mods)) return { state: null, error: 'v1 requires "mods" as string[]' };
    if (!(obj.mods as unknown[]).every(m => typeof m === 'string')) {
      return { state: null, error: 'v1 "mods" must contain only strings' };
    }
    const v1     = obj as unknown as ModListStateV1;
    const loader: Loader = v1.loader === 'forge' ? 'forge' : 'fabric';
    return { state: {
      formatVersion: CURRENT_FORMAT_VERSION,
      version: v1.version, source: v1.source, contentType: 'mod', loader, mods: v1.mods,
    } };
  }

  if (obj.formatVersion === 2) {
    const contentType = obj.contentType;
    if (typeof obj.version     !== 'string') return { state: null, error: 'v2 requires "version" as string' };
    if (typeof obj.source      !== 'string') return { state: null, error: 'v2 requires "source" as string' };
    if (!(obj.source === 'modrinth' || obj.source === 'curseforge' || obj.source === 'curseforge-bedrock')) {
      return { state: null, error: `v2 has unsupported "source": ${String(obj.source)}` };
    }
    if (typeof contentType !== 'string') return { state: null, error: 'v2 requires "contentType" as string' };
    if (!VALID_CONTENT_TYPES.has(contentType as ContentType)) {
      return { state: null, error: `v2 has unsupported "contentType": ${String(contentType)}` };
    }
    if (!Array.isArray(obj.mods)) return { state: null, error: 'v2 requires "mods" as string[]' };
    if (!(obj.mods as unknown[]).every(m => typeof m === 'string')) {
      return { state: null, error: 'v2 "mods" must contain only strings' };
    }

    const source = obj.source as Source;
    let normalizedContentType = contentType as ContentType;
    const allowedSources = CONTENT_TYPE_COMPATIBILITY[normalizedContentType];
    if (!allowedSources.includes(source)) {
      const pair = `source="${source}" + contentType="${String(contentType)}"`;
      if (options?.autoCorrectInvalidPair) {
        normalizedContentType = 'mod';
        const fallbackAllowedSources = CONTENT_TYPE_COMPATIBILITY[normalizedContentType];
        if (!fallbackAllowedSources.includes(source)) {
          return {
            state: null,
            error: `v2 invalid combination: ${pair}; fallback contentType="mod" is not supported for source="${source}"`,
          };
        }
        return {
          state: {
            formatVersion: CURRENT_FORMAT_VERSION,
            version: obj.version, source, contentType: normalizedContentType,
            loader: (['fabric', 'forge', 'neoforge', 'quilt'] as const).includes(obj.loader as Loader) ? obj.loader as Loader : 'fabric',
            mods: obj.mods as string[],
          },
          warning: `Par inválido ${pair}. Autocorreção aplicada para contentType="mod".`,
        };
      }
      return {
        state: null,
        error: `v2 invalid combination: ${pair}. Allowed for "${String(contentType)}": ${allowedSources.join(', ')}`,
      };
    }

    const base: ModListState = {
      formatVersion: CURRENT_FORMAT_VERSION,
      version: obj.version, source, contentType: normalizedContentType, mods: obj.mods as string[],
    };

    const normalizedGroups = normalizeGroups(obj.groups, source);
    if (normalizedGroups.error) return { state: null, error: normalizedGroups.error };
    if (normalizedGroups.groups) base.groups = normalizedGroups.groups;

    if (normalizedContentType === 'mod') {
      const loader: Loader = VALID_LOADERS.has(obj.loader as Loader) ? obj.loader as Loader : 'fabric';
      return { state: { ...base, loader } };
    }
    if (normalizedContentType === 'shader') {
      return { state: { ...base, shaderLoader: obj.shaderLoader === 'optifine' ? 'optifine' : 'iris' } };
    }
    if (normalizedContentType === 'plugin') {
      const pluginLoader: PluginLoader = VALID_PLUGIN_LOADERS.has(obj.pluginLoader as PluginLoader) ? obj.pluginLoader as PluginLoader : 'paper';
      return { state: { ...base, pluginLoader } };
    }
    return { state: base };
  }

  if (obj.formatVersion === undefined) {
    return { state: null, error: 'missing "formatVersion" and unable to infer v2' };
  }
  return { state: null, error: `unsupported "formatVersion": ${String(obj.formatVersion)}` };
}
