import puppeteer from 'puppeteer-core';

async function capture() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));

  await page.screenshot({
    path: 'C:\\Users\\kumar\\.gemini\\antigravity\\brain\\1d050ed7-5d2b-432d-a4dd-d8b36695c151\\workspace-screenshot.png'
  });

  console.log('Screenshot successfully taken.');
  await browser.close();
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
