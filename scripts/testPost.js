const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

  try {
    const browser = await chromium.launch({ headless: true }); // headless for GitHub Actions
    const context = await browser.newContext({
      storageState: process.env.MEDIUM_COOKIES ? JSON.parse(process.env.MEDIUM_COOKIES) : undefined
    });
    const page = await context.newPage();

    console.log('🔵 Navigating to Medium new post page...');
    await page.goto('https://medium.com/new-story', { waitUntil: 'networkidle' });

    // Dynamic editor detection
    const editorSelectors = [
      'div[data-testid="storyTitle"]',
      'div[data-testid="storyContent"]',
      'div[role="textbox"]',
      'div[data-placeholder*="Write"]',
      'textarea'
    ];

    let editorFound = false;
    for (const selector of editorSelectors) {
      const editor = await page.$(selector);
      if (editor) {
        console.log(`✅ Editor found using selector: ${selector}`);
        editorFound = true;
        break;
      }
    }

    if (!editorFound) {
      const screenshotPath = path.join(screenshotsDir, `medium-editor-fail-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`❌ Could not find the editor. Screenshot saved: ${screenshotPath}`);
      process.exit(1);
    }

    console.log('🔵 Test post can proceed! Editor detected.');
    await browser.close();
  } catch (err) {
    console.error('❌ Error during test post:', err);
    process.exit(1);
  }
})();
