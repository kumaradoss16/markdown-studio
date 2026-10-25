import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { exportEngine } from '../src/services/export-engine.js';

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

console.log(`Using browser: ${CHROME_PATH}`);

// Build a rich multi-page test document satisfying all 5 criteria
const paragraphs = [];
for (let i = 1; i <= 24; i++) {
  paragraphs.push(`
### Section ${i}: Planetary Observation & Telemetry Analysis (${i})

The deep space telemetry array continuously samples broadband radio emissions across 12 discrete bands. Orbital velocity vectors maintain standard trajectory deviations within 0.05% of baseline expectations. Automated calibration cycles execute at alternating ascending nodes to ensure sensor drift compensation across thermal fluctuations.

Each observation block records multi-spectral radiation readings, cosmic particle flux density, and micro-meteoroid impact frequencies. These parameters provide real-time validation of habitat hull integrity and sensor array calibration standards.
`);
}

const testContent = `
# Deep Space Research Lab: Mission Report & Architectural Specification

<span style="color: #e11d48; font-weight: bold; font-size: 1.1em;">CRITICAL SYSTEM ALERT: High-Energy Particle Burst Detected</span>

The automated research station has logged comprehensive mission telemetry across orbital phases 1 through 6. This document details engineering performance, environmental controls, and safety diagnostics.

<p style="background-color: #fef08a; color: #854d0e; padding: 14px; border-left: 5px solid #ca8a04; border-radius: 4px; font-weight: 500;">
Highlighted Operational Notice: Primary life support and environmental atmospheric scrubbing systems operate in closed-loop recycling mode. Any pressure deviations exceeding 0.02 bar trigger auxiliary nitrogen pressurization valves immediately.
</p>

## Subsystem Health & Diagnostics Matrix

<table style="width: 100%; border: 1px solid #94a3b8; border-collapse: collapse;">
  <thead style="background-color: #1e3a8a; color: #ffffff;">
    <tr>
      <th style="padding: 10px; background-color: #1e3a8a; color: #ffffff; text-align: left;">Subsystem</th>
      <th style="padding: 10px; background-color: #1e3a8a; color: #ffffff; text-align: left;">Status</th>
      <th style="padding: 10px; background-color: #1e3a8a; color: #ffffff; text-align: left;">Voltage</th>
      <th style="padding: 10px; background-color: #1e3a8a; color: #ffffff; text-align: left;">Thermal Fill</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background-color: #f0fdf4;">
      <td style="padding: 8px; font-weight: bold; color: #166534; border: 1px solid #cbd5e1;">Avionics Core</td>
      <td style="padding: 8px; background-color: #bbf7d0; color: #14532d; font-weight: bold; border: 1px solid #cbd5e1;">NOMINAL</td>
      <td style="padding: 8px; border: 1px solid #cbd5e1;">28.4 V</td>
      <td style="padding: 8px; background-color: #dcfce7; color: #15803d; border: 1px solid #cbd5e1;">Optimal (21°C)</td>
    </tr>
    <tr style="background-color: #fef2f2;">
      <td style="padding: 8px; font-weight: bold; color: #991b1b; border: 1px solid #cbd5e1;">Propulsion Bus</td>
      <td style="padding: 8px; background-color: #fecaca; color: #7f1d1d; font-weight: bold; border: 1px solid #cbd5e1;">CAUTION</td>
      <td style="padding: 8px; border: 1px solid #cbd5e1;">24.1 V</td>
      <td style="padding: 8px; background-color: #fee2e2; color: #b91c1c; border: 1px solid #cbd5e1;">Elevated (68°C)</td>
    </tr>
    <tr style="background-color: #eff6ff;">
      <td style="padding: 8px; font-weight: bold; color: #1e40af; border: 1px solid #cbd5e1;">Comms Array</td>
      <td style="padding: 8px; background-color: #bfdbfe; color: #1e3a8a; font-weight: bold; border: 1px solid #cbd5e1;">ACTIVE</td>
      <td style="padding: 8px; border: 1px solid #cbd5e1;">27.9 V</td>
      <td style="padding: 8px; background-color: #dbeafe; color: #1d4ed8; border: 1px solid #cbd5e1;">Normal (18°C)</td>
    </tr>
  </tbody>
</table>

## Mission Architecture Vectors & Vector Graphics

<span style="color: #2563eb; font-weight: 600;">System Vector Geometry Schematic:</span>

<div style="margin: 16px 0;">
  <svg width="340" height="90" viewBox="0 0 340 90">
    <rect x="10" y="10" width="80" height="70" rx="8" fill="#7c3aed" stroke="#5b21b6" stroke-width="2" />
    <circle cx="160" cy="45" r="35" fill="#06b6d4" stroke="#0891b2" stroke-width="2" />
    <polygon points="270,12 315,78 225,78" fill="#f59e0b" stroke="#d97706" stroke-width="2" />
  </svg>
</div>

${paragraphs.slice(0, 8).join('\n')}

<div style="background-color: #ecfdf5; border: 2px solid #10b981; padding: 12px; border-radius: 6px; margin: 16px 0;">
  <h4 style="color: #047857; margin: 0 0 6px 0;">Mid-Document Verification Checkpoint</h4>
  <p style="color: #065f46; margin: 0;">This colored panel verifies that middle pages maintain consistent background fills and text color preservation under page flow.</p>
</div>

${paragraphs.slice(8).join('\n')}

## Final Concluding Summary

<p style="color: #4338ca; font-weight: 600;">
All orbital research milestones have been archived. Terminal verification completed with zero telemetry anomalies.
</p>
`;

const sampleDoc = {
  id: 'doc-verify',
  name: 'verification-report.md',
  content: testContent,
  revision: 1
};

async function run() {
  console.log('Generating HTML from export engine...');
  const html = exportEngine.generateStandaloneHtml(sampleDoc, {
    format: 'pdf',
    theme: 'light'
  });

  const htmlPath = path.resolve('verification-preview.html');
  const pdfPath = path.resolve('verification-output.pdf');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`Saved HTML to ${htmlPath}`);

  console.log('Launching headless browser...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  console.log('Generating PDF via page.pdf with printBackground: true and preferCSSPageSize: true...');
  await page.pdf({
    path: pdfPath,
    preferCSSPageSize: true,
    printBackground: true
  });
  console.log(`Saved PDF to ${pdfPath} (${(fs.statSync(pdfPath).size / 1024).toFixed(1)} KB)`);

  // Now convert PDF to PNG and analyze margins and colors
  console.log('Rendering PDF pages to PNG using pdf.js canvas in browser...');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');

  const renderPage = await browser.newPage();
  await renderPage.setContent(`
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body style="margin: 0; background: #888888;">
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    async function analyzePdfPages(base64Data, scale) {
      const pdfData = atob(base64Data);
      const uint8Array = new Uint8Array(pdfData.length);
      for (let i = 0; i < pdfData.length; i++) {
        uint8Array[i] = pdfData.charCodeAt(i);
      }

      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      const pages = [];

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale || 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const dataUrl = canvas.toDataURL('image/png');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;

        // Measure top margin: first non-white pixel row
        let topRow = -1;
        for (let y = 0; y < canvas.height; y++) {
          let rowHasContent = false;
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const r = d[idx], g = d[idx+1], b = d[idx+2], a = d[idx+3];
            // Non-white: if not (r > 250 && g > 250 && b > 250)
            if (a > 50 && (r < 250 || g < 250 || b < 250)) {
              rowHasContent = true;
              break;
            }
          }
          if (rowHasContent) {
            topRow = y;
            break;
          }
        }

        // Measure bottom margin: last non-white pixel row
        let bottomRow = -1;
        for (let y = canvas.height - 1; y >= 0; y--) {
          let rowHasContent = false;
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            const r = d[idx], g = d[idx+1], b = d[idx+2], a = d[idx+3];
            if (a > 50 && (r < 250 || g < 250 || b < 250)) {
              rowHasContent = true;
              break;
            }
          }
          if (rowHasContent) {
            bottomRow = y;
            break;
          }
        }

        // Measure left margin: first non-white pixel col
        let leftCol = -1;
        for (let x = 0; x < canvas.width; x++) {
          let colHasContent = false;
          for (let y = 0; y < canvas.height; y++) {
            const idx = (y * canvas.width + x) * 4;
            const r = d[idx], g = d[idx+1], b = d[idx+2], a = d[idx+3];
            if (a > 50 && (r < 250 || g < 250 || b < 250)) {
              colHasContent = true;
              break;
            }
          }
          if (colHasContent) {
            leftCol = x;
            break;
          }
        }

        // A4 page height is 297mm, width is 210mm
        const mmPerPxY = 297 / canvas.height;
        const mmPerPxX = 210 / canvas.width;

        const topMarginMm = topRow >= 0 ? (topRow * mmPerPxY).toFixed(1) : 'N/A';
        const bottomMarginMm = bottomRow >= 0 ? ((canvas.height - 1 - bottomRow) * mmPerPxY).toFixed(1) : 'N/A';
        const leftMarginMm = leftCol >= 0 ? (leftCol * mmPerPxX).toFixed(1) : 'N/A';

        // Detect colors present on this page
        let hasRed = false;       // e11d48 (r~225, g~29, b~72)
        let hasYellowBg = false;   // fef08a (r~254, g~240, b~138)
        let hasBlueHeader = false; // 1e3a8a (r~30, g~58, b~138)
        let hasPurple = false;     // 7c3aed (r~124, g~58, b~237)
        let hasCyan = false;       // 06b6d4 (r~6, g~182, b~212)
        let hasAmber = false;      // f59e0b (r~245, g~158, b~11)
        let hasGreenBg = false;    // bbf7d0, dcfce7, ecfdf5 (green tints)
        let hasGreenText = false;  // 166534, 047857 (deep greens)

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
          if (a < 50) continue;

          // Red text: r > 180, g < 60, b < 90
          if (r > 180 && g < 60 && b < 90) hasRed = true;
          // Yellow highlight: r > 240, g > 220, b < 160
          if (r > 240 && g > 220 && b < 160) hasYellowBg = true;
          // Deep blue: r < 50, g < 80, b > 120
          if (r < 50 && g < 80 && b > 120) hasBlueHeader = true;
          // Purple shape: r between 100-150, g < 80, b > 200
          if (r >= 100 && r <= 150 && g < 80 && b > 200) hasPurple = true;
          // Cyan circle: r < 25, g > 160, b > 190
          if (r < 25 && g > 160 && b > 190) hasCyan = true;
          // Amber polygon: r > 230, g between 130-180, b < 30
          if (r > 230 && g >= 130 && g <= 180 && b < 30) hasAmber = true;
          // Green background: g > 200, r < 240, b < 240 and g > r + 20
          if (g > 200 && g > r + 20 && g > b + 10) hasGreenBg = true;
          // Deep green text: g between 80-150, r < 50, b < 90
          if (g >= 80 && g <= 150 && r < 50 && b < 90) hasGreenText = true;
        }

        pages.push({
          pageNum,
          width: canvas.width,
          height: canvas.height,
          topMarginPx: topRow,
          bottomMarginPx: bottomRow >= 0 ? canvas.height - 1 - bottomRow : -1,
          leftMarginPx: leftCol,
          topMarginMm,
          bottomMarginMm,
          leftMarginMm,
          colors: {
            hasRed,
            hasYellowBg,
            hasBlueHeader,
            hasPurple,
            hasCyan,
            hasAmber,
            hasGreenBg,
            hasGreenText
          },
          dataUrl
        });
      }
      return pages;
    }
  </script>
</body>
</html>
  `);

  console.log('Evaluating PDF page rendering & color measurement in browser context...');
  const analyzedPages = await renderPage.evaluate(async (b64) => {
    return await window.analyzePdfPages(b64, 1.5);
  }, pdfBase64);

  console.log(`\n============================================================`);
  console.log(`  VERIFICATION RESULTS: ${analyzedPages.length} PAGES GENERATED`);
  console.log(`============================================================\n`);

  for (const p of analyzedPages) {
    const pngPath = path.resolve(`verification-page-${p.pageNum}.png`);
    const base64Png = p.dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(pngPath, Buffer.from(base64Png, 'base64'));

    console.log(`--- Page ${p.pageNum} of ${analyzedPages.length} ---`);
    console.log(`  Image Dimensions: ${p.width} x ${p.height} px`);
    console.log(`  Measured Top Margin:    ${p.topMarginMm} mm (${p.topMarginPx} px)`);
    console.log(`  Measured Bottom Margin: ${p.bottomMarginMm} mm (${p.bottomMarginPx} px)`);
    console.log(`  Measured Left Margin:   ${p.leftMarginMm} mm (${p.leftMarginPx} px)`);
    console.log(`  Color Detection:`);
    console.log(`    - Red text (#e11d48):             ${p.colors.hasRed ? '✓ DETECTED' : '-'}`);
    console.log(`    - Highlighted yellow (#fef08a):    ${p.colors.hasYellowBg ? '✓ DETECTED' : '-'}`);
    console.log(`    - Blue table header (#1e3a8a):     ${p.colors.hasBlueHeader ? '✓ DETECTED' : '-'}`);
    console.log(`    - Purple SVG rect (#7c3aed):       ${p.colors.hasPurple ? '✓ DETECTED' : '-'}`);
    console.log(`    - Cyan SVG circle (#06b6d4):       ${p.colors.hasCyan ? '✓ DETECTED' : '-'}`);
    console.log(`    - Amber SVG polygon (#f59e0b):     ${p.colors.hasAmber ? '✓ DETECTED' : '-'}`);
    console.log(`    - Green cell/panel fill:           ${p.colors.hasGreenBg ? '✓ DETECTED' : '-'}`);
    console.log(`    - Deep green text (#166534):       ${p.colors.hasGreenText ? '✓ DETECTED' : '-'}`);
    console.log(`  Saved PNG artifact: ${pngPath}\n`);
  }

  await browser.close();
  return analyzedPages;
}

run().catch(err => {
  console.error('Verification run failed:', err);
  process.exit(1);
});
