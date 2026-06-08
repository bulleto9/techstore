/**
 * Tests for the EnemyParryReactable routing layer (GDD §2.5, §3.6, §4.1, §4.4).
 *
 * Covers: boss-vs-non-boss routing (stagger vs poise / AC-27), unparryable +
 * boss-ultimate detection (AC-20/21/28), boss parry-resistance perfect-only
 * reward (§4.4), and the proposed unparryable rate-limit.
 */

import { CombatReactionState } from '../EnemyCombatReaction'
import { PoiseState, POISE_TUNING } from '../PoiseBreakComponent'
import {
  EnemyParryReactable,
  PROPOSED_UNPARRYABLE_MIN_INTERVAL_MS,
} from '../ParryReactable'

describe('EnemyParryReactable — unparryable detection (GDD §4.1, §4.4)', () => {
  it('reports an explicitly-unparryable attack (AC-20/21)', () => {
    const e = new EnemyParryReactable()
    e.setIncomingAttack({ isUnparryable: true })
    expect(e.isAttackUnparryable()).toBe(true)
  })

  it('treats a boss ultimate as unparryable regardless of the explicit flag (AC-28)', () => {
    const e = new EnemyParryReactable({ isBoss: true })
    e.setIncomingAttack({ isBossUltimate: true })
    expect(e.isAttackUnparryable()).toBe(true)
  })

  it('a plain attack is parryable', () => {
    const e = new EnemyParryReactable()
    e.setIncomingAttack({})
    expect(e.isAttackUnparryable()).toBe(false)
  })
})

describe('EnemyParryReactable — non-boss routing (GDD §2.5)', () => {
  it('a non-boss parry applies standard stagger and no poise', () => {
    const e = new EnemyParryReactable({ isBoss: false })
    const staggerMs = e.applyStagger(false)
    expect(staggerMs).toBe(800)
    expect(e.reaction.state).toBe(CombatReactionState.Staggered)

    const poise = e.applyPoiseDamage(POISE_TUNING.ParryPoiseBreakValue, false)
    expect(poise.applied).toBe(0) // poise is a no-op for non-bosses
  })

  it('resolveParry on a non-boss rewards stagger and no poise', () => {
    const e = new EnemyParryReactable({ isBoss: false })
    const res = e.resolveParry(false)
    expect(res.rewarded).toBe(true)
    expect(res.staggerMs).toBe(800)
    expect(res.poise).toBeNull()
  })
})

describe('EnemyParryReactable — boss routing & poise (GDD §4.4, AC-27)', () => {
  it('a boss does NOT enter standard stagger (applyStagger is a no-op)', () => {
    const e = new EnemyParryReactable({ isBoss: true })
    expect(e.applyStagger(false)).toBe(0)
    expect(e.reaction.state).toBe(CombatReactionState.CombatNeutral)
  })

  it('resolveParry on a boss feeds the poise meter instead of stagger', () => {
    const e = new EnemyParryReactable({ isBoss: true })
    const res = e.resolveParry(false)
    expect(res.rewarded).toBe(true)
    expect(res.staggerMs).toBe(0)
    expect(res.poise).not.toBeNull()
    expect(res.poise?.applied).toBe(POISE_TUNING.ParryPoiseBreakValue)
    expect(e.poise.currentPoise).toBe(25)
  })

  it('four clean boss parries break poise into the VULNERABLE phase', () => {
    const e = new EnemyParryReactable({ isBoss: true })
    e.resolveParry(false)
    e.resolveParry(false)
    e.resolveParry(false)
    const last = e.resolveParry(false)
    expect(last.poise?.justBroke).toBe(true)
    expect(e.poise.state).toBe(PoiseState.Broken)
  })

  it('resetMeter clears boss poise on a phase transition', () => {
    const e = new EnemyParryReactable({ isBoss: true })
    e.resolveParry(false)
    e.resolveParry(false)
    expect(e.poise.currentPoise).toBe(50)
    e.resetMeter()
    expect(e.poise.currentPoise).toBe(0)
    expect(e.poise.state).toBe(PoiseState.Building)
  })
})

describe('EnemyParryReactable — boss parry-resistance, perfect-only (GDD §4.4)', () => {
  it('a non-perfect parry of a parry-resistant attack is NOT rewarded', () => {
    const e = new EnemyParryReactable({ isBoss: true })
    e.setIncomingAttack({ hasParryResistance: true })
    const res = e.resolveParry(false)
    expect(res.rewarded).toBe(false)
    expect(res.staggerMs).toBe(0)
    expect(res.poise).toBeNull()
    // No poise was applied on the unrewarded resolve.
    expect(e.poise.currentPoise).toBe(0)
  })

  it('a perfect parry of a parry-resistant attack IS rewarded with poise', () => {
    const e = new EnemyParryReactable({ isBoss: true })
    e.setIncomingAttack({ hasParryResistance: true })
    const res = e.resolveParry(true)
    expect(res.rewarded).toBe(true)
    expect(res.poise).not.toBeNull()
    expect(e.poise.currentPoise).toBeCloseTo(25 * 1.4)
  })
})

describe('EnemyParryReactable — proposed unparryable rate-limit (GDD §4.1)', () => {
  it('allows the first unparryable attack immediately', () => {
    const e = new EnemyParryReactable()
    expect(e.canLaunchUnparryable()).toBe(true)
  })

  it('blocks a second unparryable within the min interval, then allows it after', () => {
    const e = new EnemyParryReactable()
    e.notifyUnparryableLaunched()
    expect(e.canLaunchUnparryable()).toBe(false)
    e.tick(PROPOSED_UNPARRYABLE_MIN_INTERVAL_MS - 1)
    expect(e.canLaunchUnparryable()).toBe(false)
    e.tick(1)
    expect(e.canLaunchUnparryable()).toBe(true)
  })
})
