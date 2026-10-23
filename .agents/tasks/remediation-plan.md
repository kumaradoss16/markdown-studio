# MarkForge Security & Quality Remediation Plan

**Target:** Fix 7 critical/high-priority issues spanning XSS sanitization, PDF export layout, accent color system, async race conditions, filesystem error handling, and git hygiene.

**Health Score Target:** 7.3/10 → 8.5/10

---

## Phase 1: Critical Security & Rendering Issues

### 1. XSS Vulnerability: Overly Permissive DOMPurify Configuration (SEC-001)

**What:** Remove `<input>` tag and event-handler attributes from the DOMPurify allowlist in `src/services/markdown-service.js`. The current configuration allows dangerous HTML form inputs and inline event handlers (onerror, onload, onclick, etc.) which can be exploited even with the forbid list because allow lists take precedence.

**Files:**
- `src/services/markdown-service.js` (lines 142–165)

**Changes:**
1. Remove `'input'` from `ALLOWED_TAGS` array
2. Remove `'type'`, `'checked'`, `'disabled'` from `ALLOWED_ATTR` array
3. Add explicit comment documenting the security rationale
4. Verify FORBID_TAGS and FORBID_ATTR already cover script, iframe, style, form, etc.

**Verify:** Run `npm run test` and confirm all unit tests pass, especially `tests/security/` XSS regression tests.

---

### 2. PDF Export Corner Text & Header/Footer Pollution (PDF-001)

**What:** Remove browser-injected header/footer text, timestamps, and URLs appearing in corners of PDF exports. The export-engine generates correct content but Puppeteer's default options include `displayHeaderFooter: true` which adds page numbers, timestamps, and URLs.

**Files:**
- `src/services/export-engine.js` (around lines 636–690 — Puppeteer PDF generation)
- `src/styles/preview.css` (check for export-specific footer selectors)

**Changes:**
1. Locate the `generatePdf()` method in export-engine.js
2. Set `displayHeaderFooter: false` in Puppeteer PDF options
3. Add `@page { margin: 15mm; }` CSS rule to suppress browser-injected content
4. Add `@media print { body { margin: 0 !important; padding: 0 !important; } }` to kill margin artifacts
5. Ensure all `.export-footer`, `.fenced-code-header`, `.copy-btn` elements are hidden (already in CSS, verify they're not re-appearing)
6. Strip any remaining hardcoded URLs, timestamps, or copy badges from generated HTML before PDF conversion

**Verify:** 
- Export a test document as PDF
- Open in PDF viewer and inspect all four corners + header/footer areas
- Confirm no text, URLs, dates, or icons appear in margins
- Run `npm run test` to verify no export tests break

---

### 3. Unhandled Promise Rejection in Image Load Chain (PDF-002)

**What:** The image embedding logic in `generatePdf()` chains Promises without `.catch()` handlers, causing unhandled rejections if an image fails to load. This manifests as silent errors and incomplete PDFs.

**Files:**
- `src/services/export-engine.js` (image fetch and load logic, ~lines 636–690)

**Changes:**
1. Wrap all image fetch calls in try-catch blocks
2. Add `.catch()` handlers on Promise chains for image loading
3. Graceful fallback: on image load failure, embed a 1x1 transparent GIF or skip the image with a console warning
4. Ensure all promise chains in `generatePdf()` have explicit error handlers
5. Add unit test to verify a broken image reference doesn't crash the export

**Verify:**
- Create a test document with a broken image reference (e.g., `![alt](broken.png)`)
- Export as PDF — should complete without errors in the console
- Run `npm run test` to confirm all tests pass

---

## Phase 2: High-Priority Usability & Stability Issues

### 4. Accent Color System Only Covers ~40% of UI (ACC-001)

**What:** The accent color system is implemented for primary brand colors but doesn't apply globally. 60+ hardcoded hex colors (#3b82f6, #10b981, #ef4444, #f59e0b, #a855f7, etc.) are scattered across component CSS files, toolbar, status badges, and QA modals. Users can select an accent preset but most UI remains hardcoded.

**Files to audit and update:**
- `src/styles/tokens.css` (color token definitions — PARTIALLY DONE)
- `src/styles/components.css` (60+ hardcoded colors)
- `src/styles/toolbar.css` (gradient backgrounds, status badges)
- `src/styles/github.css` (remote status badges, commit indicators)
- `src/styles/preview.css` (live indicator dots)
- `src/components/qa/project-qa-modal.js` (inline hardcoded colors in HTML)
- `src/components/dialogs/dialogs.js` (accent swatch rendering)

**Changes:**
1. Define comprehensive CSS variable tokens in `src/styles/tokens.css` for:
   - Secondary accent shades (hover, disabled, soft background variants)
   - Status color overrides for all presets (clean, dirty, saving, error)
   - UI component colors (badges, indicators, gradients)
2. Replace all hardcoded hex colors in `.css` files with `var(--color-*)` references
3. Remove inline `style="..."` attributes from HTML in `project-qa-modal.js` and `dialogs.js`; use CSS classes instead
4. Ensure all `[data-accent="*"]` CSS selectors define the full set of derived colors (hover, soft, glow variants)
5. Add a comprehensive CSS variable reference comment at the top of `tokens.css` documenting all variables

**Specific replacements:**
- `#3b82f6` (Blue) → Use `--accent` variable in `[data-accent="blue"]` context
- `#10b981` (Green/Emerald) → Use `--color-status-clean` or `--accent` as context requires
- `#ef4444` (Red) → Define as `--color-status-error` and reference throughout
- `#f59e0b` (Amber/Orange) → Define as `--color-status-dirty`
- `#a855f7` (Violet) → Use `--accent` in `[data-accent="violet"]`
- Gradient backgrounds → Replace with CSS variables: `linear-gradient(90deg, var(--color-status-error), var(--color-status-dirty), var(--color-status-clean), ...)`

**Verify:**
- `npm run build` completes without errors
- Switch between all 9 accent presets in the UI accent selector
- Verify badges, indicators, modals, toolbar, and status displays all update colors dynamically
- Run `npm run test` — all tests pass
- Manually inspect that no hardcoded hex colors remain in visible output (check DevTools Elements for computed style values)

---

### 5. Async Race Condition in Credential Store Initialization (AUTH-001)

**What:** The `CredentialStore` constructor doesn't await the `init()` method. Multiple concurrent calls to store methods before initialization completes can race, leaving `this.cryptoKey` undefined and causing methods to fail silently or throw unhandled errors.

**Files:**
- `src/services/credential-store.js` (lines 23–60)

**Changes:**
1. Convert constructor to async or use a static factory pattern:
   - **Option A (Recommended):** Add static `async create()` factory method that constructs, calls `await this.init()`, and returns the instance
   - Option B: Change constructor to synchronous initialization guard; defer crypto setup to first use with a flag
2. Update all call sites (`src/services/github-auth-service.js`, `src/app/commands.js`) to use `await CredentialStore.create()` instead of `new CredentialStore()`
3. Add initialization guard in all public methods: if `!this.isInitialized`, throw or auto-initialize
4. Add unit test for concurrent access before initialization

**Verify:**
- Run `npm run test` — all tests pass, including credential store tests
- Verify GitHub auth flow completes without errors
- Check browser console for any warnings or unhandled promise rejections

---

### 6. Virtual Filesystem Fallback Missing Error Boundaries (FS-001)

**What:** In `src/services/filesystem-adapter.js`, the fallback to virtual storage (in-memory) when Tauri fails has no error boundaries. Failures silently cascade, and there's no way for the UI to know it's operating in degraded mode.

**Files:**
- `src/services/filesystem-adapter.js` (lines 40–100)
- `src/services/filesystem-service.js` (top-level consumers)

**Changes:**
1. Wrap all Tauri calls (`readDir`, `readFile`, `writeFile`) in try-catch blocks
2. Log errors with a clear message indicating Tauri failure
3. Add public method `isVirtualMode()` that returns true if currently using virtual storage
4. Add property `virtualModeReason` (string) capturing why virtual mode is active
5. Emit an app-level event or set a DOM flag (`data-virtual-mode="true"`) when falling back
6. Update UI (status bar or header) to show a visual warning when in virtual mode
7. Document the fallback chain clearly in JSDoc comments

**Verify:**
- Run `npm run test` and confirm filesystem tests pass
- Manually test file operations (create, read, write, delete) both with Tauri enabled and disabled
- Verify UI shows appropriate warning when in virtual mode
- Check that operations complete without throwing unhandled errors

---

### 7. Missing .gitignore Patterns (GIT-001)

**What:** The `.gitignore` is incomplete. It's missing patterns for secrets, certificates, build artifacts, OS files, Vite cache, and Rust build artifacts, creating risks of accidental commits of sensitive data.

**Files:**
- `.gitignore`

**Changes:**
Add the following patterns to `.gitignore`:

```
# Environment & Secrets
.env
.env.local
.env.*.local
.env.production
.secrets/

# Certificates & Keys
*.pem
*.key
*.crt
*.p12
*.pfx

# Build & Dist
dist/
dist-release/
coverage/
.turbo/

# Vite Cache
.vite/
.vitest/

# Rust Build (if Tauri backend compiles)
target/
src-tauri/target/

# Node cache beyond node_modules
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# OS-specific
.DS_Store
.AppleDouble
.LSOverride
Thumbs.db
ehthumbs.db
Desktop.ini

# IDE cache
.vscode/
!.vscode/extensions.json
.idea/
*.swp
*.swo
*~

# Test coverage
lcov.info

# Application temp
*.tmp
*.temp
tmp/
```

**Verify:**
- Run `git status` and confirm no untracked sensitive files appear
- Create a test `.env.local` file and verify it's ignored
- Create a test certificate and verify it's ignored
- Run `git check-ignore -v <filename>` for each new pattern to confirm matching works

---

## Implementation Order

Execute in this sequence to maintain a buildable state after each step:

1. **SEC-001** — Fix XSS DOMPurify allowlist (isolated, security-critical)
2. **PDF-001** — Fix PDF header/footer pollution (isolated, rendering)
3. **PDF-002** — Add promise error handling in PDF generation (depends on PDF-001 context)
4. **GIT-001** — Update .gitignore (no code changes, safe isolation)
5. **AUTH-001** — Fix credential store race condition (isolated, requires refactoring one service)
6. **FS-001** — Add error boundaries to filesystem adapter (isolated, defensive)
7. **ACC-001** — Refactor accent color system (largest surface area; do last so earlier fixes aren't overwritten)

---

## Build & Test Commands

From package.json:
- **Build:** `npm run build`
- **Test:** `npm run test`
- **Test (watch):** `npm run test:watch`
- **Lint:** `npm run lint`
- **Dev server:** `npm run dev`
- **QA:** `npm run qa:ci` (CI-blocking quality gates)

---

## Risk Assessment

| Issue | Risk | Mitigation |
|-------|------|-----------|
| SEC-001 | Low (localized) | Add new tests for input tag rejection |
| PDF-001 | Low (UI only) | Manual PDF inspection after merge |
| PDF-002 | Medium (silent failures) | Add error logs; test with broken images |
| GIT-001 | Low (hygiene only) | No code changes; verify with git check-ignore |
| AUTH-001 | Medium (async gotcha) | Full refactor with pattern change; update all call sites |
| FS-001 | Low (defensive) | Add fallback tests; UI warning mitigates user confusion |
| ACC-001 | High (large refactor) | Highest risk: 60+ color references; refactor carefully by theme |

---

## Success Criteria

- All 7 issues resolved
- `npm run test` passes 100%
- `npm run lint` passes 100%
- `npm run build` completes without warnings
- No XSS vectors remain in markdown rendering
- PDF exports are clean (no corner text, headers, footers)
- Accent color system is globally applied (~95%+ of UI)
- No unhandled promise rejections in console
- Virtual filesystem mode shows UI warning
- .gitignore blocks all secrets, certificates, and build artifacts
- Health score measurable improvement (7.3 → 8.5)
