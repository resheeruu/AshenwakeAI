import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '../../lib/database/db'
import { v4 as uuidv4 } from 'uuid'

export default function DeckDetail() {
  const { id } = useParams()
  const [deck, setDeck] = useState<any>(null)
  const [cards, setCards] = useState<any[]>([])
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!id) return
      const d = await db.decks.get(id as string)
      const c = await db.flashcards.where('deckId').equals(id as string).toArray()
      if (mounted) { setDeck(d); setCards(c) }
    })()
    return () => { mounted = false }
  }, [id])

  async function addCard() {
    if (!deck) return
    if (!front.trim() || !back.trim()) return
    const card = { id: uuidv4(), deckId: deck.id, type: 'vocab', front: front.trim(), back: back.trim(), createdAt: Date.now(), reviewCount: 0, correctCount:0, incorrectCount:0, ef:2.5, interval:0, streak:0, mastery:0 }
    await db.flashcards.add(card)
    setCards(await db.flashcards.where('deckId').equals(deck.id).toArray())
    setFront(''); setBack('')
  }

  async function deleteCard(cardId: string) {
    if (!confirm('Delete card?')) return
    await db.flashcards.delete(cardId)
    setCards(await db.flashcards.where('deckId').equals(deck.id).toArray())
  }

  if (!deck) return <div className="card">Deck not found</div>

  return (
    <div>
      <h2>{deck.title}</h2>
      <div className="card">
        <h4>Add Card</h4>
        <input placeholder="Front" value={front} onChange={(e)=>setFront(e.target.value)} />
        <input placeholder="Back" value={back} onChange={(e)=>setBack(e.target.value)} style={{marginLeft:8}} />
        <button onClick={addCard} style={{marginLeft:8}}>Add</button>
      </div>

      <div style={{marginTop:12}}>
        {cards.map(c => (
          <div key={c.id} className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div>
              <div style={{fontSize:20}}>{c.front}</div>
              <div style={{color:'#666'}}>{c.back}</div>
            </div>
            <div>
              <button onClick={() => deleteCard(c.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
