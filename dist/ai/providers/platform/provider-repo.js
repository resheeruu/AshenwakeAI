"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var provider_repo_exports = {};
__export(provider_repo_exports, {
  providerRepo: () => providerRepo
});
module.exports = __toCommonJS(provider_repo_exports);
var import_database = require("../../../database/database");
var import_logger = require("../../../logger");
function parseJsonField(raw, fallback, rowId, field) {
  if (raw === null || raw === void 0 || raw === "") {
    return fallback;
  }
  if (typeof raw === "object") {
    return raw;
  }
  try {
    return JSON.parse(String(raw));
  } catch {
    const id = String(rowId ?? "unknown").slice(0, 64);
    import_logger.logger.warn(
      `\u26A0\uFE0F providerRepo: corrupt ${field} for provider id=${id}; using empty fallback`
    );
    return fallback;
  }
}
function rowToProvider(row) {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    providerType: row.provider_type,
    protocol: row.protocol,
    endpoint: row.endpoint || void 0,
    enabled: Boolean(row.enabled),
    priority: row.priority,
    defaultModel: row.default_model || void 0,
    timeoutMs: row.timeout_ms,
    retryMaxAttempts: row.retry_max_attempts,
    metadata: parseJsonField(row.metadata_json, {}, row.id, "metadata_json"),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
function rowToModel(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name || void 0,
    contextLength: row.context_length || void 0,
    capabilities: parseJsonField(row.capabilities_json, [], row.id, "capabilities_json") || [],
    enabled: Boolean(row.enabled),
    priority: row.priority,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at
  };
}
function mapRowsSafely(rows, map, label) {
  const out = [];
  for (const row of rows) {
    try {
      out.push(map(row));
    } catch {
      const id = String(row?.id ?? "unknown").slice(0, 64);
      import_logger.logger.warn(`\u26A0\uFE0F providerRepo: skipping corrupt ${label} row id=${id}`);
    }
  }
  return out;
}
const providerRepo = {
  getAll() {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const rows = db.prepare("SELECT * FROM providers ORDER BY priority ASC").all();
      return mapRowsSafely(rows, rowToProvider, "provider");
    }, [], "providerRepo.getAll");
  },
  getById(id) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
      if (!row) return void 0;
      try {
        return rowToProvider(row);
      } catch {
        import_logger.logger.warn(`\u26A0\uFE0F providerRepo: corrupt provider row id=${String(id).slice(0, 64)}`);
        return void 0;
      }
    }, void 0, "providerRepo.getById");
  },
  getByName(name) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const row = db.prepare("SELECT * FROM providers WHERE name = ?").get(name);
      if (!row) return void 0;
      try {
        return rowToProvider(row);
      } catch {
        import_logger.logger.warn("\u26A0\uFE0F providerRepo: corrupt provider row for name lookup");
        return void 0;
      }
    }, void 0, "providerRepo.getByName");
  },
  getEnabled() {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const rows = db.prepare("SELECT * FROM providers WHERE enabled = 1 ORDER BY priority ASC").all();
      return mapRowsSafely(rows, rowToProvider, "provider");
    }, [], "providerRepo.getEnabled");
  },
  create(provider) {
    const db = (0, import_database.getDatabase)();
    const now = Date.now();
    (0, import_database.safeDbOperation)(() => {
      db.prepare(`
        INSERT INTO providers (id, name, display_name, provider_type, protocol, endpoint, enabled, priority, default_model, timeout_ms, retry_max_attempts, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        provider.id,
        provider.name,
        provider.displayName,
        provider.providerType,
        provider.protocol,
        provider.endpoint || null,
        provider.enabled ? 1 : 0,
        provider.priority,
        provider.defaultModel || null,
        provider.timeoutMs,
        provider.retryMaxAttempts,
        JSON.stringify(provider.metadata),
        now,
        now
      );
    }, void 0, "providerRepo.create");
    return { ...provider, createdAt: now, updatedAt: now };
  },
  update(id, updates) {
    const db = (0, import_database.getDatabase)();
    const fields = [];
    const values = [];
    if (updates.displayName !== void 0) {
      fields.push("display_name = ?");
      values.push(updates.displayName);
    }
    if (updates.endpoint !== void 0) {
      fields.push("endpoint = ?");
      values.push(updates.endpoint);
    }
    if (updates.enabled !== void 0) {
      fields.push("enabled = ?");
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.priority !== void 0) {
      fields.push("priority = ?");
      values.push(updates.priority);
    }
    if (updates.defaultModel !== void 0) {
      fields.push("default_model = ?");
      values.push(updates.defaultModel);
    }
    if (updates.timeoutMs !== void 0) {
      fields.push("timeout_ms = ?");
      values.push(updates.timeoutMs);
    }
    if (updates.retryMaxAttempts !== void 0) {
      fields.push("retry_max_attempts = ?");
      values.push(updates.retryMaxAttempts);
    }
    if (updates.metadata !== void 0) {
      fields.push("metadata_json = ?");
      values.push(JSON.stringify(updates.metadata));
    }
    if (fields.length === 0) return;
    fields.push("updated_at = unixepoch() * 1000");
    values.push(id);
    (0, import_database.safeDbOperation)(() => {
      db.prepare(`UPDATE providers SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }, void 0, `providerRepo.update:${id}`);
  },
  delete(id) {
    const db = (0, import_database.getDatabase)();
    (0, import_database.safeDbOperation)(() => {
      db.prepare("DELETE FROM providers WHERE id = ?").run(id);
    }, void 0, `providerRepo.delete:${id}`);
  },
  exists(name) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      return !!db.prepare("SELECT 1 FROM providers WHERE name = ?").get(name);
    }, false, "providerRepo.exists");
  },
  count() {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const row = db.prepare("SELECT COUNT(*) as count FROM providers").get();
      return row.count;
    }, 0, "providerRepo.count");
  },
  getModels(providerId) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const rows = db.prepare("SELECT * FROM provider_models WHERE provider_id = ? ORDER BY priority ASC").all(providerId);
      return mapRowsSafely(rows, rowToModel, "model");
    }, [], `providerRepo.getModels:${providerId}`);
  },
  getDefaultModel(providerId) {
    const db = (0, import_database.getDatabase)();
    return (0, import_database.safeDbOperation)(() => {
      const row = db.prepare("SELECT * FROM provider_models WHERE provider_id = ? AND is_default = 1").get(providerId);
      if (!row) return void 0;
      try {
        return rowToModel(row);
      } catch {
        import_logger.logger.warn(`\u26A0\uFE0F providerRepo: corrupt default model for provider=${String(providerId).slice(0, 64)}`);
        return void 0;
      }
    }, void 0, `providerRepo.getDefaultModel:${providerId}`);
  },
  upsertModel(model) {
    const db = (0, import_database.getDatabase)();
    const id = `${model.providerId}:${model.modelId}`;
    const now = Date.now();
    (0, import_database.safeDbOperation)(() => {
      if (model.isDefault) {
        db.prepare("UPDATE provider_models SET is_default = 0 WHERE provider_id = ?").run(model.providerId);
      }
      db.prepare(`
        INSERT INTO provider_models (id, provider_id, model_id, display_name, context_length, capabilities_json, enabled, priority, is_default, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_id, model_id)
        DO UPDATE SET display_name = excluded.display_name, context_length = excluded.context_length,
          capabilities_json = excluded.capabilities_json, enabled = excluded.enabled,
          priority = excluded.priority, is_default = excluded.is_default
      `).run(
        id,
        model.providerId,
        model.modelId,
        model.displayName || null,
        model.contextLength || null,
        JSON.stringify(model.capabilities),
        model.enabled ? 1 : 0,
        model.priority,
        model.isDefault ? 1 : 0,
        now
      );
    }, void 0, `providerRepo.upsertModel:${model.providerId}`);
    return { ...model, id, createdAt: now };
  },
  deleteModels(providerId) {
    const db = (0, import_database.getDatabase)();
    (0, import_database.safeDbOperation)(() => {
      db.prepare("DELETE FROM provider_models WHERE provider_id = ?").run(providerId);
    }, void 0, `providerRepo.deleteModels:${providerId}`);
  },
  deleteModel(id) {
    const db = (0, import_database.getDatabase)();
    (0, import_database.safeDbOperation)(() => {
      db.prepare("DELETE FROM provider_models WHERE id = ?").run(id);
    }, void 0, `providerRepo.deleteModel:${id}`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  providerRepo
});
