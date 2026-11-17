import { modeLabel } from './modes'

test('every known mode has its short poster label', () => {
  expect(modeLabel('WALKING')).toBe('Walk')
  expect(modeLabel('RUNNING')).toBe('Run')
  expect(modeLabel('CYCLING')).toBe('Cycle')
  expect(modeLabel('IN_PASSENGER_VEHICLE')).toBe('Car')
  expect(modeLabel('IN_BUS')).toBe('Bus')
  expect(modeLabel('IN_TRAIN')).toBe('Train')
  expect(modeLabel('IN_SUBWAY')).toBe('Metro')
  expect(modeLabel('IN_TRAM')).toBe('Tram')
  expect(modeLabel('IN_FERRY')).toBe('Ferry')
  expect(modeLabel('FLYING')).toBe('Flight')
  expect(modeLabel('MOTORCYCLING')).toBe('Motorbike')
})

test('anything unrecognised falls back to Other', () => {
  expect(modeLabel('UNKNOWN')).toBe('Other')
  expect(modeLabel('UNKNOWN_ACTIVITY_TYPE')).toBe('Other')
  expect(modeLabel('IN_VEHICLE')).toBe('Other')
  expect(modeLabel('')).toBe('Other')
})
