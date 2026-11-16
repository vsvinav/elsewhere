interface Env {
  ROOM: DurableObjectNamespace<import('./room').Room>
  REGISTRY: DurableObjectNamespace<import('./registry').Registry>
}
