// main.cjs
const fs = require("fs");
const { chromium } = require("playwright");

async function run() {
  console.log("=== Medium Post Automation Start ===");

  // Read cookies from env secret
  const secret = process.env.MEDIUM_COOKIES;
  if (!secret) {
    throw new Error("MEDIUM_COOKIES secret not found in env. Add it to repository secrets.");
  }

  let parsed;
  try {
    parsed = JSON.parse(secret);
  } catch (e) {
    throw new Error("MEDIUM_COOKIES is not valid JSON: " + e.message);
  }

  const cookies = parsed.cookies;
  if (!Array.isArray(cookies) || cookies.length === 0) {
    throw new Error("MEDIUM_COOKIES.cookies is empty or not an array.");
  }

  // Normalize cookie fields for Playwright
  const pwCookies = cookies.map(c => {
    const out = {
      name: c.name,
      value: String(c.value || ""),
      domain: c.domain || c.host || "medium.com",
      path: c.path || "/",
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      sameSite: (c.sameSite && String(c.sameSite).toLowerCase() === "strict") ? "Strict" :
                (c.sameSite && String(c.sameSite).toLowerCase() === "lax") ? "Lax" : "None"
    };
    // expirationDate can be seconds (Playwright accepts 'expires')
    if (c.expirationDate) {
      // ensure a number
      const num = Number(c.expirationDate) || Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
      out.expires = num;
    }
    return out;
  });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });

  try {
    // Add cookies
    await context.addCookies(pwCookies);
    console.log(`Loaded ${pwCookies.length} cookies.`);

    const page = await context.newPage();

    // Try to land on the "me" page to confirm login
    console.log("Navigating to https://medium.com/me to check login status...");
    try {
      await page.goto("https://medium.com/me", { waitUntil: "networkidle", timeout: 60000 });
    } catch (e) {
      console.warn("First navigation to /me timed out or was blocked:", e.message);
      // still continue to attempt editor
    }

    // Check for Cloudflare "Just a moment" challenge
    const content = await page.content();
    if (/Just a moment|Enable JavaScript and cookies to continue|cf_chl/i.test(content)) {
      console.error("Blocked by Cloudflare challenge. Playwright can't proceed while challenge is active.");
      await browser.close();
      process.exit(2);
    }

    // Open the editor
    console.log("Opening Medium editor...");
    try {
      await page.goto("https://medium.com/new", { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (e) {
      console.warn("Navigation to editor timed out:", e.message);
    }

    // Wait for common editor selectors (be tolerant)
    const selectors = [
      'textarea[placeholder="Title"]',
      'textarea[placeholder="Title"]',
      'div[role="textbox"]',      // body editor content
      'section'                   // fallback
    ];

    let ready = false;
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 20000, state: "visible" });
        console.log("Found editor selector:", sel);
        ready = true;
        break;
      } catch (e) {
        // try next
      }
    }

    if (!ready) {
      console.error("Editor did not appear; possible login failure, cloudflare block, or UI change.");
      await browser.close();
      process.exit(3);
    }

    // Attempt to fill title
    try {
      // Many Medium editors use a contenteditable div; we attempt both ways
      const titleSelector = 'textarea[placeholder="Title"], div[role="textbox"][data-placeholder="Title"], section textarea, h1';
      const titleHandle = await page.$(titleSelector);
      if (titleHandle) {
        await titleHandle.click({ timeout: 5000 }).catch(()=>{});
        await page.keyboard.type("Test post from automation (Playwright)", { delay: 20 });
      } else {
        // fallback to pressing into the page and typing
        await page.keyboard.type("Test post from automation (Playwright)\n\n", { delay: 20 });
      }

      // Body — find a contenteditable area
      const bodySelector = 'div[role="textbox"], textarea[placeholder="Tell your story…"], section';
      const bodyHandle = await page.$(bodySelector);
      if (bodyHandle) {
        await bodyHandle.click({ timeout: 5000 }).catch(()=>{});
        await page.keyboard.type("This is a test post created by the automated Playwright script. If you see this, cookies + automation worked.", { delay: 18 });
      } else {
        // last resort: write via keyboard
        await page.keyboard.type("This is a test post created by the automated Playwright script. If you see this, cookies + automation worked.", { delay: 18 });
      }

      // Try to publish -- Medium UI can vary. We'll try a few ways.
      console.log("Attempting to publish...");
      // Click Publish button text if present
      const publishButtons = [
        'text=Publish',                       // common
        'text=Publish story',                 // alternative
        'button:has-text("Publish")'          // fallback
      ];

      let published = false;
      for (const psel of publishButtons) {
        try {
          const btn = await page.$(psel);
          if (btn) {
            await btn.click({ timeout: 5000 });
            // wait a short moment for the publish pane
            await page.waitForTimeout(3000);
            // find final confirm (if exists)
            const confirm = await page.$('button:has-text("Publish"), button:has-text("Post")');
            if (confirm) {
              await confirm.click({ timeout: 5000 }).catch(()=>{});
            }
            published = true;
            break;
          }
        } catch (e) {
          // continue trying other selectors
        }
      }

      if (!published) {
        console.warn("Publish button not found — post saved as draft or UI didn't match selectors.");
      } else {
        console.log("Publish attempt done (may be published or queued).");
      }

      // Give page a few seconds to finish operations
      await page.waitForTimeout(4000);

      // Optionally capture a screenshot (workflow artifact can be added later) — commented out here
      // await page.screenshot({ path: "medium-preview.png", fullPage: true });

      console.log("Automation completed!");
    } catch (e) {
      console.error("ERROR during automation:", e.message || e);
      await browser.close();
      process.exit(4);
    }

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err && err.message ? err.message : err);
    try { await browser.close(); } catch (e){}
    process.exit(5);
  }
}

run();
