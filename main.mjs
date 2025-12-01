import fs from "fs";
import unzipper from "unzipper";
import { chromium } from "playwright-core";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0";

function stealthScript() {
  return `(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4] });
  })();`;
}

async function loadProfile() {
  console.log("Unzipping profile...");
  return new Promise((resolve, reject) => {
    fs.createReadStream("medium-profile.zip")
      .pipe(unzipper.Extract({ path: "medium-profile" }))
      .on("close", resolve)
      .on("error", reject);
  });
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  if (!BROWSERLESS_API_KEY) {
    throw new Error("Missing BROWSERLESS_API_KEY secret");
  }

  const wsUrl = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
  console.log("Connecting:", wsUrl.replace(/token=.*/, "token=***"));

  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    storageState: {
      cookies: [],
      origins: []
    }
  });

  await context.addInitScript({ content: stealthScript() });

  const page = await context.newPage();

  console.log("Opening Medium editor…");
  await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  const html = await page.content();
  if (/Cloudflare|Just a moment|checking your browser/i.test(html)) {
    await page.screenshot({ path: "/tmp/error.png" });
    throw new Error("Cloudflare Challenge – cannot continue.");
  }

  console.log("Typing title...");
  await page.keyboard.type("Automated post title");

  console.log("Typing body...");
  await page.keyboard.type("This is an automated Medium post using ZIP profile session.");

  await page.waitForTimeout(3000);

  console.log("Closing...");
  await context.close();
  await browser.close();
}

postToMedium().catch(err => {
  console.error("ERROR:", err.message);
  process.exit(2);
});
