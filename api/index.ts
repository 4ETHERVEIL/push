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
  const APP_URL = getAppUrl(req);
  
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: "VITE_GITHUB_CLIENT_ID is not configured in environment variables" });
  }

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${APP_URL}/auth/callback`,
    scope: "repo",
    state: Math.random().toString(36).substring(7),
  });
  res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
});

app.get(["/auth/callback", "/api/auth/callback"], async (req, res) => {
  const { code } = req.query;

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
