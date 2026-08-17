import Dexie, { Table } from 'dexie'

export interface UserProfile {
  id: string
  name?: string
  createdAt: number
  xp: number
  level: number
  currentStreak: number
  longestStreak: number
  lastActiveDate?: string
  totalStudyTime?: number
}

export interface Flashcard {
  id: string
  deckId: string
  type: 'hiragana' | 'katakana' | 'vocab' | 'kanji' | 'grammar'
  front: string
  back: string
  tags?: string[]
  createdAt: number
  reviewCount: number
  correctCount: number
  incorrectCount: number
  ef: number
  interval: number
  lastReviewed?: number
  nextReview?: number
  streak: number
  mastery: number
  favorite?: boolean
}

export class XykanaDB extends Dexie {
  flashcards!: Table<Flashcard, string>
  user!: Table<UserProfile, string>

  constructor() {
    super('xykana-db')
    this.version(1).stores({
      flashcards: 'id,deckId,type,nextReview',
      user: 'id'
    })

    this.on('populate', async () => {
      await this.user.add({ id: 'local', createdAt: Date.now(), xp: 0, level: 1, currentStreak: 0, longestStreak: 0, totalStudyTime: 0 })
    })
  }
}

export const db = new XykanaDB()
