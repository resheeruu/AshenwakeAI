import { db, Deck, Flashcard, ContentItem } from './db'
import hiragana from '../../data/hiragana_full.json'
import katakana from '../../data/katakana_full.json'
import { v4 as uuidv4 } from 'uuid'

export async function seedContentIfNeeded() {
  // check content count
  const cnt = await db.content.count()
  if (cnt > 0) return

  // seed hiragana
  const ops: ContentItem[] = []
  hiragana.forEach((h: any) => {
    ops.push({ id: `hiragana:${h.char}`, type: 'hiragana', key: h.char, payload: h })
  })
  katakana.forEach((k: any) => {
    ops.push({ id: `katakana:${k.char}`, type: 'katakana', key: k.char, payload: k })
  })

  await db.transaction('rw', db.content, db.decks, db.flashcards, async () => {
    await Promise.all(ops.map((o) => db.content.add(o)))

    // create default deck
    const deckId = uuidv4()
    const deck: Deck = { id: deckId, title: 'Kana Starter', createdAt: Date.now(), isDefault: true }
    await db.decks.add(deck)

    // create flashcards for each kana
    const cards: Flashcard[] = []
    hiragana.forEach((h: any) => {
      cards.push({
        id: uuidv4(), deckId, type: 'hiragana', front: h.char, back: h.romaji, createdAt: Date.now(), reviewCount: 0, correctCount: 0, incorrectCount: 0, ef: 2.5, interval: 0, streak: 0, mastery: 0
      })
    })
    katakana.forEach((k: any) => {
      cards.push({
        id: uuidv4(), deckId, type: 'katakana', front: k.char, back: k.romaji, createdAt: Date.now(), reviewCount: 0, correctCount: 0, incorrectCount: 0, ef: 2.5, interval: 0, streak: 0, mastery: 0
      })
    })
    await Promise.all(cards.map((c) => db.flashcards.add(c)))
  })
}
