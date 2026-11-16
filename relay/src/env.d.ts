interface Env {
  ROOM: DurableObjectNamespace<import('./room').Room>
  REGISTRY: DurableObjectNamespace<import('./registry').Registry>
}
declare namespace Cloudflare {
  interface Env extends globalThis.Env {}
}
