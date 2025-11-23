# auto-post-playwright

Automated Medium posting using Playwright.

## How to use

1. Upload this repository (or import the ZIP) to GitHub.
2. Add repository secrets (Settings → Secrets → Actions):
   - `MEDIUM_COOKIES` : JSON string (or base64 JSON) containing your Medium cookies object.
   - `PROXY_URL` (optional) : e.g. http://username:password@host:port or host:port
3. Actions → Run Medium Test Post → Run workflow (workflow_dispatch).

## Notes
- If Cloudflare blocks, use a residential proxy (PROXY_URL) or Browserless remote Chrome.
- This is a starting point — you may need to tweak selectors for your Medium account UI.
