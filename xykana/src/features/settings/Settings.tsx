import React, { useState } from 'react'
import { exportBackup, importBackup } from '../../lib/backup/backup'

export default function Settings() {
  const [exportUrl, setExportUrl] = useState<string | null>(null)

  async function doExport() {
    const { url } = await exportBackup()
    setExportUrl(url)
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    try {
      const json = JSON.parse(text)
      if (!confirm('Import backup? Choose Merge (OK) or Cancel to abort.')) return
      await importBackup(json, 'merge')
      alert('Import complete')
    } catch (err) {
      alert('Invalid backup file')
    }
  }

  return (
    <div>
      <h2>Settings</h2>
      <div className="card" style={{padding:12}}>
        <button onClick={doExport}>Export Backup</button>
        {exportUrl && <a href={exportUrl} download="xykana-backup.json" style={{marginLeft:8}}>Download</a>}
      </div>

      <div style={{marginTop:12}} className="card">
        <h4>Import Backup</h4>
        <input type="file" accept="application/json" onChange={onFile} />
      </div>
    </div>
  )
}
