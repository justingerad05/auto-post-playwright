const { chromium } = require("playwright");
const fs = require("fs");

async function run() {
    console.log("Starting Medium automation...");

    const browser = await chromium.launch({
        headless: true
    });
    const context = await browser.newContext();

    // Load cookies from GitHub Secrets
    let cookies = [];

    try {
        const googleCookies = JSON.parse(process.env.GOOGLE_COOKIES || "[]");
        const mediumCookies = JSON.parse(process.env.MEDIUM_COOKIES || "[]");

        cookies = [...googleCookies, ...mediumCookies];

        if (cookies.length > 0) {
            console.log("Injecting cookies...");
            await context.addCookies(cookies);
        }
    } catch (err) {
        console.log("Error loading cookies:", err);
    }

    const page = await context.newPage();

    console.log("Opening Medium...");
    await page.goto("https://medium.com/", { waitUntil: "networkidle" });

    // Ensure the user is logged in
    if (await page.locator('a[href="/m/signin"]').count() > 0) {
        console.log("⚠️ Not logged in. Cookies may not be correct.");
        await browser.close();
        return;
    }

    console.log("Logged in successfully!");

    // Create a new story
    await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

    console.log("Creating new Medium post...");

    // Create random title and body
    const title = `Automated Post - ${new Date().toISOString()}`;
    const body = "This is an automated post created using GitHub Actions + Playwright.";

    // Type title
    await page.locator('h1.graf--title').fill(title);

    // Type body
    await page.keyboard.press("Enter");
    await page.locator('div.section-content').nth(0).fill(body);

    // Publish
    console.log("Publishing...");
    await page.keyboard.press("Meta+Shift+P");
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Publish now")').click();

    console.log("Published successfully!");

    await browser.close();
}

run();
