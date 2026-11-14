import type { Cam } from './cam'

/** The live map camera, whichever provider drew it, for panels that need to move it. */
let cur: Cam | null = null
export const liveCam = { set: (c: Cam | null) => { cur = c }, get: () => cur }
