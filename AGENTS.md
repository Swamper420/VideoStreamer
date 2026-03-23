# Agent Instructions

All agents working on this repository must adhere to the highest code quality standards at all times.

## Code Quality Requirements

### General Principles
- Write clean, readable, and self-documenting code.
- Follow the principle of least surprise: code should behave exactly as its name and structure suggest.
- Prefer clarity over cleverness. Optimize for the next developer reading the code, not for the fewest keystrokes.
- Keep functions and methods small and focused on a single responsibility (Single Responsibility Principle).
- Avoid code duplication; extract shared logic into well-named helpers or utilities.

### Naming
- Use descriptive, intention-revealing names for variables, functions, classes, and modules.
- Avoid abbreviations unless they are universally understood (e.g. `url`, `id`).
- Name boolean variables and functions with a prefix that conveys truth, such as `is`, `has`, or `can` (e.g. `isStreaming`, `hasAudio`).

### Code Style
- Follow the language-specific style guide that is most widely adopted for the language in use (e.g. PEP 8 for Python, Google Style Guide for Java/TypeScript, `gofmt` conventions for Go).
- Use consistent indentation and formatting throughout the codebase.
- Remove dead code, commented-out code, and unused imports before committing.
- Keep lines within 120 characters where practical.

### Error Handling
- Handle errors explicitly; never silently swallow exceptions or error codes.
- Provide meaningful error messages that aid debugging without leaking sensitive information.
- Use typed errors or error hierarchies where the language supports it.

### Testing
- Write tests for all new functionality and bug fixes.
- Aim for high coverage on critical paths (business logic, security-sensitive code).
- Tests must be deterministic; eliminate flakiness before merging.
- Follow the Arrange-Act-Assert (AAA) pattern for test structure.
- Name tests descriptively so that a failing test name clearly communicates what broke.

### Documentation
- Document public APIs, non-obvious algorithms, and important design decisions.
- Keep comments up to date with the code they describe; stale comments are worse than no comments.
- Write a clear commit message that explains *why* a change was made, not just *what* changed.

### Security
- Never commit secrets, credentials, or personally identifiable information.
- Validate and sanitize all external inputs.
- Follow the principle of least privilege when designing access controls and permissions.
- Run security scanning tools and address all findings before merging.

### Dependencies
- Add new dependencies only when strictly necessary; prefer standard library solutions.
- Pin dependency versions and keep them up to date.
- Check new dependencies for known vulnerabilities before adding them.

### Version Control
- Make small, atomic commits that each represent one logical change.
- Ensure every commit leaves the codebase in a working, buildable state.
- Rebase or merge from the target branch before opening a pull request to avoid conflicts.

### Review and CI
- All code must pass linting, static analysis, and the full test suite before merging.
- Address all code review comments before requesting a re-review.
- Do not merge a pull request with unresolved conversations.
