// scripts/post.js
// Minimal Playwright script to publish to Medium and Mix.
// IMPORTANT: websites change frequently. You will likely need to tune selectors.
// Store credentials in GitHub Secrets (MEDIUM_EMAIL, MEDIUM_PASSWORD, MIX_EMAIL, MIX_PASSWORD).
// Optional: PROXY_URL secret if you want Actions to use a proxy.

const { chromium } = require('playwright');

(async () => {
  const proxy = process.env.PROXY_URL || null;
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    proxy: proxy ? { server: proxy } : undefined,
  });

  // create persistent context if you want to reuse session during same job
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  try {
    // ---------- MEDIUM ----------
    if (process.env.MEDIUM_EMAIL && process.env.MEDIUM_PASSWORD) {
      const page = await context.newPage();
      console.log('→ Logging into Medium...');
      await page.goto('https://medium.com/m/signin', { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // Medium offers multiple sign-in options. We'll attempt email flow.
      // Click "Sign in with email" (selector may change)
      try {
        await page.click('text=Sign in with email');
      } catch (e) {
        // fallback: try direct email form
      }

      // Fill email & submit
      await page.fill('input[type="email"]', process.env.MEDIUM_EMAIL);
      await page.click('button[type="submit"]');

      // Medium might send an email link (magic link). If your account uses password, you must adapt flow.
      // If your account uses traditional password flow (older accounts), use the password selectors:
      // WAIT carefully for password form or fallback to manual handling if magic link required.
      await page.waitForTimeout(5000);

      // Try password flow:
      const passwordInput = await page.$('input[type="password"]');
      if (passwordInput) {
        await page.fill('input[type="password"]', process.env.MEDIUM_PASSWORD);
        await page.click('button[type="submit"]');
      } else {
        console.warn('Medium probably uses magic link or different flow. You may need to handle the magic link or switch to token-based API if you have a token.');
      }

      // Wait until logged in (check avatar or /me)
      await page.waitForTimeout(5000);
      // Check if logged in by visiting https://medium.com/me
      await page.goto('https://medium.com/me', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (page.url().includes('/me')) {
        console.log('→ Medium login likely successful');
      } else {
        console.warn('→ Medium login not confirmed. You might need to adjust the login flow or use manual storageState.');
      }

      // Create a new story
      console.log('→ Creating Medium story...');
      await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // Replace selectors below if Medium UI changes
      const title = 'Automated Post Title - ' + new Date().toISOString();
      const content = `This is an automated post from Playwright on ${new Date().toISOString()}.\n\nSource: honestproductreviewlab.blogspot.com`;

      // Click title area and type
      await page.click('div[role="textbox"]'); // approximate; sometimes first textbox is title
      // Some Medium editors require focusing a specific element; try common fallbacks:
      try {
        await page.fill('h1', title);
      } catch (e) {
        try { await page.keyboard.type(title); } catch(e2){ console.warn('Title typing fallback failed'); }
      }

      // Insert paragraph
      await page.keyboard.press('Enter');
      await page.keyboard.type(content);

      // Publish: open publish dialog
      // Again, selectors change, try to click publish button text
      await page.waitForTimeout(2000);
      try {
        await page.click('text=Publish');
      } catch (err) {
        // fallback: try other button
        console.warn('Could not click Publish directly; please check editor UI.');
      }

      // Wait a bit for publishing
      await page.waitForTimeout(5000);
      console.log('→ Medium flow finished (verify manually).');
      await page.close();
    } else {
      console.log('→ MEDIUM_EMAIL/MEDIUM_PASSWORD not provided; skipping Medium.');
    }

    // ---------- MIX.COM ----------
    if (process.env.MIX_EMAIL && process.env.MIX_PASSWORD) {
      const p2 = await context.newPage();
      console.log('→ Logging into Mix.com...');

      await p2.goto('https://mix.com/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });

      // Mix may use third-party oauth (Google). If so, you need to handle the provider or use email/pass if available.
      // Attempt email/password:
      try {
        await p2.fill('input[type="email"]', process.env.MIX_EMAIL);
        await p2.fill('input[type="password"]', process.env.MIX_PASSWORD);
        await p2.click('button[type="submit"]');
      } catch (e) {
        console.warn('Mix login flow might be different; adjust selectors or use provider login flow.');
      }

      await p2.waitForTimeout(5000);
      // Create post / compose - Mix UI changes; this is a placeholder sequence.
      // Open new post composer (replace selector with actual)
      try {
        await p2.goto('https://mix.com/_hive/post', { waitUntil: 'domcontentloaded' });
        // Fill title
        await p2.fill('input[name="title"]', 'Automated Mix Post ' + new Date().toISOString());
        // Fill body
        await p2.fill('textarea[name="body"]', 'Automated content — see original: https://honestproductreviewlab.blogspot.com');
        // Submit
        await p2.click('button[type="submit"]');
        console.log('→ Mix post attempted (verify in Mix).');
      } catch (err) {
        console.warn('Mix posting flow failed or needs selector updates: ', String(err).slice(0,200));
      }

      await p2.close();
    } else {
      console.log('→ MIX_EMAIL/MIX_PASSWORD not provided; skipping Mix.');
    }

  } catch (err) {
    console.error('Script error', err);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
})();
