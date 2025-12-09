// scripts/loadProfile.js
import { chromium } from 'playwright';

const cookiesEnv = process.env.MEDIUM_COOKIES;

if (!cookiesEnv) {
  console.error('❌ MEDIUM_COOKIES environment variable not set!');
  process.exit(1);
}

const cookies = JSON.parse(cookiesEnv);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies } // Load cookies
  });

  const page = await context.newPage();

  try {
    await page.goto('https://medium.com/me');
    console.log('✅ Cookies loaded. You are now logged in!');
  } catch (err) {
    console.error('❌ Error logging in:', err);
    // Take screenshot on error
    const screenshotPath = `screenshots/login-fail-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
