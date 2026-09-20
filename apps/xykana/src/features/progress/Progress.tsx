import React, { useEffect, useState } from 'react'
import { db } from '../../lib/database/db'

export default function Progress() {
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const u = await db.user.get('local')
      if (mounted) setUser(u)
    })()
    return () => { mounted = false }
  }, [])

  if (!user) return <div className="card">Loading...</div>

  return (
    <div>
      <h2>Your Progress</h2>
      <div className="card" style={{padding:12}}>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:18,fontWeight:700}}>Level {user.level}</div>
            <div style={{color:'#666'}}>{user.xp} XP</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div>🔥 {user.currentStreak} day streak</div>
            <div style={{color:'#666'}}>Longest: {user.longestStreak}</div>
          </div>
        </div>
      </div>

      <div style={{marginTop:12}} className="card">
        <h3>Mastery</h3>
        <div>Hiragana: --% (calculated)</div>
        <div>Katakana: --%</div>
        <div>Vocabulary: --%</div>
        <div>Kanji: --%</div>
      </div>
    </div>
  )
}
