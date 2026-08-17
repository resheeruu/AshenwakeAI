import { reviewCard } from './srs'
import { expect, test } from 'vitest'

test('SRS review scheduling: correct increases nextReview', () => {
  const now = Date.now()
  const card: any = {
    id: 'c1',
    reviewCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    ef: 2.5,
    interval: 0,
    streak: 0
  }
  const updated = reviewCard({ ...card }, 4, now)
  expect(updated.lastReviewed).toBeDefined()
  expect(updated.nextReview).toBeGreaterThan(now)
  expect(updated.correctCount).toBe(1)
  expect(updated.interval).toBeGreaterThanOrEqual(1)
})

test('SRS review scheduling: failure resets interval', () => {
  const now = Date.now()
  const card: any = {
    id: 'c2',
    reviewCount: 5,
    correctCount: 3,
    incorrectCount: 2,
    ef: 2.0,
    interval: 10,
    streak: 2
  }
  const updated = reviewCard({ ...card }, 1, now)
  expect(updated.incorrectCount).toBeGreaterThanOrEqual(3)
  expect(updated.interval).toBe(1)
  expect(updated.streak).toBe(0)
})
