/**
 * Tests for the non-boss attacker stagger FSM (GDD §2.5, §3.6).
 *
 * Covers: stagger duration (800 ms base, x1.4 on perfect / AC-18), canAct
 * gating while staggered (AC: attacker cannot attack/block/dodge), and the
 * Staggered -> StaggerRecovery -> CombatNeutral progression.
 */

import {
  CombatReactionState,
  EnemyCombatReaction,
  REACTION_TUNING,
} from '../EnemyCombatReaction'

describe('EnemyCombatReaction — stagger duration (GDD §2.5, §3.6)', () => {
  it('a normal parry staggers for AttackerStaggerMs (800 ms default)', () => {
    const r = new EnemyCombatReaction()
    const applied = r.onAttackParried({ isPerfect: false })
    expect(applied).toBe(REACTION_TUNING.AttackerStaggerMs) // 800
    expect(r.state).toBe(CombatReactionState.Staggered)
    expect(r.remainingMs).toBe(800)
  })

  it('a perfect parry extends stagger by PerfectParryStaggerMultiplier (x1.4 = 1120 ms) (AC-18)', () => {
    const r = new EnemyCombatReaction()
    const applied = r.onAttackParried({ isPerfect: true })
    expect(applied).toBeCloseTo(800 * 1.4) // 1120
    expect(r.remainingMs).toBeCloseTo(1120)
  })

  it('computeStaggerMs is a pure query and does not mutate state', () => {
    const r = new EnemyCombatReaction()
    expect(r.computeStaggerMs(false)).toBe(800)
    expect(r.computeStaggerMs(true)).toBeCloseTo(1120)
    expect(r.state).toBe(CombatReactionState.CombatNeutral)
  })

  it('honours per-archetype tuning overrides', () => {
    const r = new EnemyCombatReaction({
      attackerStaggerMs: 500,
      perfectParryStaggerMultiplier: 2,
    })
    expect(r.computeStaggerMs(false)).toBe(500)
    expect(r.computeStaggerMs(true)).toBe(1000)
  })
})

describe('EnemyCombatReaction — canAct gating (GDD §2.5)', () => {
  it('a neutral enemy can act', () => {
    const r = new EnemyCombatReaction()
    expect(r.canAct).toBe(true)
  })

  it('a staggered enemy cannot attack/block/dodge', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: false })
    expect(r.canAct).toBe(false)
  })
})

describe('EnemyCombatReaction — timed progression (GDD §2.5)', () => {
  it('Staggered -> StaggerRecovery once the stagger timer elapses', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: false }) // 800 ms
    r.tick(800)
    expect(r.state).toBe(CombatReactionState.StaggerRecovery)
    expect(r.canAct).toBe(false)
  })

  it('StaggerRecovery -> CombatNeutral once recovery elapses', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: false })
    r.tick(800) // -> StaggerRecovery (250 ms)
    r.tick(REACTION_TUNING.StaggerRecoveryMs)
    expect(r.state).toBe(CombatReactionState.CombatNeutral)
    expect(r.canAct).toBe(true)
  })

  it('carries overshoot across the stagger->recovery boundary (frame-accurate)', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: false }) // 800
    // One big tick past the stagger that also eats into recovery.
    r.tick(800 + 100)
    expect(r.state).toBe(CombatReactionState.StaggerRecovery)
    expect(r.remainingMs).toBeCloseTo(REACTION_TUNING.StaggerRecoveryMs - 100) // 150
  })

  it('a single tick spanning both timed phases lands back in neutral', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: false })
    r.tick(800 + REACTION_TUNING.StaggerRecoveryMs + 10)
    expect(r.state).toBe(CombatReactionState.CombatNeutral)
  })

  it('re-applying a stagger refreshes (does not stack) the timer', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: false })
    r.tick(400) // 400 ms remaining
    r.onAttackParried({ isPerfect: false })
    expect(r.remainingMs).toBe(800) // refreshed, not 400 or 1200
  })

  it('a non-positive tick is a no-op', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: false })
    r.tick(0)
    r.tick(-50)
    expect(r.remainingMs).toBe(800)
  })

  it('reset() forces a clean neutral state', () => {
    const r = new EnemyCombatReaction()
    r.onAttackParried({ isPerfect: true })
    r.reset()
    expect(r.state).toBe(CombatReactionState.CombatNeutral)
    expect(r.remainingMs).toBe(0)
    expect(r.canAct).toBe(true)
  })
})
