import express, { Request, Response } from "express";
import session from "express-session";
import path from "node:path";
import { execSync } from "node:child_process";
import { AIRouter } from "../ai/router";
import { providers } from "../ai/providers";
import {
  getRecentLogs,
  subscribeLogs,
} from "../log-stream";
import {
  inspectUserInput,
} from "../security/gateway";
import { guardAIOutput } from "../security/output-guard";
import { ASHENAI_SYSTEM_PROMPT } from "../security/policy";
import { wrapUntrustedContent } from "../security/context";

const __dirname = path.dirname(__filename);
const app = express();

app.set("trust proxy", 1);

declare module "express-session" {
  interface SessionData {
    discordUser?: {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };
  }
}

const PORT = Number(
  process.env.PORT ||
  process.env.WEB_PORT ||
  3000
);

const router = new AIRouter(providers);
function getVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    return process.env.RENDER_GIT_COMMIT?.slice(0, 7) || "unknown";
  }
}

const VERSION = getVersion();

type AshenAIRole = "creator" | "admin" | "user";

function getUserRole(userId: string): AshenAIRole {
  const creatorId =
    process.env.CREATOR_DISCORD_USER_ID?.trim();

  const adminIds =
    (process.env.ADMIN_DISCORD_USER_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

  if (creatorId && userId === creatorId) {
    return "creator";
  }

  if (adminIds.includes(userId)) {
    return "admin";
  }

  return "user";
}
app.use(
  express.json({
    limit: "64kb",
  })
);

const sessionSecret =
  process.env.SESSION_SECRET?.trim();

if (sessionSecret) {
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );
}

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

// Public health endpoint.
// NEVER expose provider objects or API keys here.
app.get(
  "/api/health",
  (_req: Request, res: Response) => {
    res.json({
      ok: true,
      name: "AshenAI",
      version: VERSION,
      providers: router.getAvailableProviders().map((provider) => provider.name),
    });
  }
);
app.get(
  "/auth/discord",
  (_req: Request, res: Response) => {
    const clientId = process.env.DISCORD_CLIENT_ID?.trim();
    const redirectUri =
      process.env.DISCORD_REDIRECT_URI?.trim() ||
      "https://ashenwakeai.onrender.com/auth/discord/callback";

    if (!clientId) {
      res.status(503).send(
        "Discord web login is not configured."
      );
      return;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
    });

    res.redirect(
      `https://discord.com/oauth2/authorize?${params.toString()}`
    );
  }
);

app.get(
  "/auth/discord/callback",
  async (req: Request, res: Response) => {
    try {
      const code =
        typeof req.query.code === "string"
          ? req.query.code
          : "";

      if (!code) {
        res.status(400).send(
          "Discord authorization code is missing."
        );
        return;
      }

      const clientId =
        process.env.DISCORD_CLIENT_ID?.trim();

      const clientSecret =
        process.env.DISCORD_CLIENT_SECRET?.trim();

      const redirectUri =
        process.env.DISCORD_REDIRECT_URI?.trim() ||
        "https://ashenwakeai.onrender.com/auth/discord/callback";

      if (!clientId || !clientSecret) {
        res.status(503).send(
          "Discord web login is not configured."
        );
        return;
      }

      const tokenResponse = await fetch(
        "https://discord.com/api/oauth2/token",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        }
      );

      if (!tokenResponse.ok) {
        console.error(
          "Discord OAuth token exchange failed:",
          await tokenResponse.text()
        );

        res.status(401).send(
          "Discord login could not be completed."
        );
        return;
      }

      const tokenData =
        (await tokenResponse.json()) as {
          access_token?: string;
          token_type?: string;
        };

      if (!tokenData.access_token) {
        res.status(401).send(
          "Discord did not provide an access token."
        );
        return;
      }

      const userResponse = await fetch(
        "https://discord.com/api/users/@me",
        {
          headers: {
            Authorization:
              `${tokenData.token_type || "Bearer"} ` +
              tokenData.access_token,
          },
        }
      );

      if (!userResponse.ok) {
        res.status(401).send(
          "Could not retrieve your Discord account."
        );
        return;
      }

      const discordUser =
        (await userResponse.json()) as {
          id: string;
          username: string;
          global_name?: string | null;
          avatar?: string | null;
        };

      if (!req.session) {
        res.status(503).send(
          "Login session is not configured."
        );
        return;
      }

      req.session.discordUser = {
        id: discordUser.id,
        username: discordUser.username,
        global_name: discordUser.global_name,
        avatar: discordUser.avatar,
      };

      req.session.save((error) => {
        if (error) {
          console.error("Failed to save Discord login session:", error);
          res.status(500).send("Login session could not be saved.");
          return;
        }

        res.redirect("/");
      });
    } catch (error) {
      console.error(
        "Discord OAuth callback error:",
        error
      );

      res.status(500).send(
        "Discord login failed."
      );
    }
  }
);

function requireAdmin(
  req: Request,
  res: Response,
  next: () => void,
) {
  const user = req.session?.discordUser;

  if (!user) {
    res.status(401).json({
      ok: false,
      error: "Authentication required.",
    });
    return;
  }

  const role = getUserRole(user.id);

  if (role !== "creator" && role !== "admin") {
    res.status(403).json({
      ok: false,
      error: "Admin access required.",
    });
    return;
  }

  next();
}

app.get(
  "/api/admin",
  requireAdmin,
  (req: Request, res: Response) => {
    const user = req.session?.discordUser;

    res.json({
      ok: true,
      role: user ? getUserRole(user.id) : "user",
      message: "AshenAI admin access granted.",
    });
  },
);

app.get(
  "/api/me",
  (req: Request, res: Response) => {
    const user = req.session?.discordUser;

    res.json({
      ok: true,
      authenticated: Boolean(user),
      user: user || null,
      role: user ? getUserRole(user.id) : "user",
    });
  }
);

app.post(
  "/logout",
  (req: Request, res: Response) => {
    if (!req.session) {
      res.json({ ok: true });
      return;
    }

    req.session.destroy((error) => {
      if (error) {
        console.error(
          "Logout error:",
          error
        );

        res.status(500).json({
          ok: false,
          error: "Could not log out.",
        });
        return;
      }

      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  }
);

app.post(
  "/api/chat",
  async (req: Request, res: Response) => {
    try {
      const message =
        typeof req.body?.message === "string"
          ? req.body.message.trim()
          : "";

      if (!message) {
        res.status(400).json({
          ok: false,
          error: "Message is required.",
        });
        return;
      }

      if (message.length > 4000) {
        res.status(400).json({
          ok: false,
          error: "Message is too long.",
        });
        return;
      }

      // Security boundary: inspect untrusted web input before AI processing.
      const security = inspectUserInput(message);

      if (security.decision === "BLOCK") {
        res.status(400).json({
          ok: false,
          error:
            security.safeResponse ||
            "I can't process that request.",
        });
        return;
      }

      const response =
        await router.generate({
          messages: [
            {
              role: "system",
              content: ASHENAI_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: wrapUntrustedContent(
                "WEB USER PROMPT",
                message,
              ),
            },
          ],
        });

      // Security boundary: never send raw model output to the client.
      const guarded = guardAIOutput(response.text);

      if (!guarded.allowed) {
        console.warn(
          `🛡️ Web chat output blocked: ${
            guarded.reason ?? "security_policy"
          }`,
        );
      }

      res.json({
        ok: true,
        text: guarded.text,
      });
    } catch (error) {
      console.error(
        "Web chat error:",
        error
      );

      res.status(500).json({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "AI request failed.",
      });
    }
  }
);

app.get(
  "/",
  (_req: Request, res: Response) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// Protected live log stream for Termux/admin monitoring.
app.get(
  "/api/logs/stream",
  (req: Request, res: Response) => {
    const token = process.env.LOG_STREAM_TOKEN?.trim();

    if (!token) {
      res.status(503).json({
        ok: false,
        error: "Log stream is not configured.",
      });
      return;
    }

    const suppliedToken =
      typeof req.query.token === "string"
        ? req.query.token
        : req.headers.authorization?.startsWith("Bearer ")
          ? req.headers.authorization.slice(7)
          : "";

    if (suppliedToken !== token) {
      res.status(401).json({
        ok: false,
        error: "Unauthorized.",
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const send = (entry: ReturnType<typeof getRecentLogs>[number]) => {
      res.write(`event: log\n`);
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    };

    for (const entry of getRecentLogs(100)) {
      send(entry);
    }

    const unsubscribe = subscribeLogs(send);

    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  },
);

// Express 5 compatible catch-all.
app.get(
  "/{*splat}",
  (_req: Request, res: Response) => {
    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

// This is what src/index.ts expects.
export function startWebServer(): void {
  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        "🌐 ==============================="
      );
      console.log(
        `🌐 AshenAI Web listening on port ${PORT}`
      );
      console.log(
        "🌐 ==============================="
      );
    }
  );
}
