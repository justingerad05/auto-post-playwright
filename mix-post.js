import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const PROFILE_PATH = process.env.PROFILE_PATH || "./profile";

async function main() {
  console.log("Launching with persistent profile:", PROFILE_PATH);

  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ],
  });

  const page = await context.newPage();

  try {
    console.log("Opening Mix...");
    await page.goto("https://mix.com", { waitUntil: "networkidle", timeout: 120000 });

    const html = await page.content();
    if (/Just a moment|cf_chl|Checking your browser|captcha/i.test(html)) {
      throw new Error("Blocked by Cloudflare / CAPTCHA.");
    }

    console.log("Navigating to Add button...");
    await page.waitForSelector('button[data-test="create-curation"]', { timeout: 15000 });

    await page.click('button[data-test="create-curation"]');
    await page.waitForTimeout(2000);

    const title = process.env.POST_TITLE;
    const body = process.env.POST_BODY;

    console.log("Typing title...");
    await page.fill('input[name="title"]', title);

    console.log("Typing content...");
    await page.fill('textarea[name="body"]', body);

    console.log("Trying to publish...");
    await page.click('button:has-text("Publish")');

    console.log("Post attempt completed.");
  } catch (err) {
    console.error("ERROR:", err.message);
    const dir = "./debug";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    await page.screenshot({ path: `${dir}/error-${ts}.png`, fullPage: true });
    fs.writeFileSync(`${dir}/error-${ts}.html`, await page.content());

    process.exit(1);
  }

  await context.close();
}

main();
