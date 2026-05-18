import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // AI Studio App URL for callback
  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

  // GitHub OAuth Config
  const GITHUB_CLIENT_ID = process.env.VITE_GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  // 1. Get OAuth URL
  app.get("/api/auth/url", (req, res) => {
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID || "",
      redirect_uri: `${APP_URL}/auth/callback`,
      scope: "repo",
      state: Math.random().toString(36).substring(7),
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
  });

  // 2. OAuth Callback
  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
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

      // Send token back to parent window
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

  // Proxy route for GitHub API if needed (though client can use Octokit with token)
  // We'll keep it simple and just do direct client-side calls for now unless we hit CORS.
  // Actually, client-side Octokit with token is usually fine for these apps.

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
