import { db } from '../lib/database/db'

export async function addXP(amount: number, reason = 'action') {
  const u = await db.user.get('local')
  if (!u) return
  u.xp = (u.xp || 0) + amount
  // simple leveling thresholds
  const thresholds = [0,100,250,450,700,1000,1400,1700,2100,2600]
  let level = 1
  for (let i = 0; i < thresholds.length; i++) { if (u.xp >= thresholds[i]) level = i+1 }
  u.level = level
  await db.user.put(u)
  return u
}
