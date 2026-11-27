import fs from "fs";
import path from "path";

const manifestPath = path.join(process.cwd(), "android", "app", "src", "main", "AndroidManifest.xml");

if (!fs.existsSync(manifestPath)) {
  console.error("AndroidManifest.xml not found at:", manifestPath);
  process.exit(1);
}

let manifest = fs.readFileSync(manifestPath, "utf8");

const permissions = [
  "android.permission.INTERNET",
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS",
];

for (const perm of permissions) {
  if (!manifest.includes(perm)) {
    manifest = manifest.replace(
      "<application",
      `    <uses-permission android:name="${perm}" />\n\n    <application`
    );
  }
}

const deepLinkFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="gitfastpush" android:host="auth" />
            </intent-filter>`;

if (!manifest.includes('android:scheme="gitfastpush"')) {
  manifest = manifest.replace(
    "</activity>",
    `${deepLinkFilter}\n        </activity>`
  );
}

fs.writeFileSync(manifestPath, manifest, "utf8");
console.log("AndroidManifest.xml updated with permissions and gitfastpush://auth deep link.");
