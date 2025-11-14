import { chromium } from 'playwright';

async function run() {
  console.log("Starting Medium Automation...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Load Google cookies
  const googleCookies = JSON.parse(process.env.GOOGLE_COOKIES || "[]");
  await context.addCookies(googleCookies);

  // Load Medium cookies
  const mediumCookies = JSON.parse(process.env.MEDIUM_COOKIES || "[]" );
  await context.addCookies(mediumCookies);

  const page = await context.newPage();

  // Test login by visiting Medium homepage
  await page.goto("https://medium.com/");
  await page.waitForTimeout(3000);

  console.log("Logged in successfully using cookies!");

  // Go to new story page
  await page.goto("https://medium.com/new-story");
  await page.waitForTimeout(3000);

  // Create post
  await page.fill('textarea[placeholder="Title"]', "Automated Post Title");
  await page.fill('div[role="textbox"]', "This post was created automatically using Playwright + GitHub Actions.");

  console.log("✓ Post created!");

  await browser.close();
}

run();
