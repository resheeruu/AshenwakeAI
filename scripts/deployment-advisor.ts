const has = (name: string) => Boolean(process.env[name]?.trim());
const state = (name: string, required = false) => has(name) ? "present" : required ? "missing" : "optional";
const platforms: Array<[string, string[]]> = [
  ["render", ["RENDER", "RENDER_SERVICE_ID", "RENDER_GIT_COMMIT"]],
  ["railway", ["RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"]],
  ["fly.io", ["FLY_APP_NAME", "FLY_REGION", "FLY_ALLOC_ID"]],
  ["koyeb", ["KOYEB_APP_NAME", "KOYEB_SERVICE_NAME"]],
  ["heroku", ["DYNO", "HEROKU_APP_NAME"]],
  ["replit", ["REPL_ID", "REPL_SLUG"]],
];
const matches = platforms.map(([provider, signals]) => ({ provider, signals: signals.filter(has) })).filter((match) => match.signals.length);
const provider = matches.length === 1 ? matches[0].provider : matches.length > 1 ? "unknown/ambiguous" : has("KUBERNETES_SERVICE_HOST") ? "docker/container" : has("TERMUX_VERSION") ? "local development" : "unknown";
const compatibility = ["unknown", "unknown/ambiguous"].includes(provider) ? "unknown" : "partially compatible";
const owner = ["ASHENAI_OWNER_USERNAME", "ASHENAI_OWNER_PASSWORD_HASH", "ASHENAI_OWNER_PASSWORD_SALT"];
const smtp = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
const statuses: Record<string, string> = {
  NODE_ENV: process.env.NODE_ENV === "production" ? "present" : "malformed",
  DISCORD_TOKEN: state("DISCORD_TOKEN", true), DISCORD_CLIENT_ID: state("DISCORD_CLIENT_ID", true),
  owner_credentials: owner.every(has) ? "present" : owner.some(has) ? "malformed" : "optional (may be stored in persistent data)",
  AUTH_BASE_URL: state("AUTH_BASE_URL"), SESSION_SECRET: state("SESSION_SECRET", true),
  LAVALINK_URL: state("LAVALINK_URL", true), LAVALINK_PASSWORD: state("LAVALINK_PASSWORD", true),
  oauth: has("DISCORD_OAUTH_CLIENT_ID") || has("GOOGLE_OAUTH_CLIENT_ID") || has("DISCORD_CLIENT_SECRET") ? "present" : "optional",
  smtp: smtp.some(has) ? (has("SMTP_HOST") && has("SMTP_FROM") ? "present" : "malformed") : "optional",
  ai_provider_keys: Object.keys(process.env).some((name) => /(?:_API_KEY|OLLAMA_BASE_URL)$/.test(name)) ? "present" : "missing",
  OLLAMA_BASE_URL: state("OLLAMA_BASE_URL"), PORT: state("PORT"),
};
console.log(`hosting detected: ${provider}`);
console.log(`compatibility: ${compatibility}`);
console.log("required configuration:");
[
  "NODE_ENV=production; host-supplied PORT; DISCORD_TOKEN; DISCORD_CLIENT_ID; LAVALINK_URL; LAVALINK_PASSWORD; SESSION_SECRET",
  "owner account in persistent data/ or all ASHENAI_OWNER_* variables",
  "persistent writable data/ volume for accounts, sessions, guild configuration, and usage data",
  "Node.js 22+; Java 21+ and FFmpeg when self-hosting Lavalink/music",
].forEach((item) => console.log(`- ${item}`));
console.log("startup: npm start");
console.log("build: npm run build");
console.log("warnings:");
console.log("- data/ is host persistence; an ephemeral filesystem loses state on restart.");
console.log("- Render scripts are helpers, not application runtime dependencies.");
console.log(`recommendation: ${compatibility === "unknown" ? "Use a generic Node.js service or Docker image with a persistent data/ volume; confirm outbound Discord/WebSocket support." : "Confirm persistent data/ storage, then use npm run build and npm start (or Docker)."}`);
console.log("configuration status (values intentionally omitted):");
for (const [name, value] of Object.entries(statuses)) console.log(`- ${name}: ${value}`);
