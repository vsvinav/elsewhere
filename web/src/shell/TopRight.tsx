import { useData } from '../data/DataContext'
import { useStore } from '../store/useStore'

export function TopRight() {
  const { meta, visits, activities } = useData()
  const basemap = useStore((s) => s.basemap)
  const toggle = useStore((s) => s.toggleBasemap)
  const follow = useStore((s) => s.follow)
  const setFollow = useStore((s) => s.setFollow)
  const isReplay = useStore((s) => s.activeInsight === 'replay')
  const rep = meta.import_report
  return (
    <div className="topright">
      <div className="chips">
        {isReplay && <button className={`chip ${follow ? 'on' : ''}`} onClick={() => setFollow(!follow)} title="Camera follows the replay">⌖ Follow</button>}
        <button className="chip" onClick={toggle}>{basemap === 'dark' ? '☾ Dark' : '☀ Light'}</button>
      </div>
      <div className="card small">
        <div>{visits.length.toLocaleString()} visits · {activities.length.toLocaleString()} trips</div>
        <div className="muted">{rep.parsed.toLocaleString()}/{rep.segments_total.toLocaleString()} segments · {meta.source_file}</div>
      </div>
    </div>
  )
}
