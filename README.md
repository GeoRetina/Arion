# Arion: Cross‑Platform Desktop App for Agentic Geospatial AI Analysis

<div align="center" style="margin-bottom: 16px;">
  <table>
    <tr>
      <td align="center" style="background-color: #FFF3CD; border: 2px solid #FFC107; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="color: #856404; margin: 0 0 10px 0;">⚠️ Early Release Notice</h3>
        <p style="color: #856404; font-size: 16px; margin: 0;">
          Some features are currently missing and will be gradually added over the next few days as we complete code clean-up.<br/>
          You may experience some bugs or incomplete functionality during this period. Thank you for your patience!
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

**💡 Free for personal & academic use**

Arion is **source-available** under the **PolyForm Noncommercial License 1.0.0**, which means:

### ✅ **Free Use** (No license required)

- **Personal projects** and hobby development
- **Academic research** at educational institutions (including government-funded research)
- **Charitable organizations** and environmental protection organizations
- **Internal evaluation** by commercial entities

### 💼 **Commercial Use** (Separate license required)

- **Production deployments** in commercial organizations
- **SaaS offerings** or hosted services
- **Consulting work** using Arion for clients
- **Internal use** by for-profit companies

For commercial licensing inquiries, contact: `support@georetina.com`

**Full license text:** See [LICENSE](./LICENSE) file
