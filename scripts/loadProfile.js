import { chromium } from "playwright";

async function run() {
  console.log("🔵 Loading profile (cookies + storage)…");

  let cookies, storage;

  try {
    cookies = JSON.parse(process.env.MEDIUM_COOKIES);
    storage = JSON.parse(process.env.MEDIUM_STORAGE);
  } catch (err) {
    console.error("❌ Failed to parse MEDIUM_COOKIES or MEDIUM_STORAGE");
    console.error(err.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    storageState: { cookies, origins: storage.origins || [] }
  });

  const page = await context.newPage();
  await page.goto("https://medium.com", { waitUntil: "load" });

  console.log("✅ Cookies + Storage loaded successfully!");
  await browser.close();
}

run();
