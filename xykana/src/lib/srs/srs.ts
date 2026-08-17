import { Flashcard } from '../lib/database/db'

export type Quality = 0 | 1 | 2 | 3 | 4 | 5

export function reviewCard(card: Flashcard, quality: Quality, now = Date.now()): Flashcard {
  const MIN_EF = 1.3
  card.reviewCount = (card.reviewCount || 0) + 1
  if (quality >= 3) {
    card.correctCount = (card.correctCount || 0) + 1
    card.ef = Math.max(MIN_EF, (card.ef || 2.5) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
    if (!card.interval || card.interval <= 0) card.interval = 1
    else if (card.reviewCount === 2) card.interval = 6
    else card.interval = Math.round((card.interval || 1) * (card.ef || 2.5))
    const lastDay = card.lastReviewed ? Math.floor((card.lastReviewed) / 86400000) : null
    const nowDay = Math.floor(now / 86400000)
    card.streak = (lastDay !== null && lastDay === nowDay - 1) ? (card.streak || 0) + 1 : 1
  } else {
    card.incorrectCount = (card.incorrectCount || 0) + 1
    card.ef = Math.max(MIN_EF, (card.ef || 2.5) - 0.2)
    card.interval = 1
    card.streak = 0
  }
  card.lastReviewed = now
  card.nextReview = now + (card.interval || 1) * 24 * 60 * 60 * 1000
  const total = (card.correctCount || 0) + (card.incorrectCount || 0)
  card.mastery = total ? (card.correctCount || 0) / total * Math.min(1, 0.4 + (card.streak || 0) * 0.1) : 0
  return card
}
