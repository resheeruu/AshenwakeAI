import React from 'react'
import Decks from './Decks'
import { Routes, Route } from 'react-router-dom'
import DeckDetail from './DeckDetail'

export default function Flashcards() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<div><h2>Flashcards</h2><Decks/></div>} />
        <Route path="/deck/:id" element={<DeckDetail/>} />
      </Routes>
    </div>
  )
}
