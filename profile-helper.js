import fs from "fs-extra";
import AdmZip from "adm-zip";

export async function prepareProfile() {
  const zipPath = "./medium-profile.zip";
  const profileDir = "./medium-profile";

  if (!fs.existsSync(zipPath)) {
    throw new Error("❌ medium-profile.zip not found in repository!");
  }

  console.log("📦 Extracting Medium Chrome profile…");

  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(profileDir, true);

  console.log("✅ Profile ready:", profileDir);
  return profileDir;
}
