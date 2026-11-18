// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Rail } from './Rail'

afterEach(cleanup)

const figure = (label: string) => screen.getByText(label).parentElement!.querySelector('.rail-v')!.textContent

describe('Rail', () => {
  it('prints the four figures, formatted, with the milestone when there is one', () => {
    render(<Rail rail={{ km: 12480.4, cities: 23, nightsAway: 61, flights: 9, milestone: "…and that's your 25th city" }} visible />)
    expect(figure('KM SO FAR')).toBe('12,480')
    expect(figure('CITIES')).toBe('23')
    expect(figure('NIGHTS AWAY')).toBe('61')
    expect(figure('FLIGHTS')).toBe('9')
    expect(screen.getByRole('status').textContent).toBe("…and that's your 25th city")
  })
  it('drops the milestone line when there is none', () => {
    const { rerender } = render(<Rail rail={{ km: 0, cities: 1, nightsAway: 0, flights: 0, milestone: 'your first city' }} visible />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Rail rail={{ km: 0, cities: 1, nightsAway: 0, flights: 0, milestone: null }} visible />)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('shows a dash for nights away when the record has no home', () => {
    render(<Rail rail={{ km: 0, cities: 0, nightsAway: 0, flights: 0, milestone: null }} visible noHome />)
    expect(figure('NIGHTS AWAY')).toBe('—')
  })
  it('stays in the tree but hidden when not visible', () => {
    render(<Rail rail={{ km: 5, cities: 0, nightsAway: 0, flights: 0, milestone: null }} visible={false} />)
    const el = document.querySelector('.rail')!
    expect(el.classList.contains('hidden')).toBe(true)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByRole('complementary', { name: 'So far' })).toBeNull()
  })
})
