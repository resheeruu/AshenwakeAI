import React from 'react'
import hiragana from '../../data/hiragana.json'

export default function HiraganaList() {
  return (
    <div>
      <h2>Hiragana</h2>
      <div className="kana-grid">
        {hiragana.map((k) => (
          <a key={k.char} className="kana-tile" href={`/learn/hiragana/${k.char}`}>
            <div className="kana-char">{k.char}</div>
            <div style={{fontSize:12}}>{k.romaji}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
