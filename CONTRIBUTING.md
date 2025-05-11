# Contributing to Local-First AI Model Runner

First off, thank you for considering contributing to the Local-First AI Model Runner! We appreciate your time and effort. This project aims to build a powerful, privacy-focused, and offline-capable AI model runner, and every contribution helps us get closer to that goal.

## How Can I Contribute?

There are many ways to contribute, from writing code and documentation to reporting bugs and suggesting features.

### Reporting Bugs

If you encounter a bug, please help us by reporting it! To make bug reports as effective as possible:

1.  **Check if the bug has already been reported**: Search the existing issues on GitHub.
2.  **Ensure you are on the latest version**: Try to reproduce the bug with the latest version of the code.
3.  **Provide detailed information**: When submitting an issue, please include:
    *   A clear and descriptive title.
    *   Steps to reproduce the bug.
    *   What you expected to happen.
    *   What actually happened (including any error messages and console logs).
    *   Your environment (e.g., browser version, Node.js version, operating system).
    *   If possible, a minimal reproducible example.

### Suggesting Enhancements or New Features

We welcome suggestions for new features or enhancements to existing ones.

1.  **Check if the feature has already been suggested**: Search the existing issues and discussions.
2.  **Provide a clear description**: Explain the feature and why it would be useful.
    *   What is the problem you're trying to solve?
    *   How would this feature help?
    *   Are there any alternative solutions or features you've considered?

### Submitting Pull Requests

If you'd like to contribute code, please follow these steps:

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally: `git clone https://github.com/YOUR_USERNAME/LocalWebAI.git`
3.  **Create a new branch** for your changes: `git checkout -b feature/your-feature-name` or `fix/your-bug-fix-name`.
4.  **Set up the development environment**:
    *   Ensure you have Node.js and npm installed.
    *   Install root dependencies: `npm install`
    *   Navigate to `ts-wrapper/` and install its dependencies: `cd ts-wrapper && npm install && cd ..`
    *   Build the `ts-wrapper`: `cd ts-wrapper && npm run build && cd ..` (or `npm run watch` for continuous compilation during development).
5.  **Make your changes**. Ensure your code follows the existing style and conventions.
6.  **Add tests** for your changes if applicable. We aim for good test coverage.
7.  **Ensure all tests pass**: `cd ts-wrapper && npm test && cd ..` (Note: Test script might need to be configured).
8.  **Lint your code**: (Details on linters and formatters to be added. For now, try to match existing code style).
9.  **Commit your changes** with a clear and descriptive commit message (e.g., `feat: Add support for XYZ model format` or `fix: Resolve issue with model caching`).
10. **Push your branch** to your fork: `git push origin feature/your-feature-name`.
11. **Open a Pull Request (PR)** against the `main` branch of the original repository.
    *   Provide a clear title and description for your PR, explaining the changes and why they are being made.
    *   Link to any relevant issues.

## Development Setup

*   **Node.js**: Required for running the server and build scripts.
*   **npm**: Used for package management.
*   **TypeScript**: The `ts-wrapper` is written in TypeScript.

To get started:
1.  Clone the repository.
2.  Install dependencies: `npm install` (at root) and then `cd ts-wrapper && npm install`.
3.  Build the TypeScript wrapper: `cd ts-wrapper && npm run build`.
4.  Run the development server: `npm start` (from the root directory).

## Code Style

(Details on specific code style guidelines, linters (e.g., ESLint, Prettier), and formatters will be added here. For now, please try to match the style of the existing codebase.)

## Code of Conduct

To ensure a welcoming and inclusive environment, we expect all contributors to adhere to a Code of Conduct. (A formal Code of Conduct will be added soon. In the meantime, please be respectful and considerate in all interactions.)

## Questions?

Feel free to open an issue if you have questions about contributing or anything related to the project.

Thank you for contributing! 