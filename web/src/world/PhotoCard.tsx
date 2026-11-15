import { Barcode, Pass, Stamp } from './index'
import { photoBarcode, stampLines, whereLine } from '../photos/meta'
import type { Photo } from '../photos/store'
import type { CSSProperties } from 'react'

/**
 * A snapped photo as a card: the picture on stock in an ink frame, tilted like a sticker, the day stamped top-right,
 * the place in Big Shoulders, where it was in caps, the caption, a barcode. Saves and shares through `Pass`.
 */
export function PhotoCard({ photo, src, name, address, className = '' }: { photo: Photo; src: string; name: string; address?: string | null; className?: string }) {
  const stamp = stampLines(photo)
  return (
    <Pass className={`photo-card ${className}`}>
      <div className="photo-frame" style={{ '--tilt': '1.5deg' } as CSSProperties}>
        {src ? <img className="shot" src={src} alt="" /> : <div className="shot" />}
        <Stamp top={stamp.top} big={stamp.big} bottom={stamp.bottom} size="sm" style={{ position: 'absolute', top: -18, right: -14 }} />
      </div>
      <div className="name">{name}</div>
      <div className="where caps">{whereLine(photo, address)}</div>
      {photo.caption && <p className="caption">{photo.caption}</p>}
      <Barcode text={photoBarcode(photo)} />
    </Pass>
  )
}
