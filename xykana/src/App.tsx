import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './features/home/Home'
import HiraganaList from './features/learn/HiraganaList'
import KatakanaList from './features/learn/KatakanaList'
import Flashcards from './features/flashcards/Flashcards'
import Review from './features/review/Review'
import { seedContentIfNeeded } from './lib/database/seed'

export default function App() {
  useEffect(() => {
    // seed content on first app load
    ;(async () => {
      try { await seedContentIfNeeded() } catch (e) { console.error('Seed failed', e) }
    })()
  }, [])

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <div className="brand">XYKANA</div>
          <nav className="main-nav">
            <Link to="/">Home</Link>
            <Link to="/learn/hiragana">Learn</Link>
            <Link to="/review">Review</Link>
            <Link to="/practice">Practice</Link>
            <Link to="/progress">Progress</Link>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/learn/hiragana" element={<HiraganaList />} />
            <Route path="/learn/katakana" element={<KatakanaList />} />
            <Route path="/flashcards" element={<Flashcards />} />
            <Route path="/review" element={<Review />} />
            <Route path="/practice" element={<div style={{padding:20}}>Practice (coming)</div>} />
            <Route path="/progress" element={<div style={{padding:20}}>Progress (coming)</div>} />
          </Routes>
        </main>
        <footer className="app-footer">Learn Japanese. One character at a time.</footer>
      </div>
    </BrowserRouter>
  )
}
