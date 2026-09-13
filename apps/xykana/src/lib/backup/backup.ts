import { db } from '../lib/database/db'

export async function exportBackup() {
  const user = await db.user.get('local')
  const decks = await db.decks.toArray()
  const flashcards = await db.flashcards.toArray()
  const reviews = await db.reviews.toArray()
  const progress = await db.progress.toArray()
  const settings = await db.settings.toArray()
  const payload = { user, decks, flashcards, reviews, progress, settings, exportedAt: Date.now() }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  return { url, blob }
}

export async function importBackup(json: any, mode: 'merge'|'replace' = 'merge') {
  // basic validation
  if (!json) throw new Error('Invalid backup')
  if (mode === 'replace') {
    // replace user data tables
    await db.transaction('rw', db.user, db.decks, db.flashcards, db.reviews, db.progress, db.settings, async () => {
      await db.decks.clear()
      await db.flashcards.clear()
      await db.reviews.clear()
      await db.progress.clear()
      await db.settings.clear()
      if (json.decks) await Promise.all(json.decks.map((d:any)=>db.decks.add(d)))
      if (json.flashcards) await Promise.all(json.flashcards.map((c:any)=>db.flashcards.add(c)))
      if (json.reviews) await Promise.all(json.reviews.map((r:any)=>db.reviews.add(r)))
      if (json.progress) await Promise.all(json.progress.map((p:any)=>db.progress.add(p)))
      if (json.settings) await Promise.all(json.settings.map((s:any)=>db.settings.add(s)))
      if (json.user) await db.user.put(json.user)
    })
  } else {
    // merge
    await db.transaction('rw', db.decks, db.flashcards, db.reviews, db.progress, db.settings, async () => {
      if (json.decks) await Promise.all(json.decks.map((d:any)=>db.decks.put(d)))
      if (json.flashcards) await Promise.all(json.flashcards.map((c:any)=>db.flashcards.put(c)))
      if (json.reviews) await Promise.all(json.reviews.map((r:any)=>db.reviews.put(r)))
      if (json.progress) await Promise.all(json.progress.map((p:any)=>db.progress.put(p)))
      if (json.settings) await Promise.all(json.settings.map((s:any)=>db.settings.put(s)))
      if (json.user) await db.user.put(json.user)
    })
  }
}
