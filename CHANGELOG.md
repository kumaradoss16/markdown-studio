# Changelog

All notable changes to **MarkForge Markdown Studio** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-10-21

### Fixed
- **PDF Export Format & Alignment**:
  - Aligned PDF export styling with the `filesystem-lab.pdf` clean reference format.
  - Stripped all corner text, page headers, footers, timestamps, URLs, copy buttons, and interactive badges from generated HTML and print stylesheets.
  - Enforced strict `@page { size: A4; margin: 15mm; padding: 0; }` with full suppression of `@top-left`, `@top-center`, `@top-right`, `@bottom-left`, `@bottom-center`, and `@bottom-right` margin boxes.
  - Applied clean black-and-white print typography: 11pt body text (`#000000`), bold heading scale (h1: 24pt, h2: 18pt, h3: 14pt, h4: 12pt, h5/h6: 11pt), and 9.5pt monospace code blocks.
  - Enforced `page-break-inside: avoid; break-inside: avoid;` and `page-break-after: avoid; break-after: avoid;` across code blocks, tables, images, blockquotes, and headings.
  - Suppressed all interactive controls (`button`, `input`, `select`, `textarea`, `.export-footer`, `.fenced-code-header`, `.copy-btn`, `.badge`) in PDF exports.
  - Updated `tokens.css` with professional print font variables (`--font-sans-serif`, `--font-mono`, `--font-serif`).

---

## [1.0.0] - 2026-10-20

### Added
- Independent split-pane scrolling with explicit Synchronized Scrolling toggle button.
- Windows application multi-resolution 32-bit RGBA icon bundle (16x16 to 256x256).
- Zero-seeded clean install workspace onboarding with empty state cards.
- Automated NSIS setup and standalone portable Windows executable build pipeline.
- GitHub Actions CI/CD release workflow with SHA-256 checksum generation.

### Fixed
- Resolved collapsible accordion and sidebar state toggling with click stopPropagation.
- Removed custom code block widget headers and copy buttons from the left Markdown editor pane.
- Hardened Content Security Policy (CSP), local system font fallback, and AST pipeline cache limits.
