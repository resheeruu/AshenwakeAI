import React from 'react'
import useOnline from '../../hooks/useOnline'

export default function Home() {
  const online = useOnline()
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <h1>こんにちは!</h1>
          <p>Ready to learn Japanese?</p>
        </div>
        <div style={{textAlign:'right'}}>
          <div>{online ? '🟢 Online' : '🟠 Offline'}</div>
        </div>
      </div>

      <section style={{marginTop:16}} className="card">
        <h2>Today</h2>
        <div style={{display:'flex',gap:12}}>
          <div className="card" style={{padding:12}}>🔥 Streak<br/>0</div>
          <div className="card" style={{padding:12}}>Level<br/>1</div>
          <div className="card" style={{padding:12}}>XP<br/>0</div>
        </div>
      </section>

      <section style={{marginTop:16}} className="card">
        <h3>Quick Actions</h3>
        <div style={{display:'flex',gap:8}}>
          <a href="/learn/hiragana" className="card" style={{padding:12}}>Learn Hiragana</a>
          <a href="/learn/katakana" className="card" style={{padding:12}}>Learn Katakana</a>
          <a href="/review" className="card" style={{padding:12}}>Review</a>
        </div>
      </section>
    </div>
  )
}
