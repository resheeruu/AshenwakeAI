import { db } from './database/db'
import dayjs from 'dayjs'

export async function touchStreak() {
  const u = await db.user.get('local')
  if (!u) return
  const today = dayjs().format('YYYY-MM-DD')
  if (u.lastActiveDate === today) return u
  const yesterday = dayjs().subtract(1,'day').format('YYYY-MM-DD')
  if (u.lastActiveDate === yesterday) {
    u.currentStreak = (u.currentStreak || 0) + 1
    u.longestStreak = Math.max(u.longestStreak || 0, u.currentStreak)
  } else {
    u.currentStreak = 1
  }
  u.lastActiveDate = today
  await db.user.put(u)
  return u
}
