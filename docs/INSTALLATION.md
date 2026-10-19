# Installation & Deployment Guide

Welcome to **MarkForge Markdown Studio** (Release 1.0 Production). This document covers system prerequisites, installation methods across supported operating systems, in-place upgrades, and verification procedures.

---

## 1. System Requirements

| Specification | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10/11 (64-bit), macOS 12+ (Apple Silicon / Intel), Linux (glibc 2.31+) | Windows 11, macOS 14+, Ubuntu 22.04 LTS / Fedora 39 |
| **Processor** | Dual-core 1.8 GHz x86_64 / ARM64 | Quad-core 2.4 GHz+ |
| **Memory** | 2 GB RAM | 4 GB+ RAM |
| **Storage** | 200 MB free disk space | 500 MB+ SSD storage |
| **Graphics** | DirectX 11 / OpenGL 3.3 / WebGL capable | Hardware-accelerated GPU |

---

## 2. Desktop Installation

### Windows (NSIS Installer or Portable)
1. Download `MarkForge-Markdown-Studio-1.0.0-Setup.exe` or portable `.exe` from the GitHub Releases page.
2. Run the installer and choose an installation directory (defaults to `%LOCALAPPDATA%\Programs\MarkForge Markdown Studio`).
3. Launch via the Start Menu shortcut or desktop icon.
4. **Silent Enterprise Install:**
   ```powershell
   MarkForge-Markdown-Studio-1.0.0-Setup.exe /S /D=C:\Program Files\MarkForge Markdown Studio
   ```

### macOS (.dmg / .app)
1. Download `MarkForge-Markdown-Studio_1.0.0_aarch64.dmg` (Apple Silicon) or `_x64.dmg` (Intel).
2. Open the disk image and drag **MarkForge Markdown Studio** into your `/Applications` folder.
3. First launch: If Gatekeeper prompts verification, click **Open** or permit via `System Settings > Privacy & Security`.

### Linux (AppImage / Debian)
* **AppImage (Distro-agnostic):**
  ```bash
  chmod +x MarkForge-Markdown-Studio_1.0.0_amd64.AppImage
  ./MarkForge-Markdown-Studio_1.0.0_amd64.AppImage
  ```
* **Debian / Ubuntu (.deb):**
  ```bash
  sudo dpkg -i markforge-markdown-studio_1.0.0_amd64.deb
  sudo apt-get install -f
  ```

---

## 3. Web & Headless Local Deployment

To run the studio within an offline local server or browser environment:

```bash
# 1. Clone repository
git clone https://github.com/kumaradoss16/markdown-studio.git
cd markforge-markdown-studio

# 2. Install production dependencies
npm ci

# 3. Build standalone assets
npm run build

# 4. Preview locally (offline-first)
npm run preview -- --port 5173
```

Access the studio at `http://localhost:5173`.

---

## 4. In-Place Version Upgrades

MarkForge Markdown Studio preserves 100% of user data, preferences, custom themes, accent selections, and recovery journals during upgrades:

1. Close any running instances of MarkForge Markdown Studio.
2. Install the new version over the existing installation directory.
3. On first launch, the schema migration engine automatically preserves:
   * Application preferences: `devspirehub:settings`
   * Accent color selection: `devspirehub:accent`
   * Workspace tabs & dirty buffers: `devspirehub:workspace:state`
   * Crash recovery journal: `devspirehub:recovery:journal`

---

## 5. Integrity Verification (SHA-256)

Every release provides an official `checksums.txt` file. Verify downloaded binaries before execution:

* **Windows (PowerShell):**
  ```powershell
  Get-FileHash -Algorithm SHA256 .\MarkForge-Markdown-Studio-1.0.0-Setup.exe
  ```
* **macOS / Linux:**
  ```bash
  sha256sum -c checksums.txt
  ```
