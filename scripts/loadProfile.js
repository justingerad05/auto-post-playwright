import { chromium } from "playwright";
import fs from "fs";

async function run() {
  console.log("🔵 Loading profile (cookies + storage)…");

  let cookies, storage;

  // 1️⃣ Load from GitHub Secrets (passed through workflow)
  try {
    cookies = JSON.parse(process.env.MEDIUM_COOKIES);
    storage = JSON.parse(process.env.MEDIUM_STORAGE);
  } catch (err) {
    console.error("❌ Failed to parse MEDIUM_COOKIES or MEDIUM_STORAGE");
    console.error(err.message);
    process.exit(1);
  }

  // 2️⃣ Convert your plain localStorage object → Playwright format
  const originStorage = [
    {
      origin: "https://medium.com",
      localStorage: Object.entries(storage).map(([key, value]) => ({
        name: key,
        value: typeof value === "string" ? value : JSON.stringify(value)
      }))
    }
  ];

  // 3️⃣ Build proper storageState object
  const storageState = {
    cookies: cookies,
    origins: originStorage
  };

  // 4️⃣ Launch browser + load session
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    storageState
  });

  const page = await context.newPage();
  await page.goto("https://medium.com", { waitUntil: "domcontentloaded" });

  console.log("✅ Cookies + Storage loaded successfully. Medium session restored!");

  await browser.close();
}

run();
