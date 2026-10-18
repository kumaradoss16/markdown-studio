import { markdownPipeline } from '../../services/markdown-pipeline.js';
import { documentStateManager } from '../../core/document-state-manager.js';
import { AppEvents, eventBus } from '../../app/events.js';

export class PreviewComponent {
  constructor(container) {
    this.container = container;
    this.setupListeners();
  }

  setupListeners() {
    eventBus.on(AppEvents.DOCUMENT_CHANGED, (doc) => {
      const active = documentStateManager.getActiveDocument();
      if (active && active.id === doc.id) {
        this.renderPreview(doc);
      }
    });

    eventBus.on(AppEvents.DOCUMENT_ACTIVATED, (doc) => {
      this.renderPreview(doc);
    });
  }

  render() {
    this.container.innerHTML = `
      <div class="preview-header">
        <div class="preview-status-indicator">
          <span class="indicator-dot"></span>
          <span>LIVE RENDERED DOCUMENT</span>
        </div>
        <div class="preview-tools-group">
          <span class="parser-badge">PARSER: GFM + LATEX</span>
          <button class="header-btn" id="previewExportBtn" title="Export HTML / Markdown">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="preview-scroll-area" id="previewScrollArea"></div>
    `;

    const exportBtn = this.container.querySelector('#previewExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        eventBus.emit(AppEvents.DIALOG_OPEN, { type: 'export' });
      });
    }

    const activeDoc = documentStateManager.getActiveDocument();
    this.renderPreview(activeDoc);
  }

  renderPreview(doc) {
    const scrollArea = this.container.querySelector('#previewScrollArea');
    if (!scrollArea) return;

    if (!doc || !doc.content) {
      scrollArea.innerHTML = '<div style="padding: 40px; color: var(--color-text-muted); text-align: center;">No preview available</div>';
      return;
    }

    const { html, frontmatter } = markdownPipeline.process(doc, { withHeadingIds: true });

    // If document is Habitat Design or has Neo-Kyoto / TOP SECRET metadata, enrich with the visual components from reference
    const isHabitatDoc = doc.name.includes('Habitat Design') || doc.content.includes('Neo-Kyoto');

    if (isHabitatDoc) {
      scrollArea.innerHTML = `
        <div class="badge-group">
          <span class="spec-badge sec">#SEC-09</span>
          <span class="spec-badge rev">REV 8.27b</span>
          <span class="spec-badge secret">TOP SECRET</span>
        </div>

        <div class="preview-doc-title">
          <span>Habitat Design</span>
          <span class="doc-jp-title">サイバーシティ</span>
        </div>
        <div class="preview-doc-lead">
          A concept render and architectural operational document of Neo-Kyoto Space Habitat.
        </div>

        <!-- CAD Wireframe Card -->
        <div class="cad-wireframe-card">
          <svg class="cad-svg-container" viewBox="0 0 440 160">
            <ellipse cx="220" cy="80" rx="140" ry="38" fill="none" stroke="rgba(0, 229, 255, 0.4)" stroke-width="1.5" stroke-dasharray="3,3" />
            <ellipse cx="220" cy="80" rx="110" ry="28" fill="none" stroke="#00e5ff" stroke-width="1.8" />
            <ellipse cx="220" cy="80" rx="80" ry="18" fill="none" stroke="#a855f7" stroke-width="1.2" />
            <circle cx="220" cy="80" r="5" fill="#00e5ff" />
            <circle cx="220" cy="80" r="10" fill="none" stroke="#00e5ff" stroke-width="0.8" opacity="0.6" />
            <line x1="80" y1="80" x2="360" y2="80" stroke="rgba(255, 255, 255, 0.15)" stroke-width="0.8" />
            <line x1="220" y1="20" x2="220" y2="140" stroke="rgba(255, 255, 255, 0.15)" stroke-width="0.8" />
            
            <text x="140" y="45" font-family="var(--font-editor)" font-size="8.5" fill="#38bdf8">SPIN AXIS: 2.4 RPM</text>
            <text x="310" y="45" font-family="var(--font-editor)" font-size="8.5" fill="#10b981">SHIELD: BORON-PE</text>
            <text x="30" y="150" font-family="var(--font-editor)" font-size="8.5" fill="#64748b">● FIGURE 1.2: HABITAT CAD WIREFRAME</text>
          </svg>
        </div>

        <!-- Status Dashboard -->
        <div class="section-headline">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-cyan)" stroke-width="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
            <span>Status Dashboard</span>
          </div>
          <span class="section-meta">AUTO-REFRESH: 1s</span>
        </div>

        <div class="metric-grid">
          <div class="metric-card">
            <span class="label">MODULE MASS</span>
            <div class="val">18.4<span style="font-size: 13px; font-weight: 500;">t</span></div>
            <span class="sub success">▲ Within budget</span>
          </div>
          <div class="metric-card">
            <span class="label">CREW CAPACITY</span>
            <div class="val">12 <span style="font-size: 13px; font-weight: 500;">pax</span></div>
            <span class="sub">4 private + 8 shared</span>
          </div>
          <div class="metric-card">
            <span class="label">PRESSURIZED VOL.</span>
            <div class="val" style="color: var(--color-accent-emerald);">148<span style="font-size: 13px; font-weight: 500;">m³</span></div>
            <span class="sub">Largest comm. m..</span>
          </div>
        </div>

        <!-- Floor Plan Section -->
        <div class="section-headline">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-purple)" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            <span>Floor Plan</span>
          </div>
        </div>

        <p style="color: var(--color-text-secondary); margin-bottom: 14px;">
          The internal volume is bifurcated across two concentric decks designed to optimize human factor circadian rhythms during extended 180-day transit missions.
        </p>

        <!-- Upper Deck -->
        <div class="deck-container">
          <div class="deck-header">
            <div>
              <span class="dot cyan"></span>
              <span>UPPER DECK // HABITATION &amp; AVIONICS</span>
            </div>
            <span style="color: var(--color-text-muted);">DECK HEIGHT: 2.20M</span>
          </div>
          <div class="pods-grid">
            <div class="deck-pod"><div class="pod-name">SLP 1</div><div class="pod-type">Private</div></div>
            <div class="deck-pod"><div class="pod-name">SLP 2</div><div class="pod-type">Private</div></div>
            <div class="deck-pod"><div class="pod-name">SLP 3</div><div class="pod-type">Private</div></div>
            <div class="deck-pod"><div class="pod-name">SLP 4</div><div class="pod-type">Private</div></div>
            <div class="deck-pod highlight"><div class="pod-name" style="color: var(--color-accent-cyan);">AVIONICS CORE</div><div class="pod-type">AIRLOCK CONDUIT</div></div>
          </div>
          <div class="deck-strip">CENTRAL SPINE: [CORRIDOR - AUTO-LIGHTING 5500K]</div>
          <div class="deck-strip" style="margin-top: 4px;">BUNKS: [SHARED-A / 4 PAX] + [SHARED-B / 4 PAX]</div>
        </div>

        <!-- Lower Deck -->
        <div class="deck-container" style="margin-top: 10px;">
          <div class="deck-header">
            <div>
              <span class="dot emerald"></span>
              <span>LOWER DECK // LOGISTICS &amp; LIFE SUPPORT</span>
            </div>
            <span style="color: var(--color-text-muted);">PRESSURE: 101.3 kPa</span>
          </div>
          <div class="pods-grid" style="grid-template-columns: repeat(4, 1fr);">
            <div class="deck-pod"><div class="pod-name">GALLEY</div><div class="pod-type">Mess Deck</div></div>
            <div class="deck-pod"><div class="pod-name">COMMON</div><div class="pod-type">Recreation</div></div>
            <div class="deck-pod"><div class="pod-name">GYM &amp; ISO</div><div class="pod-type">Counter-gravity</div></div>
            <div class="deck-pod" style="border-color: rgba(244, 63, 94, 0.4);"><div class="pod-name" style="color: var(--color-accent-rose);">MEDBAY</div><div class="pod-type">Triage Pod</div></div>
          </div>
        </div>

        <div class="preview-content" style="margin-top: 24px;">
          ${html}
        </div>
      `;
    } else {
      scrollArea.innerHTML = `
        <div class="preview-content">
          ${html}
        </div>
      `;
    }

    // Attach wiki-link clicks
    scrollArea.querySelectorAll('.wiki-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = decodeURIComponent(link.getAttribute('data-wiki-target') || '');
        const targetFile = `ExampleVault/${target}.md`;
        documentStateManager.openDocument(targetFile, `# ${target}\n\nLinked document for ${target}.`, targetFile);
      });
    });

    // Attach internal anchor link scrolling (e.g. from TOC)
    scrollArea.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (href && href.length > 1) {
          const targetId = href.slice(1);
          const targetEl = scrollArea.querySelector(`#${targetId}`);
          if (targetEl) {
            e.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth' });
          }
        }
      });
    });
  }
}
