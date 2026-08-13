export type AshenAction =
  | "none"
  | "warn"
  | "warnings"
  | "timeout"
  | "untimeout";

export interface ActionIntent {
  action: AshenAction;
  targetUserId?: string;
  reason?: string;
  durationMinutes?: number;
}

function extractReason(
  text: string,
  durationMatch?: RegExpMatchArray | null
): string | undefined {
  let reason = "";

  if (durationMatch) {
    const afterDuration =
      text.slice(
        (durationMatch.index ?? 0) +
          durationMatch[0].length
      );

    reason = afterDuration
      .replace(/^\s*(?:for|because|reason:?)\s*/i, "")
      .trim();
  } else {
    const reasonMatch = text.match(
      /\b(?:for|because|reason:?)\s+(.+)$/i
    );

    if (reasonMatch) {
      reason = reasonMatch[1].trim();
    }
  }

  if (!reason) {
    return undefined;
  }

  return reason.slice(0, 500);
}

export function detectActionIntent(
  content: string,
  mentionedUserIds: string[]
): ActionIntent {
  const text = content.trim().toLowerCase();
  const targetUserId = mentionedUserIds[0];

  if (
    /\b(show|check|view|see|list)\b.*\b(warnings?|warning history)\b/.test(
      text
    )
  ) {
    return {
      action: "warnings",
      targetUserId,
    };
  }

  if (
    /\b(untimeout|remove timeout|unmute)\b/.test(
      text
    )
  ) {
    return {
      action: "untimeout",
      targetUserId,
    };
  }

  if (
    /\b(timeout|mute temporarily|temporarily mute)\b/.test(
      text
    )
  ) {
    const durationMatch = text.match(
      /\b(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs)\b/
    );

    let durationMinutes: number | undefined;

    if (durationMatch) {
      const value = Number(durationMatch[1]);
      const unit = durationMatch[2];

      durationMinutes =
        unit.startsWith("hour") ||
        unit === "hr" ||
        unit === "hrs"
          ? value * 60
          : value;
    }

    return {
      action: "timeout",
      targetUserId,
      durationMinutes,
      reason: extractReason(
        text,
        durationMatch
      ),
    };
  }

  if (/\b(warn|warning)\b/.test(text)) {
    return {
      action: "warn",
      targetUserId,
      reason: extractReason(text),
    };
  }

  return {
    action: "none",
  };
}
