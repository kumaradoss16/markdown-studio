# DevOps Release & Build Automation Guide

This guide details the automated build pipeline, release mechanics, packaging scripts, and GitHub Actions workflow for **DevspireHub Markdown Studio**.

---

## 1. Automated Release Architecture

Every release is driven by Git tags following semantic versioning (`v*`, e.g. `v1.0.0`, `v1.1.0`).

When a tag is pushed to GitHub, the **Production Windows Release Pipeline** (`.github/workflows/release.yml`) automatically triggers on `windows-latest` to:

1. **Enforce Pre-flight Quality Gates**: Runs static lint analysis (`npm run lint`), full Vitest test suites (`npm test`), and documentation QA (`npm run qa:ci`).
2. **Compile Windows Binaries**: Builds the optimized web application (`npm run build`) and compiles the native Windows desktop executables (`npm run build:win`).
3. **Package Clean Source Code**: Generates a pristine `source-code.zip` omitting build outputs, `node_modules`, native targets, and secrets (`npm run pack:source`).
4. **Compute SHA-256 Integrity Hashes**: Generates `checksums.txt` with cryptographic hashes for all executables and archives.
5. **Publish GitHub Release**: Publishes a formal GitHub Release attaching all assets and auto-generated release notes.

```
Git Tag (v1.0.0) ──> GitHub Actions (windows-latest)
                          ├── 1. Lint & Test Matrix
                          ├── 2. Compile NSIS Setup (.exe)
                          ├── 3. Compile Portable (.exe)
                          ├── 4. Package source-code.zip
                          ├── 5. Generate checksums.txt
                          └── 6. Publish to GitHub Releases
```

---

## 2. Release Artifacts Overview

| Artifact Name | Type | Description |
|---|---|---|
| `DevspireHub-Markdown-Studio-1.0.0-Setup.exe` | **NSIS Installer** | Setup wizard with desktop and Start Menu shortcut creation, per-user installation, and clean uninstaller. |
| `DevspireHub-Markdown-Studio-1.0.0-Portable.exe` | **Portable Executable** | Standalone single-file binary that runs immediately without administrative installation. |
| `source-code.zip` | **Clean Source Archive** | Pristine project source code archive excluding `node_modules`, `dist`, `.git`, and build caches. |
| `checksums.txt` | **Integrity Verification** | SHA-256 cryptographic hashes for all distribution files. |

---

## 3. GitHub Repository Configuration Checklist

Before triggering releases, ensure the repository permissions are configured:

### 1. Enable GitHub Actions Write Permissions
1. Go to your repository on GitHub: `https://github.com/kumaradoss16/markdown-studio`
2. Navigate to **Settings** → **Actions** → **General**.
3. Under **Workflow permissions**, select:
   * 🔘 **Read and write permissions**
   * ☑️ **Allow GitHub Actions to create and approve pull requests**
4. Click **Save**.

### 2. Verify Release Tags
Ensure tags match the `v*` pattern:
* Valid: `v1.0.0`, `v1.0.1`, `v1.1.0-rc1`
* Invalid: `1.0.0`, `release-1.0`

---

## 4. Triggering a Release (Step-by-Step)

```bash
# 1. Ensure working directory is clean and up-to-date on main
git checkout main
git pull origin main

# 2. Verify local quality gates pass
npm run lint
npm test
npm run qa:ci

# 3. Create a signed or annotated Git tag
git tag -a v1.0.0 -m "Release 1.0.0: Production Desktop Hardening & Release Distribution"

# 4. Push tag to GitHub
git push origin v1.0.0
```

Once pushed, navigate to the **Actions** tab on GitHub to monitor the build progress. Upon completion, the new release will appear under **Releases** with all downloadable assets attached.

---

## 5. Local Packaging & Inspection Commands

You can build and inspect release artifacts on your local machine at any time:

### Compile Windows Executables
```bash
npm run build:win
```
* Compiles web assets with Vite.
* Invokes the Tauri compiler to build native Windows packages.
* Outputs `DevspireHub-Markdown-Studio-1.0.0-Setup.exe` and `DevspireHub-Markdown-Studio-1.0.0-Portable.exe` to `dist-release/`.

### Package Clean Source Archive
```bash
npm run pack:source
```
* Collects all necessary source code files, omitting dev dependencies and caches.
* Outputs `dist-release/source-code.zip`.

### Generate Checksums
```bash
node scripts/generate-checksums.js dist-release dist-release/checksums.txt
```
* Computes SHA-256 hashes for all files in `dist-release/`.

### Verify Checksums Locally
```powershell
Get-FileHash dist-release\DevspireHub-Markdown-Studio-1.0.0-Setup.exe -Algorithm SHA256
```
