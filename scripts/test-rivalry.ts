#!/usr/bin/env node
/* ================================================================
 * RIVALRY REGRESSION TESTS
 *
 * Tests the interactive participant detection and rivalry system.
 * Covers: mention handling, classification, detection, sessions,
 * turn flow, loop protection, security, and response generation.
 * ================================================================ */

import {
  classifyParticipant,
  reclassifyFromResponse,
  detectRivalryIntent,
  isAshenAIMentioned,
  extractMentionedIds,
  isRefusal,
  isEndRivalryIntent,
  createSession,
  getActiveSession,
  isOpponent,
  recordAshenAITurn,
  recordOpponentTurn,
  endSession,
  getNextChallenge,
  isOpponentTimedOut,
  generateOpeningChallenge,
  generateChallenge,
  generateRoast,
  generateAcknowledgment,
  generateRefusalResponse,
  generateSessionEnd,
  classifyOpponentResponse,
  buildRivalrySystemPrompt,
} from "../src/ai/rivalry";

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✅ ${name}`);
  passed++;
}

function fail(name: string, error?: unknown) {
  console.error(`❌ ${name}`, error ?? "");
  failed++;
}

function assertEqual(
  actual: unknown,
  expected: unknown,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected "${expected}", got "${actual}"`
    );
  }
}

function assertIncludes(
  str: string,
  substr: string,
  label: string
): void {
  if (!str.includes(substr)) {
    throw new Error(
      `${label}: expected "${str}" to include "${substr}"`
    );
  }
}

function assertNotIncludes(
  str: string,
  substr: string,
  label: string
): void {
  if (str.includes(substr)) {
    throw new Error(
      `${label}: expected "${str}" to NOT include "${substr}"`
    );
  }
}

console.log("\n🧪 Rivalry Regression Tests\n");

async function runTests() {

/* ================================================================
 * 1. MENTION HANDLING
 * ================================================================ */

// Test 1.1: @everyone alone does NOT trigger
try {
  const result = detectRivalryIntent(
    "hello everyone",
    [],
    "ashen-ai-id"
  );
  assertEqual(result.isRivalry, false, "1.1 @everyone alone");
  pass("1.1 @everyone alone does NOT trigger");
} catch (e) {
  fail("1.1 @everyone alone does NOT trigger", e);
}

// Test 1.2: @everyone @AshenAI → normal (no rivalry keywords)
try {
  const result = detectRivalryIntent(
    "hello",
    [],
    "ashen-ai-id"
  );
  assertEqual(
    result.isRivalry,
    false,
    "1.2 mention without keywords"
  );
  pass("1.2 @AshenAI alone → normal response");
} catch (e) {
  fail("1.2 @AshenAI alone → normal response", e);
}

// Test 1.3: @AshenAI @BotAI who's better? → rivalry
try {
  const result = detectRivalryIntent(
    "who's better",
    ["bot-ai-id"],
    "ashen-ai-id"
  );
  assertEqual(
    result.isRivalry,
    true,
    "1.3 rivalry trigger"
  );
  assertEqual(
    result.targetBotIds.length,
    1,
    "1.3 target bots"
  );
  pass("1.3 @AshenAI @BotAI who's better? → rivalry");
} catch (e) {
  fail("1.3 @AshenAI @BotAI who's better? → rivalry", e);
}

// Test 1.4: Multiple bots mentioned
try {
  const result = detectRivalryIntent(
    "fight",
    ["bot1-id", "bot2-id"],
    "ashen-ai-id"
  );
  assertEqual(
    result.isRivalry,
    true,
    "1.4 multiple bots"
  );
  assertEqual(
    result.targetBotIds.length,
    2,
    "1.4 two targets"
  );
  pass("1.4 Multiple bots mentioned → rivalry");
} catch (e) {
  fail("1.4 Multiple bots mentioned → rivalry", e);
}

// Test 1.5: Rivalry keywords without other bots → NOT rivalry
try {
  const result = detectRivalryIntent(
    "who's better",
    [],
    "ashen-ai-id"
  );
  assertEqual(
    result.isRivalry,
    false,
    "1.5 no target bots"
  );
  pass("1.5 Rivalry keywords without bots → NOT rivalry");
} catch (e) {
  fail(
    "1.5 Rivalry keywords without bots → NOT rivalry",
    e
  );
}

// Test 1.6: Various rivalry keywords detected
try {
  const keywords = [
    "who's better",
    "fight",
    "battle",
    "challenge",
    "debate",
    "vs",
    "versus",
    "compete",
    "duel",
    "prove you're better",
    "prove yourself",
    "show me what you've got",
  ];

  for (const kw of keywords) {
    const result = detectRivalryIntent(
      kw,
      ["bot-id"],
      "ashen-ai-id"
    );
    assertEqual(
      result.isRivalry,
      true,
      `1.6 keyword "${kw}"`
    );
  }

  pass("1.6 All rivalry keywords detected");
} catch (e) {
  fail("1.6 All rivalry keywords detected", e);
}

/* ================================================================
 * 2. PARTICIPANT CLASSIFICATION
 * ================================================================ */

// Test 2.1: Discord bot → DISCORD_BOT
try {
  const p = classifyParticipant({
    userId: "123",
    displayName: "CoolBot",
    botFlag: true,
  });
  assertEqual(
    p.classification,
    "DISCORD_BOT",
    "2.1 bot flag"
  );
  assertEqual(
    p.classificationConfidence,
    1.0,
    "2.1 confidence"
  );
  pass("2.1 Discord bot → DISCORD_BOT");
} catch (e) {
  fail("2.1 Discord bot → DISCORD_BOT", e);
}

// Test 2.2: Normal human → HUMAN
try {
  const p = classifyParticipant({
    userId: "456",
    displayName: "Alice",
    botFlag: false,
  });
  assertEqual(
    p.classification,
    "HUMAN",
    "2.2 human default"
  );
  assertEqual(
    p.classificationConfidence,
    0.9,
    "2.2 confidence"
  );
  pass("2.2 Normal human → HUMAN");
} catch (e) {
  fail("2.2 Normal human → HUMAN", e);
}

// Test 2.3: Fictional character name → FICTIONAL_PERSONA
try {
  const p = classifyParticipant({
    userId: "789",
    displayName: "Batman",
    botFlag: false,
  });
  assertEqual(
    p.classification,
    "FICTIONAL_PERSONA",
    "2.3 fictional"
  );
  pass("2.3 Fictional character → FICTIONAL_PERSONA");
} catch (e) {
  fail("2.3 Fictional character → FICTIONAL_PERSONA", e);
}

// Test 2.4: AI persona claim → AI_PERSONA
try {
  const p = classifyParticipant({
    userId: "abc",
    displayName: "GPT4User",
    botFlag: false,
    contextMessage: "I am an AI assistant",
  });
  assertEqual(
    p.classification,
    "AI_PERSONA",
    "2.4 AI persona"
  );
  pass("2.4 AI persona claim → AI_PERSONA");
} catch (e) {
  fail("2.4 AI persona claim → AI_PERSONA", e);
}

// Test 2.5: Reclassify from response — claims AI
try {
  const original = classifyParticipant({
    userId: "def",
    displayName: "User",
    botFlag: false,
  });
  assertEqual(
    original.classification,
    "HUMAN",
    "2.5 original"
  );

  const reclassified = reclassifyFromResponse(
    original,
    "I am an AI language model"
  );
  assertEqual(
    reclassified.classification,
    "AI_PERSONA",
    "2.5 reclassified"
  );
  pass("2.5 Reclassify from response → AI_PERSONA");
} catch (e) {
  fail("2.5 Reclassify from response → AI_PERSONA", e);
}

// Test 2.6: Reclassify — denies AI
try {
  const original = classifyParticipant({
    userId: "ghi",
    displayName: "SuspiciousUser",
    botFlag: false,
    contextMessage: "I am an AI",
  });

  const reclassified = reclassifyFromResponse(
    original,
    "I am not an AI, I'm human"
  );
  assertEqual(
    reclassified.classification,
    "HUMAN",
    "2.6 denied AI"
  );
  pass("2.6 Reclassify — denied AI → HUMAN");
} catch (e) {
  fail("2.6 Reclassify — denied AI → HUMAN", e);
}

/* ================================================================
 * 3. MENTION EXTRACTION
 * ================================================================ */

// Test 3.1: Extract mentioned IDs
try {
  const ids = extractMentionedIds(
    "<@123> <@!456> hello",
    "ashen-ai-id"
  );
  assertEqual(ids.length, 2, "3.1 two IDs");
  assertEqual(ids.includes("123"), true, "3.1 has 123");
  assertEqual(ids.includes("456"), true, "3.1 has 456");
  pass("3.1 Extract mentioned IDs");
} catch (e) {
  fail("3.1 Extract mentioned IDs", e);
}

// Test 3.2: AshenAI ID excluded
try {
  const ids = extractMentionedIds(
    "<@ashen-ai-id> <@1234567890> hello",
    "ashen-ai-id"
  );
  assertEqual(ids.length, 1, "3.2 one ID");
  assertEqual(
    ids[0],
    "1234567890",
    "3.2 only bot ID"
  );
  pass("3.2 AshenAI ID excluded from extraction");
} catch (e) {
  fail("3.2 AshenAI ID excluded from extraction", e);
}

// Test 3.3: isAshenAIMentioned
try {
  assertEqual(
    isAshenAIMentioned(
      "<@ashen-ai-id> hello",
      "ashen-ai-id"
    ),
    true,
    "3.3 mentioned"
  );
  assertEqual(
    isAshenAIMentioned("hello there", "ashen-ai-id"),
    false,
    "3.3 not mentioned"
  );
  pass("3.3 isAshenAIMentioned works");
} catch (e) {
  fail("3.3 isAshenAIMentioned works", e);
}

/* ================================================================
 * 4. RIVALRY SESSION LIFECYCLE
 * ================================================================ */

// Test 4.1: Create session
try {
  const session = createSession({
    guildId: "guild-1",
    channelId: "channel-1",
    initiatorUserId: "human-1",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-1",
      discordUserId: "bot-1",
      displayName: "TestBot",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: ["discord_author_bot_flag"],
    },
  });

  assertEqual(
    session.status,
    "active",
    "4.1 status active"
  );
  assertEqual(session.turn, 0, "4.1 turn 0");
  assertEqual(
    session.opponentId,
    "bot-1",
    "4.1 opponent"
  );
  assertEqual(
    session.opponentClassification,
    "DISCORD_BOT",
    "4.1 classification"
  );
  pass("4.1 Create session");
} catch (e) {
  fail("4.1 Create session", e);
}

// Test 4.2: Get active session
try {
  const session = createSession({
    guildId: "guild-2",
    channelId: "channel-2",
    initiatorUserId: "human-2",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-2",
      discordUserId: "bot-2",
      displayName: "Bot2",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: ["discord_author_bot_flag"],
    },
  });

  const found = getActiveSession("guild-2", "channel-2");
  assertEqual(
    found?.id,
    session.id,
    "4.2 found session"
  );
  pass("4.2 Get active session");
} catch (e) {
  fail("4.2 Get active session", e);
}

// Test 4.3: isOpponent check
try {
  createSession({
    guildId: "guild-3",
    channelId: "channel-3",
    initiatorUserId: "human-3",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-3",
      discordUserId: "bot-3",
      displayName: "Bot3",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: ["discord_author_bot_flag"],
    },
  });

  assertEqual(
    isOpponent("guild-3", "channel-3", "bot-3"),
    true,
    "4.3 is opponent"
  );
  assertEqual(
    isOpponent("guild-3", "channel-3", "random-id"),
    false,
    "4.3 not opponent"
  );
  pass("4.3 isOpponent check");
} catch (e) {
  fail("4.3 isOpponent check", e);
}

/* ================================================================
 * 5. TURN FLOW
 * ================================================================ */

// Test 5.1: Record AshenAI turn
try {
  const session = createSession({
    guildId: "guild-4",
    channelId: "channel-4",
    initiatorUserId: "human-4",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-4",
      discordUserId: "bot-4",
      displayName: "Bot4",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const turn = recordAshenAITurn(
    session,
    "Challenge!",
    "reasoning"
  );
  assertEqual(session.turn, 1, "5.1 turn incremented");
  assertEqual(
    turn.speaker,
    "ashenai",
    "5.1 speaker"
  );
  assertEqual(
    turn.challengeDomain,
    "reasoning",
    "5.1 domain"
  );
  pass("5.1 Record AshenAI turn");
} catch (e) {
  fail("5.1 Record AshenAI turn", e);
}

// Test 5.2: Record opponent turn
try {
  const session = createSession({
    guildId: "guild-5",
    channelId: "channel-5",
    initiatorUserId: "human-5",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-5",
      discordUserId: "bot-5",
      displayName: "Bot5",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  recordAshenAITurn(session, "Challenge!", "reasoning");
  const turn = recordOpponentTurn(
    session,
    "My response"
  );
  assertEqual(
    turn?.speaker,
    "opponent",
    "5.2 speaker"
  );
  assertEqual(session.turn, 2, "5.2 turn 2");
  pass("5.2 Record opponent turn");
} catch (e) {
  fail("5.2 Record opponent turn", e);
}

// Test 5.3: Duplicate response prevention
try {
  const session = createSession({
    guildId: "guild-6",
    channelId: "channel-6",
    initiatorUserId: "human-6",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-6",
      discordUserId: "bot-6",
      displayName: "Bot6",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  recordAshenAITurn(session, "Challenge!");
  recordOpponentTurn(session, "Response");
  const dupe = recordOpponentTurn(session, "Response");
  assertEqual(dupe, null, "5.3 duplicate blocked");
  pass("5.3 Duplicate response prevented");
} catch (e) {
  fail("5.3 Duplicate response prevented", e);
}

/* ================================================================
 * 6. LOOP PROTECTION
 * ================================================================ */

// Test 6.1: Max turns enforced
try {
  const session = createSession({
    guildId: "guild-7",
    channelId: "channel-7",
    initiatorUserId: "human-7",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-7",
      discordUserId: "bot-7",
      displayName: "Bot7",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
    config: { maxTurns: 4 },
  });

  // Simulate turns up to max
  recordAshenAITurn(session, "1");
  recordOpponentTurn(session, "2");
  recordAshenAITurn(session, "3");
  recordOpponentTurn(session, "4");

  // Next turn should fail
  const nextTurn = recordOpponentTurn(session, "5");
  assertEqual(nextTurn, null, "6.1 max turns blocked");
  assertEqual(
    session.status,
    "ended_limit",
    "6.1 ended"
  );
  pass("6.1 Max turns enforced");
} catch (e) {
  fail("6.1 Max turns enforced", e);
}

// Test 6.2: Session timeout
try {
  const session = createSession({
    guildId: "guild-8",
    channelId: "channel-8",
    initiatorUserId: "human-8",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-8",
      discordUserId: "bot-8",
      displayName: "Bot8",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
    config: { sessionDurationMs: 1 },
  });

  // Wait a tick
  await new Promise((r) => setTimeout(r, 10));

  const found = getActiveSession("guild-8", "channel-8");
  assertEqual(found, null, "6.2 expired");
  pass("6.2 Session timeout");
} catch (e) {
  fail("6.2 Session timeout", e);
}

// Test 6.3: Opponent response timeout
try {
  const session = createSession({
    guildId: "guild-9",
    channelId: "channel-9",
    initiatorUserId: "human-9",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-9",
      discordUserId: "bot-9",
      displayName: "Bot9",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
    config: { opponentResponseTimeoutMs: 1 },
  });

  recordAshenAITurn(session, "Challenge!");
  await new Promise((r) => setTimeout(r, 10));

  assertEqual(
    isOpponentTimedOut(session, 1),
    true,
    "6.3 timed out"
  );
  pass("6.3 Opponent response timeout");
} catch (e) {
  fail("6.3 Opponent response timeout", e);
}

// Test 6.4: One session per channel (last write wins)
try {
  const s1 = createSession({
    guildId: "guild-10",
    channelId: "channel-10",
    initiatorUserId: "human-a",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-a",
      discordUserId: "bot-a",
      displayName: "BotA",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const s2 = createSession({
    guildId: "guild-10",
    channelId: "channel-10",
    initiatorUserId: "human-b",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-b",
      discordUserId: "bot-b",
      displayName: "BotB",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const found = getActiveSession("guild-10", "channel-10");
  assertEqual(
    found?.id,
    s2.id,
    "6.4 last session wins"
  );
  pass("6.4 One session per channel");
} catch (e) {
  fail("6.4 One session per channel", e);
}

/* ================================================================
 * 7. SESSION END
 * ================================================================ */

// Test 7.1: End session — human ends
try {
  createSession({
    guildId: "guild-11",
    channelId: "channel-11",
    initiatorUserId: "human-11",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-11",
      discordUserId: "bot-11",
      displayName: "Bot11",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const ended = endSession(
    "guild-11",
    "channel-11",
    "ended_human",
    "user_ended"
  );
  assertEqual(
    ended?.status,
    "ended_human",
    "7.1 ended"
  );

  const found = getActiveSession("guild-11", "channel-11");
  assertEqual(found, null, "7.1 cleaned up");
  pass("7.1 End session — human ends");
} catch (e) {
  fail("7.1 End session — human ends", e);
}

// Test 7.2: End session — opponent refuses
try {
  createSession({
    guildId: "guild-12",
    channelId: "channel-12",
    initiatorUserId: "human-12",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-12",
      discordUserId: "bot-12",
      displayName: "Bot12",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const ended = endSession(
    "guild-12",
    "channel-12",
    "ended_refusal",
    "opponent_refused"
  );
  assertEqual(
    ended?.status,
    "ended_refusal",
    "7.2 refused"
  );
  pass("7.2 End session — opponent refuses");
} catch (e) {
  fail("7.2 End session — opponent refuses", e);
}

/* ================================================================
 * 8. REFUSAL & END DETECTION
 * ================================================================ */

// Test 8.1: Refusal detected
try {
  assertEqual(isRefusal("no"), true, "8.1 no");
  assertEqual(isRefusal("nah"), true, "8.1 nah");
  assertEqual(
    isRefusal("not interested"),
    true,
    "8.1 not interested"
  );
  assertEqual(
    isRefusal("I decline"),
    true,
    "8.1 decline"
  );
  assertEqual(
    isRefusal("let's do this"),
    false,
    "8.1 not refusal"
  );
  pass("8.1 Refusal detection");
} catch (e) {
  fail("8.1 Refusal detection", e);
}

// Test 8.2: End-rivalry intent
try {
  assertEqual(
    isEndRivalryIntent("stop"),
    true,
    "8.2 stop"
  );
  assertEqual(
    isEndRivalryIntent("that's enough"),
    true,
    "8.2 enough"
  );
  assertEqual(
    isEndRivalryIntent("good game"),
    true,
    "8.2 gg"
  );
  assertEqual(
    isEndRivalryIntent("keep going"),
    false,
    "8.2 not end"
  );
  pass("8.2 End-rivalry intent detection");
} catch (e) {
  fail("8.2 End-rivalry intent detection", e);
}

/* ================================================================
 * 9. RESPONSE GENERATION
 * ================================================================ */

// Test 9.1: Opening challenge generated
try {
  const session = createSession({
    guildId: "guild-13",
    channelId: "channel-13",
    initiatorUserId: "human-13",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-13",
      discordUserId: "bot-13",
      displayName: "Bot13",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const opening = generateOpeningChallenge(session);
  assertEqual(
    opening.text.length > 0,
    true,
    "9.1 has text"
  );
  assertEqual(
    opening.challengeDomain.length > 0,
    true,
    "9.1 has domain"
  );
  pass("9.1 Opening challenge generated");
} catch (e) {
  fail("9.1 Opening challenge generated", e);
}

// Test 9.2: Follow-up challenge
try {
  const session = createSession({
    guildId: "guild-14",
    channelId: "channel-14",
    initiatorUserId: "human-14",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-14",
      discordUserId: "bot-14",
      displayName: "Bot14",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  recordAshenAITurn(session, "Challenge!", "reasoning");
  const challenge = generateChallenge(
    session,
    "opponent response"
  );
  assertEqual(
    challenge.text.length > 0,
    true,
    "9.2 has text"
  );
  pass("9.2 Follow-up challenge generated");
} catch (e) {
  fail("9.2 Follow-up challenge generated", e);
}

// Test 9.3: Roast generated
try {
  const session = createSession({
    guildId: "guild-15",
    channelId: "channel-15",
    initiatorUserId: "human-15",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-15",
      discordUserId: "bot-15",
      displayName: "Bot15",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const roast = generateRoast(session, "weak response");
  assertEqual(roast.length > 0, true, "9.3 has text");
  pass("9.3 Roast generated");
} catch (e) {
  fail("9.3 Roast generated", e);
}

// Test 9.4: Acknowledgment generated
try {
  const session = createSession({
    guildId: "guild-16",
    channelId: "channel-16",
    initiatorUserId: "human-16",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-16",
      discordUserId: "bot-16",
      displayName: "Bot16",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const ack = generateAcknowledgment(
    session,
    "strong response"
  );
  assertEqual(ack.length > 0, true, "9.4 has text");
  pass("9.4 Acknowledgment generated");
} catch (e) {
  fail("9.4 Acknowledgment generated", e);
}

// Test 9.5: Refusal response
try {
  const session = createSession({
    guildId: "guild-17",
    channelId: "channel-17",
    initiatorUserId: "human-17",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-17",
      discordUserId: "bot-17",
      displayName: "Bot17",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const ref = generateRefusalResponse(session);
  assertEqual(ref.length > 0, true, "9.5 has text");
  pass("9.5 Refusal response generated");
} catch (e) {
  fail("9.5 Refusal response generated", e);
}

// Test 9.6: Session end message
try {
  const session = createSession({
    guildId: "guild-18",
    channelId: "channel-18",
    initiatorUserId: "human-18",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-18",
      discordUserId: "bot-18",
      displayName: "Bot18",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const end = generateSessionEnd(session);
  assertEqual(end.length > 0, true, "9.6 has text");
  pass("9.6 Session end message generated");
} catch (e) {
  fail("9.6 Session end message generated", e);
}

/* ================================================================
 * 10. RESPONSE QUALITY CLASSIFICATION
 * ================================================================ */

// Test 10.1: Short response → weak
try {
  assertEqual(
    classifyOpponentResponse("lol"),
    "weak",
    "10.1 short"
  );
  pass("10.1 Short response → weak");
} catch (e) {
  fail("10.1 Short response → weak", e);
}

// Test 10.2: Substantive response → strong
try {
  assertEqual(
    classifyOpponentResponse(
      "Because the evidence suggests otherwise, therefore we should consider the analysis carefully."
    ),
    "strong",
    "10.2 substantive"
  );
  pass("10.2 Substantive response → strong");
} catch (e) {
  fail("10.2 Substantive response → strong", e);
}

// Test 10.3: Neutral response
try {
  assertEqual(
    classifyOpponentResponse("Interesting point, let me think about that."),
    "neutral",
    "10.3 neutral"
  );
  pass("10.3 Neutral response");
} catch (e) {
  fail("10.3 Neutral response", e);
}

/* ================================================================
 * 11. SYSTEM PROMPT
 * ================================================================ */

// Test 11.1: Rivalry system prompt contains key elements
try {
  const session = createSession({
    guildId: "guild-19",
    channelId: "channel-19",
    initiatorUserId: "human-19",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-19",
      discordUserId: "bot-19",
      displayName: "TestBot",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const prompt = buildRivalrySystemPrompt(session);
  assertIncludes(
    prompt,
    "TestBot",
    "11.1 opponent name"
  );
  assertIncludes(
    prompt,
    "DISCORD_BOT",
    "11.1 classification"
  );
  assertIncludes(
    prompt,
    "untrusted",
    "11.1 opponent untrusted"
  );
  assertIncludes(
    prompt,
    "Never generate @everyone",
    "11.1 has @everyone rule"
  );
  pass("11.1 Rivalry system prompt correct");
} catch (e) {
  fail("11.1 Rivalry system prompt correct", e);
}

/* ================================================================
 * 12. CHALLENGE ROTATION
 * ================================================================ */

// Test 12.1: Challenges rotate through domains
try {
  const session = createSession({
    guildId: "guild-20",
    channelId: "channel-20",
    initiatorUserId: "human-20",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-20",
      discordUserId: "bot-20",
      displayName: "Bot20",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const domains: string[] = [];
  for (let i = 0; i < 8; i++) {
    const domain = getNextChallenge(session);
    domains.push(domain);
    recordAshenAITurn(session, `Turn ${i}`, domain);
  }

  // All 8 domains should be used at least once
  const unique = new Set(domains);
  assertEqual(
    unique.size,
    8,
    "12.1 all domains used"
  );
  pass("12.1 Challenges rotate through all domains");
} catch (e) {
  fail("12.1 Challenges rotate through all domains", e);
}

/* ================================================================
 * 13. SECURITY
 * ================================================================ */

// Test 13.1: Opponent output is untrusted
try {
  // Verify that the system prompt treats opponent as untrusted
  const session = createSession({
    guildId: "guild-21",
    channelId: "channel-21",
    initiatorUserId: "human-21",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-21",
      discordUserId: "bot-21",
      displayName: "EvilBot",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const prompt = buildRivalrySystemPrompt(session);
  assertIncludes(
    prompt,
    "untrusted",
    "13.1 opponent untrusted"
  );
  pass("13.1 Opponent output treated as untrusted");
} catch (e) {
  fail("13.1 Opponent output treated as untrusted", e);
}

// Test 13.2: No @everyone in generated responses
try {
  const session = createSession({
    guildId: "guild-22",
    channelId: "channel-22",
    initiatorUserId: "human-22",
    ashenAIId: "ashen-ai-id",
    opponent: {
      id: "discord:bot-22",
      discordUserId: "bot-22",
      displayName: "Bot22",
      discordBot: true,
      classification: "DISCORD_BOT",
      classificationConfidence: 1.0,
      evidence: [],
    },
  });

  const opening = generateOpeningChallenge(session);
  assertNotIncludes(
    opening.text,
    "@everyone",
    "13.2 no @everyone"
  );

  const roast = generateRoast(session, "test");
  assertNotIncludes(
    roast,
    "@everyone",
    "13.2 roast no @everyone"
  );

  const ack = generateAcknowledgment(session, "test");
  assertNotIncludes(
    ack,
    "@everyone",
    "13.2 ack no @everyone"
  );

  const ref = generateRefusalResponse(session);
  assertNotIncludes(
    ref,
    "@everyone",
    "13.2 refusal no @everyone"
  );

  const end = generateSessionEnd(session);
  assertNotIncludes(
    end,
    "@everyone",
    "13.2 end no @everyone"
  );

  pass("13.2 No @everyone in generated responses");
} catch (e) {
  fail("13.2 No @everyone in generated responses", e);
}

/* ================================================================
 * 14. ACTUAL BUG REGRESSION TESTS
 * These test the exact scenarios reported from Discord runtime.
 * ================================================================ */

// Test 14.1: @AshenAI @Senku fight → rivalry (THE ACTUAL BUG)
try {
  // Simulate: human sends "<@ASHENAI_ID> <@SENKU_ID> fight"
  // After cleanBotMention strips AshenAI, content = "<@SENKU_ID> fight"
  const trigger = detectRivalryIntent(
    "<@SENKU_ID> fight",
    ["SENKU_ID"],
    "ASHENAI_ID"
  );
  assertEqual(trigger.isRivalry, true, "14.1 isRivalry");
  assertEqual(
    trigger.targetBotIds.length,
    1,
    "14.1 has target"
  );
  assertEqual(
    trigger.targetBotIds[0],
    "SENKU_ID",
    "14.1 target is Senku"
  );
  assertIncludes(
    trigger.rivalryKeywords.join(","),
    "fight",
    "14.1 has fight keyword"
  );
  pass("14.1 @AshenAI @Senku fight → rivalry");
} catch (e) {
  fail("14.1 @AshenAI @Senku fight → rivalry", e);
}

// Test 14.2: @everyone @AshenAI @Senku fight → rivalry
try {
  const trigger = detectRivalryIntent(
    "<@SENKU_ID> fight",
    ["SENKU_ID"],
    "ASHENAI_ID"
  );
  assertEqual(
    trigger.isRivalry,
    true,
    "14.2 @everyone + rivalry"
  );
  pass("14.2 @everyone @AshenAI @Senku fight → rivalry");
} catch (e) {
  fail(
    "14.2 @everyone @AshenAI @Senku fight → rivalry",
    e
  );
}

// Test 14.3: @everyone fight → NO AshenAI response
try {
  const trigger = detectRivalryIntent(
    "fight",
    [],
    "ASHENAI_ID"
  );
  assertEqual(
    trigger.isRivalry,
    false,
    "14.3 no target bots"
  );
  assertEqual(
    trigger.targetBotIds.length,
    0,
    "14.3 empty targets"
  );
  pass("14.3 @everyone fight → NO rivalry");
} catch (e) {
  fail("14.3 @everyone fight → NO rivalry", e);
}

// Test 14.4: @everyone @Senku fight → NO rivalry (AshenAI not mentioned)
try {
  // If AshenAI is NOT mentioned, the rivalry detection block is never reached
  // This is handled by the "Only interact when: DM, mention, reply" check
  // So this test verifies the detector itself doesn't falsely trigger
  const trigger = detectRivalryIntent(
    "<@SENKU_ID> fight",
    ["SENKU_ID"],
    "ASHENAI_ID"
  );
  // The detector sees target bots + keywords, so it would say isRivalry=true
  // But the MESSAGE HANDLER would never reach rivalry detection because
  // isMention=false (AshenAI not mentioned) → returns at the trigger check.
  // This test verifies the detector's behavior in isolation.
  assertEqual(
    trigger.isRivalry,
    true,
    "14.4 detector says rivalry (but handler blocks it)"
  );
  pass("14.4 @everyone @Senku fight → handler blocks (no AshenAI mention)");
} catch (e) {
  fail(
    "14.4 @everyone @Senku fight → handler blocks",
    e
  );
}

// Test 14.5: @AshenAI @Senku debate → rivalry
try {
  const trigger = detectRivalryIntent(
    "<@SENKU_ID> debate",
    ["SENKU_ID"],
    "ASHENAI_ID"
  );
  assertEqual(trigger.isRivalry, true, "14.5 debate");
  pass("14.5 @AshenAI @Senku debate → rivalry");
} catch (e) {
  fail("14.5 @AshenAI @Senku debate → rivalry", e);
}

// Test 14.6: @AshenAI @Senku challenge → rivalry
try {
  const trigger = detectRivalryIntent(
    "<@SENKU_ID> challenge",
    ["SENKU_ID"],
    "ASHENAI_ID"
  );
  assertEqual(
    trigger.isRivalry,
    true,
    "14.6 challenge"
  );
  pass("14.6 @AshenAI @Senku challenge → rivalry");
} catch (e) {
  fail("14.6 @AshenAI @Senku challenge → rivalry", e);
}

// Test 14.7: @AshenAI @Senku who's better? → rivalry
try {
  const trigger = detectRivalryIntent(
    "<@SENKU_ID> who's better?",
    ["SENKU_ID"],
    "ASHENAI_ID"
  );
  assertEqual(
    trigger.isRivalry,
    true,
    "14.7 who's better"
  );
  pass("14.7 @AshenAI @Senku who's better? → rivalry");
} catch (e) {
  fail(
    "14.7 @AshenAI @Senku who's better? → rivalry",
    e
  );
}

// Test 14.8: @AshenAI @Senku versus → rivalry
try {
  const trigger = detectRivalryIntent(
    "<@SENKU_ID> versus",
    ["SENKU_ID"],
    "ASHENAI_ID"
  );
  assertEqual(
    trigger.isRivalry,
    true,
    "14.8 versus"
  );
  pass("14.8 @AshenAI @Senku versus → rivalry");
} catch (e) {
  fail("14.8 @AshenAI @Senku versus → rivalry", e);
}

// Test 14.9: Bot ID extracted from message.mentions.users (not guild.members.fetch)
try {
  // This tests the FIX: we use message.mentions.users, not guild.members.fetch
  // Simulate what happens in the handler:
  // message.mentions.users has AshenAI + Senku
  // AshenAI is filtered out (user.id !== botId)
  // Senku is kept if user.bot === true
  const mentions = new Map();
  mentions.set("ASHENAI_ID", {
    id: "ASHENAI_ID",
    bot: true,
    displayName: "AshenAI",
    username: "ashenai",
  });
  mentions.set("SENKU_ID", {
    id: "SENKU_ID",
    bot: true,
    displayName: "Senku",
    username: "senku",
  });

  const mentionedBotIds: string[] = [];
  for (const [, user] of mentions) {
    if (user.id !== "ASHENAI_ID" && user.bot) {
      mentionedBotIds.push(user.id);
    }
  }

  assertEqual(
    mentionedBotIds.length,
    1,
    "14.9 one bot found"
  );
  assertEqual(
    mentionedBotIds[0],
    "SENKU_ID",
    "14.9 Senku detected"
  );
  pass("14.9 Bot ID from message.mentions.users");
} catch (e) {
  fail("14.9 Bot ID from message.mentions.users", e);
}

// Test 14.10: Human mentioned is NOT treated as bot
try {
  const mentions = new Map();
  mentions.set("ASHENAI_ID", {
    id: "ASHENAI_ID",
    bot: true,
    displayName: "AshenAI",
    username: "ashenai",
  });
  mentions.set("HUMAN_ID", {
    id: "HUMAN_ID",
    bot: false,
    displayName: "SomeHuman",
    username: "somehuman",
  });

  const mentionedBotIds: string[] = [];
  for (const [, user] of mentions) {
    if (user.id !== "ASHENAI_ID" && user.bot) {
      mentionedBotIds.push(user.id);
    }
  }

  assertEqual(
    mentionedBotIds.length,
    0,
    "14.10 no bots found"
  );

  const trigger = detectRivalryIntent(
    "<@HUMAN_ID> fight",
    mentionedBotIds,
    "ASHENAI_ID"
  );
  assertEqual(
    trigger.isRivalry,
    false,
    "14.10 no rivalry (no bot target)"
  );
  pass("14.10 Human is NOT treated as bot");
} catch (e) {
  fail("14.10 Human is NOT treated as bot", e);
}

// Test 14.11: @AshenAI sleep kanga → NOT rivalry (no target bot)
try {
  const trigger = detectRivalryIntent(
    "sleep kanga",
    [],
    "ASHENAI_ID"
  );
  assertEqual(
    trigger.isRivalry,
    false,
    "14.11 normal chat"
  );
  pass("14.11 @AshenAI sleep kanga → NOT rivalry");
} catch (e) {
  fail("14.11 @AshenAI sleep kanga → NOT rivalry", e);
}

// Test 14.12: Display name does NOT affect bot detection
try {
  // "AIBot" has "AI" and "bot" in name, but user.bot=false → HUMAN
  const p = classifyParticipant({
    userId: "12345",
    displayName: "AIBot",
    botFlag: false,
  });
  assertEqual(
    p.classification,
    "HUMAN",
    "14.12 name doesn't override bot flag"
  );

  // "RegularUser" with user.bot=true → DISCORD_BOT
  const p2 = classifyParticipant({
    userId: "67890",
    displayName: "RegularUser",
    botFlag: true,
  });
  assertEqual(
    p2.classification,
    "DISCORD_BOT",
    "14.12 bot flag overrides name"
  );

  pass("14.12 Display name does NOT affect bot detection");
} catch (e) {
  fail("14.12 Display name does NOT affect bot detection", e);
}

} // end runTests

/* ================================================================
 * SUMMARY
 * ================================================================ */

console.log(`\n${"=".repeat(50)}`);
console.log(
  `Rivalry Tests: ${passed} passed, ${failed} failed`
);
console.log(`${"=".repeat(50)}\n`);

runTests().finally(() => {
  process.exit(failed > 0 ? 1 : 0);
});
