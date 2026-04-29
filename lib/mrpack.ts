import { zip, unzipSync, strFromU8 } from 'fflate';
import type { Loader } from '@/lib/modrinth/types';
import { CURRENT_FORMAT_VERSION, type ModListState } from '@/lib/stateSchema';
import type { QueueEntry } from '@/hooks/useQueue';

const MODRINTH_CDN_RE = /cdn\.modrinth\.com\/data\/([^/]+)\/versions\//;

interface ModrinthIndex {
  game:          string;
  formatVersion: number;
  files:         Array<{ downloads: string[] }>;
  dependencies:  Record<string, string>;
}

interface CurseForgeManifest {
  minecraft: {
    version: string;
    modLoaders: Array<{ id: string; primary?: boolean }>;
    recommendedRam?: number;
  };
  manifestType: string;
  manifestVersion: number;
  name: string;
  version: string;
  author: string;
  files: Array<{
    projectID: number;
    fileID: number;
    required: boolean;
    isLocked: boolean;
  }>;
  overrides?: string;
}

export function isModrinthIndex(raw: unknown): raw is ModrinthIndex {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return (
    o['game'] === 'minecraft' &&
    Array.isArray(o['files']) &&
    typeof o['dependencies'] === 'object' && o['dependencies'] !== null
  );
}

export function isCurseForgeManifest(raw: unknown): raw is CurseForgeManifest {
  if (typeof raw !== 'object' || raw === null) return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o['minecraft'] === 'object' && o['minecraft'] !== null &&
    (o['manifestType'] === 'minecraftModpack') &&
    Array.isArray(o['files'])
  );
}

function inferLoader(modLoaders: CurseForgeManifest['minecraft']['modLoaders']): Loader {
  for (const ml of modLoaders) {
    const id = ml.id.toLowerCase();
    if (id.startsWith('forge'))    return 'forge';
    if (id.startsWith('neoforge')) return 'neoforge';
    if (id.startsWith('fabric'))  return 'fabric';
    if (id.startsWith('quilt'))   return 'quilt';
  }
  return 'fabric';
}

export function fromCurseForgeManifest(manifest: CurseForgeManifest): ModListState {
  const mc = manifest.minecraft;
  const loader = inferLoader(mc.modLoaders);

  const seen = new Set<string>();
  const mods: string[] = [];
  for (const file of manifest.files) {
    const id = String(file.projectID);
    if (!seen.has(id)) {
      seen.add(id);
      mods.push(id);
    }
  }

  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    version:       mc.version,
    source:        'curseforge',
    contentType:   'mod',
    loader,
    mods,
  };
}

export function fromModrinthIndex(index: ModrinthIndex): ModListState | null {
  const deps      = index.dependencies;
  const mcVersion = deps['minecraft'];
  if (!mcVersion) return null;

  const loader: Loader = ('forge' in deps || 'neoforge' in deps) ? 'forge' : 'fabric';

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
    version:       mcVersion,
    source:        'modrinth',
    contentType:   'mod',
    loader,
    mods,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

const LOADER_DEP: Partial<Record<Loader, string>> = {
  fabric:   'fabric-loader',
  forge:    'forge',
  neoforge: 'neoforge',
  quilt:    'quilt-loader',
};

const CONTENT_FOLDER: Partial<Record<string, string>> = {
  mod:          'mods',
  resourcepack: 'resourcepacks',
  shader:       'shaderpacks',
  datapack:     'datapacks',
  plugin:       'plugins',
};

export async function downloadMrpack(
  entries: QueueEntry[],
  version: string,
  loader:  Loader,
): Promise<void> {
  const files = entries
    .filter(e => e.filters.source === 'modrinth' && e.resolved?.file.hashes)
    .map(e => ({
      path:      `${CONTENT_FOLDER[e.filters.contentType] ?? 'mods'}/${e.resolved!.file.filename}`,
      hashes:    e.resolved!.file.hashes!,
      env:       { client: 'required' as const, server: 'required' as const },
      downloads: [e.resolved!.file.url],
      fileSize:  e.resolved!.file.size,
    }));

  const deps: Record<string, string> = { minecraft: version };
  const loaderKey = LOADER_DEP[loader];
  if (loaderKey) deps[loaderKey] = '*';

  const manifest = {
    formatVersion: 1,
    game:          'minecraft',
    versionId:     '1.0.0',
    name:          `Modpack ${version}`,
    files,
    dependencies:  deps,
  };

  const enc  = new TextEncoder();
  const json = enc.encode(JSON.stringify(manifest, null, 2));
  const zippable = { 'modrinth.index.json': [json, { level: 0 }] } as Record<string, [Uint8Array, { level: 0 }]>;

  const data = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zippable, (err, d) => (err ? reject(err) : resolve(d)));
  });

  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/zip' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `modpack-${version}.mrpack`,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export async function readMrpackFile(file: File): Promise<ModListState> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const archive = unzipSync(bytes);
    const indexBytes = archive['modrinth.index.json'];
    if (!indexBytes) {
      throw new Error('Unsupported format. Expected ModListState v1/v2 or compatible aliases. Detail: modrinth.index.json missing');
    }

    const parsed = JSON.parse(strFromU8(indexBytes));
    if (!isModrinthIndex(parsed)) {
      throw new Error('Unsupported format. Expected ModListState v1/v2 or compatible aliases. Detail: invalid modrinth.index.json');
    }

    const state = fromModrinthIndex(parsed);
    if (!state) throw new Error('No Modrinth CDN files found in the index.');
    return state;
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Unsupported format.') || error.message === 'No Modrinth CDN files found in the index.')) {
      throw error;
    }
    throw new Error('Invalid JSON.');
  }
}
