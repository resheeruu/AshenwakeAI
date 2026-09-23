"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var database_exports = {};
__export(database_exports, {
  closeDatabase: () => closeDatabase,
  getDatabase: () => getDatabase,
  getDatabaseStats: () => getDatabaseStats,
  safeDbOperation: () => safeDbOperation,
  transaction: () => transaction
});
module.exports = __toCommonJS(database_exports);
var import_better_sqlite3 = __toESM(require("better-sqlite3"));
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));
var import_logger = require("../logger");
const DATA_DIR = import_path.default.join(process.cwd(), "data");
const DB_PATH = import_path.default.join(DATA_DIR, "ashenai.db");
let db = null;
function getDatabase() {
  if (db) return db;
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  db = new import_better_sqlite3.default(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  import_logger.logger.info("\u{1F4E6} SQLite database initialized: " + DB_PATH);
  return db;
}
function runMigrations(db2) {
  db2.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
  const applied = new Set(
    db2.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
  const migrations = getMigrations();
  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      import_logger.logger.info(`\u{1F4E6} Running migration v${migration.version}: ${migration.description}`);
      db2.transaction(() => {
        db2.exec(migration.sql);
        db2.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
      })();
    }
  }
}
function getMigrations() {
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
      `
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
      `
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
      `
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
      `
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
      `
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
      `
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
      `
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
      `
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
      `
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
      `
    },
    {
      version: 11,
      description: "Cache isolation columns + trace size index",
      sql: `
        -- Add guild_id and user_id to response cache for isolation
        ALTER TABLE ai_response_cache ADD COLUMN guild_id TEXT DEFAULT '';
        ALTER TABLE ai_response_cache ADD COLUMN user_id TEXT DEFAULT '';
      `
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
      `
    },
    {
      version: 13,
      description: "Support cases with lifecycle, AI analysis, and evidence",
      sql: `
        CREATE TABLE IF NOT EXISTS support_cases (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('support', 'report', 'appeal')),
          status TEXT NOT NULL CHECK(status IN ('open', 'investigating', 'waiting_user', 'waiting_staff', 'escalated', 'resolved', 'closed')),
          creator_id TEXT NOT NULL,
          subject_user_id TEXT,
          assigned_staff_id TEXT,
          summary TEXT,
          ai_analysis_json TEXT,
          metadata_json TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          closed_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_support_cases_guild ON support_cases(guild_id);
        CREATE INDEX IF NOT EXISTS idx_support_cases_status ON support_cases(status);
        CREATE INDEX IF NOT EXISTS idx_support_cases_type ON support_cases(type);
        CREATE INDEX IF NOT EXISTS idx_support_cases_creator ON support_cases(creator_id);
        CREATE INDEX IF NOT EXISTS idx_support_cases_assigned ON support_cases(assigned_staff_id);
        CREATE INDEX IF NOT EXISTS idx_support_cases_channel ON support_cases(channel_id);
        CREATE INDEX IF NOT EXISTS idx_support_cases_updated ON support_cases(updated_at);

        CREATE TABLE IF NOT EXISTS support_case_messages (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          content TEXT NOT NULL,
          is_ai INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          FOREIGN KEY (case_id) REFERENCES support_cases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_support_case_messages_case ON support_case_messages(case_id);

        CREATE TABLE IF NOT EXISTS support_case_evidence (
          id TEXT PRIMARY KEY,
          case_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_name TEXT,
          content TEXT,
          channel_id TEXT,
          channel_name TEXT,
          message_url TEXT,
          attachment_urls_json TEXT,
          collected_by TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          FOREIGN KEY (case_id) REFERENCES support_cases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_support_case_evidence_case ON support_case_evidence(case_id);
      `
    },
    {
      version: 14,
      description: "Support case conversation state for AI orchestrator",
      sql: `
        CREATE TABLE IF NOT EXISTS support_case_conversations (
          case_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          FOREIGN KEY (case_id) REFERENCES support_cases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_support_case_conversations_updated ON support_case_conversations(updated_at);
      `
    },
    {
      version: 15,
      description: "Support idempotency, concurrency control, and message dedup",
      sql: `
        -- Version column for optimistic concurrency on support_cases
        ALTER TABLE support_cases ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

        -- Idempotency key for case creation dedup (e.g. Discord interaction ID)
        ALTER TABLE support_cases ADD COLUMN idempotency_key TEXT;

        -- Unique index on idempotency_key (partial: only non-null keys)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_support_cases_idempotency
          ON support_cases(idempotency_key)
          WHERE idempotency_key IS NOT NULL;

        -- Discord message ID for message-level idempotency
        ALTER TABLE support_case_messages ADD COLUMN discord_message_id TEXT;

        -- Unique index on discord_message_id (partial: only non-null)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_support_case_messages_discord
          ON support_case_messages(discord_message_id)
          WHERE discord_message_id IS NOT NULL;

        -- Unique evidence per case+message to prevent duplicate evidence items
        CREATE UNIQUE INDEX IF NOT EXISTS idx_support_case_evidence_unique
          ON support_case_evidence(case_id, message_id);
      `
    },
    {
      version: 16,
      description: "AI provider platform: dynamic provider management",
      sql: `
        -- Provider definitions (built-in + custom)
        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          provider_type TEXT NOT NULL CHECK(provider_type IN ('builtin', 'custom', 'local')),
          protocol TEXT NOT NULL DEFAULT 'openai_compatible',
          endpoint TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          priority INTEGER NOT NULL DEFAULT 100,
          default_model TEXT,
          timeout_ms INTEGER NOT NULL DEFAULT 15000,
          retry_max_attempts INTEGER NOT NULL DEFAULT 2,
          metadata_json TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
        CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(provider_type);
        CREATE INDEX IF NOT EXISTS idx_providers_enabled ON providers(enabled);

        -- Provider credentials (API keys, secrets) -- stored separately from metadata
        CREATE TABLE IF NOT EXISTS provider_credentials (
          provider_id TEXT NOT NULL,
          credential_key TEXT NOT NULL,
          credential_value TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          PRIMARY KEY (provider_id, credential_key),
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
        );

        -- Discovered/configured models per provider
        CREATE TABLE IF NOT EXISTS provider_models (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          display_name TEXT,
          context_length INTEGER,
          capabilities_json TEXT DEFAULT '[]',
          enabled INTEGER NOT NULL DEFAULT 1,
          priority INTEGER NOT NULL DEFAULT 100,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_provider_models_provider ON provider_models(provider_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_models_unique ON provider_models(provider_id, model_id);
      `
    },
    {
      version: 17,
      description: "Dashboard automation rules (persistent)",
      sql: `
        CREATE TABLE IF NOT EXISTS automation_rules (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          trigger_type TEXT NOT NULL,
          trigger_config_json TEXT NOT NULL DEFAULT '{}',
          conditions_json TEXT NOT NULL DEFAULT '[]',
          actions_json TEXT NOT NULL DEFAULT '[]',
          created_by TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
        );
        CREATE INDEX IF NOT EXISTS idx_automation_rules_guild ON automation_rules(guild_id);
        CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled ON automation_rules(enabled);
      `
    }
  ];
}
function transaction(fn) {
  const database = getDatabase();
  return database.transaction(fn)();
}
function safeDbOperation(operation, fallback, context) {
  try {
    return operation();
  } catch (error) {
    import_logger.logger.warn(`\u26A0\uFE0F Database operation failed (${context}): ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}
function closeDatabase() {
  if (db) {
    try {
      db.close();
      db = null;
      import_logger.logger.info("\u{1F4E6} SQLite database closed.");
    } catch (error) {
      import_logger.logger.warn(`\u26A0\uFE0F Error closing database: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
function getDatabaseStats() {
  const database = getDatabase();
  const tables = database.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get();
  const size = import_fs.default.existsSync(DB_PATH) ? import_fs.default.statSync(DB_PATH).size : 0;
  return { tables: tables.count, size };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  closeDatabase,
  getDatabase,
  getDatabaseStats,
  safeDbOperation,
  transaction
});
