import { chromium } from "playwright";

async function run() {
  console.log("🔵 Running test post...");

  const cookiesEnv = process.env.MEDIUM_COOKIES;
  const cookies = JSON.parse(cookiesEnv);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies, origins: [] }
  });

  const page = await context.newPage();
  await page.goto("https://medium.com/new-story");

  // Wait for editor to load
  await page.waitForSelector('div[role="textbox"]', { timeout: 15000 });

  // Add a test title and body
  await page.fill('div[role="textbox"]', "This is a test post via automation.");
  await page.keyboard.press('Enter');
  await page.fill('div[role="textbox"] >> nth=1', "Medium Auto Post Test");

  console.log("✅ Test post filled. Check Medium editor manually if needed.");

  await browser.close();
}

run();
