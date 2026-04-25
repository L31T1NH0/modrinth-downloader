import type { en } from './en';

export const pt: typeof en = {
  status: {
    resolving:   'Resolvendo...',
    pending:     'Aguardando...',
    downloading: 'Baixando...',
    done:        'Concluído',
  },

  search: {
    placeholder:  'Pesquisar itens...',
    clearTitle:   'Limpar pesquisa',
    minLength:    'Digite pelo menos {n} caracteres para pesquisar.',
    loadMore:     'Carregar mais',
    loading:      'Carregando...',
    error:        'Erro na pesquisa. Verifique sua conexão.',
    noResultsFor: 'Sem resultados para',
    withVersion:  'com',
  },

  fallback: {
    banner: 'Sem {type} para {version}. Mostrando resultados de {fallback}.',
  },

  queue: {
    title:       'Fila de download',
    clear:       'Limpar',
    empty:       'Fila vazia.',
    emptyHint:   'Adicione itens da pesquisa.',
    addToQueue:  'Adicionar à fila',
    inQueue:     'Na fila',
    dep:         'dep',
    retryTitle:    'Tentar novamente',
    removeTitle:   'Remover',
    conflictWith:  'Conflito com {title}',
    conflictBanner: '{n} conflito detectado — baixar mesmo assim?',
    conflictBannerPlural: '{n} conflitos detectados — baixar mesmo assim?',
  },

  errors: {
    noCompatibleVersion: 'Nenhuma versão compatível',
    batchLimitExceeded:  'Limite de download em lote excedido',
    networkError:        'Erro de rede',
  },

  footer: {
    export:           'Exportar',
    exportTitle:      'Exportar lista de mods como JSON',
    import:           'Importar',
    importTitle:      'Importar lista de mods do JSON',
    restoring:        'Restaurando...',
    share:            'Compartilhar',
    shareTitle:       'Copiar URL compartilhável',
    copySharePrompt:  'Copie esta URL de compartilhamento:',
    copied:           'Copiado!',
    downloadFile:     'Baixar arquivo',
    downloadFiles:    'Baixar {n} arquivos',
    toggleFormat:     'Alternar formato do arquivo',
    failedMods:       '{n} mod não pôde ser carregado',
    failedModsPlural: '{n} mods não puderam ser carregados',
    downloading:      'Baixando...',
    creatingArchive:  'Criando {format}...',
  },

  summary: {
    resolving:   'resolvendo',
    ready:       'pronto',
    downloaded:  'baixado',
    error:       'erro',
    errors:      'erros',
  },

  snackbar: {
    added:        'Adicionado à fila',
    datapacks:    'Use o CurseForge; datapacks do Modrinth são instáveis (podem baixar mods)',
    listTooLarge: 'Lista grande demais para uma URL — use Exportar.',
  },

  migration: {
    prompt:      '{n} mods de {from} — mudança de versão detectada',
    checking:    'Verificando {n} mods para {to}…',
    compatible:  '{ok} compatíveis',
    incompatible: '{fail} incompatíveis para {to}',
    check:       'Verificar para {to}',
    migrate:     'Migrar',
    dismiss:     'Dispensar',
  },

  nav: {
    search: 'Pesquisar',
    queue:  'Fila',
  },

  filters: {
    source:      'Fonte',
    version:     'Versão',
    loader:      'Loader',
    renderer:    'Renderizador',
    platform:    'Plataforma',
    contentType: 'Tipo de conteúdo',
    sources: {
      modrinth:   'Modrinth',
      curseforge: 'CurseForge',
      bedrock:    'Bedrock',
    },
    contentTypes: {
      mod:            'Mods',
      plugin:         'Plugins',
      datapack:       'Datapacks',
      resourcepack:   'Pacotes de recursos',
      shader:         'Shaders',
      addon:          'Addons',
      map:            'Mapas',
      'texture-pack': 'Pacotes de textura',
      script:         'Scripts',
      skin:           'Skins',
    },
  },

  rankings: {
    title:            'Rankings',
    mostDownloaded:   'Mais baixados',
    tracked:          'Rastreados',
    downloads:        'Downloads',
    loading:          'Carregando rankings...',
    empty:            'Ainda não há rankings para {type}',
    emptyHint:        'Baixe algo pelo Dynrinth para começar!',
    alreadyInQueue:   'Já está na fila',
    addToQueueTitle:  'Adicionar à fila - {version} - {loader}',
    openToSetVersion: 'Abra o Dynrinth para definir primeiro uma versão do Minecraft',
    searchOnDynrinth: 'Pesquisar "{name}" no Dynrinth',
    viewOnPlatform:   'Ver na plataforma',
    tracking:         'Downloads rastreados pelo Dynrinth',
  },

  importErrors: {
    noModrinthCdnFiles: 'Nenhum arquivo CDN do Modrinth encontrado no índice.',
    unsupportedFormat:  'Formato não suportado. Esperado: ModListState v1/v2 ou aliases compatíveis.',
    invalidJson:        'JSON inválido.',
    fileReadFailed:     'Falha ao ler o arquivo.',
    invalidStructure:   'estrutura inválida',
    detail:             'Detalhe: {detail}',
  },

  debug: {
    browse:    'navegação',
    hits:      'resultados',
    download:  'download',
    files:     'arquivos',
    loadMore:  'carregar mais',
    open:      'Abrir painel de debug (Ctrl+Shift+D)',
    hint:      'Ctrl+Shift+D - clique na linha para expandir - copie o JSON para compartilhar',
    events:    'eventos',
    copied:    'copiado!',
    copyJson:  'copiar JSON',
    clear:     'limpar',
    noEvents:  'ainda não há eventos',
  },

  meta: {
    homeDescription:     'Pesquise e baixe mods de Minecraft do Modrinth e CurseForge com facilidade',
    rankingsTitle:       'Rankings - Dynrinth',
    rankingsDescription: 'Conteúdos de Minecraft mais baixados pelo Dynrinth',
  },

  mobileSuggestion: {
    text:   'No celular, Bedrock costuma funcionar melhor. Trocar agora?',
    keep:   'Manter',
    switch: 'Trocar',
  },

  minecraft: {
    share:      'Minecraft',
    shareTitle: 'Gerar código para instalar via mod',
    prompt:     'Digite no Minecraft:',
    command:    '/dynrinth {code}',
    copied:     'Copiado!',
    generating: 'Gerando...',
    error:      'Erro ao gerar código',
    preview:    'Preview',
  },
};
