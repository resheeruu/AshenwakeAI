import React from 'react'
import katakana from '../../data/katakana.json'

export default function KatakanaList() {
  return (
    <div>
      <h2>Katakana</h2>
      <div className="kana-grid">
        {katakana.map((k) => (
          <a key={k.char} className="kana-tile" href={`/learn/katakana/${k.char}`}>
            <div className="kana-char">{k.char}</div>
            <div style={{fontSize:12}}>{k.romaji}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
