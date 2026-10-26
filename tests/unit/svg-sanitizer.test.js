import { describe, it, expect } from 'vitest';
import { svgSanitizer } from '../../src/services/svg-sanitizer.js';

describe('SvgSanitizer (Slice 2)', () => {
  it('allows clean valid SVG vectors', () => {
    const cleanSvg = `<svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red" /></svg>`;
    const res = svgSanitizer.sanitize(cleanSvg);
    expect(res.success).toBe(true);
    expect(res.sanitized).toContain('<circle');
    expect(res.sanitized).toContain('fill="red"');
    expect(res.error).toBeNull();
  });

  it('rejects SVG missing root <svg> element', () => {
    const bad = `<div>Not an svg</div>`;
    const res = svgSanitizer.sanitize(bad);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Missing root <svg> element/i);
  });

  it('removes or blocks <script> tags inside SVG', () => {
    const malicious = `<svg width="100" height="100"><script>alert(1)</script><rect width="50" height="50"/></svg>`;
    const res = svgSanitizer.sanitize(malicious);
    if (res.success) {
      expect(res.sanitized).not.toContain('<script');
      expect(res.sanitized).not.toContain('alert(1)');
    } else {
      expect(res.error).toMatch(/Forbidden element|script/i);
    }
  });

  it('strips on* inline event handlers', () => {
    const malicious = `<svg width="100" height="100"><circle cx="50" cy="50" r="40" onload="alert('pwn')" onclick="evil()" /></svg>`;
    const res = svgSanitizer.sanitize(malicious);
    expect(res.success).toBe(true);
    expect(res.sanitized).not.toContain('onload');
    expect(res.sanitized).not.toContain('onclick');
    expect(res.sanitized).not.toContain('alert');
  });

  it('rejects or removes <foreignObject> elements', () => {
    const malicious = `<svg width="100" height="100"><foreignObject width="100" height="100"><iframe src="https://evil.com"></iframe></foreignObject></svg>`;
    const res = svgSanitizer.sanitize(malicious);
    if (res.success) {
      expect(res.sanitized).not.toContain('<foreignObject');
      expect(res.sanitized).not.toContain('<iframe');
    } else {
      expect(res.error).toMatch(/Forbidden element|foreignObject/i);
    }
  });

  it('strips external href / xlink:href while preserving internal fragment identifiers', () => {
    const svgWithLinks = `<svg width="100" height="100">
      <a href="https://malicious.org"><rect width="20" height="20"/></a>
      <use href="#internal-def"/>
      <use xlink:href="http://remote.org/defs.svg#icon"/>
    </svg>`;
    const res = svgSanitizer.sanitize(svgWithLinks);
    expect(res.success).toBe(true);
    expect(res.sanitized).not.toContain('https://malicious.org');
    expect(res.sanitized).not.toContain('http://remote.org');
    expect(res.sanitized).toContain('#internal-def');
  });

  it('strips external CSS url() in style attributes', () => {
    const svgWithStyle = `<svg width="100" height="100"><rect style="background: url('https://evil.com/leak.png'); fill: blue;" width="50" height="50"/></svg>`;
    const res = svgSanitizer.sanitize(svgWithStyle);
    expect(res.success).toBe(true);
    expect(res.sanitized).not.toContain('https://evil.com/leak.png');
  });
});
