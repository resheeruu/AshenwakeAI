import { getDatabase, safeDbOperation } from "../../../database/database";
import { logger } from "../../../logger";
import type {
  ProviderDefinition,
  ProviderModel,
  ProviderType,
  ProviderProtocol,
} from "./types";

function rowToProvider(row: any): ProviderDefinition {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    providerType: row.provider_type,
    protocol: row.protocol,
    endpoint: row.endpoint || undefined,
    enabled: Boolean(row.enabled),
    priority: row.priority,
    defaultModel: row.default_model || undefined,
    timeoutMs: row.timeout_ms,
    retryMaxAttempts: row.retry_max_attempts,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToModel(row: any): ProviderModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name || undefined,
    contextLength: row.context_length || undefined,
    capabilities: row.capabilities_json ? JSON.parse(row.capabilities_json) : [],
    enabled: Boolean(row.enabled),
    priority: row.priority,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
  };
}

export const providerRepo = {
  getAll(): ProviderDefinition[] {
    const db = getDatabase();
    return safeDbOperation(() => {
      const rows = db.prepare("SELECT * FROM providers ORDER BY priority ASC").all();
      return rows.map(rowToProvider);
    }, [], "providerRepo.getAll");
  },

  getById(id: string): ProviderDefinition | undefined {
    const db = getDatabase();
    return safeDbOperation(() => {
      const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
      return row ? rowToProvider(row) : undefined;
    }, undefined, "providerRepo.getById");
  },

  getByName(name: string): ProviderDefinition | undefined {
    const db = getDatabase();
    return safeDbOperation(() => {
      const row = db.prepare("SELECT * FROM providers WHERE name = ?").get(name);
      return row ? rowToProvider(row) : undefined;
    }, undefined, "providerRepo.getByName");
  },

  getEnabled(): ProviderDefinition[] {
    const db = getDatabase();
    return safeDbOperation(() => {
      const rows = db.prepare("SELECT * FROM providers WHERE enabled = 1 ORDER BY priority ASC").all();
      return rows.map(rowToProvider);
    }, [], "providerRepo.getEnabled");
  },

  create(provider: Omit<ProviderDefinition, "createdAt" | "updatedAt">): ProviderDefinition {
    const db = getDatabase();
    const now = Date.now();
    safeDbOperation(() => {
      db.prepare(`
        INSERT INTO providers (id, name, display_name, provider_type, protocol, endpoint, enabled, priority, default_model, timeout_ms, retry_max_attempts, metadata_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        provider.id, provider.name, provider.displayName, provider.providerType,
        provider.protocol, provider.endpoint || null, provider.enabled ? 1 : 0,
        provider.priority, provider.defaultModel || null, provider.timeoutMs,
        provider.retryMaxAttempts, JSON.stringify(provider.metadata), now, now
      );
    }, undefined, "providerRepo.create");
    return { ...provider, createdAt: now, updatedAt: now };
  },

  update(id: string, updates: Partial<Omit<ProviderDefinition, "id" | "createdAt" | "updatedAt">>): void {
    const db = getDatabase();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (updates.displayName !== undefined) { fields.push("display_name = ?"); values.push(updates.displayName); }
    if (updates.endpoint !== undefined) { fields.push("endpoint = ?"); values.push(updates.endpoint); }
    if (updates.enabled !== undefined) { fields.push("enabled = ?"); values.push(updates.enabled ? 1 : 0); }
    if (updates.priority !== undefined) { fields.push("priority = ?"); values.push(updates.priority); }
    if (updates.defaultModel !== undefined) { fields.push("default_model = ?"); values.push(updates.defaultModel); }
    if (updates.timeoutMs !== undefined) { fields.push("timeout_ms = ?"); values.push(updates.timeoutMs); }
    if (updates.retryMaxAttempts !== undefined) { fields.push("retry_max_attempts = ?"); values.push(updates.retryMaxAttempts); }
    if (updates.metadata !== undefined) { fields.push("metadata_json = ?"); values.push(JSON.stringify(updates.metadata)); }
    if (fields.length === 0) return;
    fields.push("updated_at = unixepoch() * 1000");
    values.push(id);
    safeDbOperation(() => {
      db.prepare(`UPDATE providers SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }, undefined, `providerRepo.update:${id}`);
  },

  delete(id: string): void {
    const db = getDatabase();
    safeDbOperation(() => {
      db.prepare("DELETE FROM providers WHERE id = ?").run(id);
    }, undefined, `providerRepo.delete:${id}`);
  },

  exists(name: string): boolean {
    const db = getDatabase();
    return safeDbOperation(() => {
      return !!db.prepare("SELECT 1 FROM providers WHERE name = ?").get(name);
    }, false, "providerRepo.exists");
  },

  count(): number {
    const db = getDatabase();
    return safeDbOperation(() => {
      const row = db.prepare("SELECT COUNT(*) as count FROM providers").get() as { count: number };
      return row.count;
    }, 0, "providerRepo.count");
  },

  getModels(providerId: string): ProviderModel[] {
    const db = getDatabase();
    return safeDbOperation(() => {
      const rows = db.prepare("SELECT * FROM provider_models WHERE provider_id = ? ORDER BY priority ASC").all(providerId);
      return rows.map(rowToModel);
    }, [], `providerRepo.getModels:${providerId}`);
  },

  getDefaultModel(providerId: string): ProviderModel | undefined {
    const db = getDatabase();
    return safeDbOperation(() => {
      const row = db.prepare("SELECT * FROM provider_models WHERE provider_id = ? AND is_default = 1").get(providerId);
      return row ? rowToModel(row) : undefined;
    }, undefined, `providerRepo.getDefaultModel:${providerId}`);
  },

  upsertModel(model: Omit<ProviderModel, "id" | "createdAt">): ProviderModel {
    const db = getDatabase();
    const id = `${model.providerId}:${model.modelId}`;
    const now = Date.now();
    safeDbOperation(() => {
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
      `).run(id, model.providerId, model.modelId, model.displayName || null,
        model.contextLength || null, JSON.stringify(model.capabilities),
        model.enabled ? 1 : 0, model.priority, model.isDefault ? 1 : 0, now);
    }, undefined, `providerRepo.upsertModel:${model.providerId}`);
    return { ...model, id, createdAt: now };
  },

  deleteModels(providerId: string): void {
    const db = getDatabase();
    safeDbOperation(() => {
      db.prepare("DELETE FROM provider_models WHERE provider_id = ?").run(providerId);
    }, undefined, `providerRepo.deleteModels:${providerId}`);
  },

  deleteModel(id: string): void {
    const db = getDatabase();
    safeDbOperation(() => {
      db.prepare("DELETE FROM provider_models WHERE id = ?").run(id);
    }, undefined, `providerRepo.deleteModel:${id}`);
  },
};
