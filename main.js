const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

async function run() {
  console.log("=== Medium test automation start ===");

  const cookiePath = path.join(__dirname, "cookies", "medium.json");

  if (!fs.existsSync(cookiePath)) {
    throw new Error("cookies/medium.json not found.");
  }

  // Load cookies & validate JSON
  let cookieData = JSON.parse(fs.readFileSync(cookiePath, "utf8"));

  if (!cookieData.cookies || !Array.isArray(cookieData.cookies)) {
    throw new Error("cookies/medium.json must contain { cookies: [] }");
  }

  console.log(`Loaded ${cookieData.cookies.length} cookies.`);

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({});

  // Apply cookies
  await context.addCookies(cookieData.cookies);
  console.log("Cookies added to browser context.");

  const page = await context.newPage();

  try {
    console.log("Navigating to https://medium.com/me to check login status...");
    await page.goto("https://medium.com/me", { timeout: 120000, waitUntil: "networkidle" });

    await page.waitForTimeout(5000);

    const url = page.url();

    if (url.includes("medium.com/me")) {
      console.log("LOGIN SUCCESSFUL. Cookies are working.");
    } else {
      console.log("LOGIN FAILED — Medium redirected somewhere else:", url);
    }

  } catch (err) {
    console.error("ERROR during automation:", err.message);
  }

  await browser.close();
}

run();
