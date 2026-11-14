import { describe, expect, it } from 'vitest'
import { lrocQuickMapUrl } from './moonLinks'

describe('LROC QuickMap links', () => {
  it('zooms to a site using signed east longitude', () => {
    const url = new URL(lrocQuickMapUrl({ lat: -84.232, lonE: 29.926 }))
    expect(url.searchParams.get('extent')).toBe('29.676,-84.482,30.176,-83.982')
    expect(url.searchParams.get('proj')).toBe('10')
    expect(url.searchParams.get('secondaryProj')).toBe('0')
  })

  it('wraps longitudes above 180 degrees', () => {
    const url = new URL(lrocQuickMapUrl({ lat: -85, lonE: 359.764 }))
    expect(url.searchParams.get('extent')).toBe('-0.486,-85.250,0.014,-84.750')
  })

  it('keeps the extent inside the latitude limits at the pole', () => {
    const url = new URL(lrocQuickMapUrl({ lat: -90, lonE: 0 }))
    expect(url.searchParams.get('extent')).toBe('-0.250,-90.000,0.250,-89.750')
  })
})
