async function getProfileInfo(page) {
  try {
    await page.goto("https://medium.com/me", { waitUntil: "networkidle" });

    const name = await page.textContent("h1");
    const profileUrl = page.url();

    return {
      name: name?.trim() || "Unknown",
      url: profileUrl
    };
  } catch (err) {
    console.error("Error getting profile info:", err);
    return null;
  }
}

module.exports = { getProfileInfo };
