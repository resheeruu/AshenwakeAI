import express, { Request, Response } from "express";
import path from "node:path";
import { execSync } from "node:child_process";
import { AIRouter } from "../ai/router";
import { providers } from "../ai/providers";

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
      providers: router.getAvailableProviders(),
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

      const response =
        await router.generate({
          messages: [
            {
              role: "system",
              content:
                "You are AshenAI, a helpful AI assistant. Answer clearly and naturally.",
            },
            {
              role: "user",
              content: message,
            },
          ],
        });

      res.json({
        ok: true,
        text: response.text,
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
