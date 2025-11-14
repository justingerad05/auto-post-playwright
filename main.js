import { chromium } from 'playwright';

async function run() {
  console.log("Starting Medium Automation...");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Go to Medium login page
  await page.goto("https://medium.com/m/signin");

  // 2. Click "Sign in with Google" button
  // NOTE: You must update this if you use email login later.
  await page.click('button:has-text("Sign in with Google")');

  console.log("Waiting for Google login page...");

  // 3. Stop here — because we will use saved cookies later
  await page.waitForTimeout(5000);

  console.log("Login placeholder completed.");

  // 4. Now go to Medium “New Story”
  await page.goto("https://medium.com/new-story");
  await page.waitForTimeout(3000);

  // Example Automation: Write a post
  await page.fill('textarea[placeholder="Title"]', "Automated Post Title");
  await page.fill('div[role="textbox"]', "This post was created automatically using Playwright.");

  console.log("Post created (not yet published).");

  await browser.close();
}

run();

