const { chromium } = require("playwright");
const { mediumLogin } = require("./helpers/mediumLogin");
const { getProfileInfo } = require("./helpers/profileHelper");

(async () => {
  console.log("🚀 Starting test post...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🔵 Attempting login...");
  const loggedIn = await mediumLogin(page);
  if (!loggedIn) {
    console.error("❌ Login failed — quitting.");
    process.exit(1);
  }

  console.log("🔵 Fetching profile info...");
  const profile = await getProfileInfo(page);
  console.log("✔ Profile:", profile);

  console.log("📝 Opening Medium editor...");
  await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

  await page.waitForSelector("textarea", { timeout: 10000 });
  console.log("✔ Editor loaded");

  console.log("✍ Writing test title...");
  await page.fill("textarea", "This is a Playwright AUTOMATION test post");

  await page.keyboard.press("Tab");
  await page.keyboard.type("This is a test post generated automatically to confirm automation is working.");

  await page.waitForTimeout(2000);

  console.log("💾 Publishing...");
  await page.click("text=Publish");
  await page.waitForTimeout(3000);

  console.log("🎉 Test post published successfully!");

  await browser.close();
})();
