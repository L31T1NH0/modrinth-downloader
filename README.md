# Modrinth Downloader

Uma aplicação web moderna para buscar, resolver dependências e baixar mods, shaders, plugins e outros conteúdos do Modrinth e CurseForge de forma centralizada.

## ✨ Funcionalidades

- **Suporte a múltiplas fontes**: Busque e baixe conteúdos do Modrinth e CurseForge
- **Busca inteligente**: Procure por mods, shaders, plugins, datapacks, resourcepacks e outros conteúdos
- **Filtros avançados**: Filtre por versão do Minecraft, loader, versão de shader, plataforma de plugin, etc.
- **Resolução de dependências**: Detecte automaticamente as dependências de cada projeto
- **Download em lote**: Selecione múltiplos arquivos e baixe tudo em um único ZIP
- **Acompanhamento de progresso**: Veja o progresso em tempo real para cada arquivo e progresso geral
- **Interface intuitiva**: Design responsivo e moderno com Tailwind CSS
- **Seletor de versões otimizado**: Menu de versões com altura limitada e scroll para melhor navegação

## 🚀 Início Rápido

### Requisitos

- Node.js 18+ 
- npm ou yarn

### Instalação

```bash
# Clone o repositório
git clone https://github.com/l31t1nh0/modrinth-downloader.git
cd modrinth-downloader

# Instale as dependências
npm install
```

### Desenvolvimento

```bash
# Inicie o servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em [http://localhost:3000](http://localhost:3000)

### Build para Produção

```bash
# Build da aplicação
npm run build

# Inicie o servidor de produção
npm start
```

## 📁 Estrutura do Projeto

```
modrinth-downloader/
├── app/                      # Aplicação Next.js (App Router)
│   ├── layout.tsx           # Layout principal
│   └── page.tsx             # Página principal
├── components/
│   └── CustomSelect.tsx      # Componente de seletor customizado
├── lib/
│   ├── download.ts          # Lógica de download e empacotamento ZIP
│   ├── modrinth/
│   │   ├── service.ts       # Integração com API do Modrinth
│   │   └── types.ts         # Tipos TypeScript
│   └── curseforge/
│       ├── service.ts       # Integração com API do CurseForge
│       └── types.ts         # Tipos TypeScript
├── hooks/
│   └── useQueue.ts          # Hook para gerenciar fila de downloads
├── package.json             # Dependências do projeto
├── tsconfig.json            # Configuração TypeScript
├── tailwind.config.ts       # Configuração Tailwind CSS
└── next.config.ts           # Configuração Next.js
```

## 🛠 Tecnologias

- **Next.js 15** - Framework React moderno
- **React 19** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização utilitária
- **fflate** - Compressão ZIP em tempo real
- **API Modrinth v2** - Integração com Modrinth
- **API CurseForge** - Integração com CurseForge

## 📚 Como Usar

### 1. Buscar Projetos

- Acesse a página inicial
- Selecione a fonte: Modrinth ou CurseForge
- Digite o nome do projeto que procura no campo de busca
- Selecione o tipo de conteúdo: Mod, Shader, Plugin, Datapack, Resourcepack, etc.
- Escolha a versão do Minecraft desejada
- Configure filtros adicionais conforme o tipo de conteúdo (loader para mods, renderer para shaders, etc.)
- Clique em "Buscar"

### 2. Resolver Dependências

- Selecione um projeto da lista de resultados
- As dependências serão automaticamente detectadas
- Uma lista mostrará todos os arquivos necessários com suas dependências

### 3. Baixar em Lote

- Selecione os arquivos que deseja baixar
- Clique em "Baixar como ZIP"
- Todos os arquivos serão compactados em um único ZIP
- O navegador iniciará o download automaticamente

## 🔧 API Modrinth

### Endpoints Utilizados

- `GET /tag/game_version` - Listar versões do Minecraft
- `GET /search` - Buscar projetos
- `GET /project/{id}/version` - Obter versões de um projeto
- `GET /project/{id}` - Obter informações do projeto

**Base URL**: `https://api.modrinth.com/v2`

## 📝 Configuração de Filtros

### Fonte de Conteúdo
- **Modrinth**: Acesso completo a todos os tipos de conteúdo
- **CurseForge**: Suporte para mods e plugins

### Tipos de Conteúdo e Filtros Específicos
- **Mods**: Loader (Fabric, Forge)
- **Shaders**: Renderer (Iris, OptiFine) - disponível apenas no Modrinth
- **Plugins**: Plataforma (Paper, Spigot, Bukkit)
- **Datapacks**: Apenas versão do Minecraft
- **Resourcepacks**: Apenas versão do Minecraft

## 🎨 Customização

### Tema Tailwind

Edite `tailwind.config.ts` para customizar cores, fontes e outros estilos.

### Configuração Next.js

Ajuste `next.config.ts` conforme necessário para suas necessidades específicas.

## 🐛 Tratamento de Erros

- **Falha de rede**: A aplicação detecta erros de conectividade e exibe mensagens apropriadas
- **Arquivo não disponível**: Se um arquivo não estiver disponível, ele é excluído do ZIP
- **Versão incompatível**: Mensagens claras indicam quando não há versões compatíveis

## 📄 Licença

[Adicionar informação de licença aqui]

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se livre para abrir issues e pull requests.

## 📮 Suporte

Para questões ou problemas, abra uma issue no repositório.
