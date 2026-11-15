import { Bill } from '../world'
import { KeyCheck } from './KeyCheck'
import './onboarding.css'

/** The whole screen while a saved key is checked against Google, before any record is printed on it. */
export function KeyGate() {
  return (
    <main className="bills keygate">
      <Bill className="hero" share={false}>
        <h1 className="title"><span className="misreg">Else</span><span className="misreg red">where</span></h1>
        <p className="lede sub">Checking your Google key before we print your record.</p>
        <KeyCheck />
      </Bill>
    </main>
  )
}
