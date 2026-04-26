import type { ComponentType, SVGProps } from 'react';
import type { ContentType, Filters, Loader, PluginLoader, ShaderLoader, Source } from '@/lib/modrinth/types';
import {
  CogIcon, ServerStackIcon, CircleStackIcon, PhotoIcon, SparklesIcon,
} from '@heroicons/react/24/outline';

export const LOADERS: { id: Loader; label: string }[] = [
  { id: 'fabric', label: 'Fabric' },
  { id: 'forge',  label: 'Forge'  },
];

export const SHADER_LOADERS: { id: ShaderLoader; label: string }[] = [
  { id: 'iris',     label: 'Iris'     },
  { id: 'optifine', label: 'OptiFine' },
];

export const PLUGIN_LOADERS: { id: PluginLoader; label: string }[] = [
  { id: 'paper',  label: 'Paper'  },
  { id: 'spigot', label: 'Spigot' },
  { id: 'bukkit', label: 'Bukkit' },
];

export const CONTENT_TYPES: { id: ContentType; usesLoader: boolean; sources: Source[] }[] = [
  { id: 'mod',          usesLoader: true,  sources: ['modrinth', 'curseforge', 'optifine'] },
  { id: 'plugin',       usesLoader: false, sources: ['modrinth']                           },
  { id: 'datapack',     usesLoader: false, sources: ['modrinth', 'curseforge']             },
  { id: 'resourcepack', usesLoader: false, sources: ['modrinth', 'curseforge', 'pvprp']   },
  { id: 'shader',       usesLoader: false, sources: ['modrinth', 'curseforge']             },
  { id: 'addon',        usesLoader: false, sources: ['curseforge-bedrock']                 },
  { id: 'map',          usesLoader: false, sources: ['curseforge-bedrock']                 },
  { id: 'texture-pack', usesLoader: false, sources: ['curseforge-bedrock']                 },
  { id: 'script',       usesLoader: false, sources: ['curseforge-bedrock']                 },
  { id: 'skin',         usesLoader: false, sources: ['curseforge-bedrock']                 },
];

export const BEDROCK_CONTENT_TYPES = new Set<ContentType>([
  'addon', 'map', 'texture-pack', 'script', 'skin',
]);

export const CONTENT_TYPE_ICONS: Partial<Record<ContentType, ComponentType<SVGProps<SVGSVGElement>>>> = {
  mod:          CogIcon,
  plugin:       ServerStackIcon,
  datapack:     CircleStackIcon,
  resourcepack: PhotoIcon,
  shader:       SparklesIcon,
};

export const DEFAULT_FILTERS: Filters = {
  source:       'modrinth',
  version:      '',
  contentType:  'mod',
  loader:       'fabric',
  shaderLoader: null,
  pluginLoader: null,
};
