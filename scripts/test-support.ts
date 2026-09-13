import { SupportCaseManager } from "../src/support/case-manager";
import { canTransition, VALID_TRANSITIONS } from "../src/support/types";
import type { CaseStatus } from "../src/support/types";

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

console.log("\n🧪 AshenAI Support System Tests\n");

// ─────────────────────────────────────
// LIFECYCLE STATE MACHINE
// ─────────────────────────────────────

const VALID_TRANSITIONS_DEFINED: Array<[CaseStatus, CaseStatus]> = [
  ["open", "investigating"],
  ["open", "waiting_user"],
  ["open", "waiting_staff"],
  ["open", "escalated"],
  ["open", "resolved"],
  ["investigating", "waiting_user"],
  ["investigating", "waiting_staff"],
  ["investigating", "escalated"],
  ["investigating", "resolved"],
  ["waiting_user", "investigating"],
  ["waiting_user", "waiting_staff"],
  ["waiting_user", "escalated"],
  ["waiting_user", "resolved"],
  ["waiting_staff", "investigating"],
  ["waiting_staff", "waiting_user"],
  ["waiting_staff", "escalated"],
  ["waiting_staff", "resolved"],
  ["escalated", "investigating"],
  ["escalated", "resolved"],
  ["resolved", "closed"],
];

const INVALID_TRANSITIONS: Array<[CaseStatus, CaseStatus]> = [
  ["open", "closed"],
  ["investigating", "open"],
  ["waiting_user", "open"],
  ["waiting_staff", "open"],
  ["escalated", "open"],
  ["resolved", "open"],
  ["closed", "open"],
  ["closed", "investigating"],
  ["closed", "resolved"],
];

try {
  let allValidPass = true;
  for (const [from, to] of VALID_TRANSITIONS_DEFINED) {
    if (!canTransition(from, to)) {
      fail(`Valid transition ${from} → ${to}`);
      allValidPass = false;
    }
  }
  if (allValidPass) pass("All valid transitions accepted");
} catch (error) {
  fail("Valid transitions", error);
}

try {
  let allInvalidBlocked = true;
  for (const [from, to] of INVALID_TRANSITIONS) {
    if (canTransition(from, to)) {
      fail(`Invalid transition ${from} → ${to} should be blocked`);
      allInvalidBlocked = false;
    }
  }
  if (allInvalidBlocked) pass("All invalid transitions blocked");
} catch (error) {
  fail("Invalid transitions", error);
}

try {
  const allStatuses: CaseStatus[] = ["open", "investigating", "waiting_user", "waiting_staff", "escalated", "resolved", "closed"];
  let closedBlocked = true;
  for (const status of allStatuses) {
    if (canTransition("closed", status)) {
      fail(`Closed → ${status} should be blocked`);
      closedBlocked = false;
    }
  }
  if (closedBlocked) pass("Closed status has no outgoing transitions");
} catch (error) {
  fail("Closed transitions", error);
}

try {
  const allStatuses: CaseStatus[] = ["open", "investigating", "waiting_user", "waiting_staff", "escalated", "resolved", "closed"];
  let allDefined = true;
  for (const status of allStatuses) {
    if (!VALID_TRANSITIONS[status]) {
      fail(`Missing transition entry for ${status}`);
      allDefined = false;
    }
  }
  if (allDefined) pass("All statuses have transition entries");
} catch (error) {
  fail("Transition map completeness", error);
}

// ─────────────────────────────────────
// CASE MANAGER
// ─────────────────────────────────────

const manager = new SupportCaseManager();

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Need help with something",
  });

  if (c && c.type === "support" && c.status === "open" && c.creatorId === "test-user-1") {
    pass("Create support case");
  } else {
    fail("Create support case", c);
  }
} catch (error) {
  fail("Create support case", error);
}

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "report",
    creatorId: "test-user-1",
    subjectUserId: "test-user-2",
    summary: "Harassment report",
  });

  if (c && c.type === "report" && c.subjectUserId === "test-user-2") {
    pass("Create report case with subject user");
  } else {
    fail("Create report case", c);
  }
} catch (error) {
  fail("Create report case", error);
}

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "appeal",
    creatorId: "test-user-1",
    summary: "Wrongly banned",
  });

  if (c && c.type === "appeal") {
    pass("Create appeal case");
  } else {
    fail("Create appeal case", c);
  }
} catch (error) {
  fail("Create appeal case", error);
}

try {
  const c1 = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "First",
  });
  const c2 = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Second",
  });

  if (c1 && c2 && c1.id !== c2.id) {
    pass("Unique case IDs");
  } else {
    fail("Unique case IDs", { c1, c2 });
  }
} catch (error) {
  fail("Unique case IDs", error);
}

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Persist test",
  });
  const retrieved = manager.getCase(c!.id);

  if (retrieved && retrieved.id === c!.id && retrieved.summary === "Persist test") {
    pass("Case persistence");
  } else {
    fail("Case persistence", retrieved);
  }
} catch (error) {
  fail("Case persistence", error);
}

try {
  const nonExistent = manager.getCase("non-existent-id");
  if (nonExistent === null) {
    pass("Get non-existent case returns null");
  } else {
    fail("Get non-existent case", nonExistent);
  }
} catch (error) {
  fail("Get non-existent case", error);
}

// ─────────────────────────────────────
// CASE TRANSITIONS
// ─────────────────────────────────────

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Transition test",
  });

  const updated = manager.transitionCase(c!.id, "investigating", "staff-1");
  if (updated && updated.status === "investigating") {
    pass("Transition open → investigating");
  } else {
    fail("Transition open → investigating", updated);
  }
} catch (error) {
  fail("Transition open → investigating", error);
}

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Invalid transition test",
  });

  const updated = manager.transitionCase(c!.id, "closed", "staff-1");
  if (updated === null) {
    pass("Invalid transition open → closed rejected");
  } else {
    fail("Invalid transition open → closed should be rejected", updated);
  }
} catch (error) {
  fail("Invalid transition test", error);
}

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Full lifecycle test",
  });

  let r = manager.transitionCase(c!.id, "investigating", "staff-1");
  if (!r || r.status !== "investigating") fail("Lifecycle step 1");

  r = manager.transitionCase(c!.id, "resolved", "staff-1");
  if (!r || r.status !== "resolved") fail("Lifecycle step 2");

  r = manager.transitionCase(c!.id, "closed", "staff-1");
  if (!r || r.status !== "closed" || !r.closedAt) fail("Lifecycle step 3");

  if (r && r.status === "closed" && r.closedAt) {
    pass("Full lifecycle: open → investigating → resolved → closed");
  }
} catch (error) {
  fail("Full lifecycle", error);
}

try {
  const nonExistent = manager.transitionCase("non-existent", "investigating", "staff-1");
  if (nonExistent === null) {
    pass("Transition non-existent case returns null");
  } else {
    fail("Transition non-existent case", nonExistent);
  }
} catch (error) {
  fail("Transition non-existent case", error);
}

// ─────────────────────────────────────
// CASE ASSIGNMENT
// ─────────────────────────────────────

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Assignment test",
  });

  const updated = manager.assignCase(c!.id, "staff-1", "admin-1");
  if (updated && updated.assignedStaffId === "staff-1") {
    pass("Assign case to staff");
  } else {
    fail("Assign case to staff", updated);
  }
} catch (error) {
  fail("Assign case to staff", error);
}

try {
  const result = manager.assignCase("non-existent", "staff-1", "admin-1");
  if (result === null) {
    pass("Assign non-existent case returns null");
  } else {
    fail("Assign non-existent case", result);
  }
} catch (error) {
  fail("Assign non-existent case", error);
}

// ─────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "support",
    creatorId: "test-user-1",
    summary: "Message test",
  });

  const msg1 = manager.addMessage(c!.id, "user-1", "Hello, I need help");
  const msg2 = manager.addMessage(c!.id, "ai", "How can I help you?", true);

  if (msg1 && msg1.content === "Hello, I need help" && !msg1.isAi) {
    pass("Add user message");
  } else {
    fail("Add user message", msg1);
  }

  if (msg2 && msg2.isAi === true) {
    pass("Add AI message");
  } else {
    fail("Add AI message", msg2);
  }

  const messages = manager.getMessages(c!.id);
  if (messages.length === 2 && messages[0].content === "Hello, I need help" && messages[1].isAi) {
    pass("Retrieve messages in order");
  } else {
    fail("Retrieve messages", messages);
  }
} catch (error) {
  fail("Messages", error);
}

// ─────────────────────────────────────
// EVIDENCE
// ─────────────────────────────────────

try {
  const c = manager.createCase({
    guildId: "test-guild-1",
    channelId: "test-ch-1",
    type: "report",
    creatorId: "test-user-1",
    subjectUserId: "test-user-2",
    summary: "Evidence test",
  });

  const ev = manager.addEvidence({
    caseId: c!.id,
    messageId: "msg-123",
    authorId: "test-user-2",
    authorName: "BadUser#0001",
    content: "Offensive message content",
    channelId: "test-ch-general",
    channelName: "general",
    messageUrl: "https://discord.com/channels/test-guild-1/test-ch-1/msg-123",
    collectedBy: "staff-1",
  });

  if (ev && ev.authorId === "test-user-2" && ev.content === "Offensive message content") {
    pass("Add evidence");
  } else {
    fail("Add evidence", ev);
  }

  const evidence = manager.getEvidence(c!.id);
  if (evidence.length === 1 && evidence[0].messageId === "msg-123") {
    pass("Retrieve evidence");
  } else {
    fail("Retrieve evidence", evidence);
  }
} catch (error) {
  fail("Evidence", error);
}

// ─────────────────────────────────────
// GUILD ISOLATION
// ─────────────────────────────────────

try {
  manager.createCase({ guildId: "iso-guild-A", channelId: "ch-1", type: "support", creatorId: "u1", summary: "A case" });
  manager.createCase({ guildId: "iso-guild-B", channelId: "ch-2", type: "support", creatorId: "u1", summary: "B case" });

  const aCases = manager.getGuildCases("iso-guild-A");
  const bCases = manager.getGuildCases("iso-guild-B");

  if (aCases.length === 1 && bCases.length === 1 && aCases[0].guildId === "iso-guild-A" && bCases[0].guildId === "iso-guild-B") {
    pass("Guild isolation");
  } else {
    fail("Guild isolation", { aCases, bCases });
  }
} catch (error) {
  fail("Guild isolation", error);
}

// ─────────────────────────────────────
// USER ISOLATION
// ─────────────────────────────────────

try {
  manager.createCase({ guildId: "user-iso-g", channelId: "ch-1", type: "support", creatorId: "user-A", summary: "A ticket" });
  manager.createCase({ guildId: "user-iso-g", channelId: "ch-1", type: "support", creatorId: "user-B", summary: "B ticket" });

  const aCases = manager.getUserCases("user-iso-g", "user-A");
  const bCases = manager.getUserCases("user-iso-g", "user-B");

  if (aCases.length === 1 && bCases.length === 1 && aCases[0].creatorId === "user-A" && bCases[0].creatorId === "user-B") {
    pass("User isolation");
  } else {
    fail("User isolation", { aCases, bCases });
  }
} catch (error) {
  fail("User isolation", error);
}

// ─────────────────────────────────────
// CHANNEL CASES
// ─────────────────────────────────────

try {
  manager.createCase({ guildId: "ch-iso-g", channelId: "ch-specific", type: "support", creatorId: "u1", summary: "Specific channel" });
  manager.createCase({ guildId: "ch-iso-g", channelId: "ch-other", type: "support", creatorId: "u2", summary: "Other channel" });

  const specific = manager.getChannelCases("ch-specific");
  if (specific.length === 1 && specific[0].channelId === "ch-specific") {
    pass("Channel case lookup");
  } else {
    fail("Channel case lookup", specific);
  }
} catch (error) {
  fail("Channel case lookup", error);
}

// ─────────────────────────────────────
// STATS
// ─────────────────────────────────────

try {
  manager.createCase({ guildId: "stats-g", channelId: "c1", type: "support", creatorId: "u1", summary: "s1" });
  manager.createCase({ guildId: "stats-g", channelId: "c1", type: "report", creatorId: "u1", summary: "s2" });
  manager.createCase({ guildId: "stats-g", channelId: "c1", type: "support", creatorId: "u2", summary: "s3" });

  const stats = manager.getStats("stats-g");
  if (stats.total === 3 && stats.open === 3 && stats.byType["support"] === 2 && stats.byType["report"] === 1) {
    pass("Case statistics");
  } else {
    fail("Case statistics", stats);
  }
} catch (error) {
  fail("Case statistics", error);
}

// ─────────────────────────────────────
// GUILD CONFIG EXTENSIONS
// ─────────────────────────────────────

async function testGuildConfig() {
  try {
    const { loadGuildConfig } = await import("../src/core/guild-config");
    const config = loadGuildConfig("test-config-guild");

    if (config.support && config.reports && config.appeals && config.supportAi && config.supportLogging && config.staff) {
      pass("Guild config has all support sections");
    } else {
      fail("Guild config support sections", {
        support: !!config.support,
        reports: !!config.reports,
        appeals: !!config.appeals,
        supportAi: !!config.supportAi,
        supportLogging: !!config.supportLogging,
        staff: !!config.staff,
      });
    }
  } catch (error) {
    fail("Guild config support sections", error);
  }

  try {
    const { loadGuildConfig } = await import("../src/core/guild-config");
    const config = loadGuildConfig("test-config-guild-2");

    if (config.support?.enabled === false && config.support?.allowGeneralHelp === true) {
      pass("Default support config values");
    } else {
      fail("Default support config values", config.support);
    }
  } catch (error) {
    fail("Default support config values", error);
  }

  try {
    const { loadGuildConfig } = await import("../src/core/guild-config");
    const config = loadGuildConfig("test-config-guild-3");

    if (config.supportAi?.enabled === true && config.supportAi?.requireConfirmation === true) {
      pass("Default AI config values");
    } else {
      fail("Default AI config values", config.supportAi);
    }
  } catch (error) {
    fail("Default AI config values", error);
  }
}

testGuildConfig().then(() => {
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
});
