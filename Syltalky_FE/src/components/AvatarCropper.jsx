import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'

export default function AvatarCropper({ imageSrc, onConfirm, onCancel }) {
  const [crop, setCrop]       = useState({ x: 0, y: 0 })
  const [zoom, setZoom]       = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = async () => {
    const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, rotation)
    onConfirm(blob)
  }

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Be Vietnam Pro", sans-serif',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 440, background: '#0F1117', borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          animation: 'modal-in 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <style>{`@keyframes modal-in { from { opacity:0; transform:scale(0.95) translateY(10px) } to { opacity:1; transform:scale(1) translateY(0) } }`}</style>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Chỉnh ảnh đại diện</span>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.color = '#F87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
          >✕</button>
        </div>

        {/* Crop area */}
        <div style={{ position: 'relative', width: '100%', height: 300, background: '#000' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: { background: '#000' },
              cropAreaStyle: { border: '2px solid #00C9B8', boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' },
            }}
          />
        </div>

        {/* Controls */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', width: 52, flexShrink: 0 }}>Zoom</span>
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#00C9B8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', width: 36, textAlign: 'right' }}>{zoom.toFixed(1)}×</span>
          </div>

          {/* Rotation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', width: 52, flexShrink: 0 }}>Xoay</span>
            <input
              type="range" min={-180} max={180} step={1} value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#00C9B8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', width: 36, textAlign: 'right' }}>{rotation}°</span>
          </div>

          {/* Rotate buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: '↺ 90°', delta: -90 },
              { label: '↻ 90°', delta: +90 },
              { label: 'Reset', reset: true },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={() => btn.reset ? (setRotation(0), setZoom(1), setCrop({ x: 0, y: 0 })) : setRotation(r => Math.max(-180, Math.min(180, r + btn.delta)))}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onCancel} style={{
              flex: 1, padding: '10px', borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
              color: 'rgba(255,255,255,0.5)', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
            >Huỷ</button>
            <button onClick={handleConfirm} style={{
              flex: 2, padding: '10px', borderRadius: 9, border: 'none',
              background: 'linear-gradient(135deg,#00C9B8,#0099CC)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 16px rgba(0,201,184,0.3)',
            }}>
              Xác nhận
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function rotateSize(width, height, rotation) {
  const rad = (rotation * Math.PI) / 180
  return {
    width:  Math.abs(Math.cos(rad) * width)  + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width)  + Math.abs(Math.cos(rad) * height),
  }
}

async function getCroppedBlob(imageSrc, pixelCrop, rotation) {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const rad = (rotation * Math.PI) / 180

  const { width: bw, height: bh } = rotateSize(image.width, image.height, rotation)
  canvas.width  = bw
  canvas.height = bh

  ctx.translate(bw / 2, bh / 2)
  ctx.rotate(rad)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height)

  canvas.width  = pixelCrop.width
  canvas.height = pixelCrop.height
  ctx.putImageData(data, 0, 0)

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = src
  })
}
