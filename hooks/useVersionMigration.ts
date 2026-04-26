import { useState, useCallback, useEffect, useRef } from 'react';
import * as modrinthService   from '@/lib/modrinth/service';
import * as curseforgeService from '@/lib/curseforge/service';
import * as pvprpService      from '@/lib/scrapers/pvprp';
import * as optifineService   from '@/lib/scrapers/optifine';
import type { Filters } from '@/lib/modrinth/types';
import type { UseQueueReturn, QueueEntry } from './useQueue';
import type { ModListState } from '@/lib/stateUtils';
import { CURRENT_FORMAT_VERSION } from '@/lib/stateSchema';

function getService(source: string) {
  switch (source) {
    case 'modrinth':  return modrinthService;
    case 'pvprp':     return pvprpService;
    case 'optifine':  return optifineService;
    default:          return curseforgeService;
  }
}

async function runCompatibilityCheck(
  modIds:  string[],
  filters: Filters,
): Promise<{ compatible: number; incompatible: number }> {
  const service = getService(filters.source);
  const CHUNK   = 8;
  let compatible   = 0;
  let incompatible = 0;

  for (let i = 0; i < modIds.length; i += CHUNK) {
    const chunk   = modIds.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map(id => service.resolveProjectVersion(id, filters)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) compatible++;
      else incompatible++;
    }
  }

  return { compatible, incompatible };
}

export type MigrationState =
  | { phase: 'prompt';   sourceVersion: string; modIds: string[] }
  | { phase: 'checking'; sourceVersion: string; modIds: string[] }
  | { phase: 'result';   sourceVersion: string; modIds: string[]; compatible: number; incompatible: number };

export interface UseVersionMigrationReturn {
  migration: MigrationState | null;
  check:     () => Promise<void>;
  confirm:   () => Promise<void>;
  dismiss:   () => void;
}

export function useVersionMigration(
  filters:     Filters,
  queue:       UseQueueReturn,
  restoreMods: (state: ModListState) => Promise<void>,
): UseVersionMigrationReturn {
  const [migration, setMigration] = useState<MigrationState | null>(null);

  // Kept as ref so the version-change effect always reads current entries
  // without adding queue.entries as a dependency (which would fire too often).
  const queueEntriesRef = useRef<QueueEntry[]>(queue.entries);
  queueEntriesRef.current = queue.entries;

  // Detect when version/source/contentType changes while queue has entries
  // that belong to a different version.
  useEffect(() => {
    const mismatch = queueEntriesRef.current.filter(
      e => !e.isDependency &&
           e.filters.source      === filters.source &&
           e.filters.contentType === filters.contentType &&
           e.filters.version     !== filters.version,
    );

    if (mismatch.length === 0) { setMigration(null); return; }

    setMigration({
      phase:         'prompt',
      sourceVersion: mismatch[0].filters.version,
      modIds:        mismatch.map(e => e.id),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.version, filters.source, filters.contentType]);

  // Auto-dismiss when queue is emptied.
  useEffect(() => {
    if (queue.entries.length === 0) setMigration(null);
  }, [queue.entries.length]);

  const check = useCallback(async () => {
    if (!migration || migration.phase !== 'prompt') return;

    const { sourceVersion, modIds } = migration;
    setMigration({ phase: 'checking', sourceVersion, modIds });

    try {
      const result = await runCompatibilityCheck(modIds, filters);
      setMigration({ phase: 'result', sourceVersion, modIds, ...result });
    } catch {
      setMigration({ phase: 'prompt', sourceVersion, modIds });
    }
  }, [migration, filters]);

  const confirm = useCallback(async () => {
    if (!migration) return;

    const state: ModListState = {
      formatVersion: CURRENT_FORMAT_VERSION,
      version:       filters.version,
      source:        filters.source,
      contentType:   filters.contentType,
      mods:          migration.modIds,
      ...(filters.contentType === 'mod'    ? { loader:       filters.loader       ?? 'fabric' } : {}),
      ...(filters.contentType === 'shader' ? { shaderLoader: filters.shaderLoader ?? 'iris'   } : {}),
      ...(filters.contentType === 'plugin' ? { pluginLoader: filters.pluginLoader ?? 'paper'  } : {}),
    };

    setMigration(null);
    await restoreMods(state);
  }, [migration, filters, restoreMods]);

  const dismiss = useCallback(() => setMigration(null), []);

  return { migration, check, confirm, dismiss };
}
