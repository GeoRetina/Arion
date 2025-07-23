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

We welcome contributions from the community! Please see our [Contributing Guide](./CONTRIBUTING.md) for details on:

- 🚀 **Getting started** with development
- 📋 **Types of contributions** we're looking for  
- 🛠️ **Development guidelines** and coding standards
- 📝 **Licensing terms** for contributors

**Quick start:** Fork the [repository](https://github.com/georetina/arion), make your changes, and submit a pull request.

For questions: `support@georetina.com`

## License

**💡 Free for personal & academic use 🚀 Commercial? [Get a license →](mailto:support@georetina.com)**

Arion is licensed under the **PolyForm Noncommercial License 1.0.0**, which means:

### ✅ **Free Use** (No license required)
- **Personal projects** and hobby development
- **Academic research** at educational institutions
- **Internal evaluation** by commercial entities

### 💼 **Commercial Use** (License required)
- Any use where **money changes hands**
- **Production deployments** in commercial organizations
- **SaaS offerings** or hosted services
- **Consulting work** using Arion for clients

### How to Get a Commercial License
If you're using Arion commercially, please contact us at `support@georetina.com` for:
- **Flexible pricing** based on your use case
- **Priority support** and updates
- **Custom licensing terms** for enterprise deployments

### FAQ
- **University lab or student project?** You're good to go! 🎓
- **Open source contribution?** We welcome PRs under the same license
- **Evaluation for purchase?** 30-day evaluation is included for commercial entities
- **Questions about your use case?** Drop us a line - we're here to help!

**Full license text:** See [LICENSE](./LICENSE) file

---

*"Arion" is a trademark of GeoRetina Inc. Derivative works must use a different name.*
