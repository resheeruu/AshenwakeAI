# AshenAI Feature Spec (in progress)

Mode: UPGRADE — never replace working systems. Keep existing hunt/shop/blackjack
rewards fully functional. Results must be determined by deterministic game code.

## 5. HUNTING 2.0

Upgrade the existing Hunt (`/hunt` -> `src/games/hunting.ts`) instead of replacing it.

### Encounter roster
1. 🐺 Wolf — combat, common
2. 👹 Demon — combat, rare
3. 🧟 Undead — combat, uncommon
4. 🐉 Dragon — combat, epic
5. 👑 Ancient Shadow — legendary boss combat, rare
6. 🌑 World Devourer — mythic boss combat, rare
   - announced with flavor: "🌑 THE FOREST HAS GONE SILENT."
7. 🎁 Treasure — non-combat reward encounter
8. 🧙 NPC — non-combat boon encounter
9. 💀 Ambush — forced combat (no flee), higher reward

### Interactions / actions
- ⚔️ FIGHT — engage combat
- 🏃 FLEE — attempt to escape

### Flavor lines
- 🌑 "THE FOREST HAS GONE SILENT." (World Event / rare announce)
- ambient "Something is watching you."

### Constraints
- Result must be determined by deterministic game code (no user-picked prize paths).

## 6. COMBAT ENGINE
- Create a reusable combat engine.