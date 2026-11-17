import { useMemo } from 'react'
import { useData } from '../../data/DataContext'
import { stats } from '../../analytics/stats'
import { commuteStats } from '../../analytics/commute'
import { explorationScore } from '../../analytics/explore'
import { CountUp, Field, Pass, PrintIn } from '../../world'
import { date, hours, month, n0, WEEKDAYS } from '../../world/fmt'
import { kmByLabel, modeLabel } from '../../data/modes'
import { useUnits } from '../../profile/units'
import { Door, doorProps } from '../../world/Door'
import { cityIndex, monthRange } from '../../analytics/doors'
import { isHome, isWork } from '../../analytics/geo'
import type { Door as Target } from '../../store/useStore'

const TOP_MODES = 3
const CLS = ['orange', 'blue', '']
const Pct = ({ n }: { n: number }) => <>{n}<small style={{ fontSize: '0.5em' }}>%</small></>

export function Stats() {
  const { u, cv } = useUnits()
  const data = useData()
  const s = useMemo(() => stats(data), [data])
  const hasWork = !!(data.profile.works?.length || data.profile.work)
  const commute = useMemo(() => commuteStats(data, data.meta.range), [data])
  const explore = useMemo(() => explorationScore(data, data.meta.range), [data])
  // Where each figure leads; the place book is indexed once per record.
  const d = useMemo(() => {
    const [r0, r1] = data.meta.range
    const byCity = cityIndex(data.places)
    const homeWork = Object.entries(data.places).filter(([, p]) => isHome(p) || isWork(p)).map(([id]) => id)
    return {
      whole: (label: string): Target => ({ kind: 'range', from: r0, to: r1, label }),
      month: (key: string, label: string): Target => { const [a, b] = monthRange(key); return { kind: 'range', from: Math.max(r0, a), to: Math.min(r1, b), label } },
      city: (city: string, label: string): Target => ({ kind: 'places', placeIds: byCity.get(city) ?? [], label }),
      commute: (label: string): Target => (homeWork.length ? { kind: 'places', placeIds: homeWork, label } : { kind: 'range', from: r0, to: r1, label }),
    }
  }, [data])

  // Months stacked by label, so every unnamed mode is one grey Other and never takes a colour.
  const months = s.months.map((m) => ({ ...m, byMode: Object.fromEntries(kmByLabel(m.byMode)) }))
  const totals: Record<string, number> = {}
  for (const m of months) for (const [k, v] of Object.entries(m.byMode)) totals[k] = (totals[k] ?? 0) + v
  const modes = Object.entries(totals).filter(([k]) => k !== 'Other').sort((a, b) => b[1] - a[1]).slice(0, TOP_MODES).map(([k]) => k)
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
          <Field label="Best month" big>{best ? <Door target={d.month(best.key, `Best month · ${month(best.key)} · ${n0(cv(best.total))} ${u}`)}><CountUp value={best.total} /></Door> : null}</Field>
          <Field label="Which">{best ? <Door target={d.month(best.key, `Best month · ${month(best.key)}`)}>{month(best.key)}</Door> : null}</Field>
          <Field label="Average per month" big><Door target={d.whole(`Average per month · ${n0(cv(avg))} ${u}`)}><CountUp value={avg} /></Door></Field>
          <Field label="Months on record" big><Door target={d.whole(`${s.months.length} months on record`)}>{s.months.length}</Door></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Distance by month">Top three modes in colour, the rest in grey</Field></div>
          <div className="big">{best ? <Door target={d.month(best.key, `Peak month · ${month(best.key)} · ${n0(cv(maxMonth))} ${u}`)}><CountUp value={maxMonth} /><small>KM PEAK</small></Door> : <><CountUp value={maxMonth} /><small>KM PEAK</small></>}</div>
          <div className="columns" aria-label="Distance per month, stacked by mode">
            {months.map((m) => {
              const other = m.total - modes.reduce((a, k) => a + (m.byMode[k] ?? 0), 0)
              return (
                <div className="col" key={m.key} {...doorProps(d.month(m.key, `${month(m.key)} · ${n0(cv(m.total))} ${u}`))}>
                  <span className="tip">{month(m.key)} · {n0(cv(m.total))} {u}</span>
                  <i className="ghost" style={{ height: `${(100 * other) / maxMonth}%` }} />
                  {[...modes].reverse().map((k, i) => <i key={k} className={CLS[modes.length - 1 - i]} style={{ height: `${(100 * (m.byMode[k] ?? 0)) / maxMonth}%` }} />)}
                </div>
              )
            })}
          </div>
          <div className="axis"><span>{s.months[0] && month(s.months[0].key)}</span><span>{s.months.at(-1) && month(s.months.at(-1)!.key)}</span></div>
          <div className="legend">{modes.map((k, i) => <span key={k} className={CLS[i]}>{k}</span>)}<span className="ghost">Other</span></div>
        </PrintIn>
      </Pass>

      <Pass stub={
        <PrintIn>
          <Field label="Peak hour">{peak.v ? `${WEEKDAYS[peak.d]} ${String(peak.h).padStart(2, '0')}:00` : null}</Field>
          <Field label="Busiest day out">{byDay[topDay] ? WEEKDAYS[topDay] : null}</Field>
          <Field label="Hours away" big><Door target={d.whole(`${n0(byDay.reduce((a, b) => a + b, 0))} hours away`)}><CountUp value={byDay.reduce((a, b) => a + b, 0)} /></Door></Field>
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
          <Field label="Away" big><Door target={d.whole(`${pct(s.dayTypes.away)}% of days away`)}><Pct n={pct(s.dayTypes.away)} /></Door></Field>
          <Field label="Work" big><Door target={d.commute(`${pct(s.dayTypes.work)}% of days at work`)}><Pct n={pct(s.dayTypes.work)} /></Door></Field>
          <Field label="Out" big><Door target={d.whole(`${pct(s.dayTypes.out)}% of days out`)}><Pct n={pct(s.dayTypes.out)} /></Door></Field>
          <Field label="Home" big><Door target={d.commute(`${pct(s.dayTypes.home)}% of days home`)}><Pct n={pct(s.dayTypes.home)} /></Door></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Kinds of days">Away = over {n0(cv(100))} {u} from home · Work = 2 h+ at work · Out = 3 h+ elsewhere</Field></div>
          <div className="big"><Door target={d.whole(`${n0(s.dayTypes.away)} days away`)}><CountUp value={s.dayTypes.away} /><small>DAYS AWAY</small></Door></div>
          <div className="strip100" aria-hidden>
            <span className="other" style={{ width: `${pct(s.dayTypes.away)}%` }}>Away</span>
            {hasWork && <span className="work" style={{ width: `${pct(s.dayTypes.work)}%` }}>Work</span>}
            <span className="home" style={{ width: `${pct(s.dayTypes.out)}%` }}>Out</span>
            <span className="transit" style={{ width: `${pct(s.dayTypes.home)}%` }}>Home</span>
          </div>
        </PrintIn>
      </Pass>

      {hasWork && (
      <Pass stub={
        <PrintIn>
          <Field label="Legs on record" big><Door target={d.commute(`${n0(commute.legs.length)} commute legs`)}><CountUp value={commute.legs.length} /></Door></Field>
          <Field label="To work · median">{commute.to_work.n ? <Door target={d.commute(`To work · ${Math.round(commute.to_work.median_min)} min`)}>{Math.round(commute.to_work.median_min)} min</Door> : null}</Field>
          <Field label="To home · median">{commute.to_home.n ? <Door target={d.commute(`To home · ${Math.round(commute.to_home.median_min)} min`)}>{Math.round(commute.to_home.median_min)} min</Door> : null}</Field>
          <Field label="Bad day (p90)">{commute.legs.length ? <Door target={d.commute(`Bad day · ${Math.round(Math.max(commute.to_work.p90_min, commute.to_home.p90_min))} min`)}>{Math.round(Math.max(commute.to_work.p90_min, commute.to_home.p90_min))} min</Door> : null}</Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Commute">Home ↔ work legs under 3 hours</Field><Field label="Usually by">{usualMode && modeLabel(usualMode)}</Field></div>
          <div className="big">{commute.legs.length ? <Door target={d.commute(`${Math.round(commute.median_all)} min door to door`)}><CountUp value={commute.median_all} /><small>MIN DOOR TO DOOR</small></Door> : <span className="ghost">—</span>}</div>
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
      )}

      <Pass stub={
        <PrintIn>
          <Field label="New places" big><Door target={d.whole(`${n0(newTotal)} new places`)}><CountUp value={newTotal} /></Door></Field>
          <Field label="Per month" big><Door target={d.whole(`${n0(newTotal / Math.max(1, explore.length))} new places a month`)}><CountUp value={newTotal / Math.max(1, explore.length)} /></Door></Field>
          <Field label="Lapsed" big><Door target={d.whole(`${n0(explore.reduce((a, b) => a + b.lapsed, 0))} lapsed places`)}><CountUp value={explore.reduce((a, b) => a + b.lapsed, 0)} /></Door></Field>
        </PrintIn>
      }>
        <PrintIn>
          <div className="fields"><Field label="Exploration">First visits, returns, and places that went quiet, by month</Field></div>
          <div className="columns" aria-label="New, repeat and lapsed places per month">
            {explore.map((b) => (
              <div className="col" key={b.key} {...doorProps(d.month(b.key, `${month(b.key)} · ${b.new} new · ${b.repeat} repeat · ${b.lapsed} lapsed`))}>
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
          <div className="fields"><Field label="Cities"><Door target={d.whole(`${s.cities.length} cities`)}>{s.cities.length} cities</Door> in <Door target={d.whole(`${new Set(s.cities.map((c) => c.country).filter(Boolean)).size} countries`)}>{new Set(s.cities.map((c) => c.country).filter(Boolean)).size} countries</Door>, by time spent</Field></div>
          <table className="ptable compact">
            <thead><tr><th>City</th><th>Time</th><th>Visits</th><th>Places</th><th>First</th><th>Last</th></tr></thead>
            <tbody>
              {s.cities.slice(0, 25).map((c) => (
                <tr key={c.city}>
                  <td><Door target={d.city(c.city, `${c.city} · ${hours(c.hours)} · ${n0(c.visits)} visits · ${n0(c.places)} places`)}>{c.city}<small>{c.country}</small></Door></td>
                  <td><Door target={d.city(c.city, `${c.city} · ${hours(c.hours)}`)}>{hours(c.hours)}</Door></td><td><Door target={d.city(c.city, `${c.city} · ${n0(c.visits)} visits`)}>{n0(c.visits)}</Door></td><td><Door target={d.city(c.city, `${c.city} · ${n0(c.places)} places`)}>{n0(c.places)}</Door></td>
                  <td className="t"><Door target={{ kind: 'range', from: c.first, to: c.last, label: `${c.city} · first visit ${date(c.first)}` }}>{date(c.first)}</Door></td><td className="t"><Door target={{ kind: 'range', from: c.first, to: c.last, label: `${c.city} · last visit ${date(c.last)}` }}>{date(c.last)}</Door></td>
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
