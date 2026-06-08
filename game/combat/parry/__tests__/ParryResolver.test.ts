/**
 * Tests for the pure parry-resolution logic.
 *
 * Covers GDD §3.1 (damage negation 1.0/0.5/0.0), §3.2/§4.4 (stamina cost +
 * boss multiplier), §2.4 (zero-stamina guard-break, AC-11), §4.1 (unparryable
 * -> fail, AC-20/21), §4.2 (non-parryable projectile, AC-23), §4.4 (boss
 * parry-resistance perfect-only) and §3.6 (perfect stagger extension).
 */

import {
  DEFAULT_PARRY_CONFIG,
  ParryConfig,
} from '../ParryConfig'
import { Outcome, ParryState } from '../ParryState'
import {
  IncomingAttack,
  resolve,
  staminaCostFor,
} from '../ParryResolver'

const cfg = (overrides: Partial<ParryConfig> = {}): ParryConfig => ({
  ...DEFAULT_PARRY_CONFIG,
  ...overrides,
})

const attack = (overrides: Partial<IncomingAttack> = {}): IncomingAttack => ({
  baseDamage: 100,
  tier: 0,
  unparryable: false,
  isProjectile: false,
  projectileParryable: false,
  bossParryResistance: false,
  ...overrides,
})

// Helper: resolve a normal melee parry in the Active window with full stamina.
const resolveActive = (
  a: Partial<IncomingAttack>,
  opts: {
    elapsedMs?: number
    stamina?: number
    kind?: 'normal' | 'boss'
    config?: ParryConfig
  } = {},
) =>
  resolve(
    attack(a),
    ParryState.Active,
    opts.elapsedMs ?? 120, // past the 60 ms perfect window by default
    opts.stamina ?? 100,
    opts.kind ?? 'normal',
    opts.config ?? cfg(),
  )

describe('resolve — damage negation (GDD §3.1)', () => {
  it('full success negates 100% of damage (1.0)', () => {
    const r = resolveActive({ baseDamage: 100 })
    expect(r.outcome).toBe(Outcome.Success)
    expect(r.damageNegation).toBe(1.0)
    expect(r.damageReceived).toBe(0)
    expect(r.nextState).toBe(ParryState.Success)
  })

  it('zero-stamina guard-break negates 50% (0.5) (AC-11)', () => {
    const r = resolveActive({ baseDamage: 100 }, { stamina: 0 })
    expect(r.outcome).toBe(Outcome.GuardBreak)
    expect(r.damageNegation).toBe(0.5)
    expect(r.damageReceived).toBe(50)
    expect(r.staminaCost).toBe(0)
    expect(r.opensCounterWindow).toBe(false)
    expect(r.attackerStaggerMs).toBe(0)
    expect(r.nextState).toBe(ParryState.Success)
  })

  it('a mistimed hit (not Active) negates 0% — full damage, PARRY_FAIL (AC-10)', () => {
    const r = resolve(
      attack({ baseDamage: 100 }),
      ParryState.Recovery,
      0,
      100,
      'normal',
      cfg(),
    )
    expect(r.outcome).toBe(Outcome.Fail)
    expect(r.damageNegation).toBe(0)
    expect(r.damageReceived).toBe(100)
    expect(r.staminaCost).toBe(0)
    expect(r.nextState).toBe(ParryState.Fail)
  })
})

describe('resolve — unparryable attacks (GDD §4.1, AC-20/21)', () => {
  it('unparryable attack deals full damage even in the active window (AC-20)', () => {
    const r = resolveActive({ baseDamage: 80, unparryable: true })
    expect(r.damageNegation).toBe(0)
    expect(r.damageReceived).toBe(80)
  })

  it('unparryable attack transitions to PARRY_FAIL, not SUCCESS (AC-21)', () => {
    const r = resolveActive({ unparryable: true })
    expect(r.outcome).toBe(Outcome.Fail)
    expect(r.nextState).toBe(ParryState.Fail)
    expect(r.staminaCost).toBe(0)
  })
})

describe('resolve — projectiles (GDD §4.2, AC-23)', () => {
  it('non-parryable projectile is ignored and deals full damage (AC-23)', () => {
    const r = resolveActive({
      baseDamage: 40,
      isProjectile: true,
      projectileParryable: false,
    })
    expect(r.outcome).toBe(Outcome.Ignored)
    expect(r.damageNegation).toBe(0)
    expect(r.damageReceived).toBe(40)
    expect(r.nextState).toBe(ParryState.Fail)
  })

  it('a parryable projectile resolves as a normal success', () => {
    const r = resolveActive({
      baseDamage: 40,
      isProjectile: true,
      projectileParryable: true,
    })
    expect(r.outcome).toBe(Outcome.Success)
    expect(r.damageReceived).toBe(0)
  })
})

describe('resolve — boss parry-resistance (GDD §4.4)', () => {
  it('non-perfect parry of a resisted boss attack negates damage but no counter/stagger', () => {
    const r = resolveActive(
      { bossParryResistance: true },
      { elapsedMs: 120, kind: 'boss' },
    )
    expect(r.outcome).toBe(Outcome.Success)
    expect(r.damageReceived).toBe(0)
    expect(r.perfect).toBe(false)
    expect(r.opensCounterWindow).toBe(false)
    expect(r.attackerStaggerMs).toBe(0)
  })

  it('perfect parry of a resisted boss attack opens the counter window', () => {
    const r = resolveActive(
      { bossParryResistance: true },
      { elapsedMs: 10, kind: 'boss' },
    )
    expect(r.perfect).toBe(true)
    expect(r.opensCounterWindow).toBe(true)
  })
})

describe('resolve — perfect stagger extension (GDD §3.6, AC-18)', () => {
  it('a perfect (non-boss) parry extends attacker stagger by the multiplier', () => {
    const c = cfg({ attackerStaggerMs: 800, perfectParryStaggerMultiplier: 1.4 })
    const r = resolveActive({}, { elapsedMs: 10, config: c })
    expect(r.perfect).toBe(true)
    expect(r.attackerStaggerMs).toBeCloseTo(800 * 1.4) // 1120
  })

  it('a non-perfect (non-boss) parry uses the base stagger duration', () => {
    const c = cfg({ attackerStaggerMs: 800 })
    const r = resolveActive({}, { elapsedMs: 120, config: c })
    expect(r.perfect).toBe(false)
    expect(r.attackerStaggerMs).toBe(800)
  })

  it('boss attackers report 0 ms standard stagger (poise handled engine-side)', () => {
    const r = resolveActive({}, { elapsedMs: 10, kind: 'boss' })
    expect(r.attackerStaggerMs).toBe(0)
  })
})

describe('staminaCostFor (GDD §3.2, §4.4, §4.2)', () => {
  it('light attack costs the flat base (tier 0)', () => {
    expect(staminaCostFor(cfg(), attack({ tier: 0 }), 'normal')).toBe(15)
  })

  it('heavy attack adds weight*tier (15 + 8*2 = 31)', () => {
    expect(staminaCostFor(cfg(), attack({ tier: 2 }), 'normal')).toBe(31)
  })

  it('boss attack multiplies cost by bossStaminaMultiplier (AC-26)', () => {
    // heavy boss: (15 + 8*2) * 1.5 = 46.5
    expect(staminaCostFor(cfg(), attack({ tier: 2 }), 'boss')).toBeCloseTo(46.5)
  })

  it('projectiles ignore tier scaling and cost the flat base only', () => {
    expect(
      staminaCostFor(
        cfg(),
        attack({ tier: 2, isProjectile: true, projectileParryable: true }),
        'normal',
      ),
    ).toBe(15)
  })

  it('successful resolve reports the matching stamina cost', () => {
    const r = resolveActive({ tier: 2 })
    expect(r.staminaCost).toBe(31)
  })
})
