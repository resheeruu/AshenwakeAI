import React, { useEffect, useState } from 'react'
import { db } from '../../lib/database/db'
import { v4 as uuidv4 } from 'uuid'

export default function Decks() {
  const [decks, setDecks] = useState<any[]>([])
  const [title, setTitle] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const all = await db.decks.toArray()
      if (mounted) setDecks(all)
    })()
    const sub = db.decks.hook('creating', () => {})
    return () => { mounted = false; sub.unsubscribe && sub.unsubscribe() }
  }, [])

  async function addDeck() {
    if (!title.trim()) return
    const d = { id: uuidv4(), title: title.trim(), createdAt: Date.now() }
    await db.decks.add(d)
    setDecks(await db.decks.toArray())
    setTitle('')
  }

  async function removeDeck(id: string) {
    if (!confirm('Delete this deck?')) return
    await db.decks.delete(id)
    await db.flashcards.where('deckId').equals(id).delete()
    setDecks(await db.decks.toArray())
  }

  return (
    <div>
      <h2>Decks</h2>
      <div className="card" style={{padding:12}}>
        <input placeholder="New deck title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button onClick={addDeck} style={{marginLeft:8}}>Add</button>
      </div>

      <div style={{marginTop:12}}>
        {decks.map(d => (
          <div key={d.id} className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div>
              <div style={{fontWeight:700}}>{d.title}</div>
              <div style={{fontSize:12,color:'#666'}}>Created {new Date(d.createdAt).toLocaleDateString()}</div>
            </div>
            <div>
              <a href={`/flashcards/deck/${d.id}`} style={{marginRight:8}}>Open</a>
              <button onClick={() => removeDeck(d.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
