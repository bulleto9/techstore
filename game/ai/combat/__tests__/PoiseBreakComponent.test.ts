/**
 * Tests for the boss poise-break meter (GDD §4.4, §3.6).
 *
 * Covers: poise accumulation per parry (ParryPoiseBreakValue = 25), the break
 * threshold (MaxPoise = 100), perfect-parry weighting (x1.4), the VULNERABLE
 * (Broken) window timing, ignoring damage while broken, and meter reset at the
 * start of each boss phase (AC-27).
 */

import {
  PoiseBreakComponent,
  PoiseState,
  POISE_TUNING,
} from '../PoiseBreakComponent'

describe('PoiseBreakComponent — accumulation + break threshold (GDD §4.4)', () => {
  it('starts empty in the Building state', () => {
    const p = new PoiseBreakComponent()
    expect(p.state).toBe(PoiseState.Building)
    expect(p.currentPoise).toBe(0)
    expect(p.isVulnerable).toBe(false)
  })

  it('each non-perfect parry adds ParryPoiseBreakValue (25)', () => {
    const p = new PoiseBreakComponent()
    const r = p.applyParry(false)
    expect(r.applied).toBe(POISE_TUNING.ParryPoiseBreakValue) // 25
    expect(p.currentPoise).toBe(25)
    expect(r.justBroke).toBe(false)
  })

  it('breaks into the VULNERABLE phase when the meter fills at 100 (4 clean parries)', () => {
    const p = new PoiseBreakComponent()
    p.applyParry(false) // 25
    p.applyParry(false) // 50
    p.applyParry(false) // 75
    const r = p.applyParry(false) // 100 -> break
    expect(r.justBroke).toBe(true)
    expect(r.state).toBe(PoiseState.Broken)
    expect(p.isVulnerable).toBe(true)
    expect(p.currentPoise).toBe(100)
  })

  it('clamps poise to MaxPoise (never overfills)', () => {
    const p = new PoiseBreakComponent({ maxPoise: 100, parryPoiseBreakValue: 80 })
    p.applyParry(false) // 80
    const r = p.applyParry(false) // would be 160 -> clamps to 100, breaks
    expect(p.currentPoise).toBe(100)
    expect(r.justBroke).toBe(true)
  })

  it('fillRatio reflects the normalised meter for UI', () => {
    const p = new PoiseBreakComponent()
    p.applyParry(false) // 25 / 100
    expect(p.fillRatio).toBeCloseTo(0.25)
  })
})

describe('PoiseBreakComponent — perfect parry weighting (GDD §3.6)', () => {
  it('a perfect parry applies value * PerfectParryStaggerMultiplier (25 * 1.4 = 35)', () => {
    const p = new PoiseBreakComponent()
    const r = p.applyParry(true)
    expect(r.applied).toBeCloseTo(25 * 1.4) // 35
    expect(p.currentPoise).toBeCloseTo(35)
  })

  it('perfect parries break poise faster', () => {
    const p = new PoiseBreakComponent()
    p.applyParry(true) // 35
    p.applyParry(true) // 70
    const r = p.applyParry(true) // 100 (clamped from 105) -> break in 3
    expect(r.justBroke).toBe(true)
  })
})

describe('PoiseBreakComponent — VULNERABLE window + ignoring further damage (GDD §4.4)', () => {
  const fillToBreak = (p: PoiseBreakComponent) => {
    p.applyParry(false)
    p.applyParry(false)
    p.applyParry(false)
    p.applyParry(false)
  }

  it('ignores further poise damage while Broken', () => {
    const p = new PoiseBreakComponent()
    fillToBreak(p)
    expect(p.isVulnerable).toBe(true)
    const r = p.applyParry(false)
    expect(r.applied).toBe(0)
    expect(r.state).toBe(PoiseState.Broken)
  })

  it('returns to Building (empty meter) after the VULNERABLE window elapses', () => {
    const p = new PoiseBreakComponent()
    fillToBreak(p)
    p.tick(POISE_TUNING.VulnerableDurationMs)
    expect(p.state).toBe(PoiseState.Building)
    expect(p.currentPoise).toBe(0)
    expect(p.isVulnerable).toBe(false)
  })

  it('stays Broken until the full vulnerable duration has elapsed', () => {
    const p = new PoiseBreakComponent()
    fillToBreak(p)
    p.tick(POISE_TUNING.VulnerableDurationMs - 1)
    expect(p.state).toBe(PoiseState.Broken)
    p.tick(1)
    expect(p.state).toBe(PoiseState.Building)
  })

  it('honours a Recovering tail when recoveryDurationMs > 0', () => {
    const p = new PoiseBreakComponent({
      vulnerableDurationMs: 1000,
      recoveryDurationMs: 500,
    })
    p.applyParry(false)
    p.applyParry(false)
    p.applyParry(false)
    p.applyParry(false) // break
    p.tick(1000) // vulnerable elapsed -> Recovering
    expect(p.state).toBe(PoiseState.Recovering)
    p.tick(500) // recovery elapsed -> Building
    expect(p.state).toBe(PoiseState.Building)
  })
})

describe('PoiseBreakComponent — phase reset (GDD §4.4, AC-27)', () => {
  it('resetMeter empties poise and returns to Building (boss phase start)', () => {
    const p = new PoiseBreakComponent()
    p.applyParry(false)
    p.applyParry(false)
    expect(p.currentPoise).toBe(50)
    p.resetMeter()
    expect(p.currentPoise).toBe(0)
    expect(p.state).toBe(PoiseState.Building)
  })
})

describe('PoiseBreakComponent — optional decay (designer opt-in)', () => {
  it('decays poise over time while Building when poiseDecayPerSecond > 0', () => {
    const p = new PoiseBreakComponent({ poiseDecayPerSecond: 10 })
    p.applyParry(false) // 25
    p.tick(1000) // -10 -> 15
    expect(p.currentPoise).toBeCloseTo(15)
  })

  it('does not decay by default (GDD specifies only increments + resets)', () => {
    const p = new PoiseBreakComponent()
    p.applyParry(false)
    p.tick(5000)
    expect(p.currentPoise).toBe(25)
  })
})
