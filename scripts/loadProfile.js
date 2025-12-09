import { chromium } from "playwright";

async function run() {
  console.log("🔵 Loading Medium cookies from environment variable...");

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
  await page.goto("https://medium.com");

  console.log("✅ Cookies loaded. You are now logged in!");
  await browser.close();
}

run();
