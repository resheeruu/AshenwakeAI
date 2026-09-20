import React, { useRef, useState } from 'react'

export default function WritingPractice() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  function start(e: React.PointerEvent) {
    const c = canvasRef.current
    if (!c) return
    c.setPointerCapture(e.pointerId)
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY)
    setIsDrawing(true)
  }

  function draw(e: React.PointerEvent) {
    if (!isDrawing) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY)
    ctx.stroke()
  }

  function end(e: React.PointerEvent) {
    const c = canvasRef.current
    if (!c) return
    try { c.releasePointerCapture(e.pointerId) } catch {}
    setIsDrawing(false)
  }

  function clear() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0,0,c.width,c.height)
  }

  return (
    <div>
      <h3>Writing Practice</h3>
      <div className="card" style={{padding:12}}>
        <div style={{marginBottom:8}}>Trace the character shown below</div>
        <canvas ref={canvasRef} width={300} height={300} style={{border:'1px solid #eee',touchAction:'none'}} onPointerDown={start} onPointerMove={draw} onPointerUp={end} onPointerCancel={end}></canvas>
        <div style={{marginTop:8}}>
          <button onClick={clear}>Clear</button>
        </div>
      </div>
    </div>
  )
}
