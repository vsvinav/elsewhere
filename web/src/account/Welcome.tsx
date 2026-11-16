import { Stamp } from '../world'
import { useAccount } from './store'
import '../profile/onboarding.css'
import './account.css'

export const WELCOME_LINE = 'Your life, mapped as you live it.'
export const SIGN_UP = 'Sign up'
export const LOG_IN = 'Log in'
export const CONTINUE_WITHOUT = 'Continue without an account'

interface Props { onSignUp(): void; onLogIn(): void; onContinue(): void }

/** The first screen on a fresh device: an account keeps the record going across devices; skipping it is one tap. */
export function Welcome({ onSignUp, onLogIn, onContinue }: Props) {
  const skip = () => { void useAccount.getState().setWelcomed(true); onContinue() }
  return (
    <main className="ob acct">
      <section className="bill ob-bill">
        <div className="peel">
          <header className="ob-head"><span className="ob-mark" aria-hidden>E</span></header>
          <div className="ob-start acct-welcome">
            <div>
              <h1 className="title"><span className="misreg">Else</span><span className="misreg red">where</span></h1>
              <p className="lede">{WELCOME_LINE}</p>
            </div>
            <div className="acct-choices">
              <span className="caps">Your record, on every device</span>
              <div className="acct-buttons">
                <button className="btn" onClick={onSignUp}>{SIGN_UP}</button>
                <button className="btn quiet" onClick={onLogIn}>{LOG_IN}</button>
              </div>
              <button className="acct-link" onClick={skip}>{CONTINUE_WITHOUT}</button>
            </div>
          </div>
        </div>
        <Stamp top="World" big="v3" bottom="tour" style={{ position: 'absolute', right: 'var(--gutter)', bottom: 56 }} />
      </section>
    </main>
  )
}
