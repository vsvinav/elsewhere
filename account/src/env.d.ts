interface Env {
  ACCOUNTS: KVNamespace
  LIMITER: DurableObjectNamespace<import('./limiter').Limiter>
  /** "1" returns the code in the /auth/start response instead of mailing it, on localhost only. */
  DEV_MAIL?: string
  RESEND_KEY?: string
  MAIL_FROM?: string
  LINK_BASE?: string
  /** OAuth client IDs whose Google ID tokens sign in here, comma-separated (web and Android). */
  GOOGLE_CLIENT_ID?: string
}
