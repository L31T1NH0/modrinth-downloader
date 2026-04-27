import { useState, useRef, useCallback } from 'react';
import * as modrinthService   from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import type { Filters, Loader, PluginLoader, ShaderLoader } from '@/lib/modrinth/types';
import type { UseQueueReturn } from './useQueue';
import type { ModListState, ContentGroup } from '@/lib/stateUtils';

// ─── Concurrency helper ───────────────────────────────────────────────────────

/**
 * Maximum number of simultaneous fetchProjectInfo requests during restoration.
 * Balances speed against API rate-limiting and client-side memory pressure.
 * Large lists are processed in rolling windows of this size rather than all at once.
 */
const FETCH_CONCURRENCY = 5;

/**
 * Runs `fn` on each item with at most `limit` concurrent executions.
 * Returns results in input order, equivalent in shape to Promise.allSettled.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn:    (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx], idx) };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  // Spawn `limit` workers (or fewer if the list is smaller)
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

const VALID_MOD_LOADERS = new Set<Loader>(['fabric', 'forge', 'neoforge', 'quilt']);
const VALID_SHADER_LOADERS = new Set<ShaderLoader>(['iris', 'optifine']);
const VALID_PLUGIN_LOADERS = new Set<PluginLoader>(
  ['bukkit', 'spigot', 'paper', 'purpur', 'folia', 'velocity', 'bungeecord', 'sponge'],
);

function normalizeModLoader(loader: unknown): Loader {
  return VALID_MOD_LOADERS.has(loader as Loader) ? loader as Loader : 'fabric';
}

function normalizeShaderLoader(loader: unknown): ShaderLoader {
  return VALID_SHADER_LOADERS.has(loader as ShaderLoader) ? loader as ShaderLoader : 'iris';
}

function normalizePluginLoader(loader: unknown): PluginLoader {
  return VALID_PLUGIN_LOADERS.has(loader as PluginLoader) ? loader as PluginLoader : 'paper';
}

function buildGroupFilters(state: ModListState, group: ContentGroup): Filters {
  const contentType = group.contentType;
  return {
    source:       state.source,
    version:      state.version,
    contentType,
    loader:       normalizeModLoader(group.loader ?? state.loader),
    shaderLoader: contentType === 'shader'
      ? normalizeShaderLoader(group.shaderLoader ?? state.shaderLoader)
      : null,
    pluginLoader: contentType === 'plugin'
      ? normalizePluginLoader(group.pluginLoader ?? group.loader ?? state.pluginLoader ?? state.loader)
      : null,
    sortIndex:  'relevance',
    clientSide: false,
    serverSide: false,
  };
}

function normalizeGroups(state: ModListState): ContentGroup[] {
  if (Array.isArray(state.groups) && state.groups.length > 0) {
    return state.groups.filter(g => Array.isArray(g.mods) && g.mods.length > 0);
  }
  if (Array.isArray(state.mods) && state.mods.length > 0) {
    return [{
      contentType:   state.contentType,
      loader:        state.loader,
      shaderLoader:  state.shaderLoader,
      pluginLoader:  state.pluginLoader,
      mods:          state.mods,
    }];
  }
  return [];
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseRestoreModsReturn {
  isRestoring: boolean;
  /** null = no restore attempted yet; 0 = all succeeded; >0 = partial failure */
  failedCount: number | null;
  restoreMods: (state: ModListState) => Promise<void>;
}

export function useRestoreMods(
  queue:      UseQueueReturn,
  setFilters: React.Dispatch<React.SetStateAction<Filters>>,
): UseRestoreModsReturn {
  const [isRestoring, setIsRestoring] = useState(false);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const inProgressRef = useRef(false); // prevents overlapping restore calls

  const restoreMods = useCallback(async (state: ModListState) => {
    if (inProgressRef.current) return;
    inProgressRef.current = true;

    let totalItems = 0;

    try {
      const groups = normalizeGroups(state);
      const groupsWithFilters = groups.map(group => ({
        mods:    group.mods,
        filters: buildGroupFilters(state, group),
      }));

      const restoredFilters: Filters = groupsWithFilters[0]?.filters ?? {
        source:       state.source,
        version:      state.version,
        contentType:  state.contentType,
        loader:       normalizeModLoader(state.loader),
        shaderLoader: state.contentType === 'shader' ? normalizeShaderLoader(state.shaderLoader) : null,
        pluginLoader: state.contentType === 'plugin' ? normalizePluginLoader(state.pluginLoader ?? state.loader) : null,
        sortIndex:    'relevance',
        clientSide:   false,
        serverSide:   false,
      };

      const restoreItems = groupsWithFilters.flatMap(group =>
        group.mods.map(id => ({ id, filters: group.filters })),
      );
      totalItems = restoreItems.length;

      // Apply filters and clear queue before starting async work so the UI
      // immediately reflects the new context even while metadata is loading.
      setFilters(restoredFilters);
      queue.clear();
      setIsRestoring(true);
      setFailedCount(null);

      if (restoreItems.length === 0) {
        setFailedCount(0);
        setIsRestoring(false);
        return;
      }

      const results = await mapWithConcurrency(
        restoreItems,
        FETCH_CONCURRENCY,
        item => {
          const service = item.filters.source === 'modrinth' ? modrinthService : curseforgeService;
          return service.fetchProjectInfo(item.id);
        },
      );

      let failed = 0;
      results.forEach((result, i) => {
        const item = restoreItems[i];
        if (result.status === 'fulfilled') {
          const { title, iconUrl } = result.value;
          // queue.add deduplicates by canonical queue key (id + filter snapshot).
          queue.add(item.id, title, iconUrl, item.filters);
        } else {
          failed++;
        }
      });

      setFailedCount(failed);
      setIsRestoring(false);
    } catch {
      setIsRestoring(false);
      setFailedCount(prev => prev ?? totalItems);
    } finally {
      inProgressRef.current = false;
    }
  }, [queue, setFilters]);

  return { isRestoring, failedCount, restoreMods };
}
