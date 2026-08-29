import crypto from "crypto";
import { logger } from "../logger";
import { recordAudit } from "../security/audit";
import {
  getAccountById,
  getAccountByUsername,
  createAccount,
  updateAccount,
  updateAccountCredentials,
  generateId,
  type Account,
} from "./account-store";
import {
  createSession,
  setSessionCookie,
  type Session,
} from "./session-store";
import {
  linkIdentity,
  findIdentityByProvider,
  type IdentityProvider,
} from "./linked-identities";

/* ================================================================
 * OAUTH STATE MANAGEMENT
 * ================================================================ */

interface OAuthState {
  state: string;
  provider: IdentityProvider;
  action: "login" | "link";
  accountId?: string;
  createdAt: number;
}

const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const oauthStates = new Map<string, OAuthState>();

function cleanupStates(): void {
  const now = Date.now();
  for (const [key, state] of oauthStates) {
    if (now - state.createdAt > STATE_EXPIRY_MS) {
      oauthStates.delete(key);
    }
  }
}

setInterval(cleanupStates, STATE_EXPIRY_MS).unref();

export function createOAuthState(
  provider: IdentityProvider,
  action: "login" | "link",
  accountId?: string,
): string {
  cleanupStates();
  const state = crypto.randomBytes(32).toString("hex");
  oauthStates.set(state, {
    state,
    provider,
    action,
    accountId,
    createdAt: Date.now(),
  });
  return state;
}

export function consumeOAuthState(
  state: string,
): OAuthState | null {
  const record = oauthStates.get(state);
  if (!record) return null;
  oauthStates.delete(state);
  if (Date.now() - record.createdAt > STATE_EXPIRY_MS) return null;
  return record;
}

/* ================================================================
 * DISCORD OAUTH2
 * ================================================================ */

const DISCORD_API = "https://discord.com/api/v10";

function getDiscordConfig() {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET || process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI || process.env.DISCORD_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

export function getDiscordAuthUrl(state: string): string | null {
  const { clientId, redirectUri } = getDiscordConfig();
  if (!clientId || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
    state,
  });

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
  email?: string;
  verified?: boolean;
}

async function exchangeDiscordCode(code: string): Promise<DiscordTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getDiscordConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Discord OAuth not configured");
  }

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<DiscordTokenResponse>;
}

async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Discord user fetch failed: ${response.status}`);
  }

  return response.json() as Promise<DiscordUser>;
}

export interface OAuthLoginResult {
  success: boolean;
  sessionId?: string;
  expiresAt?: number;
  csrfToken?: string;
  role?: "owner" | "admin" | "user";
  username?: string;
  accountId?: string;
  isNewAccount?: boolean;
  requiresLinking?: boolean;
  linkToken?: string;
  error?: string;
}

export async function handleDiscordCallback(
  code: string,
  state: string,
  ip: string,
): Promise<OAuthLoginResult> {
  const stateRecord = consumeOAuthState(state);
  if (!stateRecord || stateRecord.provider !== "discord") {
    return { success: false, error: "Invalid or expired OAuth state" };
  }

  try {
    const tokenResponse = await exchangeDiscordCode(code);
    const discordUser = await getDiscordUser(tokenResponse.access_token);

    // Check if this Discord identity is already linked
    const existingIdentity = findIdentityByProvider("discord", discordUser.id);

    if (stateRecord.action === "link" && stateRecord.accountId) {
      // Linking flow: attach this Discord identity to the specified account
      const account = getAccountById(stateRecord.accountId);
      if (!account) {
        return { success: false, error: "Account not found" };
      }

      // Check if this Discord identity is already linked to a different account
      if (existingIdentity && existingIdentity.accountId !== stateRecord.accountId) {
        return { success: false, error: "This Discord account is already linked to another user" };
      }

      linkIdentity({
        accountId: stateRecord.accountId,
        provider: "discord",
        providerUserId: discordUser.id,
        providerEmail: discordUser.email,
        displayName: discordUser.global_name || discordUser.username,
      });

      recordAudit({
        who: account.username,
        what: "Discord identity linked",
        where: "oauth",
        result: "success",
        details: `Discord user: ${discordUser.username}`,
      });

      // Create session and redirect
      const session = createSession(account.id, account.role, ip);
      return {
        success: true,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        csrfToken: session.csrfToken,
        role: session.role,
        username: account.username,
        accountId: account.id,
      };
    }

    // Login flow
    if (existingIdentity) {
      // Identity already linked — log in
      const account = getAccountById(existingIdentity.accountId);
      if (!account || !account.enabled) {
        return { success: false, error: "Account not found or disabled" };
      }

      existingIdentity.lastUsedAt = Date.now();
      const session = createSession(account.id, account.role, ip);
      updateAccountCredentials(account.id, { lastLoginAt: Date.now() });

      recordAudit({
        who: account.username,
        what: "Discord login successful",
        where: "oauth",
        result: "success",
        details: `IP: ${ip}`,
      });

      return {
        success: true,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        csrfToken: session.csrfToken,
        role: session.role,
        username: account.username,
        accountId: account.id,
      };
    }

    // No linked identity — check if Discord email matches an existing account
    if (discordUser.email && discordUser.verified) {
      // Search for account with matching email
      const { listAccounts: listAllAccounts } = require("./account-store");
      const allAccounts: Account[] = listAllAccounts();
      const matchingAccount = allAccounts.find(
        (a) => a.email?.toLowerCase() === discordUser.email!.toLowerCase(),
      );

      if (matchingAccount) {
        // Email matches — require explicit linking confirmation
        const linkToken = crypto.randomBytes(32).toString("hex");
        return {
          success: false,
          requiresLinking: true,
          linkToken,
          accountId: matchingAccount.id,
          username: matchingAccount.username,
        };
      }
    }

    // No match — create new account
    const username = discordUser.global_name || discordUser.username || `discord_${discordUser.id}`;
    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);

    // Ensure unique username
    let finalUsername = safeUsername;
    let counter = 1;
    while (getAccountByUsername(finalUsername)) {
      finalUsername = `${safeUsername}_${counter}`;
      counter++;
    }

    const result = createAccount({
      username: finalUsername,
      password: crypto.randomBytes(32).toString("hex"), // Random password (user uses OAuth only)
      role: "user",
    });

    if (!result.success || !result.account) {
      return { success: false, error: result.error || "Failed to create account" };
    }

    // Link the Discord identity
    linkIdentity({
      accountId: result.account.id,
      provider: "discord",
      providerUserId: discordUser.id,
      providerEmail: discordUser.email,
      displayName: discordUser.global_name || discordUser.username,
    });

    // Update email if verified
    if (discordUser.email && discordUser.verified) {
      updateAccount(result.account.id, {
        email: discordUser.email,
        emailVerified: true,
      });
    }

    const session = createSession(result.account.id, result.account.role, ip);

    recordAudit({
      who: result.account.username,
      what: "Discord login — new account created",
      where: "oauth",
      result: "success",
      details: `IP: ${ip}, Discord: ${discordUser.username}`,
    });

    return {
      success: true,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      csrfToken: session.csrfToken,
      role: session.role,
      username: result.account.username,
      accountId: result.account.id,
      isNewAccount: true,
    };
  } catch (error) {
    logger.error(`Discord OAuth error: ${error instanceof Error ? error.message : String(error)}`);
    recordAudit({
      who: "unknown",
      what: "Discord OAuth error",
      where: "oauth",
      result: "failure",
      details: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "OAuth authentication failed" };
  }
}

/* ================================================================
 * GOOGLE OAUTH2
 * ================================================================ */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

export function getGoogleAuthUrl(state: string): string | null {
  const { clientId, redirectUri } = getGoogleConfig();
  if (!clientId || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

interface GoogleUser {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
}

async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
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
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status}`);
  }

  return response.json() as Promise<GoogleTokenResponse>;
}

async function getGoogleUser(accessToken: string): Promise<GoogleUser> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo fetch failed: ${response.status}`);
  }

  return response.json() as Promise<GoogleUser>;
}

export async function handleGoogleCallback(
  code: string,
  state: string,
  ip: string,
): Promise<OAuthLoginResult> {
  const stateRecord = consumeOAuthState(state);
  if (!stateRecord || stateRecord.provider !== "google") {
    return { success: false, error: "Invalid or expired OAuth state" };
  }

  try {
    const tokenResponse = await exchangeGoogleCode(code);
    const googleUser = await getGoogleUser(tokenResponse.access_token);

    // Check if this Google identity is already linked
    const existingIdentity = findIdentityByProvider("google", googleUser.id);

    if (stateRecord.action === "link" && stateRecord.accountId) {
      const account = getAccountById(stateRecord.accountId);
      if (!account) {
        return { success: false, error: "Account not found" };
      }

      if (existingIdentity && existingIdentity.accountId !== stateRecord.accountId) {
        return { success: false, error: "This Google account is already linked to another user" };
      }

      linkIdentity({
        accountId: stateRecord.accountId,
        provider: "google",
        providerUserId: googleUser.id,
        providerEmail: googleUser.email,
        displayName: googleUser.name,
      });

      recordAudit({
        who: account.username,
        what: "Google identity linked",
        where: "oauth",
        result: "success",
        details: `Google: ${googleUser.email}`,
      });

      const session = createSession(account.id, account.role, ip);
      return {
        success: true,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        csrfToken: session.csrfToken,
        role: session.role,
        username: account.username,
        accountId: account.id,
      };
    }

    // Login flow
    if (existingIdentity) {
      const account = getAccountById(existingIdentity.accountId);
      if (!account || !account.enabled) {
        return { success: false, error: "Account not found or disabled" };
      }

      existingIdentity.lastUsedAt = Date.now();
      const session = createSession(account.id, account.role, ip);
      updateAccountCredentials(account.id, { lastLoginAt: Date.now() });

      recordAudit({
        who: account.username,
        what: "Google login successful",
        where: "oauth",
        result: "success",
        details: `IP: ${ip}`,
      });

      return {
        success: true,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        csrfToken: session.csrfToken,
        role: session.role,
        username: account.username,
        accountId: account.id,
      };
    }

    // Check if Google email matches an existing account
    if (googleUser.verified_email && googleUser.email) {
      const { listAccounts: listAllAccounts } = require("./account-store");
      const allAccounts: Account[] = listAllAccounts();
      const matchingAccount = allAccounts.find(
        (a) => a.email?.toLowerCase() === googleUser.email.toLowerCase(),
      );

      if (matchingAccount) {
        const linkToken = crypto.randomBytes(32).toString("hex");
        return {
          success: false,
          requiresLinking: true,
          linkToken,
          accountId: matchingAccount.id,
          username: matchingAccount.username,
        };
      }
    }

    // Create new account
    const name = googleUser.name || googleUser.email?.split("@")[0] || `google_${googleUser.id}`;
    const safeUsername = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);

    let finalUsername = safeUsername;
    let counter = 1;
    while (getAccountByUsername(finalUsername)) {
      finalUsername = `${safeUsername}_${counter}`;
      counter++;
    }

    const result = createAccount({
      username: finalUsername,
      password: crypto.randomBytes(32).toString("hex"),
      role: "user",
    });

    if (!result.success || !result.account) {
      return { success: false, error: result.error || "Failed to create account" };
    }

    linkIdentity({
      accountId: result.account.id,
      provider: "google",
      providerUserId: googleUser.id,
      providerEmail: googleUser.email,
      displayName: googleUser.name,
    });

    if (googleUser.email && googleUser.verified_email) {
      updateAccount(result.account.id, {
        email: googleUser.email,
        emailVerified: true,
      });
    }

    const session = createSession(result.account.id, result.account.role, ip);

    recordAudit({
      who: result.account.username,
      what: "Google login — new account created",
      where: "oauth",
      result: "success",
      details: `IP: ${ip}, Google: ${googleUser.email}`,
    });

    return {
      success: true,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      csrfToken: session.csrfToken,
      role: session.role,
      username: result.account.username,
      accountId: result.account.id,
      isNewAccount: true,
    };
  } catch (error) {
    logger.error(`Google OAuth error: ${error instanceof Error ? error.message : String(error)}`);
    recordAudit({
      who: "unknown",
      what: "Google OAuth error",
      where: "oauth",
      result: "failure",
      details: error instanceof Error ? error.message : "Unknown error",
    });
    return { success: false, error: "OAuth authentication failed" };
  }
}
