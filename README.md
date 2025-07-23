# Arion: Geospatial AI Assistant

Arion is a modular and extensible desktop application designed for advanced geospatial analysis and agentic workflows. Built with Electron, React (TypeScript), and Vite, Arion empowers users to leverage local and cloud-based Large Language Models (LLMs), integrate custom Model Context Protocol (MCP) servers, and utilize a plugin system for extended capabilities.

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

Build the application for packaging:

```bash
# For Windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

## Contributing

(Placeholder for contribution guidelines - to be updated)

## License

(Placeholder for license information - to be updated)
