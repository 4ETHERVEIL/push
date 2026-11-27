import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const GITHUB_CLIENT_ID = process.env.VITE_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Helper to determine URL dynamically if APP_URL is not set
const getAppUrl = (req: any) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  return `${protocol}://${host}`;
};

app.get(["/api/auth/url", "/auth/url"], (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const APP_URL = getAppUrl(req);
  
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: "VITE_GITHUB_CLIENT_ID is not configured in environment variables" });
  }

  const isApk = req.query.mode === "apk";
  const statePrefix = isApk ? "apk_" : "web_";

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${APP_URL}/auth/callback`,
    scope: "repo,delete_repo,workflow",
    state: `${statePrefix}${Math.random().toString(36).substring(7)}`,
  });
  res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
});

app.get(["/auth/callback", "/api/auth/callback"], async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).send("Code not found");
  }

  try {
    const response = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const { access_token } = response.data;
    const isApk = typeof state === "string" && state.startsWith("apk_");

    if (isApk) {
      const deepLinkUrl = `gitfastpush://auth?token=${encodeURIComponent(access_token || "")}`;
      return res.send(`
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          </head>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FFD600; padding: 1rem;">
            <div style="padding: 2rem; border: 4px solid black; background: white; box-shadow: 8px 8px 0px black; text-align: center; max-width: 360px; width: 100%;">
              <h1 style="margin: 0 0 0.75rem 0; font-size: 1.5rem;">Login Berhasil!</h1>
              <p style="margin: 0 0 1.25rem 0; font-weight: bold;">Mengembalikan Anda ke aplikasi GitHub Fast Push...</p>
              <a href="${deepLinkUrl}" style="display: inline-block; padding: 0.75rem 1.25rem; background: #FFD600; color: black; font-weight: 900; text-decoration: none; border: 4px solid black; box-shadow: 4px 4px 0px black;">BUKA APLIKASI</a>
              <script>
                window.location.href = ${JSON.stringify(deepLinkUrl)};
              </script>
            </div>
          </body>
        </html>
      `);
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FFD600;">
          <div style="padding: 2rem; border: 4px solid black; background: white; box-shadow: 8px 8px 0px black;">
            <h1 style="margin: 0 0 1rem 0;">Authenticated!</h1>
            <p>Closing this window...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', token: '${access_token}' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth Exchange Error:", error);
    res.status(500).send("Authentication failed");
  }
});

export default app;
