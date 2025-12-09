// scripts/testPost.js
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: {
      cookies: JSON.parse(process.env.MEDIUM_COOKIES || '[]'),
    },
  });

  const page = await context.newPage();

  try {
    console.log('🔵 Opening Medium...');
    await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded' });

    // Close potential modals/popups
    const closeButtons = await page.$$('button[aria-label="Close"], button[jsaction="close"]');
    for (const btn of closeButtons) {
      await btn.click().catch(() => {});
    }

    // Wait for the editor to appear (increase timeout to 30s)
    console.log('🔵 Waiting for the editor...');
    await page.waitForSelector(
      'div[contenteditable="true"][role="textbox"], div.js-postField, div.section-inner',
      { timeout: 30000 }
    );

    console.log('✅ Editor found! Running test post...');
    // Insert a test title and content
    const titleBox = await page.$('h1');
    if (titleBox) await titleBox.type('Test Post from GitHub Actions', { delay: 50 });

    const editorBox = await page.$(
      'div[contenteditable="true"][role="textbox"], div.js-postField, div.section-inner'
    );
    if (editorBox) await editorBox.type('This is a test post sent from GitHub Actions.', { delay: 50 });

    console.log('✅ Test post input completed.');
  } catch (err) {
    console.error('❌ Could not find the editor or another error occurred:', err.message);

    // Save screenshot for debugging
    const screenshotPath = path.join(SCREENSHOT_DIR, `medium-editor-fail-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
