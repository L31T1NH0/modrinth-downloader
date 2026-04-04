import * as LZString from 'lz-string';
import type { Source, ContentType, Loader, ShaderLoader, PluginLoader } from '@/lib/modrinth/types';

// ─── Data model ───────────────────────────────────────────────────────────────

interface ModListStateV1 {
  formatVersion: 1;
  version:       string;   // MC version e.g. "1.20.1"
  loader:        string;   // "fabric" | "forge"
  source:        Source;   // "modrinth" | "curseforge" | "curseforge-bedrock"
  mods:          string[]; // project IDs — non-dependency entries only
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
}

export type ModListState = ModListStateV2;

const CURRENT_FORMAT_VERSION = 2;

/**
 * Conservative limit for the encoded ?data= payload.
 * Keeps the full URL within ~8 KB, which is safe across all major browsers.
 */
const MAX_ENCODED_URL_LENGTH = 8000;

// ─── Modrinth index format (.mrpack) ─────────────────────────────────────────

const MODRINTH_CDN_RE = /cdn\.modrinth\.com\/data\/([^/]+)\/versions\//;

interface ModrinthIndex {
  game:         string;
  formatVersion: number;
  files:        Array<{ downloads: string[] }>;
  dependencies: Record<string, string>;
}

function isModrinthIndex(raw: unknown): raw is ModrinthIndex {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return (
    o['game'] === 'minecraft' &&
    Array.isArray(o['files']) &&
    typeof o['dependencies'] === 'object' && o['dependencies'] !== null
  );
}

function fromModrinthIndex(index: ModrinthIndex): ModListState | null {
  const deps = index.dependencies;
  const mcVersion = deps['minecraft'];
  if (!mcVersion) return null;

  let loader = 'fabric';
  if ('forge' in deps || 'neoforge' in deps) loader = 'forge';

  const seen = new Set<string>();
  const mods: string[] = [];
  for (const file of index.files) {
    for (const url of file.downloads) {
      const m = MODRINTH_CDN_RE.exec(url);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        mods.push(m[1]);
      }
    }
  }

  if (mods.length === 0) return null;

  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    version: mcVersion,
    source: 'modrinth',
    contentType: 'mod',
    loader: loader as Loader,
    mods,
  };
}

// ─── Validation & migration ───────────────────────────────────────────────────

/**
 * Validates and migrates any supported schema version to the current schema.
 *
 * Supported payloads by schema version:
 * - schema v1 (formatVersion: 1):
 *   - Custom ModListState payloads only.
 *   - source: "modrinth" | "curseforge" | "curseforge-bedrock".
 * - schema v2 (formatVersion: 2):
 *   - Custom ModListState payloads only.
 *   - source: "modrinth" | "curseforge" | "curseforge-bedrock".
 *
 * Related import format support:
 * - Modrinth index files (.mrpack index JSON) are validated separately via
 *   `isModrinthIndex` / `fromModrinthIndex` and always map to source "modrinth".
 *
 * Returns null for unknown schema versions or structurally invalid payloads.
 * Use `migrateWithDetails` when a caller needs a structured failure reason.
 */
function migrate(raw: unknown): ModListState | null {
  const result = migrateWithDetails(raw);
  return result.state;
}

function migrateWithDetails(raw: unknown): { state: ModListState | null; error?: string } {
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
    if (typeof obj.loader !== 'string') return { state: null, error: 'v1 requires "loader" as string' };
    if (typeof obj.source !== 'string') return { state: null, error: 'v1 requires "source" as string' };
    if (!(obj.source === 'modrinth' || obj.source === 'curseforge' || obj.source === 'curseforge-bedrock')) {
      return { state: null, error: `v1 has unsupported "source": ${String(obj.source)}` };
    }
    if (!Array.isArray(obj.mods)) return { state: null, error: 'v1 requires "mods" as string[]' };
    if (!(obj.mods as unknown[]).every(m => typeof m === 'string')) {
      return { state: null, error: 'v1 "mods" must contain only strings' };
    }

    {
      const v1 = obj as unknown as ModListStateV1;
      const loader = v1.loader === 'forge' ? 'forge' : 'fabric';
      return { state: {
        formatVersion: CURRENT_FORMAT_VERSION,
        version: v1.version,
        source: v1.source,
        contentType: 'mod',
        loader,
        mods: v1.mods,
      } };
    }
  }

  if (obj.formatVersion === 2) {
    const contentType = obj.contentType;
    if (typeof obj.version !== 'string') return { state: null, error: 'v2 requires "version" as string' };
    if (typeof obj.source !== 'string') return { state: null, error: 'v2 requires "source" as string' };
    if (!(obj.source === 'modrinth' || obj.source === 'curseforge' || obj.source === 'curseforge-bedrock')) {
      return { state: null, error: `v2 has unsupported "source": ${String(obj.source)}` };
    }
    if (typeof contentType !== 'string') return { state: null, error: 'v2 requires "contentType" as string' };
    if (!['mod', 'plugin', 'datapack', 'resourcepack', 'shader', 'addon', 'map', 'texture-pack', 'script', 'skin'].includes(contentType)) {
      return { state: null, error: `v2 has unsupported "contentType": ${String(contentType)}` };
    }
    if (!Array.isArray(obj.mods)) return { state: null, error: 'v2 requires "mods" as string[]' };
    if (!(obj.mods as unknown[]).every(m => typeof m === 'string')) {
      return { state: null, error: 'v2 "mods" must contain only strings' };
    }

    {
      const base: ModListState = {
        formatVersion: CURRENT_FORMAT_VERSION,
        version: obj.version,
        source: obj.source as Source,
        contentType: contentType as ContentType,
        mods: obj.mods as string[],
      };

      if (contentType === 'mod') {
        return { state: {
          ...base,
          loader: obj.loader === 'forge' ? 'forge' : 'fabric',
        } };
      }
      if (contentType === 'shader') {
        const shaderLoader = obj.shaderLoader === 'optifine' ? 'optifine' : 'iris';
        return { state: { ...base, shaderLoader } };
      }
      if (contentType === 'plugin') {
        const pluginLoader =
          obj.pluginLoader === 'bukkit' || obj.pluginLoader === 'spigot' || obj.pluginLoader === 'paper'
            ? obj.pluginLoader
            : 'paper';
        return { state: { ...base, pluginLoader } };
      }
      return { state: base };
    }
  }

  // Unknown schema version — refuse rather than silently misinterpret
  if (obj.formatVersion === undefined) {
    return { state: null, error: 'missing "formatVersion" and unable to infer v2' };
  }
  return { state: null, error: `unsupported "formatVersion": ${String(obj.formatVersion)}` };
}

// ─── Encode / decode ──────────────────────────────────────────────────────────

export function encodeState(state: ModListState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
}

export function decodeState(encoded: string): ModListState | null {
  try {
    const raw = LZString.decompressFromEncodedURIComponent(encoded);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

// ─── Share URL ────────────────────────────────────────────────────────────────

/**
 * Returns the full share URL, or null if the encoded payload exceeds the safe
 * URL length. Callers should surface a "list too large — use Export" message.
 */
export function buildShareUrl(state: ModListState): string | null {
  const encoded = encodeState(state);
  if (encoded.length > MAX_ENCODED_URL_LENGTH) return null;
  return `${window.location.origin}${window.location.pathname}?data=${encoded}`;
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

/** Triggers a browser download of the state as a formatted .json file. */
export function downloadJSON(state: ModListState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `modlist-${state.version}-${state.loader}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reads a File object, parses it as JSON, and validates it as a ModListState.
 * Rejects with a descriptive Error on any failure so callers can surface a
 * user-facing message without inspecting error types.
 */
export function readJSONFile(file: File): Promise<ModListState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (isModrinthIndex(parsed)) {
          const state = fromModrinthIndex(parsed);
          if (!state) { reject(new Error('No Modrinth CDN files found in index')); return; }
          resolve(state);
          return;
        }
        const migrated = migrateWithDetails(parsed);
        if (!migrated.state) {
          reject(
            new Error(
              `Formato não suportado. Esperado: ModListState v1/v2 (ou aliases compatíveis: projects/mods, mcVersion/version). Detalhe: ${migrated.error ?? 'estrutura inválida'}`,
            ),
          );
          return;
        }
        resolve(migrated.state);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsText(file);
  });
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/** Constructs a ModListState from the current UI context. */
export function buildExportState(
  version: string,
  source:  Source,
  contentType: ContentType,
  modIds:  string[],
  context?: {
    loader?: Loader;
    shaderLoader?: ShaderLoader | null;
    pluginLoader?: PluginLoader | null;
  },
): ModListState {
  const state: ModListState = {
    formatVersion: CURRENT_FORMAT_VERSION,
    version,
    source,
    contentType,
    mods: modIds,
  };
  if (contentType === 'mod') {
    state.loader = context?.loader ?? 'fabric';
  } else if (contentType === 'shader' && context?.shaderLoader) {
    state.shaderLoader = context.shaderLoader;
  } else if (contentType === 'plugin' && context?.pluginLoader) {
    state.pluginLoader = context.pluginLoader;
  }
  return state;
}
