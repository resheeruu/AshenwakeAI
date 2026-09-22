import { getDatabase, closeDatabase } from "../src/database/database";
import { providerRepo } from "../src/ai/providers/platform/provider-repo";
import { encryptCredential, decryptCredential, storeCredential, getCredential, deleteAllCredentials } from "../src/ai/providers/platform/credential-store";
import { isSafeEndpoint } from "../src/ai/providers/platform/connection-tester";
import { ProviderRegistry } from "../src/ai/providers/registry";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg}`); }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.error(`  ❌ ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

async function run() {
  console.log("\n🧪 Provider Platform Tests\n");

  // ── Database Setup ──
  console.log("Database initialization...");
  const db = getDatabase();
  assert(db !== null, "Database initialized");

  // ── Credential Store ──
  console.log("\n── Credential Store ──");

  const plaintext = "sk-test-api-key-12345";
  const encrypted = encryptCredential(plaintext);
  assert(encrypted !== plaintext, "Encryption produces different output than plaintext");
  assert(encrypted.length > 0, "Encrypted value is non-empty");

  const decrypted = decryptCredential(encrypted);
  assertEqual(decrypted, plaintext, "Decrypted value matches original");

  /*
   * Seed the parent provider row first: provider_credentials.provider_id has
   * a FOREIGN KEY to providers(id), so a credential cannot exist without its
   * provider definition. Delete first so reruns are idempotent.
   */
  providerRepo.delete("test-provider-1");
  providerRepo.create({
    id: "test-provider-1",
    name: "test-credential-provider",
    displayName: "Test Credential Provider",
    providerType: "custom",
    protocol: "openai_compatible",
    endpoint: "https://api.test.com/v1",
    enabled: false,
    priority: 60,
    defaultModel: "test-model",
    timeoutMs: 10000,
    retryMaxAttempts: 3,
    metadata: { test: true },
  });

  storeCredential("test-provider-1", "api_key", "sk-secret-123");
  const stored = getCredential("test-provider-1", "api_key");
  assertEqual(stored, "sk-secret-123", "Stored credential retrieved correctly");

  storeCredential("test-provider-1", "api_key", "sk-secret-updated");
  const updated = getCredential("test-provider-1", "api_key");
  assertEqual(updated, "sk-secret-updated", "Credential update works");

  const missing = getCredential("nonexistent", "api_key");
  assertEqual(missing, undefined, "Missing credential returns undefined");

  deleteAllCredentials("test-provider-1");
  const afterDelete = getCredential("test-provider-1", "api_key");
  assertEqual(afterDelete, undefined, "Deleted credential returns undefined");

  // Remove the seeded provider row (also cascades any leftover credentials).
  providerRepo.delete("test-provider-1");

  // ── Provider Repository ──
  console.log("\n── Provider Repository ──");

  const beforeCount = providerRepo.count();
  assert(typeof beforeCount === "number", "Count returns a number");

  const testProvider = providerRepo.create({
    id: "test-repo-1",
    name: "test-repo-provider",
    displayName: "Test Repo Provider",
    providerType: "custom",
    protocol: "openai_compatible",
    endpoint: "https://api.test.com/v1",
    enabled: true,
    priority: 50,
    defaultModel: "test-model",
    timeoutMs: 10000,
    retryMaxAttempts: 3,
    metadata: { test: true },
  });
  assertEqual(testProvider.name, "test-repo-provider", "Created provider has correct name");
  assertEqual(testProvider.priority, 50, "Created provider has correct priority");
  assert(testProvider.createdAt > 0, "Created provider has timestamp");

  const retrieved = providerRepo.getById("test-repo-1");
  assert(retrieved !== undefined, "getById returns the provider");
  assertEqual(retrieved!.displayName, "Test Repo Provider", "Retrieved provider has correct displayName");
  assertEqual(retrieved!.endpoint, "https://api.test.com/v1", "Retrieved provider has correct endpoint");
  assert(retrieved!.enabled === true, "Retrieved provider is enabled");

  const byName = providerRepo.getByName("test-repo-provider");
  assert(byName !== undefined, "getByName returns the provider");

  const exists = providerRepo.exists("test-repo-provider");
  assert(exists === true, "exists returns true for existing provider");

  const notExists = providerRepo.exists("nonexistent-provider");
  assert(notExists === false, "exists returns false for missing provider");

  providerRepo.update("test-repo-1", { displayName: "Updated Name", enabled: false });
  const updatedProvider = providerRepo.getById("test-repo-1");
  assertEqual(updatedProvider!.displayName, "Updated Name", "Update changes displayName");
  assertEqual(updatedProvider!.enabled, false, "Update changes enabled");

  providerRepo.upsertModel({
    providerId: "test-repo-1",
    modelId: "model-a",
    displayName: "Model A",
    contextLength: 4096,
    capabilities: ["chat"],
    enabled: true,
    priority: 100,
    isDefault: true,
  });

  providerRepo.upsertModel({
    providerId: "test-repo-1",
    modelId: "model-b",
    displayName: "Model B",
    contextLength: 8192,
    capabilities: ["chat", "completion"],
    enabled: true,
    priority: 90,
    isDefault: false,
  });

  const models = providerRepo.getModels("test-repo-1");
  assertEqual(models.length, 2, "Two models created");

  const defaultModel = providerRepo.getDefaultModel("test-repo-1");
  assert(defaultModel !== undefined, "Default model exists");
  assertEqual(defaultModel!.modelId, "model-a", "Default model is model-a");

  providerRepo.upsertModel({
    providerId: "test-repo-1",
    modelId: "model-a",
    displayName: "Model A Updated",
    contextLength: 4096,
    capabilities: ["chat"],
    enabled: true,
    priority: 100,
    isDefault: false,
  });

  providerRepo.upsertModel({
    providerId: "test-repo-1",
    modelId: "model-b",
    displayName: "Model B",
    contextLength: 8192,
    capabilities: ["chat", "completion"],
    enabled: true,
    priority: 90,
    isDefault: true,
  });

  const newDefault = providerRepo.getDefaultModel("test-repo-1");
  assertEqual(newDefault!.modelId, "model-b", "Default model changed to model-b after upsert");

  providerRepo.deleteModels("test-repo-1");
  const afterDeleteModels = providerRepo.getModels("test-repo-1");
  assertEqual(afterDeleteModels.length, 0, "All models deleted");

  providerRepo.delete("test-repo-1");
  const afterDeleteProvider = providerRepo.getById("test-repo-1");
  assertEqual(afterDeleteProvider, undefined, "Provider deleted");

  // ── SSRF Protection ──
  console.log("\n── SSRF / Endpoint Safety ──");

  assert(isSafeEndpoint("https://api.openai.com/v1") === true, "Allows public HTTPS endpoint");
  assert(isSafeEndpoint("https://api.example.com:8080/v1") === true, "Allows HTTPS with custom port");
  assert(isSafeEndpoint("http://localhost:11434/api") === false, "Blocks localhost");
  assert(isSafeEndpoint("http://0.0.0.0:8080") === false, "Blocks 0.0.0.0");
  assert(isSafeEndpoint("http://127.0.0.1:8080") === false, "Blocks loopback");
  assert(isSafeEndpoint("http://10.0.0.1:8080") === false, "Blocks Class A private");
  assert(isSafeEndpoint("http://172.16.0.1:8080") === false, "Blocks Class B private");
  assert(isSafeEndpoint("http://192.168.1.1:8080") === false, "Blocks Class C private");
  assert(isSafeEndpoint("http://169.254.169.254/metadata") === false, "Blocks AWS metadata");
  assert(isSafeEndpoint("file:///etc/passwd") === false, "Blocks file:// protocol");
  assert(isSafeEndpoint("javascript:alert(1)") === false, "Blocks javascript: protocol");
  assert(isSafeEndpoint("http://myhost.local/api") === false, "Blocks .local TLD");
  assert(isSafeEndpoint("http://service.internal/api") === false, "Blocks .internal TLD");
  assert(isSafeEndpoint("not-a-url") === false, "Blocks invalid URLs");
  assert(isSafeEndpoint("") === false, "Blocks empty string");
  assert(isSafeEndpoint("ftp://example.com") === false, "Blocks non-HTTP protocols");

  // ── Provider Registry ──
  console.log("\n── Provider Registry ──");

  const registry = new ProviderRegistry();
  const mockProvider = { name: "mock-provider", isAvailable: () => true, generate: async () => ({ text: "", provider: "", model: "", latencyMs: 0 }) };

  registry.register(mockProvider, 50);
  assertEqual(registry.size, 1, "Registry has 1 provider after register");
  assert(registry.has("mock-provider"), "Registry has the provider");

  const retrieved2 = registry.get("mock-provider");
  assertEqual(retrieved2?.name, "mock-provider", "get returns correct provider");

  const all = registry.getAll();
  assertEqual(all.length, 1, "getAll returns 1 provider");

  const available = registry.getAvailable();
  assertEqual(available.length, 1, "getAvailable returns 1 provider (mock is available)");

  registry.register(mockProvider, 10);
  assertEqual(registry.size, 1, "Re-registering same name doesn't duplicate");

  const mockUnavailable = { name: "unavail", isAvailable: () => false, generate: async () => ({ text: "", provider: "", model: "", latencyMs: 0 }) };
  registry.register(mockUnavailable, 200);
  const availAfter = registry.getAvailable();
  assertEqual(availAfter.length, 1, "Unavailable provider excluded from getAvailable");

  registry.unregister("mock-provider");
  assertEqual(registry.size, 1, "Unregistered provider removed");
  assert(!registry.has("mock-provider"), "Registry no longer has unregistered provider");

  registry.clear();
  assertEqual(registry.size, 0, "Clear empties registry");

  // ── Multiple providers with priority ordering ──
  const highPriority = { name: "high", isAvailable: () => true, generate: async () => ({ text: "", provider: "", model: "", latencyMs: 0 }) };
  const lowPriority = { name: "low", isAvailable: () => true, generate: async () => ({ text: "", provider: "", model: "", latencyMs: 0 }) };
  registry.register(lowPriority, 200);
  registry.register(highPriority, 10);
  const ordered = registry.getAll();
  assertEqual(ordered[0].name, "high", "Priority ordering: lower number = first");

  // ── Summary ──
  console.log(`\n${"═".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
