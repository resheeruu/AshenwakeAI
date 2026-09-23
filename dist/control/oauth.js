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
var oauth_exports = {};
__export(oauth_exports, {
  consumeOAuthState: () => consumeOAuthState,
  createOAuthState: () => createOAuthState,
  getDiscordAuthUrl: () => getDiscordAuthUrl,
  getGoogleAuthUrl: () => getGoogleAuthUrl,
  handleDiscordCallback: () => handleDiscordCallback,
  handleGoogleCallback: () => handleGoogleCallback
});
module.exports = __toCommonJS(oauth_exports);
var import_crypto = __toESM(require("crypto"));
var import_logger = require("../logger");
var import_audit = require("../security/audit");
var import_account_store = require("./account-store");
var import_session_store = require("./session-store");
var import_linked_identities = require("./linked-identities");
const STATE_EXPIRY_MS = 10 * 60 * 1e3;
const oauthStates = /* @__PURE__ */ new Map();
function cleanupStates() {
  const now = Date.now();
  for (const [key, state] of oauthStates) {
    if (now - state.createdAt > STATE_EXPIRY_MS) {
      oauthStates.delete(key);
    }
  }
}
setInterval(cleanupStates, STATE_EXPIRY_MS).unref();
function createOAuthState(provider, action, accountId) {
  cleanupStates();
  const state = import_crypto.default.randomBytes(32).toString("hex");
  oauthStates.set(state, {
    state,
    provider,
    action,
    accountId,
    createdAt: Date.now()
  });
  return state;
}
function consumeOAuthState(state) {
  const record = oauthStates.get(state);
  if (!record) return null;
  oauthStates.delete(state);
  if (Date.now() - record.createdAt > STATE_EXPIRY_MS) return null;
  return record;
}
const DISCORD_API = "https://discord.com/api/v10";
function getDiscordConfig() {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI || process.env.DISCORD_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}
function getDiscordAuthUrl(state) {
  const { clientId, redirectUri } = getDiscordConfig();
  if (!clientId || !redirectUri) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
    state
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}
async function exchangeDiscordCode(code) {
  const { clientId, clientSecret, redirectUri } = getDiscordConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Discord OAuth not configured");
  }
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord token exchange failed: ${response.status}`);
  }
  return response.json();
}
async function getDiscordUser(accessToken) {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Discord user fetch failed: ${response.status}`);
  }
  return response.json();
}
async function handleDiscordCallback(code, state, ip) {
  const stateRecord = consumeOAuthState(state);
  if (!stateRecord || stateRecord.provider !== "discord") {
    return { success: false, error: "Invalid or expired OAuth state" };
  }
  try {
    const tokenResponse = await exchangeDiscordCode(code);
    const discordUser = await getDiscordUser(tokenResponse.access_token);
    const existingIdentity = (0, import_linked_identities.findIdentityByProvider)("discord", discordUser.id);
    if (stateRecord.action === "link" && stateRecord.accountId) {
      const account = (0, import_account_store.getAccountById)(stateRecord.accountId);
      if (!account) {
        return { success: false, error: "Account not found" };
      }
      if (existingIdentity && existingIdentity.accountId !== stateRecord.accountId) {
        return { success: false, error: "This Discord account is already linked to another user" };
      }
      (0, import_linked_identities.linkIdentity)({
        accountId: stateRecord.accountId,
        provider: "discord",
        providerUserId: discordUser.id,
        providerEmail: discordUser.email,
        displayName: discordUser.global_name || discordUser.username
      });
      (0, import_audit.recordAudit)({
        who: account.username,
        what: "Discord identity linked",
        where: "oauth",
        result: "success",
        details: `Discord user: ${discordUser.username}`
      });
      const session2 = (0, import_session_store.createSession)(account.id, account.role, ip);
      return {
        success: true,
        sessionId: session2.sessionId,
        expiresAt: session2.expiresAt,
        csrfToken: session2.csrfToken,
        role: session2.role,
        username: account.username,
        accountId: account.id
      };
    }
    if (existingIdentity) {
      const account = (0, import_account_store.getAccountById)(existingIdentity.accountId);
      if (!account || !account.enabled) {
        return { success: false, error: "Account not found or disabled" };
      }
      existingIdentity.lastUsedAt = Date.now();
      const session2 = (0, import_session_store.createSession)(account.id, account.role, ip);
      (0, import_account_store.updateAccountCredentials)(account.id, { lastLoginAt: Date.now() });
      (0, import_audit.recordAudit)({
        who: account.username,
        what: "Discord login successful",
        where: "oauth",
        result: "success",
        details: `IP: ${ip}`
      });
      return {
        success: true,
        sessionId: session2.sessionId,
        expiresAt: session2.expiresAt,
        csrfToken: session2.csrfToken,
        role: session2.role,
        username: account.username,
        accountId: account.id
      };
    }
    if (discordUser.email && discordUser.verified) {
      const { listAccounts: listAllAccounts } = require("./account-store");
      const allAccounts = listAllAccounts();
      const matchingAccount = allAccounts.find(
        (a) => a.email?.toLowerCase() === discordUser.email.toLowerCase()
      );
      if (matchingAccount) {
        (0, import_audit.recordAudit)({
          who: matchingAccount.username,
          what: "OAuth email match \u2014 explicit link required",
          where: "oauth",
          result: "denied",
          details: `Provider: discord, IP: ${ip}`
        });
        return {
          success: false,
          requiresLinking: true,
          error: "An account with this email already exists. Sign in with your password, then link this provider from account settings."
        };
      }
    }
    const username = discordUser.global_name || discordUser.username || `discord_${discordUser.id}`;
    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
    let finalUsername = safeUsername;
    let counter = 1;
    while ((0, import_account_store.getAccountByUsername)(finalUsername)) {
      finalUsername = `${safeUsername}_${counter}`;
      counter++;
    }
    const result = (0, import_account_store.createAccount)({
      username: finalUsername,
      password: import_crypto.default.randomBytes(32).toString("hex"),
      // Random password (user uses OAuth only)
      role: "user"
    });
    if (!result.success || !result.account) {
      return { success: false, error: result.error || "Failed to create account" };
    }
    (0, import_linked_identities.linkIdentity)({
      accountId: result.account.id,
      provider: "discord",
      providerUserId: discordUser.id,
      providerEmail: discordUser.email,
      displayName: discordUser.global_name || discordUser.username
    });
    if (discordUser.email && discordUser.verified) {
      (0, import_account_store.updateAccount)(result.account.id, {
        email: discordUser.email,
        emailVerified: true
      });
    }
    const session = (0, import_session_store.createSession)(result.account.id, result.account.role, ip);
    (0, import_audit.recordAudit)({
      who: result.account.username,
      what: "Discord login \u2014 new account created",
      where: "oauth",
      result: "success",
      details: `IP: ${ip}, Discord: ${discordUser.username}`
    });
    return {
      success: true,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      csrfToken: session.csrfToken,
      role: session.role,
      username: result.account.username,
      accountId: result.account.id,
      isNewAccount: true
    };
  } catch (error) {
    import_logger.logger.error(`Discord OAuth error: ${error instanceof Error ? error.message : String(error)}`);
    (0, import_audit.recordAudit)({
      who: "unknown",
      what: "Discord OAuth error",
      where: "oauth",
      result: "failure",
      details: error instanceof Error ? error.message : "Unknown error"
    });
    return { success: false, error: "OAuth authentication failed" };
  }
}
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
function getGoogleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}
function getGoogleAuthUrl(state) {
  const { clientId, redirectUri } = getGoogleConfig();
  if (!clientId || !redirectUri) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent"
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
async function exchangeGoogleCode(code) {
  const { clientId, clientSecret, redirectUri } = getGoogleConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google OAuth not configured");
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }
  return response.json();
}
async function getGoogleUser(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Google userinfo fetch failed: ${response.status}`);
  }
  return response.json();
}
async function handleGoogleCallback(code, state, ip) {
  const stateRecord = consumeOAuthState(state);
  if (!stateRecord || stateRecord.provider !== "google") {
    return { success: false, error: "Invalid or expired OAuth state" };
  }
  try {
    const tokenResponse = await exchangeGoogleCode(code);
    const googleUser = await getGoogleUser(tokenResponse.access_token);
    const existingIdentity = (0, import_linked_identities.findIdentityByProvider)("google", googleUser.id);
    if (stateRecord.action === "link" && stateRecord.accountId) {
      const account = (0, import_account_store.getAccountById)(stateRecord.accountId);
      if (!account) {
        return { success: false, error: "Account not found" };
      }
      if (existingIdentity && existingIdentity.accountId !== stateRecord.accountId) {
        return { success: false, error: "This Google account is already linked to another user" };
      }
      (0, import_linked_identities.linkIdentity)({
        accountId: stateRecord.accountId,
        provider: "google",
        providerUserId: googleUser.id,
        providerEmail: googleUser.email,
        displayName: googleUser.name
      });
      (0, import_audit.recordAudit)({
        who: account.username,
        what: "Google identity linked",
        where: "oauth",
        result: "success",
        details: `Google: ${googleUser.email}`
      });
      const session2 = (0, import_session_store.createSession)(account.id, account.role, ip);
      return {
        success: true,
        sessionId: session2.sessionId,
        expiresAt: session2.expiresAt,
        csrfToken: session2.csrfToken,
        role: session2.role,
        username: account.username,
        accountId: account.id
      };
    }
    if (existingIdentity) {
      const account = (0, import_account_store.getAccountById)(existingIdentity.accountId);
      if (!account || !account.enabled) {
        return { success: false, error: "Account not found or disabled" };
      }
      existingIdentity.lastUsedAt = Date.now();
      const session2 = (0, import_session_store.createSession)(account.id, account.role, ip);
      (0, import_account_store.updateAccountCredentials)(account.id, { lastLoginAt: Date.now() });
      (0, import_audit.recordAudit)({
        who: account.username,
        what: "Google login successful",
        where: "oauth",
        result: "success",
        details: `IP: ${ip}`
      });
      return {
        success: true,
        sessionId: session2.sessionId,
        expiresAt: session2.expiresAt,
        csrfToken: session2.csrfToken,
        role: session2.role,
        username: account.username,
        accountId: account.id
      };
    }
    if (googleUser.verified_email && googleUser.email) {
      const { listAccounts: listAllAccounts } = require("./account-store");
      const allAccounts = listAllAccounts();
      const matchingAccount = allAccounts.find(
        (a) => a.email?.toLowerCase() === googleUser.email.toLowerCase()
      );
      if (matchingAccount) {
        (0, import_audit.recordAudit)({
          who: matchingAccount.username,
          what: "OAuth email match \u2014 explicit link required",
          where: "oauth",
          result: "denied",
          details: `Provider: google, IP: ${ip}`
        });
        return {
          success: false,
          requiresLinking: true,
          error: "An account with this email already exists. Sign in with your password, then link this provider from account settings."
        };
      }
    }
    const name = googleUser.name || googleUser.email?.split("@")[0] || `google_${googleUser.id}`;
    const safeUsername = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
    let finalUsername = safeUsername;
    let counter = 1;
    while ((0, import_account_store.getAccountByUsername)(finalUsername)) {
      finalUsername = `${safeUsername}_${counter}`;
      counter++;
    }
    const result = (0, import_account_store.createAccount)({
      username: finalUsername,
      password: import_crypto.default.randomBytes(32).toString("hex"),
      role: "user"
    });
    if (!result.success || !result.account) {
      return { success: false, error: result.error || "Failed to create account" };
    }
    (0, import_linked_identities.linkIdentity)({
      accountId: result.account.id,
      provider: "google",
      providerUserId: googleUser.id,
      providerEmail: googleUser.email,
      displayName: googleUser.name
    });
    if (googleUser.email && googleUser.verified_email) {
      (0, import_account_store.updateAccount)(result.account.id, {
        email: googleUser.email,
        emailVerified: true
      });
    }
    const session = (0, import_session_store.createSession)(result.account.id, result.account.role, ip);
    (0, import_audit.recordAudit)({
      who: result.account.username,
      what: "Google login \u2014 new account created",
      where: "oauth",
      result: "success",
      details: `IP: ${ip}, Google: ${googleUser.email}`
    });
    return {
      success: true,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      csrfToken: session.csrfToken,
      role: session.role,
      username: result.account.username,
      accountId: result.account.id,
      isNewAccount: true
    };
  } catch (error) {
    import_logger.logger.error(`Google OAuth error: ${error instanceof Error ? error.message : String(error)}`);
    (0, import_audit.recordAudit)({
      who: "unknown",
      what: "Google OAuth error",
      where: "oauth",
      result: "failure",
      details: error instanceof Error ? error.message : "Unknown error"
    });
    return { success: false, error: "OAuth authentication failed" };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  consumeOAuthState,
  createOAuthState,
  getDiscordAuthUrl,
  getGoogleAuthUrl,
  handleDiscordCallback,
  handleGoogleCallback
});
