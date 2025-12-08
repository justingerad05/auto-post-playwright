import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function run() {
  const profilePath = process.env.PROFILE_PATH || "./profile";

  if (!fs.existsSync(profilePath)) {
    console.error("❌ Profile folder not found:", profilePath);
    process.exit(1);
  }

  console.log("Loading Medium profile from:", profilePath);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true,
  });

  const page = await browser.newPage();

  console.log("Opening Medium new story editor...");
  await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

  const testTitle = "Automation Test Post (Please Ignore)";
  const testBody = "This is a *test post* to confirm Medium automation is working.";

  console.log("Writing post title...");
  await page.click("section div[role='textbox']");
  await page.keyboard.type(testTitle);

  console.log("Writing post body...");
  await page.keyboard.press("Tab");
  await page.keyboard.type(testBody);

  console.log("Opening Publish modal...");
  await page.click('text=Publish');

  console.log("Finalizing publish...");
  await page.waitForSelector('button:has-text("Publish now")');
  await page.click('button:has-text("Publish now")');

  console.log("🎉 Test post published successfully!");
  await browser.close();
}

run().catch(err => {
  console.error("❌ Error occurred:", err);
  process.exit(1);
});
