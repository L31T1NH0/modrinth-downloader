import type { en } from './en';

export const tr: typeof en = {
  status: {
    resolving:   'Çözümleniyor...',
    pending:     'Bekliyor...',
    downloading: 'İndiriliyor...',
    done:        'Tamamlandı',
  },

  search: {
    placeholder:  'Öğe ara...',
    clearTitle:   'Aramayı temizle',
    minLength:    'Aramak için en az {n} karakter girin.',
    loadMore:     'Daha fazla yükle',
    loading:      'Yükleniyor...',
    error:        'Arama hatası. Bağlantınızı kontrol edin.',
    noResultsFor: 'Sonuç bulunamadı:',
    withVersion:  'sürümü için',
  },

  fallback: {
    banner: '{version} için {type} bulunamadı. Bunun yerine {fallback} sonuçları gösteriliyor.',
  },

  queue: {
    title:       'İndirme kuyruğu',
    clear:       'Temizle',
    empty:       'Kuyruk boş.',
    emptyHint:   'Aramadan öğe ekleyin.',
    addToQueue:  'Kuyruğa ekle',
    inQueue:     'Kuyrukta',
    dep:         'bağ.',
    retryTitle:    'Tekrar dene',
    removeTitle:   'Kaldır',
    conflictWith:  '{title} ile çakışma',
    conflictBanner: '{n} çakışma tespit edildi — yine de indirilsin mi?',
    conflictBannerPlural: '{n} çakışma tespit edildi — yine de indirilsin mi?',
  },

  errors: {
    noCompatibleVersion: 'Uyumlu sürüm yok',
    batchLimitExceeded:  'Toplu indirme sınırı aşıldı',
    networkError:        'Ağ hatası',
  },

  footer: {
    export:           'Dışa aktar',
    exportTitle:      'Mod listesini JSON olarak dışa aktar',
    import:           'İçe aktar',
    importTitle:      'Mod listesini JSON\'dan içe aktar',
    restoring:        'Geri yükleniyor...',
    share:            'Paylaş',
    shareTitle:       'Paylaşılabilir URL\'yi kopyala',
    copySharePrompt:  'Bu paylaşım URL\'sini kopyalayın:',
    copied:           'Kopyalandı!',
    downloadFile:     'Dosyayı indir',
    downloadFiles:    '{n} dosyayı indir',
    toggleFormat:     'Arşiv formatını değiştir',
    failedMods:       '{n} mod yüklenemedi',
    failedModsPlural: '{n} mod yüklenemedi',
    downloading:      'İndiriliyor...',
    creatingArchive:  '{format} oluşturuluyor...',
  },

  summary: {
    resolving:   'çözümleniyor',
    ready:       'hazır',
    downloaded:  'indirildi',
    error:       'hata',
    errors:      'hata',
  },

  snackbar: {
    added:        'Kuyruğa eklendi',
    datapacks:    'Modrinth veri paketleri güvenilmez (mod indirebilir). Bunun yerine CurseForge kullanın.',
    listTooLarge: 'Liste URL için çok büyük — bunun yerine Dışa Aktar kullanın.',
  },

  migration: {
    prompt:      '{from} sürümünden {n} mod — sürüm değişikliği algılandı',
    checking:    '{n} mod {to} için kontrol ediliyor…',
    compatible:  '{ok} uyumlu',
    incompatible: '{fail} uyumsuz ({to} için)',
    check:       '{to} için doğrula',
    migrate:     'Geçir',
    dismiss:     'Kapat',
  },

  nav: {
    search: 'Ara',
    queue:  'Kuyruk',
  },

  filters: {
    source:      'Kaynak',
    version:     'Sürüm',
    loader:      'Loader',
    renderer:    'Renderer',
    platform:    'Platform',
    contentType: 'İçerik türü',
    sources: {
      modrinth:   'Modrinth',
      curseforge: 'CurseForge',
      bedrock:    'Bedrock',
      pvprp:      'pvprp.com',
      optifine:   'OptiFine',
    },
    contentTypes: {
      mod:            'Modlar',
      plugin:         'Eklentiler',
      datapack:       'Veri paketleri',
      resourcepack:   'Kaynak paketleri',
      shader:         'Shaderlar',
      addon:          'Add-on\'lar',
      map:            'Haritalar',
      'texture-pack': 'Doku paketleri',
      script:         'Scriptler',
      skin:           'Skinler',
    },
  },

  rankings: {
    title:            'Sıralamalar',
    mostDownloaded:   'En Çok İndirilenler',
    tracked:          'İzlenen',
    downloads:        'İndirmeler',
    loading:          'Sıralamalar yükleniyor...',
    empty:            '{type} için henüz sıralama yok',
    emptyHint:        'Başlamak için Dynrinth üzerinden bir şey indirin!',
    alreadyInQueue:   'Zaten kuyrukta',
    addToQueueTitle:  'Kuyruğa ekle - {version} - {loader}',
    openToSetVersion: 'Önce bir Minecraft sürümü seçmek için Dynrinth\'i açın',
    searchOnDynrinth: 'Dynrinth\'te "{name}" ara',
    viewOnPlatform:   'Platformda görüntüle',
    tracking:         'İndirmeler Dynrinth üzerinden izleniyor',
  },

  importErrors: {
    noModrinthCdnFiles: 'Dizinde Modrinth CDN dosyası bulunamadı.',
    unsupportedFormat:  'Desteklenmeyen format. Beklenen: ModListState v1/v2 veya uyumlu takma adlar.',
    invalidJson:        'Geçersiz JSON.',
    fileReadFailed:     'Dosya okunamadı.',
    invalidStructure:   'geçersiz yapı',
    detail:             'Ayrıntı: {detail}',
  },

  debug: {
    browse:    'gezinti',
    hits:      'sonuç',
    download:  'indir',
    files:     'dosya',
    loadMore:  'daha fazla yükle',
    open:      'Hata ayıklama panelini aç (Ctrl+Shift+D)',
    hint:      'Ctrl+Shift+D - satıra tıklayıp genişlet - paylaşmak için JSON kopyala',
    events:    'olay',
    copied:    'kopyalandı!',
    copyJson:  'JSON kopyala',
    clear:     'temizle',
    noEvents:  'henüz olay yok',
  },

  meta: {
    homeDescription:     'Minecraft modlarını Modrinth ve CurseForge\'dan kolayca ara ve indir',
    rankingsTitle:       'Sıralamalar - Dynrinth',
    rankingsDescription: 'Dynrinth üzerinden en çok indirilen Minecraft içerikleri',
    modTitle:            'Dynrinth Mod',
    modDescription:      '/dynrinth <code> ile koddan modpack kur',
  },

  modPage: {
    source: 'Kaynak',
    hero: {
      titleLine1:      'Modpack kur',
      titleLine2:      'tek komutla',
      description:     'Bir mod listesini 10 karakterlik kod olarak paylaş. Alan kişi',
      descriptionTail: 'oyunda yazsın, her sey otomatik indirilsin.',
    },
    download:   'Indir',
    build:      'Modpack olustur',
    howItWorks: 'Nasil calisir',
    callout: {
      title: 'Henuz kodun yok mu?',
      body:  'Mod listesini dynrinth.vercel.app uzerinde hazirla ve saniyeler icinde paylas.',
      open:  'Ac',
    },
    steps: {
      buildTitle:   'Listeyi olustur',
      buildBody:    'dynrinth.vercel.app\'te mod ara ve kuyruga ekle, sonra "Share to Dynrinth"e tikla.',
      runTitle:     'Komutu calistir',
      runBody:      'Herhangi bir dunya veya sunucuya girip /dynrinth komutundan sonra 10 karakterlik kodunu yaz.',
      restartTitle: 'Yeniden baslat ve oyna',
      restartBody:  'Her sey otomatik olarak /mods klasorune iner. Oyunu yeniden baslat ve hazirsin.',
    },
    commands: {
      title:   'Komutlar',
      install: 'Modpack kur',
      force:   'Surum kontrolunu atla',
      remove:  'Modpack kaldir',
    },
    platforms: {
      title:    'Desteklenen platformlar',
      fabric:   'Fabric',
      neoForge: 'NeoForge',
      paper:    'Paper',
    },
    chat: {
      title:         'Dynrinth sohbeti',
      fetching:      'Modpack aliniyor...',
      resolving:     'MC 1.21.1 icin 12 mod cozumleniyor...',
      downloadingA:  'Indiriliyor (3/12) sodium-fabric-0.6.jar',
      downloadingB:  'Indiriliyor (9/12) lithium-fabric-0.14.jar',
      done:          'Bitti! 12 mod kuruldu. Etkinlestirmek icin yeniden baslat.',
    },
  },

  mobileSuggestion: {
    text:   'Mobilde Bedrock genellikle daha iyi çalışır. Şimdi geçelim mi?',
    keep:   'Kalsın',
    switch: 'Geç',
  },

  minecraft: {
    share:      'Dynrinth',
    shareTitle: 'Mod aracılığıyla kurulum için kod oluştur',
    prompt:     'Dynrinth\'te yaz:',
    command:    '/dynrinth {code}',
    copied:     'Kopyalandı!',
    generating: 'Oluşturuluyor...',
    error:      'Kod oluşturulamadı',
    preview:    'Önizleme',
  },
};
