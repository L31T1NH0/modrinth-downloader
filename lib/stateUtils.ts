import * as LZString from 'lz-string';
import type { ContentType, Loader, PluginLoader, ShaderLoader, Source } from '@/lib/modrinth/types';
import {
  migrate, migrateWithDetails,
  CURRENT_FORMAT_VERSION,
  type ModListState,
} from '@/lib/stateSchema';
import { isModrinthIndex, fromModrinthIndex, readMrpackFile } from '@/lib/mrpack';

// Re-export the canonical state type so callers don't need to know about stateSchema.
export type { ModListState, ModListStateV2, ContentGroup } from '@/lib/stateSchema';

const MAX_ENCODED_URL_LENGTH = 8000;

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
    download: `modlist-${state.version}-${state.loader ?? state.shaderLoader ?? state.pluginLoader ?? state.contentType}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Reads a File object and resolves to a valid ModListState.
 * Supports: custom JSON (v1/v2), Modrinth .mrpack index.
 * Rejects with a descriptive Error on any failure.
 */
export function readJSONFile(file: File): Promise<ModListState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target?.result as string);

        if (isModrinthIndex(parsed)) {
          const state = fromModrinthIndex(parsed);
          if (!state) { reject(new Error('No Modrinth CDN files found in the index.')); return; }
          resolve(state);
          return;
        }

        const migrated = migrateWithDetails(parsed, { autoCorrectInvalidPair: true });
        if (!migrated.state) {
          reject(new Error(
            `Unsupported format. Expected ModListState v1/v2 or compatible aliases. Detail: ${migrated.error ?? 'invalid structure'}`,
          ));
          return;
        }
        if (migrated.warning) console.warn(`[readJSONFile] ${migrated.warning}`);
        resolve(migrated.state);
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    };
    reader.onerror = () => reject(new Error('File read failed.'));
    reader.readAsText(file);
  });
}

export function readStateFile(file: File): Promise<ModListState> {
  const isMrpack = /\.mrpack$/i.test(file.name);
  if (isMrpack) return readMrpackFile(file);
  return readJSONFile(file);
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Constructs a ModListState that supports mixed content types.
 * When all entries share a single type, the output is identical to buildExportState (no `groups`).
 * When entries span multiple types, adds a `groups` array so the mod can route each type correctly.
 */
export function buildExportStateMulti(
  version: string,
  source:  Source,
  groups:  Array<{
    contentType:   ContentType;
    loader?:       Loader;
    shaderLoader?: ShaderLoader | null;
    pluginLoader?: PluginLoader | null;
    mods:          string[];
  }>,
): ModListState {
  const nonEmpty = groups.filter(g => g.mods.length > 0);

  if (nonEmpty.length === 0) {
    return buildExportState(version, source, 'mod', [], {});
  }

  if (nonEmpty.length === 1) {
    const g = nonEmpty[0];
    return buildExportState(version, source, g.contentType, g.mods, {
      loader:       g.loader,
      shaderLoader: g.shaderLoader ?? undefined,
      pluginLoader: g.pluginLoader ?? undefined,
    });
  }

  // Multiple groups: top-level fields mirror the first group for backward compat with old clients.
  // New clients (mod v3.19+) read `groups` and route each type to its correct directory.
  const first = nonEmpty[0];
  const state: ModListState = {
    formatVersion: CURRENT_FORMAT_VERSION,
    version,
    source,
    contentType: first.contentType,
    mods: first.mods,
    groups: nonEmpty.map(g => {
      const group: import('@/lib/stateSchema').ContentGroup = {
        contentType: g.contentType,
        mods: g.mods,
      };
      if (g.contentType === 'mod'    && g.loader)       group.loader       = g.loader;
      if (g.contentType === 'shader' && g.shaderLoader) group.shaderLoader = g.shaderLoader;
      if (g.contentType === 'plugin' && g.pluginLoader) group.pluginLoader = g.pluginLoader;
      return group;
    }),
  };

  if (first.contentType === 'mod')    state.loader       = first.loader ?? 'fabric';
  if (first.contentType === 'shader') state.shaderLoader = first.shaderLoader ?? 'iris';
  if (first.contentType === 'plugin') state.pluginLoader = first.pluginLoader ?? 'paper';

  return state;
}

/** Constructs a ModListState from the current UI context. */
export function buildExportState(
  version:     string,
  source:      Source,
  contentType: ContentType,
  modIds:      string[],
  context?: {
    loader?:       Loader;
    shaderLoader?: ShaderLoader | null;
    pluginLoader?: PluginLoader | null;
  },
): ModListState {
  const state: ModListState = {
    formatVersion: CURRENT_FORMAT_VERSION,
    version, source, contentType, mods: modIds,
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
