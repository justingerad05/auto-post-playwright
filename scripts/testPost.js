// scripts/testPost.js
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR);
}

const cookiesEnv = process.env.MEDIUM_COOKIES;
if (!cookiesEnv) {
  console.error('❌ MEDIUM_COOKIES environment variable not set!');
  process.exit(1);
}

const cookies = JSON.parse(cookiesEnv);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies }
  });

  const page = await context.newPage();

  try {
    await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded' });
    console.log('🔵 Running test post...');

    // Wait for the editor textbox
    const editor = await page.waitForSelector('div[role="textbox"]', { timeout: 15000 });

    if (!editor) {
      throw new Error('Editor not found');
    }

    console.log('✅ Editor loaded successfully!');
    
    // Optionally: Type a test post
    await editor.fill('This is a test post from GitHub Actions automation.');
    
    console.log('✅ Test post ready (not published).');

  } catch (err) {
    console.error('❌ Could not find the editor or another error occurred:', err.message);
    const screenshotPath = path.join(SCREENSHOT_DIR, `medium-editor-fail-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
