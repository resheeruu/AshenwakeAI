import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { logger } from "../logger";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ashenai.db");

let db: Database.Database | null = null;

/**
 * Get the singleton database instance.
 * Creates the database on first call with WAL mode and migrations.
 */
export function getDatabase(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);

  // WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // Busy timeout for concurrent access
  db.pragma("busy_timeout = 5000");

  // Synchronous NORMAL for good durability with performance
  db.pragma("synchronous = NORMAL");

  // Foreign keys enabled
  db.pragma("foreign_keys = ON");

  // Run migrations
  runMigrations(db);

  logger.info("📦 SQLite database initialized: " + DB_PATH);

  return db;
}

/**
 * Run all pending migrations in order.
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r: any) => r.version)
  );

  const migrations = getMigrations();

  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      logger.info(`📦 Running migration v${migration.version}: ${migration.description}`);
      db.transaction(() => {
        db!.exec(migration.sql);
        db!.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
      })();
    }
  }
}

/**
 * Get all migrations in order.
 */
function getMigrations(): Array<{ version: number; description: string; sql: string }> {
  return [
    {
      version: 1,
      description: "Guild configs",
      sql: `
        CREATE TABLE guild_configs (
          guild_id TEXT PRIMARY KEY,
          config_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
        CREATE INDEX idx_guild_configs_updated ON guild_configs(updated_at);
      `,
    },
    {
      version: 2,
      description: "Guild AI configs + trusted users",
      sql: `
        CREATE TABLE guild_ai_configs (
          guild_id TEXT PRIMARY KEY,
          config_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
        CREATE INDEX idx_guild_ai_configs_updated ON guild_ai_configs(updated_at);

        CREATE TABLE trusted_users (
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          added_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          PRIMARY KEY (guild_id, user_id)
        );
        CREATE INDEX idx_trusted_users_guild ON trusted_users(guild_id);
      `,
    },
    {
      version: 3,
      description: "Audit log",
      sql: `
        CREATE TABLE audit_log (
          id TEXT PRIMARY KEY,
          timestamp INTEGER NOT NULL,
          who TEXT NOT NULL,
          who_name TEXT,
          what TEXT NOT NULL,
          "where" TEXT NOT NULL,
          guild_id TEXT,
          reason TEXT,
          result TEXT NOT NULL CHECK(result IN ('success', 'failure', 'denied', 'error')),
          details TEXT,
          signature TEXT,
          prev_hash TEXT
        );
        CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
        CREATE INDEX idx_audit_log_guild ON audit_log(guild_id);
        CREATE INDEX idx_audit_log_who ON audit_log(who);
      `,
    },
    {
      version: 4,
      description: "Usage statistics",
      sql: `
        CREATE TABLE usage_stats (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          total_users INTEGER NOT NULL DEFAULT 0,
          total_messages INTEGER NOT NULL DEFAULT 0,
          total_commands INTEGER NOT NULL DEFAULT 0,
          total_failures INTEGER NOT NULL DEFAULT 0,
          command_failures INTEGER NOT NULL DEFAULT 0,
          chat_failures INTEGER NOT NULL DEFAULT 0,
          command_usage_json TEXT NOT NULL DEFAULT '{}',
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );

        CREATE TABLE usage_daily_users (
          day_key TEXT NOT NULL,
          user_id TEXT NOT NULL,
          PRIMARY KEY (day_key, user_id)
        );

        CREATE TABLE usage_weekly_users (
          week_key TEXT NOT NULL,
          user_id TEXT NOT NULL,
          PRIMARY KEY (week_key, user_id)
        );

        CREATE TABLE usage_user_records (
          user_id TEXT PRIMARY KEY,
          first_seen INTEGER NOT NULL,
          last_seen INTEGER NOT NULL
        );
      `,
    },
    {
      version: 5,
      description: "Conversation memory",
      sql: `
        CREATE TABLE conversations (
          conversation_key TEXT PRIMARY KEY,
          messages_json TEXT NOT NULL DEFAULT '[]',
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
        CREATE INDEX idx_conversations_updated ON conversations(updated_at);
      `,
    },
    {
      version: 6,
      description: "Builder sessions",
      sql: `
        CREATE TABLE builder_sessions (
          session_key TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          session_json TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          last_activity_at INTEGER NOT NULL
        );
        CREATE INDEX idx_builder_sessions_guild ON builder_sessions(guild_id);
        CREATE INDEX idx_builder_sessions_user ON builder_sessions(user_id);
        CREATE INDEX idx_builder_sessions_activity ON builder_sessions(last_activity_at);
      `,
    },
    {
      version: 7,
      description: "FTS5 conversation search",
      sql: `
        CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
          conversation_key,
          messages_text,
          content='conversations',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS conversations_ai AFTER INSERT ON conversations BEGIN
          INSERT INTO conversations_fts(rowid, conversation_key, messages_text)
          VALUES (new.rowid, new.conversation_key, new.messages_json);
        END;

        CREATE TRIGGER IF NOT EXISTS conversations_ad AFTER DELETE ON conversations BEGIN
          INSERT INTO conversations_fts(conversations_fts, rowid, conversation_key, messages_text)
          VALUES ('delete', old.rowid, old.conversation_key, old.messages_json);
        END;

        CREATE TRIGGER IF NOT EXISTS conversations_au AFTER UPDATE ON conversations BEGIN
          INSERT INTO conversations_fts(conversations_fts, rowid, conversation_key, messages_text)
          VALUES ('delete', old.rowid, old.conversation_key, old.messages_json);
          INSERT INTO conversations_fts(rowid, conversation_key, messages_text)
          VALUES (new.rowid, new.conversation_key, new.messages_json);
        END;
      `,
    },
    {
      version: 8,
      description: "AI response cache",
      sql: `
        CREATE TABLE IF NOT EXISTS ai_response_cache (
          cache_key TEXT PRIMARY KEY,
          response TEXT NOT NULL,
          model TEXT NOT NULL,
          token_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          expires_at INTEGER NOT NULL,
          hit_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_response_cache_expires ON ai_response_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_response_cache_model ON ai_response_cache(model);
      `,
    },
    {
      version: 9,
      description: "Agent tasks (SQLite)",
      sql: `
        CREATE TABLE IF NOT EXISTS agent_tasks (
          id TEXT PRIMARY KEY,
          goal TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          task_json TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
        CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
        CREATE INDEX IF NOT EXISTS idx_agent_tasks_updated ON agent_tasks(updated_at);
      `,
    },
    {
      version: 10,
      description: "Agent traces",
      sql: `
        CREATE TABLE IF NOT EXISTS agent_traces (
          id TEXT PRIMARY KEY,
          trace_id TEXT NOT NULL,
          parent_id TEXT,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration_ms INTEGER,
          status TEXT NOT NULL DEFAULT 'ok',
          metadata_json TEXT,
          error_message TEXT,
          tokens_used INTEGER DEFAULT 0,
          cost_usd REAL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_agent_traces_trace ON agent_traces(trace_id);
        CREATE INDEX IF NOT EXISTS idx_agent_traces_category ON agent_traces(category);
        CREATE INDEX IF NOT EXISTS idx_agent_traces_time ON agent_traces(start_time);
        CREATE INDEX IF NOT EXISTS idx_agent_traces_status ON agent_traces(status);
      `,
    },
    {
      version: 11,
      description: "Cache isolation columns + trace size index",
      sql: `
        -- Add guild_id and user_id to response cache for isolation
        ALTER TABLE ai_response_cache ADD COLUMN guild_id TEXT DEFAULT '';
        ALTER TABLE ai_response_cache ADD COLUMN user_id TEXT DEFAULT '';
      `,
    },
    {
      version: 12,
      description: "AI usage tracking per user request",
      sql: `
        CREATE TABLE IF NOT EXISTS ai_usage (
          request_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          guild_id TEXT DEFAULT '',
          channel_id TEXT DEFAULT '',
          source TEXT NOT NULL DEFAULT 'unknown',
          provider TEXT DEFAULT '',
          model TEXT DEFAULT '',
          input_tokens INTEGER,
          output_tokens INTEGER,
          total_tokens INTEGER,
          success INTEGER NOT NULL DEFAULT 1,
          latency_ms INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_guild ON ai_usage(guild_id);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_source ON ai_usage(source);
      `,
    },
  ];
}

/**
 * Execute a function within a transaction.
 */
export function transaction<T>(fn: () => T): T {
  const database = getDatabase();
  return database.transaction(fn)();
}

/**
 * Safe database operation with error handling.
 */
export function safeDbOperation<T>(operation: () => T, fallback: T, context: string): T {
  try {
    return operation();
  } catch (error) {
    logger.warn(`⚠️ Database operation failed (${context}): ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase(): void {
  if (db) {
    try {
      db.close();
      db = null;
      logger.info("📦 SQLite database closed.");
    } catch (error) {
      logger.warn(`⚠️ Error closing database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Get database statistics for diagnostics.
 */
export function getDatabaseStats(): { tables: number; size: number } {
  const database = getDatabase();
  const tables = database.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as any;
  const size = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  return { tables: tables.count, size };
}
