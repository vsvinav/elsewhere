interface Env {
  ACCOUNTS: KVNamespace
  /** "1" returns the code and token in the /auth/start response instead of mailing them. Tests and local dev only. */
  DEV_MAIL?: string
  RESEND_KEY?: string
  MAIL_FROM?: string
  LINK_BASE?: string
}
