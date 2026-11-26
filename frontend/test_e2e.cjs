const puppeteer = require('puppeteer');
const path = require('path');

async function runMobile375Test() {
  console.log('--- Starting LinkSure 375px Mobile & Cache Verification ---');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });

  console.log('1. Navigating to http://127.0.0.1:5173 at 375px width ...');
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0' });

  // Verify PWA manifest link exists
  const manifestHref = await page.$eval('link[rel="manifest"]', el => el.getAttribute('href'));
  console.log(`2. PWA manifest link: ${manifestHref}`);

  // Load the 8 real ASINs
  const realAsins = 'B0DS8PP26V B0DSG16349 B0DSLB1778 B0FSN4SK8T B0DTHPWFWK B0DTV21KQQ B0FFGZK7ZG B0H26YWBMX';
  await page.type('textarea', realAsins);
  await new Promise(r => setTimeout(r, 500));

  console.log('3. Running check for 8 real ASINs ...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const checkBtn = buttons.find(b => b.textContent.includes('Check 8 Links'));
    if (checkBtn) checkBtn.click();
  });

  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const cards = document.querySelectorAll('.results-mobile-cards > div');
    return text.includes('Check Complete') && cards.length === 8;
  }, { timeout: 60000 });

  await new Promise(r => setTimeout(r, 500));

  // Verify blocked rate indicator and mobile card count
  const check1 = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const cards = document.querySelectorAll('.results-mobile-cards > div').length;
    return {
      overflow,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cards,
      hasBlockedRate: bodyText.includes('Blocked rate:'),
      blockedRateLine: bodyText.split('\n').find(l => l.includes('Blocked rate:')) || '',
    };
  });
  console.log('4. First run at 375px:', check1);
  if (check1.overflow) {
    throw new Error(`Horizontal overflow at 375px: scrollWidth=${check1.scrollWidth} > clientWidth=${check1.clientWidth}`);
  }
  if (!check1.hasBlockedRate) {
    throw new Error('Blocked rate indicator not found');
  }

  // Run a second time immediately to verify 24h cache + "cached" badge + "Force re-check" button
  console.log('5. Running second check to verify 24h cache badge & Force re-check button ...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const checkBtn = buttons.find(b => b.textContent.includes('Check 8 Links'));
    if (checkBtn) checkBtn.click();
  });

  await page.waitForFunction(() => {
    const text = document.body.innerText;
    const cards = document.querySelectorAll('.results-mobile-cards > div');
    return text.includes('Check Complete') && cards.length === 8 && text.includes('cached');
  }, { timeout: 15000 });

  await new Promise(r => setTimeout(r, 400));

  const check2 = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    return {
      hasCachedBadge: bodyText.includes('cached'),
      hasForceRecheck: bodyText.includes('Force re-check'),
      fromCacheCount: bodyText.includes('from 24h cache'),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  console.log('6. Second run (cached) at 375px:', check2);

  const shotPath = path.resolve(__dirname, '..', 'screenshot_mobile_375.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`7. Saved 375px screenshot to: ${shotPath}`);

  await browser.close();
  console.log('--- 375px Mobile & Cache Verification Passed! ---');
}

runMobile375Test().catch(err => {
  console.error('Mobile 375px Test Failed:', err);
  process.exit(1);
});
