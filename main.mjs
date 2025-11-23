// main.mjs — Stealth-enabled playwright script (Browserless)
import fs from 'fs';
import playwright from 'playwright';

const { chromium } = playwright;

function parseCookies(envString) {
  if (!envString) throw new Error('MEDIUM_COOKIES env missing');
  let parsed;
  try {
    parsed = JSON.parse(envString);
  } catch (e) {
    throw new Error('MEDIUM_COOKIES is not valid JSON');
  }
  if (Array.isArray(parsed)) return { cookies: parsed, origins: [] };
  if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed;
  // If it's a single cookie object
  if (typeof parsed === 'object') return { cookies: [parsed], origins: [] };
  throw new Error('Unrecognized cookie structure');
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function applyStealthPagePatches(page, userAgent) {
  // Set some navigator properties and other anti-detection tweaks before any script runs
  await page.addInitScript(() => {
    // navigator.webdriver
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); } catch(e){}
    // languages
    try { Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'], configurable: true }); } catch(e){}
    // plugins
    try { Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5], configurable: true }); } catch(e){}
    // permissions
    try {
      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications' ? Promise.resolve({ state: 'denied' }) : originalQuery(parameters);
    } catch(e){}
    // webdriver chrome property
    try { window.chrome = window.chrome || { runtime: {} }; } catch(e){}
    // fake plugins length property for older checks
    try { Object.defineProperty(navigator, 'mimeTypes', { get: () => ({ length: 1 }), configurable: true }); } catch(e){}

    // WebGL fingerprint mitigation (basic) — override getParameter
    try {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        // When asked for UNMASKED_VENDOR_WEBGL or UNMASKED_RENDERER_WEBGL, return common values
        if (param === 37445) return 'Intel Inc.'; // UNMASKED_VENDOR_WEBGL
        if (param === 37446) return 'Intel Iris OpenGL Engine'; // UNMASKED_RENDERER_WEBGL
        return getParameter.call(this, param);
      };
    } catch(e){}
  });

  // set a real-like user agent on every new page
  await page.setExtraHTTPHeaders({ 'sec-ch-ua': '"Chromium";v="119", "Google Chrome";v="119", "Not:A-Brand";v="99"' });
}

async function waitForMediumEditor(page, timeout = 90_000) {
  // Several selectors tried — Medium changes UI sometimes, so we loop and retry.
  const tries = 6;
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[class*="editorContent"]',
    'div[contenteditable="true"]',
    'div[data-testid="editor-root"]',
  ];

  const start = Date.now();
  for (let attempt = 0; attempt < tries; attempt++) {
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        return sel;
      } catch (e) {
        // not found — continue
      }
    }
    if (Date.now() - start > timeout) break;
    // give browser some time
    await sleep(3000 + attempt * 1000);
  }
  throw new Error('Failed to detect Medium editor — all selectors failed.');
}

async function postToMedium() {
  console.log('=== Medium Automation Start ===');

  const { BROWSERLESS_API_KEY, MEDIUM_COOKIES, USER_AGENT } = process.env;
  if (!BROWSERLESS_API_KEY) throw new Error('Missing BROWSERLESS_API_KEY');
  if (!MEDIUM_COOKIES) throw new Error('Missing MEDIUM_COOKIES');

  const wsUrl = process.env.BROWSERLESS_WS || `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
  console.log('Connecting to Browserless:', wsUrl);

  // Connect to Browserless Chrome via CDP
  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 120_000 });
  console.log('Connected to browserless.');

  const storageState = parseCookies(MEDIUM_COOKIES);

  // Create context with a realistic profile (Windows 10 Chrome)
  const context = await browser.newContext({
    userAgent: USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    permissions: [],
    storageState, // pass storageState object: { cookies: [...], origins: [] }
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // stealth patches
  await applyStealthPagePatches(page);

  console.log('Opening Medium editor...');
  // Use DOMContent loaded so assets may still stream; we wait for editor separately
  await page.goto('https://medium.com/new-story', { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});

  // Try to detect editor
  console.log('Waiting for editor...');
  const editorSelector = await waitForMediumEditor(page).catch(err => { throw err; });
  console.log('Editor detected using selector:', editorSelector);

  // Focus editable area and type a test post
  try {
    // Title first
    await page.focus(editorSelector);
    await page.keyboard.type('Automated test post — Playwright + Browserless (stealth)', { delay: 40 });
    await page.keyboard.press('Enter');

    // Body — create a paragraph and type
    await page.keyboard.type('This is a test generated by an automation script. If you see this it worked!', { delay: 20 });

    console.log('Typed test post. Pausing briefly to let Medium autosave...');
    await page.waitForTimeout(5000);

  } catch (e) {
    console.warn('Warning while typing:', e.message);
  }

  console.log('Closing session.');
  try { await context.close(); } catch(e){}
  try { await browser.close(); } catch(e){}
  console.log('Done.');
}

postToMedium().catch(err => {
  console.error('ERROR during automation:', err);
  process.exit(2);
});
