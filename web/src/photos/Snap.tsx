import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CAPTION_MAX, PRIVACY_COPY, resolveMeta } from './meta'
import { downscale, forPlace, photoBlob, usePhotos, type Photo } from './store'
import { readExif } from './exif'
import { PhotoCard } from '../world/PhotoCard'
import './snap.css'

const PRIVACY_KEY = 'photos:privacy'
const privacySeen = () => { try { return localStorage.getItem(PRIVACY_KEY) === '1' } catch { return false } }
const markPrivacy = () => { try { localStorage.setItem(PRIVACY_KEY, '1') } catch { /* private mode */ } }

/** The place a photo is taken from: what the card prints and what the metadata keeps. */
export interface SnapPlace { id: string; lat: number; lng: number; name: string; city?: string | null; address?: string | null }

/** A blob URL for one stored photo, revoked when the id changes or the component leaves. */
function usePhotoUrl(id: string | null): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!id) { setUrl(''); return }
    let u = ''
    let live = true
    photoBlob(id).then((b) => { if (live && b) { u = URL.createObjectURL?.(b) ?? ''; setUrl(u) } })
    return () => { live = false; if (u) URL.revokeObjectURL?.(u) }
  }, [id])
  return url
}

/**
 * The "snap" entry: a file input that opens the camera on a phone and the picker on a desk. The first time, a sheet
 * says where the photos go; after that, straight to the camera. A taken picture is stored and opened as its card.
 * `caption` is written on the photo as taken, for a card that already knows who it is with; `onStart` fires on the press.
 */
export function SnapButton({ place, variant = 'button', caption, onStart, children }: { place: SnapPlace; variant?: 'stamp' | 'button'; caption?: string; onStart?(): void; children?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const add = usePhotos((s) => s.add)

  const start = () => { onStart?.(); if (privacySeen()) input.current?.click(); else setSheet(true) }
  const accept = () => { markPrivacy(); setSheet(false); input.current?.click() }
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const [blob, exif] = await Promise.all([downscale(f), readExif(f).catch(() => null)])
      const photo = await add(blob, resolveMeta({ place, exif, now: Date.now() }), caption)
      setOpen(photo.id)
    } catch (err) { console.error(err) } finally { setBusy(false) }
  }
  return (
    <>
      <button type="button" className={variant === 'stamp' ? 'snap-stamp' : 'btn snap-btn'} onClick={start} disabled={busy} aria-label={variant === 'stamp' ? 'Snap a photo here' : undefined}>
        {children ?? (variant === 'stamp' ? 'SNAP' : 'Snap a photo here')}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden aria-hidden onChange={onFile} data-testid="snap-input" />
      {sheet && <PrivacySheet onAccept={accept} onClose={() => setSheet(false)} />}
      {open && <SnapModal id={open} place={place} onClose={() => setOpen(null)} />}
    </>
  )
}

function PrivacySheet({ onAccept, onClose }: { onAccept(): void; onClose(): void }) {
  return createPortal(
    <div className="snap-veil" role="dialog" aria-modal aria-label="Before your first snap" onClick={onClose}>
      <div className="snap-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="caps">Before your first snap</div>
        <p>{PRIVACY_COPY}</p>
        <div className="row">
          <button type="button" className="btn" onClick={onAccept}>Got it, open the camera</button>
          <button type="button" className="btn quiet" onClick={onClose}>Not now</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** One photo as its card, with the caption field, delete, and a way back. */
export function SnapModal({ id, place, onClose }: { id: string; place?: SnapPlace; onClose(): void }) {
  const photo = usePhotos((s) => s.photos?.find((p) => p.id === id))
  const { setCaption, remove } = usePhotos.getState()
  const src = usePhotoUrl(photo ? id : null)
  const [draft, setDraft] = useState(photo?.caption ?? '')
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose])
  if (!photo) return null
  const commit = () => { const c = draft.trim().slice(0, CAPTION_MAX); if (c !== (photo.caption ?? '')) setCaption(id, c) }
  return createPortal(
    <div className="snap-veil" role="dialog" aria-modal aria-label="Your photo" onClick={onClose}>
      <div className="snap-modal" onClick={(e) => e.stopPropagation()}>
        <PhotoCard photo={photo} src={src} name={place?.name ?? 'Somewhere'} address={place?.address} />
        <label className="snap-caption">
          <span className="caps">Caption <small>{draft.length} / {CAPTION_MAX}</small></span>
          <input value={draft} maxLength={CAPTION_MAX} placeholder="A line under the name…" onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }} />
        </label>
        <div className="row">
          <button type="button" className="btn quiet" onClick={onClose}>Done</button>
          <button type="button" className="btn quiet snap-delete" onClick={() => { remove(id); onClose() }}>Delete photo</button>
        </div>
        <p className="fine">{PRIVACY_COPY}</p>
      </div>
    </div>,
    document.body,
  )
}

/** The photos pinned to one place, newest first; tap one for its card, × to delete it. */
export function PhotoStrip({ place, compact = false }: { place: SnapPlace; compact?: boolean }) {
  const photos = usePhotos((s) => s.photos)
  const load = usePhotos((s) => s.load)
  const remove = usePhotos((s) => s.remove)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { load() }, [load])
  const mine = forPlace(photos, place.id)
  if (!mine.length) return null
  return (
    <div className={`photo-strip ${compact ? 'compact' : ''}`} aria-label="Your photos here">
      {mine.map((p) => <Thumb key={p.id} photo={p} onOpen={() => setOpen(p.id)} onDelete={() => remove(p.id)} />)}
      {open && <SnapModal id={open} place={place} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Thumb({ photo, onOpen, onDelete }: { photo: Photo; onOpen(): void; onDelete(): void }) {
  const src = usePhotoUrl(photo.id)
  return (
    <div className="photo-thumb">
      <button type="button" className="shot" onClick={onOpen} aria-label={`Photo from ${new Date(photo.ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`}>
        {src ? <img src={src} alt="" /> : <span />}
      </button>
      <button type="button" className="x" onClick={onDelete} aria-label="Delete photo">×</button>
    </div>
  )
}
