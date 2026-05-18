import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const GITHUB_CLIENT_ID = process.env.VITE_GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const VERCEL_CLIENT_ID = process.env.VERCEL_CLIENT_ID || process.env.VITE_VERCEL_CLIENT_ID;
const VERCEL_CLIENT_SECRET = process.env.VERCEL_CLIENT_SECRET;

const normalizeVercelProjectName = (value: string) => {
  return String(value || "")
    .toLowerCase()
    .replace(/\.vercel\.app$/i, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const getAppUrl = (req: any) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host;
  return `${protocol}://${host}`;
};

const getCookie = (req: any, name: string) => {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map((item: string) => item.trim());
  const found = parts.find((item: string) => item.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.substring(name.length + 1)) : "";
};

const setVercelCookie = (req: any, res: any, token: string) => {
  const isHttps = String(req.headers["x-forwarded-proto"] || "").includes("https");
  const secure = isHttps ? "; Secure" : "";
  res.setHeader("Set-Cookie", `vercel_oauth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
};

const getVercelAccessToken = (req: any) => {
  // Prioritas utama: OAuth Vercel dari cookie. Env token tetap didukung sebagai fallback server-only.
  return getCookie(req, "vercel_oauth_token") || process.env.VERCEL_TOKEN || process.env.VITE_VERCEL_TOKEN || "";
};

const getVercelAuthUrl = (req: any) => {
  if (!VERCEL_CLIENT_ID) return null;
  const redirectUri = `${getAppUrl(req)}/auth/vercel/callback`;
  const params = new URLSearchParams({
    client_id: VERCEL_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    state: Math.random().toString(36).substring(7),
  });
  return `https://vercel.com/oauth/authorize?${params.toString()}`;
};

const exchangeVercelCode = async (req: any, code: string) => {
  if (!VERCEL_CLIENT_ID || !VERCEL_CLIENT_SECRET) {
    throw new Error("VERCEL_CLIENT_ID dan VERCEL_CLIENT_SECRET belum dikonfigurasi.");
  }

  const redirectUri = `${getAppUrl(req)}/auth/vercel/callback`;
  const body = new URLSearchParams({
    client_id: VERCEL_CLIENT_ID,
    client_secret: VERCEL_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  });

  const response = await axios.post("https://api.vercel.com/v2/oauth/access_token", body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return response.data?.access_token || response.data?.token || "";
};

async function setupVercelProject(req: any, res: any) {
  const { projectName, repoFullName, repoId, branch = "main" } = req.body || {};
  const token = getVercelAccessToken(req);
  const name = normalizeVercelProjectName(projectName);

  if (!token) {
    return res.status(401).json({
      needsVercelAuth: true,
      error: "Vercel belum terhubung. Klik Connect Vercel dulu, lalu izinkan akses tanpa input token manual.",
    });
  }

  if (!name || !repoFullName) {
    return res.status(400).json({ error: "Nama project dan repository GitHub wajib diisi." });
  }

  try {
    let project: any = null;
    let created = false;

    try {
      const createResponse = await axios.post(
        "https://api.vercel.com/v10/projects",
        {
          name,
          gitRepository: {
            type: "github",
            repo: repoFullName,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      project = createResponse.data;
      created = true;
    } catch (createError: any) {
      const status = createError.response?.status;
      const code = createError.response?.data?.error?.code;
      const message = createError.response?.data?.error?.message || createError.response?.data?.message || "";

      if (status === 409 || code === "project_already_exists" || /already exists/i.test(message)) {
        const getResponse = await axios.get(
          `https://api.vercel.com/v9/projects/${encodeURIComponent(name)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        project = getResponse.data;
      } else {
        throw createError;
      }
    }

    let deployment: any = null;
    if (repoId) {
      try {
        const deployResponse = await axios.post(
          "https://api.vercel.com/v13/deployments",
          {
            name,
            target: "production",
            gitSource: {
              type: "github",
              repoId: Number(repoId),
              ref: branch || "main",
            },
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        deployment = deployResponse.data;
      } catch (deployError: any) {
        console.warn("Initial deployment trigger failed:", deployError.response?.data || deployError.message);
      }
    }

    const webUrl = `https://${name}.vercel.app`;
    const dashboardUrl = `https://vercel.com/${project?.accountId || "dashboard"}/${name}`;

    return res.json({
      ok: true,
      created,
      project,
      deployment,
      webUrl,
      dashboardUrl,
      message: deployment
        ? `Setup otomatis berhasil. Deployment sedang diproses: ${webUrl}`
        : `Project Vercel berhasil ${created ? "dibuat" : "ditemukan"}: ${webUrl}. Jika deployment belum jalan, pastikan Vercel GitHub App sudah punya akses ke repo ini.`,
    });
  } catch (error: any) {
    console.error("Vercel Setup Error:", error.response?.data || error.message);
    return res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || error.response?.data?.message || error.message || "Setup Vercel otomatis gagal.",
      details: error.response?.data,
    });
  }
}


app.get(["/api/auth/url", "/auth/url"], (req, res) => {
  const APP_URL = getAppUrl(req);
  
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: "VITE_GITHUB_CLIENT_ID is not configured in environment variables" });
  }

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${APP_URL}/auth/callback`,
    scope: "repo,delete_repo",
    state: Math.random().toString(36).substring(7),
  });
  res.json({ url: `https://github.com/login/oauth/authorize?${params.toString()}` });
});


app.get(["/api/auth/vercel/url", "/auth/vercel/url"], (req, res) => {
  const url = getVercelAuthUrl(req);
  if (!url) {
    return res.status(500).json({ error: "VERCEL_CLIENT_ID belum dikonfigurasi. Buat OAuth App/Integration Vercel dulu." });
  }
  res.json({ url });
});

app.get(["/api/auth/vercel/status", "/auth/vercel/status"], (req, res) => {
  res.json({ connected: Boolean(getVercelAccessToken(req)) });
});

app.get(["/auth/vercel/callback", "/api/auth/vercel/callback"], async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Vercel code not found");

  try {
    const accessToken = await exchangeVercelCode(req, String(code));
    if (!accessToken) throw new Error("Access token Vercel tidak ditemukan dari OAuth response.");
    setVercelCookie(req, res, accessToken);
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FFD600;">
          <div style="padding: 2rem; border: 4px solid black; background: white; box-shadow: 8px 8px 0px black;">
            <h1 style="margin: 0 0 1rem 0;">Vercel Connected!</h1>
            <p>Closing this window...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'VERCEL_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Vercel OAuth Error:", error.response?.data || error.message);
    res.status(500).send(error.response?.data?.error?.message || error.message || "Vercel authentication failed");
  }
});

app.post(["/api/vercel/setup-project", "/vercel/setup-project"], setupVercelProject);

app.post(["/api/vercel/deploy", "/vercel/deploy"], async (req, res) => {
  const { token, name, files, target = "production" } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: "Vercel token wajib diisi." });
  }

  if (!name || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "Nama project dan files wajib diisi." });
  }

  try {
    const response = await axios.post(
      "https://api.vercel.com/v13/deployments",
      {
        name,
        files,
        target,
        projectSettings: {
          framework: null,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json(response.data);
  } catch (error: any) {
    console.error("Vercel Deploy Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.error?.message || error.response?.data?.message || error.message || "Deploy Vercel gagal.",
      details: error.response?.data,
    });
  }
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
