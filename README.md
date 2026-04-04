# Arion: Cross‑Platform Desktop App for Agentic Geospatial AI Analysis

<div align="center">
  <table>
    <tr>
      <td align="center" style="background-color: #E8F5E9; border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="color: #2E7D32; margin: 0 0 10px 0;">🎉 v0.1.0 Released!</h3>
        <p style="color: #424242; font-size: 16px; margin: 0;">
          Arion v0.1.0 is now available with bundled MCP server discovery and security approval flow.<br/>
          Check out the <a href="./changelogs/v0.3.9-2025-12-29.md" style="color: #2E7D32; font-weight: bold;">release notes</a> for full details!
        </p>
      </td>
    </tr>
  </table>
</div>

<div align="center">
  <table>
    <tr>
      <td align="center" style="background-color: #E3F2FD; border: 2px solid #2196F3; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="color: #1976D2; margin: 0 0 10px 0;">📦 Binary Releases Coming Soon!</h3>
        <p style="color: #424242; font-size: 16px; margin: 0;">Binary builds for <strong>Windows</strong>, <strong>macOS</strong>, and <strong>Linux</strong> will be available soon. Stay tuned!</p>
      </td>
    </tr>
  </table>
</div>

Arion is a **cross-platform desktop application** designed for advanced geospatial analysis and agentic workflows. Built with Electron, React (TypeScript), and Vite, Arion runs natively on **Windows, macOS, and Linux**, empowering users to leverage local and cloud-based Large Language Models (LLMs), integrate custom Model Context Protocol (MCP) servers, and utilize a plugin system for extended capabilities.

<div align="center">
  <img src="resources/icon.png" alt="Arion Logo" width="256" height="256" style="border-radius: 20px;">
</div>

## 🎥 Demo Video

<div align="center">
  <a href="https://www.youtube.com/watch?v=dI0FVaPBHtk">
    <img src="https://img.youtube.com/vi/dI0FVaPBHtk/maxresdefault.jpg" alt="Arion Demo Video" width="560" height="315" style="border-radius: 10px;">
  </a>
  <br>
  <em>Click to watch the Arion introduction video</em>
</div>

## Core Features

- **Interactive Chat Interface:** Communicate with LLMs for geospatial queries, analysis, and task automation. Supports various providers (OpenAI, Google Gemini, Azure, Anthropic, Ollama) via the Vercel AI SDK.
- **Dynamic Map Visualization:** Render and interact with geospatial data using MapLibre GL.
- **LLM Tool Integration:**
  - Built-in tools for map manipulation (add features, buffers, set view), UI control, and knowledge base queries.
  - Support for user-defined MCP servers, allowing agents to access external Python/TypeScript tools and data sources.
- **Knowledge Base Integration:** Ingest documents (PDF, DOCX, TXT) into a local vector store (PGlite with pgvector) for Retrieval Augmented Generation (RAG).
- **Local LLM Support:** Configure and use local LLMs via Ollama.
- **Agentic Workflows (Planned):** Future support for running Python (LangGraph/CrewAI) and TypeScript agents in isolated processes, orchestrated by the application.
- **Plugin System (Planned):** Extend Arion's functionality with custom plugins for data connectors, visualization providers, MCP tools, and agent providers.
- **SQLite/SpatiaLite Backend:** Manages application settings, chat history, and plugin configurations. SpatiaLite for advanced geospatial data operations (integration in progress).

## Technology Stack

- **Desktop Framework:** Electron
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend (Main Process):** Node.js, TypeScript
- **Mapping:** MapLibre GL
- **AI/Chat:** Vercel AI SDK, LangChain (for future agent runtimes)
- **LLM Tools:** Model Context Protocol (MCP) - `@modelcontextprotocol/sdk`
- **Local Vector Store (Knowledge Base):** PGlite with `pgvector` extension
- **Database (Application Data):** SQLite (using `better-sqlite3`)
- **Build & Packaging:** Electron Vite, Electron Builder
- **Linting & Formatting:** ESLint, Prettier

## Project Structure

- `src/main/`: Electron Main process code (Node.js environment).
- `src/renderer/src/`: Electron Renderer process code (React UI).
- `src/preload/`: Electron Preload script for secure IPC.
- `src/shared/`: Code shared between Main and Renderer (e.g., IPC types).
- `plugins/` (Planned): Top-level directory for user-installed plugins.
- `python-agents/` (Planned): Directory for Python-based agent runtimes.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Prerequisites

- **Node.js 22** or higher
- **npm** 8 or higher

### Install Dependencies

```bash
npm install
```

### Development

Run the application in development mode with hot reloading:

```bash
npm run dev
```

### Build for Production

Arion uses native Node modules (`better-sqlite3`, `keytar`) that require platform-specific build tools.

#### Windows

Requires Visual Studio Build Tools (C++ workload) or `windows-build-tools`:

```bash
npm run build:win
```

Produces an NSIS installer (`arion-<version>-setup.exe`) for x64.

To build without code signing:

```bash
npm run build:win:unsigned
```

#### macOS

Requires Xcode Command Line Tools:

```bash
xcode-select --install
npm run build:mac
```

Produces a `.dmg` disk image.

#### Linux

Requires `build-essential`, `python3`, and packaging dependencies:

```bash
# Ubuntu / Debian
sudo apt install -y build-essential python3 libsecret-1-dev

npm run build:linux
```

Produces AppImage, Snap, and `.deb` packages.

#### Build without Packaging

To compile without creating distributable installers (useful for testing):

```bash
npm run build:unpack
```

#### Rebuild Native Modules

After updating dependencies, rebuild native modules for your Electron version:

```bash
npm run rebuild
```

### Raster GDAL Runtime

- Windows builds include bundled GDAL binaries.
- macOS and Linux use bundled GDAL first, then automatically fall back to system GDAL binaries from `PATH` if bundled binaries are not present.
- See `resources/gdal/README.md` for supported layouts and `ARION_GDAL_*` overrides.

### Install GDAL (Quick)

Use these commands to install GDAL quickly on each OS:

```bash
# macOS (Homebrew)
brew install gdal

# Ubuntu / Debian
sudo apt update && sudo apt install -y gdal-bin libgdal-dev

# Fedora / RHEL
sudo dnf install -y gdal gdal-devel

# Arch Linux
sudo pacman -S --needed gdal
```

Windows:

- Arion does not use system GDAL fallback on Windows, and shipped Windows app builds already include GDAL.
- For local development or preparing bundled binaries, install GDAL with Conda:
  - `conda install -c conda-forge gdal`

Verify install:

```bash
gdalinfo --version
```

## Contributing

We welcome contributions from the community! Please see our [Contributing Guide](./CONTRIBUTING.md) for details on:

- 🚀 **Getting started** with development
- 📋 **Types of contributions** we're looking for
- 🛠️ **Development guidelines** and coding standards
- 📝 **Licensing terms** for contributors

**Quick start:** Fork the [repository](https://github.com/georetina/arion), make your changes, and submit a pull request.

For questions: `support@georetina.com`

## License

Arion is free software released under the **GNU General Public License v3.0 or later**.

- You may use, modify, and redistribute the project under the GPL terms (including commercial use).
- Distributions and derivative works must provide source code and remain licensed under the GPL.
- See the [LICENSE](./LICENSE) file for the complete text and guidance on applying the GPL to your changes.
