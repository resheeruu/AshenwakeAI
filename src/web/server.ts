import express, { Request, Response } from "express";
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
app.use(
  express.json({
    limit: "64kb",
  })
);

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
