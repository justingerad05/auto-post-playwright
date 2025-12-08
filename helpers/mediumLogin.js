const fs = require("fs");

async function mediumLogin(page) {
  try {
    const cookies = JSON.parse(fs.readFileSync("cookies.json", "utf8"));
    await page.context().addCookies(cookies);
    console.log("✔ Cookies loaded successfully.");

    await page.goto("https://medium.com", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    console.log("✔ Logged in using cookies.");
    return true;
  } catch (err) {
    console.error("❌ Login failed:", err);
    return false;
  }
}

module.exports = { mediumLogin };
