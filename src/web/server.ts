import express, { Request, Response } from "express";
import path from "node:path";

import { AIRouter } from "../ai/router";
import { providers } from "../ai/providers";

const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || process.env.WEB_PORT || 3000);

const router = new AIRouter(providers);

app.use(express.json({ limit: "64kb" }));

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.get(
  "/api/health",
  (_req: Request, res: Response) => {
    res.json({
      ok: true,
      name: "AshenAI",
      uptime: process.uptime(),
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
          error: "Message is required.",
        });
        return;
      }

      if (message.length > 4000) {
        res.status(400).json({
          error: "Message is too long.",
        });
        return;
      }

      const response = await router.generate({
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
      console.error("Web chat error:", error);

      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "AI request failed.",
      });
    }
  }
);

app.get(
  "*",
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

export function startWebServer(): void {
  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log("");
      console.log("🌐 ===============================");
      console.log(
        `🌐 AshenAI Web listening on port ${PORT}`
      );
      console.log("🌐 ===============================");
      console.log("");
    }
  );
}
