# MarkForge Markdown Studio v1.0.1

**MarkForge Markdown Studio v1.0.1** introduces a high-performance, single-file native Windows executable and Inno Setup installer built with the Visual Studio C++ toolchain and Microsoft WebView2. This release also incorporates comprehensive PDF export engine margin and color fidelity enhancements, resolving page-boundary and styling defects.

---

## What's Changed & Fixes

- **Native Windows C++ Desktop Host (`src-win32`):** Implemented a lightweight, DPI-aware Win32 host with immersive dark-mode title bar, static CRT linking (`/MT`), and Microsoft WebView2 integration (`286b3bb`).
- **Single-File Portable Executable:** All web frontend assets (HTML, CSS, JavaScript, icons) are embedded directly as PE resources inside the standalone binary, operating offline with zero sibling file dependencies (`286b3bb`).
- **Inno Setup 6 Installer Package:** Added per-user setup wizard with fixed GUID, Start Menu shortcut, optional desktop icon, optional `.md` file associations, and clean uninstaller (`fb769e0`).
- **PDF Export Margin Alignment:** Enforced consistent 20mm top and bottom margins across all pages via CSS `@page` paged media rules, eliminating margin doubling and page edge clipping (`953e3c4`).
- **Print Color Fidelity:** Enabled exact print color retention (`print-color-adjust: exact`) across all elements and removed destructive `!important` color overwrites, ensuring user highlight colors, code block badges, and tables render accurately in exported PDFs (`953e3c4`).
- **Tauri Virtual FS Toast Storm Mitigation:** Resolved unhandled promise errors and notification loops during virtual fallback (`ed9c1bb`).
- **Security & UX Hardening:** Strengthened Content Security Policy (CSP), masked GitHub PAT input with an interactive modal dialog, and added anti-FOUC initialization script (`08afd60`).

---

## Installation & Which Download to Choose

- **Installer (`markdown-studio-v1.0.1-windows-x64-setup.exe`):**
  Recommended for desktop workstations. Installs MarkForge into `{localappdata}\Programs\MarkForge Markdown Studio` without requiring administrator / UAC elevation, creates Start Menu and optional Desktop shortcuts, provides `.md` file associations, and registers a standard uninstaller in Windows Add/Remove Programs.
- **Standalone Portable (`markdown-studio-v1.0.1-windows-x64-portable.exe`):**
  Zero-install, single-file executable. Copy anywhere (e.g. desktop, flash drive) and launch directly. App state and web cache are stored cleanly in `%LOCALAPPDATA%\MarkdownStudio`.

---

## System Requirements

- **Operating System:** Windows 10 (version 1809 or higher) or Windows 11 (64-bit x64).
- **Runtime Dependency:** Microsoft Edge WebView2 Runtime (pre-installed by default on Windows 11 and modern Windows 10). If not present, the application will display a prompt offering to download it from Microsoft's official site.
- **Visual C++ Redistributable:** **Not required.** The executable is compiled with `/MT` (Static C Runtime) and contains no external C++ runtime dependencies.

---

## Windows SmartScreen Notice

> [!NOTE]
> Because these binaries are built from source and not signed with an expensive Extended Validation (EV) code-signing certificate, Windows SmartScreen may display an alert: *"Windows protected your PC"*.
>
> To run the application:
> 1. Click **More info**
> 2. Click **Run anyway**
>
> You can verify the integrity of your download against the SHA-256 checksums below.

---

## Checksums (SHA-256)

```text
314a970840afd5aa0e76edda3ac04eba1e539c7c945aeac514e183d500462600  markdown-studio-v1.0.1-windows-x64-setup.exe
ef94556b0fcd971d88a2cbb54a6e55a27aad2e3fd1cf7603cf2e556813182867  markdown-studio-v1.0.1-windows-x64-portable.exe
```

---

## Known Issues

- Systems lacking the Microsoft Edge WebView2 Runtime must install the evergreen runtime from Microsoft before the window can render.
