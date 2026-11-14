import { useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { stats } from '../../analytics/stats'
import { commuteStats } from '../../analytics/commute'
import { explorationScore } from '../../analytics/explore'
import { CountUp, Field, Pass, PrintIn } from '../../world'
import { date, hours, label, month, n0, WEEKDAYS } from '../../world/fmt'

const TOP_MODES = 3
const CLS = ['orange', 'blue', '']
const Pct = ({ n }: { n: number }) => <>{n}<small style={{ fontSize: '0.5em' }}>%</small></>

export function Stats() {
  const data = useData()
  const s = useMemo(() => stats(data), [data])
  const commute = useMemo(() => commuteStats(data, data.meta.range), [data])
  const explore = useMemo(() => explorationScore(data, data.meta.range), [data])

  const totals: Record<string, number> = {}
  for (const m of s.months) for (const [k, v] of Object.entries(m.byMode)) totals[k] = (totals[k] ?? 0) + v
  const modes = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, TOP_MODES).map(([k]) => k)
  const maxMonth = Math.max(1, ...s.months.map((m) => m.total))
  const best = s.months.reduce((a, b) => (b.total > a.total ? b : a), s.months[0])
  const avg = s.months.reduce((a, m) => a + m.total, 0) / Math.max(1, s.months.length)

  let peak = { d: 0, h: 0, v: 0 }
  s.rhythm.forEach((row, d) => row.forEach((v, h) => { if (v > peak.v) peak = { d, h, v } }))
  const byDay = s.rhythm.map((r) => r.reduce((a, b) => a + b, 0))
  const topDay = byDay.indexOf(Math.max(...byDay))

  const days = Object.values(s.dayTypes).reduce((a, b) => a + b, 0)
  const pct = (n: number) => Math.round((100 * n) / Math.max(1, days))

  const maxExplore = Math.max(1, ...explore.map((b) => b.new + b.repeat + b.lapsed))
  const newTotal = explore.reduce((a, b) => a + b.new, 0)
  const hourMax = Math.max(1, ...commute.to_work.by_hour, ...commute.to_home.by_hour)
  const usualMode = Object.entries(commute.to_work.by_mode).sort((a, b) => b[1] - a[1])[0]?.[0]

  return (
    <main className="strip dense">
      <Pass stripe stub={
        <PrintIn>
          <Field label="Best month" big>{best ? <CountUp value={best.total} /> : null}</Field>
          <Field label="Which">{best ? month(best.key) : null}</Field>
          <Field label="Average per month" big><CountUp value={avg} /></Field>
          <Field label="Months on record" big>{s.months.length}</Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Distance by month">Top three modes in colour, the rest in grey</Field></div>
          <div className="big"><CountUp value={maxMonth} /><small>KM PEAK</small></div>
          <div className="columns" role="img" aria-label="Kilometres per month, stacked by mode">
            {s.months.map((m) => {
              const other = m.total - modes.reduce((a, k) => a + (m.byMode[k] ?? 0), 0)
              return (
                <div className="col" key={m.key} tabIndex={0}>
                  <span className="tip">{month(m.key)} · {n0(m.total)} km</span>
                  <i className="ghost" style={{ height: `${(100 * other) / maxMonth}%` }} />
                  {[...modes].reverse().map((k, i) => <i key={k} className={CLS[modes.length - 1 - i]} style={{ height: `${(100 * (m.byMode[k] ?? 0)) / maxMonth}%` }} />)}
                </div>
              )
            })}
          </div>
          <div className="axis"><span>{s.months[0] && month(s.months[0].key)}</span><span>{s.months.at(-1) && month(s.months.at(-1)!.key)}</span></div>
          <div className="legend">{modes.map((k, i) => <span key={k} className={CLS[i]}>{label(k)}</span>)}<span className="ghost">Other</span></div>
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          <Field label="Peak hour">{peak.v ? `${WEEKDAYS[peak.d]} ${String(peak.h).padStart(2, '0')}:00` : null}</Field>
          <Field label="Busiest day out">{byDay[topDay] ? WEEKDAYS[topDay] : null}</Field>
          <Field label="Hours away" big><CountUp value={byDay.reduce((a, b) => a + b, 0)} /></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Weekly rhythm">Hours away from home, by weekday and hour of day</Field></div>
          <div className="heat" role="img" aria-label="Heat grid of hours away from home by weekday and hour">
            {s.rhythm.map((row, d) => (
              <div key={d} style={{ display: 'contents' }}>
                <span className="day">{WEEKDAYS[d]}</span>
                <div className="row">{row.map((v, h) => <b key={h} className={v === 0 ? 'off' : ''} style={{ ['--v' as string]: Math.max(0.08, v / s.rhythmMax) }} />)}</div>
              </div>
            ))}
            <div className="hours">{Array.from({ length: 24 }, (_, h) => <span key={h}>{String(h).padStart(2, '0')}</span>)}</div>
          </div>
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          <Field label="Away" big><Pct n={pct(s.dayTypes.away)} /></Field>
          <Field label="Work" big><Pct n={pct(s.dayTypes.work)} /></Field>
          <Field label="Out" big><Pct n={pct(s.dayTypes.out)} /></Field>
          <Field label="Home" big><Pct n={pct(s.dayTypes.home)} /></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Kinds of days">Away = over 100 km from home · Work = 2 h+ at work · Out = 3 h+ elsewhere</Field></div>
          <div className="big"><CountUp value={s.dayTypes.away} /><small>DAYS AWAY</small></div>
          <div className="strip100" aria-hidden>
            <span className="other" style={{ width: `${pct(s.dayTypes.away)}%` }}>Away</span>
            <span className="work" style={{ width: `${pct(s.dayTypes.work)}%` }}>Work</span>
            <span className="home" style={{ width: `${pct(s.dayTypes.out)}%` }}>Out</span>
            <span className="transit" style={{ width: `${pct(s.dayTypes.home)}%` }}>Home</span>
          </div>
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          <Field label="Legs on record" big><CountUp value={commute.legs.length} /></Field>
          <Field label="To work · median">{commute.to_work.n ? `${Math.round(commute.to_work.median_min)} min` : null}</Field>
          <Field label="To home · median">{commute.to_home.n ? `${Math.round(commute.to_home.median_min)} min` : null}</Field>
          <Field label="Bad day (p90)">{commute.legs.length ? `${Math.round(Math.max(commute.to_work.p90_min, commute.to_home.p90_min))} min` : null}</Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Commute">Home ↔ work legs under 3 hours</Field><Field label="Usually by">{usualMode && label(usualMode)}</Field></div>
          <div className="big">{commute.legs.length ? <><CountUp value={commute.median_all} /><small>MIN DOOR TO DOOR</small></> : <span className="ghost">—</span>}</div>
          {commute.legs.length > 0 && (
            <>
              <div className="legend"><span className="orange">Leaving home</span><span>Leaving work</span></div>
              <div className="spark" aria-hidden>{commute.to_work.by_hour.map((v, h) => <i key={h} className="orange" style={{ height: `${(100 * v) / hourMax}%` }} />)}</div>
              <div className="spark" aria-hidden style={{ marginTop: 2 }}>{commute.to_home.by_hour.map((v, h) => <i key={h} style={{ height: `${(100 * v) / hourMax}%` }} />)}</div>
              <div className="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
            </>
          )}
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          <Field label="New places" big><CountUp value={newTotal} /></Field>
          <Field label="Per month" big><CountUp value={newTotal / Math.max(1, explore.length)} /></Field>
          <Field label="Lapsed" big><CountUp value={explore.reduce((a, b) => a + b.lapsed, 0)} /></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Exploration">First visits, returns, and places that went quiet, by month</Field></div>
          <div className="columns" role="img" aria-label="New, repeat and lapsed places per month">
            {explore.map((b) => (
              <div className="col" key={b.key} tabIndex={0}>
                <span className="tip">{month(b.key)} · {b.new} new · {b.repeat} repeat · {b.lapsed} lapsed</span>
                <i className="ghost" style={{ height: `${(100 * b.lapsed) / maxExplore}%` }} />
                <i className="blue" style={{ height: `${(100 * b.repeat) / maxExplore}%` }} />
                <i className="orange" style={{ height: `${(100 * b.new) / maxExplore}%` }} />
              </div>
            ))}
          </div>
          <div className="axis"><span>{explore[0] && month(explore[0].key)}</span><span>{explore.at(-1) && month(explore.at(-1)!.key)}</span></div>
          <div className="legend"><span className="orange">New</span><span className="blue">Repeat</span><span className="ghost">Lapsed</span></div>
        </PrintIn>
      </Pass>

      <Pass>
        <PrintIn>
          <div className="fields"><Field label="Cities">{s.cities.length} cities in {new Set(s.cities.map((c) => c.country).filter(Boolean)).size} countries, by time spent</Field></div>
          <table className="ptable compact">
            <thead><tr><th>City</th><th>Time</th><th>Visits</th><th>Places</th><th>First</th><th>Last</th></tr></thead>
            <tbody>
              {s.cities.slice(0, 25).map((c) => (
                <tr key={c.city}>
                  <td>{c.city}<small>{c.country}</small></td>
                  <td>{hours(c.hours)}</td><td>{n0(c.visits)}</td><td>{n0(c.places)}</td>
                  <td className="t">{date(c.first)}</td><td className="t">{date(c.last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.cities.length > 25 && <div className="more">and {s.cities.length - 25} more</div>}
        </PrintIn>
      </Pass>
    </main>
  )
}
