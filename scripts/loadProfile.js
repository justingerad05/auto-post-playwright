import { chromium } from "playwright";

async function run() {
  console.log("🔵 Loading profile (cookies + storage)…");

  const cookiesBase64 = process.env.MEDIUM_COOKIES;
  const storageBase64 = process.env.MEDIUM_STORAGE;

  if (!cookiesBase64 || !storageBase64) {
    console.error("❌ MEDIUM_COOKIES or MEDIUM_STORAGE not found!");
    process.exit(1);
  }

  let cookies, storage;
  try {
    cookies = JSON.parse(Buffer.from(cookiesBase64, "base64").toString());
    storage = JSON.parse(Buffer.from(storageBase64, "base64").toString());
  } catch (e) {
    console.error("❌ Failed to parse base64 JSON:", e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false }); // set headless: false for debug
  const context = await browser.newContext({
    storageState: { cookies, origins: storage.origins || [] }
  });

  const page = await context.newPage();
  await page.goto("https://medium.com", { waitUntil: "networkidle" });

  console.log("✅ Cookies + Storage loaded. Logged in!");

  // Optional: Wait a few seconds to allow Cloudflare to complete
  await page.waitForTimeout(5000);

  await browser.close();
}

run();
