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

export interface Deck {
  id: string
  title: string
  createdAt: number
  updatedAt?: number
  isDefault?: boolean
}

export interface ContentItem {
  id: string
  type: 'hiragana' | 'katakana' | 'kanji' | 'vocab' | 'grammar'
  key: string
  payload: any
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

export interface Progress {
  id?: number
  xp: number
  level: number
  streakCount: number
  lastActiveDate?: string
  createdAt: number
  updatedAt?: number
}

export interface ReviewRecord {
  id?: string
  cardId: string
  rating: number
  timestamp: number
}

export interface Setting {
  key: string
  value: any
}

export class XykanaDB extends Dexie {
  flashcards!: Table<Flashcard, string>
  user!: Table<UserProfile, string>
  decks!: Table<Deck, string>
  content!: Table<ContentItem, string>
  progress!: Table<Progress, number>
  reviews!: Table<ReviewRecord, string>
  settings!: Table<Setting, string>

  constructor() {
    super('xykana-db')

    // v1: initial schema
    this.version(1).stores({
      flashcards: 'id,deckId,type,nextReview',
      user: 'id'
    })

    // v2: add decks, content, progress, reviews, settings
    this.version(2).stores({
      flashcards: 'id,deckId,type,nextReview',
      user: 'id',
      decks: 'id,title',
      content: 'id,type,key',
      progress: '++id',
      reviews: '++id,cardId',
      settings: 'key'
    }).upgrade(async tx => {
      // keep existing user rows intact
      return
    })

    this.on('populate', async () => {
      // create a default local profile if not present
      const existing = await this.table('user').get('local')
      if (!existing) {
        await this.user.add({ id: 'local', createdAt: Date.now(), xp: 0, level: 1, currentStreak: 0, longestStreak: 0, totalStudyTime: 0 })
      }
    })
  }
}

export const db = new XykanaDB()
