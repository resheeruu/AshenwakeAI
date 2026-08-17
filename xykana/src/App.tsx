import React from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Home from './features/home/Home'
import HiraganaList from './features/learn/HiraganaList'
import KatakanaList from './features/learn/KatakanaList'
import Flashcards from './features/flashcards/Flashcards'
import Review from './features/review/Review'
import Practice from './features/practice/Practice'
import Progress from './features/progress/Progress'
import Settings from './features/settings/Settings'
import { seedContentIfNeeded } from './lib/database/seed'

export default function App() {
  React.useEffect(() => {
    ;(async () => { try { await seedContentIfNeeded() } catch(e){ console.error('seed failed', e) } })()
  }, [])

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div className="brand">XYKANA</div>
            <div style={{fontSize:12,color:'#666'}}>Learn Japanese. One character at a time.</div>
          </div>
          <nav className="main-nav">
            <Link to="/">Home</Link>
            <Link to="/learn/hiragana">Learn</Link>
            <Link to="/review">Review</Link>
            <Link to="/practice">Practice</Link>
            <Link to="/progress">Progress</Link>
            <Link to="/settings">Settings</Link>
          </nav>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/learn/hiragana" element={<HiraganaList />} />
            <Route path="/learn/katakana" element={<KatakanaList />} />
            <Route path="/flashcards/*" element={<Flashcards />} />
            <Route path="/review" element={<Review />} />
            <Route path="/practice/*" element={<Practice />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <footer className="app-footer" style={{padding:12}}>XYKANA • Learn Japanese. One character at a time.</footer>
      </div>
    </BrowserRouter>
  )
}
