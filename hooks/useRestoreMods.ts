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
  /** Number of items processed so far (including pending in current batch) */
  processedCount: number;
  /** Total number of items to process */
  totalCount: number;
  /** Whether restoration is paused waiting for rate limit */
  isPaused: boolean;
  /** Seconds remaining until restoration can continue */
  pauseSecondsRemaining: number;
  restoreMods: (state: ModListState) => Promise<void>;
}

export function useRestoreMods(
  queue:      UseQueueReturn,
  setFilters: React.Dispatch<React.SetStateAction<Filters>>,
): UseRestoreModsReturn {
  const [isRestoring, setIsRestoring] = useState(false);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseSecondsRemaining, setPauseSecondsRemaining] = useState(0);
  const inProgressRef = useRef(false);
  const pauseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldPauseRef = useRef(false);

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

      setFilters(restoredFilters);
      queue.clear();
      setIsRestoring(true);
      setFailedCount(null);
      setTotalCount(totalItems);
      setProcessedCount(0);
      setIsPaused(false);
      setPauseSecondsRemaining(0);
      shouldPauseRef.current = false;

      if (restoreItems.length === 0) {
        setFailedCount(0);
        setIsRestoring(false);
        return;
      }

      const BATCH_SIZE = 20;
      const BATCH_LIMIT = 120;
      const PAUSE_SECONDS = 60;
      let failed = 0;
      let processed = 0;

      for (let i = 0; i < restoreItems.length; i += BATCH_SIZE) {
        if (shouldPauseRef.current) {
          setIsPaused(true);
          
          for (let sec = PAUSE_SECONDS; sec > 0; sec--) {
            setPauseSecondsRemaining(sec);
            await new Promise(r => setTimeout(r, 1000));
          }
          
          setIsPaused(false);
          setPauseSecondsRemaining(0);
          shouldPauseRef.current = false;
        }

        const batch = restoreItems.slice(i, i + BATCH_SIZE);
        const results = await mapWithConcurrency(
          batch,
          FETCH_CONCURRENCY,
          item => {
            const service = item.filters.source === 'modrinth' ? modrinthService : curseforgeService;
            return service.fetchProjectInfo(item.id);
          },
        );

        results.forEach((result, idx) => {
          const item = batch[idx];
          if (result.status === 'fulfilled') {
            const { title, iconUrl } = result.value;
            queue.add(item.id, title, iconUrl, item.filters);
          } else {
            failed++;
          }
        });

        processed += batch.length;
        setProcessedCount(processed);

        if (processed >= BATCH_LIMIT && i + BATCH_SIZE < restoreItems.length) {
          shouldPauseRef.current = true;
        }

        if (i + BATCH_SIZE < restoreItems.length && !shouldPauseRef.current) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      setFailedCount(failed);
      setIsRestoring(false);
    } catch {
      setIsRestoring(false);
      setFailedCount(prev => prev ?? totalItems);
    } finally {
      inProgressRef.current = false;
    }
  }, [queue, setFilters]);

  return { isRestoring, failedCount, processedCount, totalCount, isPaused, pauseSecondsRemaining, restoreMods };
}
