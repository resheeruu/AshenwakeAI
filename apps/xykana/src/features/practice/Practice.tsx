import React from 'react'
import { Link, Routes, Route } from 'react-router-dom'
import WritingPractice from '../writing/WritingPractice'

export default function Practice() {
  return (
    <div>
      <h2>Practice</h2>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <Link to="/practice/kana" className="card" style={{padding:12}}>Kana Quiz</Link>
        <Link to="/practice/flashcards" className="card" style={{padding:12}}>Flashcards</Link>
        <Link to="/practice/writing" className="card" style={{padding:12}}>Writing Practice</Link>
      </div>

      <Routes>
        <Route path="/writing" element={<WritingPractice />} />
        <Route path="/kana" element={<div className="card">Kana Quiz (coming)</div>} />
        <Route path="/flashcards" element={<div className="card">Flashcard Practice (coming)</div>} />
      </Routes>
    </div>
  )
}
