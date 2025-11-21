// Go to Medium new story page
await page.goto("https://medium.com/new", { waitUntil: "networkidle" });

// Wait for editor root to load
await page.waitForSelector('div[data-testid="editor"]', { timeout: 60000 });

// Click title area
await page.click('textarea[data-testid="post-title-input"]');
await page.keyboard.type("Test Automation Story from Playwright");

// Click body area
await page.click('div[data-testid="wysiwyg-wrapper"] div');
await page.keyboard.type("This is a test story published automatically using Playwright.");

// Wait for auto-save
await page.waitForTimeout(5000);

// Open publish panel
await page.click('button[data-testid="publishButton"]');

// Wait for publish modal
await page.waitForSelector('button[data-testid="publishStoryButton"]', { timeout: 30000 });

// Publish
await page.click('button[data-testid="publishStoryButton"]');

// Wait for redirect
await page.waitForNavigation({ timeout: 60000 });
