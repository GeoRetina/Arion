# Contributing to Arion

Thank you for your interest in contributing to Arion! We welcome contributions from the community and appreciate your help in making Arion better.

## 🚀 Quick Start

1. **Fork** the [georetina/arion](https://github.com/georetina/arion) repository
2. **Clone** your fork: `git clone https://github.com/your-username/arion.git`
3. **Install** dependencies: `npm install`
4. **Run** in development mode: `npm run dev`
5. **Create** a feature branch: `git checkout -b feature/amazing-feature`
6. **Make** your changes and **commit**: `git commit -m "Add amazing feature"`
7. **Push** to your branch: `git push origin feature/amazing-feature`
8. **Open** a Pull Request

## 📋 Ways to Contribute

### 🐛 Bug Reports
- Use the [GitHub Issues](https://github.com/georetina/arion/issues) page
- Search existing issues first to avoid duplicates
- Provide detailed reproduction steps
- Include system information (OS, Node.js version, etc.)
- Attach screenshots or error logs when relevant

### 💡 Feature Requests
- Open an issue with the "enhancement" label
- Clearly describe the problem you're trying to solve
- Explain how this feature would benefit other users
- Consider proposing an implementation approach

### 🔧 Code Contributions
- **Bug fixes** are always welcome
- **New features** should be discussed in an issue first
- **Documentation improvements** help everyone
- **Test coverage** increases are appreciated

## 🛠️ Development Guidelines

### Prerequisites
- **Node.js** 18 or higher
- **npm** 8 or higher
- **Git** for version control

### Code Style
- Follow the existing **TypeScript** and **ESLint** configurations
- Use **Prettier** for code formatting (run `npm run format`)
- Write **meaningful commit messages** following [Conventional Commits](https://www.conventionalcommits.org/)
- Add **JSDoc comments** for public APIs
- Include **unit tests** for new functionality

### Project Structure
```
src/
├── main/          # Electron main process (Node.js)
├── renderer/src/  # React frontend (TypeScript)
├── preload/       # Electron preload scripts
└── shared/        # Shared types and utilities
```

### Testing
- Run tests with: `npm test`
- Ensure all tests pass before submitting PR
- Add tests for new features and bug fixes
- Aim for meaningful test coverage, not just high percentages

### Pull Request Process
1. **Update** documentation if you change APIs
2. **Run** `npm run lint` and fix any issues
3. **Test** your changes thoroughly
4. **Write** a clear PR description explaining your changes
5. **Link** to any relevant issues
6. **Request review** from maintainers

## 📝 Contribution Licensing

**Important**: By contributing to Arion, you agree that:

- Your contributions will be licensed under the same **PolyForm Noncommercial License 1.0.0**
- You have the right to submit your contributions
- GeoRetina Inc. may use your contributions in both the open-source and commercial versions of Arion
- You retain copyright to your contributions, but grant GeoRetina Inc. necessary rights for dual licensing

If you're contributing on behalf of your employer, ensure you have permission to make the contribution under these terms.

## 🎯 Focus Areas

We're particularly interested in contributions in these areas:

### Core Features
- **LLM integrations** and tool improvements
- **Geospatial analysis** capabilities
- **Map visualization** enhancements
- **Knowledge base** functionality

### Developer Experience
- **Documentation** improvements
- **Testing** infrastructure
- **Build and deployment** optimizations
- **Plugin system** development

### Integrations
- **MCP server** implementations
- **Data connectors** for geospatial sources
- **Export/import** functionality
- **API integrations**

## 🚫 What We Don't Accept

- **Breaking changes** without prior discussion
- **Features that compromise security** or privacy
- **Code that violates licensing** of dependencies
- **Contributions without proper attribution**
- **Large refactoring** without architectural discussion

## 🆘 Getting Help

- **Discord**: [Join our community](https://discord.gg/arion-geo) (if you have one)
- **Email**: Technical questions to `support@georetina.com`
- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for general questions

## 🏷️ Issue Labels

- `bug` - Something isn't working correctly
- `enhancement` - New feature or improvement
- `documentation` - Documentation needs improvement
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention is needed
- `priority:high` - Urgent issues
- `priority:low` - Nice to have improvements

## 🤝 Code of Conduct

### Our Standards
- **Be respectful** and inclusive
- **Be collaborative** and constructive
- **Be patient** with newcomers
- **Be professional** in all interactions

### Unacceptable Behavior
- Harassment, discrimination, or offensive language
- Personal attacks or trolling
- Spam or off-topic discussions
- Sharing private information without consent

### Enforcement
Community leaders will remove, edit, or reject contributions that don't align with this Code of Conduct. Serious violations may result in temporary or permanent bans.

## 📞 Contact

For questions about contributing:
- **Email**: `support@georetina.com`
- **GitHub Issues**: [Create an issue](https://github.com/georetina/arion/issues)

---

**Thank you for contributing to Arion!** 🎉

Your contributions help make geospatial AI more accessible to researchers, developers, and organizations worldwide. 