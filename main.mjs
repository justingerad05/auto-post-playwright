import fs from "fs";
import path from "path";
import { chromium } from "playwright-core";
import { FingerprintInjector } from "fingerprint-injector";

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function run() {
  console.log("=== Medium Automation Start ===");

  const cookies = JSON.parse(process.env.MEDIUM_COOKIES);
  const fingerprint = JSON.parse(process.env.MEDIUM_FINGERPRINT);
  const html = process.env.MEDIUM_POST_HTML;
  const userAgent = process.env.USER_AGENT;

  const profilePath = path.join(process.cwd(), "profile");

  // Start browser
  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    viewport: null,
    userAgent: userAgent
  });

  const page = browser.pages()[0];

  // Inject fingerprint
  await new FingerprintInjector().attachFingerprintToPlaywright(browser, fingerprint);

  try {
    console.log("Opening Medium...");
    await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

    await delay(3000);

    // Ensure we are logged in
    if (page.url().includes("sign-in")) {
      console.log("ERROR: Not signed in. Cookies/profile failed.");
      await page.screenshot({ path: "login-error.png" });
      await browser.close();
      process.exit(1);
    }

    console.log("Medium loaded.");

    // Wait for editor
    await page.waitForSelector('[data-testid="editor"]', { timeout: 15000 });

    // Insert HTML
    await page.evaluate((content) => {
      const editor = document.querySelector('[data-testid="editor"]');
      editor.innerHTML = content;
    }, html);

    console.log("HTML inserted successfully.");

    await delay(2000);

    console.log("Done.");
    await browser.close();

  } catch (err) {
    console.log("Automation crashed:", err);
    await page.screenshot({ path: "error.png" });
    await browser.close();
    process.exit(1);
  }
}

run();
