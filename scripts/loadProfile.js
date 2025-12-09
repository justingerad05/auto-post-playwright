import { chromium } from "playwright";

async function run() {
  console.log("🔵 Loading Medium cookies from environment variable...");

  const cookiesEnv = process.env.MEDIUM_COOKIES;

  if (!cookiesEnv) {
    console.error("❌ MEDIUM_COOKIES not found!");
    process.exit(1);
  }

  let cookies;
  try {
    cookies = JSON.parse(cookiesEnv);

    if (!Array.isArray(cookies)) {
      console.error("❌ MEDIUM_COOKIES must be a JSON array of cookies.");
      process.exit(1);
    }

    // Fix sameSite automatically if invalid
    cookies = cookies.map(c => ({
      ...c,
      sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "Lax",
    }));

  } catch (e) {
    console.error("❌ MEDIUM_COOKIES is not valid JSON:", e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: { cookies, origins: [] } });

  const page = await context.newPage();
  await page.goto("https://medium.com");

  console.log("✅ Cookies loaded. You are now logged in!");
  await browser.close();
}

run();
