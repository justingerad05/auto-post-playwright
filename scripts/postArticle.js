import { chromium } from "playwright";

async function run() {
  const cookiesEnv = process.env.MEDIUM_COOKIES;
  if (!cookiesEnv) {
    console.error("❌ MEDIUM_COOKIES not found!");
    process.exit(1);
  }

  const cookies = JSON.parse(cookiesEnv);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies, origins: [] }
  });

  const page = await context.newPage();
  await page.goto("https://medium.com/new-story");

  await page.waitForSelector('div[role="textbox"]', { timeout: 15000 });

  // Replace these with your actual content
  const title = "Automated Post Title";
  const body = "This is the body of the automated post.";

  await page.fill('div[role="textbox"]', title);
  await page.keyboard.press('Enter');
  await page.fill('div[role="textbox"] >> nth=1', body);

  // Optional: Publish (uncomment to auto-publish)
  // await page.click('button:has-text("Publish")');

  console.log("✅ Article filled. Review in Medium editor or publish manually.");

  await browser.close();
}

run();
