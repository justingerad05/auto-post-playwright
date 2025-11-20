import { chromium } from "playwright";
import fs from "fs";

async function postToMedium({ title, html }) {
  // Load Medium cookies
  const cookies = JSON.parse(process.env.MEDIUM_COOKIES);

  const browser = await chromium.launch({
    headless: true,        // Change to false if you want to watch it
  });

  const context = await browser.newContext();
  await context.addCookies(cookies);

  const page = await context.newPage();

  // 1. Go to Medium homepage (should load you as logged in)
  await page.goto("https://medium.com/");
  await page.waitForTimeout(3000);

  // 2. Navigate to the Medium editor
  await page.goto("https://medium.com/new-story");
  await page.waitForSelector("section");

  // 3. Type title
  await page.click("h1");
  await page.keyboard.type(title);
  await page.waitForTimeout(1000);

  // 4. Paste HTML as story body
  await page.click("section");
  await page.keyboard.insertText(" "); // ensure cursor placed

  // Use JS to inject the HTML directly
  await page.evaluate((content) => {
    const editor = document.querySelector("section");
    editor.innerHTML = content;
  }, html);

  await page.waitForTimeout(1500);

  // 5. Click Publish
  await page.click('button:has-text("Publish")');
  await page.waitForSelector('button:has-text("Publish now")');

  await page.click('button:has-text("Publish now")');

  // 6. Wait for final URL
  await page.waitForNavigation();
  const finalUrl = page.url();

  console.log("Published:", finalUrl);

  await browser.close();
  return finalUrl;
}

// Example usage:
postToMedium({
  title: "Test Story From Playwright",
  html: "<h1>Hello Medium</h1><p>This is a Playwright test post.</p>"
});
