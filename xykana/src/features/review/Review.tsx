import React, { useEffect, useState } from 'react'
import { db } from '../../lib/database/db'
import { reviewCard } from '../../lib/srs/srs'

export default function Review() {
  const [cards, setCards] = useState<any[]>([])
  useEffect(() => {
    let mounted = true
    ;(async () => {
      // load due cards
      const now = Date.now()
      const due = await db.table('flashcards').where('nextReview').belowOrEqual(now).limit(50).toArray()
      if (mounted) setCards(due)
    })()
    return () => { mounted = false }
  }, [])

  async function rate(card: any, q: number) {
    const updated = reviewCard(card, q as any)
    await db.table('flashcards').put(updated)
    setCards((s) => s.filter((c) => c.id !== card.id))
  }

  if (!cards.length) return <div className="card"><h3>No cards due</h3></div>

  const c = cards[0]
  return (
    <div className="card">
      <h3>Review</h3>
      <div style={{fontSize:48}}>{c.front}</div>
      <div style={{marginTop:8}}>Think...</div>
      <div style={{marginTop:12}}>
        <button onClick={() => rate(c,0)}>Again</button>
        <button onClick={() => rate(c,2)}>Hard</button>
        <button onClick={() => rate(c,4)}>Good</button>
        <button onClick={() => rate(c,5)}>Easy</button>
      </div>
    </div>
  )
}
