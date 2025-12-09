import fs from "fs";
import path from "path";
import { chromium } from "playwright";

async function run() {
  console.log("Loading profile (cookies + storage)…");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Load cookies from GitHub secret (JSON string)
  const cookies = JSON.parse(process.env.MEDIUM_COOKIES);
  await context.addCookies(cookies);

  // Load storage state (also JSON string)
  const storageState = JSON.parse(process.env.MEDIUM_STORAGE);
  await context.setStorageState(storageState);

  // Save a merged state file for Playwright to reuse
  const outputPath = path.join(process.cwd(), "medium-state.json");
  await context.storageState({ path: outputPath });

  await browser.close();
  console.log("✔ Profile loaded. Saved medium-state.json");
}

run();
