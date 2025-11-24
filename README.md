# auto-post-playwright

Files:
- main.mjs : Main automation
- package.json
- .github/workflows/run-medium-post.yml

Secrets to set in GitHub:
- BROWSERLESS_API_KEY  (or BROWSERLESS_WS if you prefer full ws URL)
- BROWSERLESS_WS       (optional; if set, used instead of API key)
- MEDIUM_COOKIES       (cookies JSON or base64(JSON))
- USER_AGENT           (optional; defaults to a modern Chrome UA)

How to format MEDIUM_COOKIES:
- You may paste a JSON object with "cookies": [ ... ].
- Example file `medium-cookies.json` is included in README for format.

Debug:
- The script will copy local debug screenshots if possible and logs the uploaded debug screenshot path: /mnt/data/medium-test-result.png
