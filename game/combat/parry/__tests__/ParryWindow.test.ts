/**
 * Tests for ParryWindow timing helpers.
 *
 * Covers GDD §3.3 (effective window clamp, AC-02 boundary), §3.6 (perfect
 * sub-window, AC-16/19) and §2.1/§5.2 (input buffer eligibility, AC-03/04).
 */

import {
  DEFAULT_PARRY_CONFIG,
  PARRY_WINDOW_MAX_MS,
  PARRY_WINDOW_MIN_MS,
  ParryConfig,
} from '../ParryConfig'
import { effectiveWindowMs, isPerfect, isWithinBuffer } from '../ParryWindow'

const cfg = (overrides: Partial<ParryConfig> = {}): ParryConfig => ({
  ...DEFAULT_PARRY_CONFIG,
  ...overrides,
})

describe('effectiveWindowMs (GDD §3.3)', () => {
  it('returns the raw window with no level scaling (default bonus 0)', () => {
    expect(effectiveWindowMs(cfg({ parryWindowMs: 200 }), 50)).toBe(200)
  })

  it('adds the per-level bonus before clamping', () => {
    // 200 + 2*30 = 260, within [80,400]
    expect(effectiveWindowMs(cfg({ parryWindowMs: 200 }), 30, 2)).toBe(260)
  })

  it('clamps to the 400 ms hard ceiling (AC: trivialization guard)', () => {
    // 200 + 10*100 = 1200 -> clamp to 400
    expect(effectiveWindowMs(cfg({ parryWindowMs: 200 }), 100, 10)).toBe(
      PARRY_WINDOW_MAX_MS,
    )
  })

  it('clamps to the 80 ms hard floor (unfairness guard)', () => {
    // Even a tiny base window cannot go below the floor.
    expect(effectiveWindowMs(cfg({ parryWindowMs: 50 }), 0)).toBe(
      PARRY_WINDOW_MIN_MS,
    )
  })

  it('treats negative character levels as 0 (no negative scaling)', () => {
    expect(effectiveWindowMs(cfg({ parryWindowMs: 200 }), -10, 5)).toBe(200)
  })

  it('a window already at the max stays at the max', () => {
    expect(effectiveWindowMs(cfg({ parryWindowMs: 400 }), 5, 1)).toBe(400)
  })
})

describe('isPerfect — perfect sub-window detection (GDD §3.6, AC-16/19)', () => {
  const c = cfg({ perfectParryWindowMs: 60 })

  it('contact at the very start of the active window is perfect', () => {
    expect(isPerfect(0, c)).toBe(true)
  })

  it('contact within the first perfectParryWindowMs is perfect (AC-16)', () => {
    expect(isPerfect(30, c)).toBe(true)
  })

  it('contact exactly at the perfect-window edge is still perfect', () => {
    expect(isPerfect(60, c)).toBe(true)
  })

  it('contact after perfectParryWindowMs is NOT perfect (AC-19)', () => {
    expect(isPerfect(61, c)).toBe(false)
    expect(isPerfect(120, c)).toBe(false)
  })

  it('negative elapsed is never perfect', () => {
    expect(isPerfect(-1, c)).toBe(false)
  })
})

describe('isWithinBuffer — input buffer eligibility (GDD §2.1, AC-03/04)', () => {
  const c = cfg({ inputBufferMs: 80 })

  it('a press 60 ms early is buffered (AC-03)', () => {
    expect(isWithinBuffer(60, c)).toBe(true)
  })

  it('a press exactly at the buffer edge is buffered', () => {
    expect(isWithinBuffer(80, c)).toBe(true)
  })

  it('a press 200 ms early (outside buffer) is ignored (AC-04)', () => {
    expect(isWithinBuffer(200, c)).toBe(false)
  })

  it('a press just past the buffer edge is ignored', () => {
    expect(isWithinBuffer(81, c)).toBe(false)
  })

  it('a present-time press (0 ms ahead) is eligible', () => {
    expect(isWithinBuffer(0, c)).toBe(true)
  })

  it('negative ahead values are not eligible', () => {
    expect(isWithinBuffer(-5, c)).toBe(false)
  })
})
