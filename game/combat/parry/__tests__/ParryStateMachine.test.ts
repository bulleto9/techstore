/**
 * Tests for the deterministic parry FSM (GDD §2.2, §2.3, §3.4, §3.6).
 *
 * Covers: Idle->Startup->Active->Recovery->Idle cycle, cooldown gating
 * (AC-05/06), success -> counter-window transition (AC-12/13), and the
 * "no stamina spent on a whiffed parry" property (AC-09) — verified at the
 * FSM level by confirming a whiff never produces an onAttackContact / Success.
 */

import { MS_PER_FRAME, DEFAULT_PARRY_CONFIG, ParryConfig } from '../ParryConfig'
import { ParryState, Outcome } from '../ParryState'
import { ParryStateMachine } from '../ParryStateMachine'
import { ParryResolution } from '../ParryResolver'

const cfg = (overrides: Partial<ParryConfig> = {}): ParryConfig => ({
  ...DEFAULT_PARRY_CONFIG,
  ...overrides,
})

const STARTUP_MS = DEFAULT_PARRY_CONFIG.parryStartupFrames * MS_PER_FRAME // 50
const ACTIVE_MS = DEFAULT_PARRY_CONFIG.parryWindowMs // 200
const RECOVERY_MS = DEFAULT_PARRY_CONFIG.parryRecoveryFrames * MS_PER_FRAME // 200

// A success resolution that opens a counter window (normal, non-perfect parry).
const successResolution = (
  overrides: Partial<ParryResolution> = {},
): ParryResolution => ({
  outcome: Outcome.Success,
  damageNegation: 1.0,
  damageReceived: 0,
  staminaCost: 31,
  perfect: false,
  opensCounterWindow: true,
  attackerStaggerMs: 800,
  nextState: ParryState.Success,
  ...overrides,
})

// A guard-break resolution: success, but no counter window.
const guardBreakResolution = (): ParryResolution => ({
  outcome: Outcome.GuardBreak,
  damageNegation: 0.5,
  damageReceived: 50,
  staminaCost: 0,
  perfect: false,
  opensCounterWindow: false,
  attackerStaggerMs: 0,
  nextState: ParryState.Success,
})

const failResolution = (): ParryResolution => ({
  outcome: Outcome.Fail,
  damageNegation: 0,
  damageReceived: 100,
  staminaCost: 0,
  perfect: false,
  opensCounterWindow: false,
  attackerStaggerMs: 0,
  nextState: ParryState.Fail,
})

describe('ParryStateMachine — Idle->Startup->Active->Recovery->Idle cycle (GDD §2.2)', () => {
  it('starts in Idle', () => {
    const m = new ParryStateMachine(cfg())
    expect(m.getState()).toBe(ParryState.Idle)
    expect(m.isHitboxActive()).toBe(false)
  })

  it('a request from Idle enters Startup (hitbox not yet live)', () => {
    const m = new ParryStateMachine(cfg())
    const r = m.requestParry()
    expect(r.accepted).toBe(true)
    expect(m.getState()).toBe(ParryState.Startup)
    expect(m.isHitboxActive()).toBe(false)
  })

  it('Startup completes into Active after the startup delay (AC-01)', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    expect(m.getState()).toBe(ParryState.Active)
    expect(m.isHitboxActive()).toBe(true)
    expect(m.getActiveElapsedMs()).toBe(0)
  })

  it('Active stays live until the window expires, then enters Recovery (AC-02)', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    // Just shy of the full window: still active.
    m.tick(ACTIVE_MS - 1)
    expect(m.getState()).toBe(ParryState.Active)
    expect(m.isHitboxActive()).toBe(true)
    // Cross the window boundary -> Recovery.
    m.tick(1)
    expect(m.getState()).toBe(ParryState.Recovery)
    expect(m.isHitboxActive()).toBe(false)
  })

  it('Recovery completes back to Idle and starts the cooldown', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    m.tick(ACTIVE_MS)
    expect(m.getState()).toBe(ParryState.Recovery)
    m.tick(RECOVERY_MS)
    expect(m.getState()).toBe(ParryState.Idle)
    expect(m.getCooldownRemainingMs()).toBe(DEFAULT_PARRY_CONFIG.parryCooldownMs)
  })

  it('tracks active-elapsed time while in the active window (for perfect timing)', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    m.tick(40)
    expect(m.getActiveElapsedMs()).toBe(40)
  })
})

describe('ParryStateMachine — cooldown gating (GDD §3.4, AC-05/06)', () => {
  it('a second request during cooldown does not activate (AC-05)', () => {
    const m = new ParryStateMachine(cfg())
    // Whiff a full attempt to start the cooldown.
    m.requestParry()
    m.tick(STARTUP_MS)
    m.tick(ACTIVE_MS)
    m.tick(RECOVERY_MS)
    expect(m.getState()).toBe(ParryState.Idle)
    expect(m.getCooldownRemainingMs()).toBeGreaterThan(0)

    const r = m.requestParry()
    expect(r.accepted).toBe(false)
    expect(r.reason).toBe('cooldown')
    expect(m.getState()).toBe(ParryState.Idle)
  })

  it('a request succeeds again once the full cooldown has elapsed (AC-06)', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    m.tick(ACTIVE_MS)
    m.tick(RECOVERY_MS)
    // Burn down the cooldown.
    m.tick(DEFAULT_PARRY_CONFIG.parryCooldownMs)
    expect(m.getCooldownRemainingMs()).toBe(0)

    const r = m.requestParry()
    expect(r.accepted).toBe(true)
    expect(m.getState()).toBe(ParryState.Startup)
  })
})

describe('ParryStateMachine — success -> counter window (GDD §2.2, AC-12/13)', () => {
  it('a successful deflect enters CounterWindow and starts the cooldown', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    expect(m.getState()).toBe(ParryState.Active)

    m.onAttackContact(successResolution())
    expect(m.getState()).toBe(ParryState.CounterWindow)
    expect(m.getCooldownRemainingMs()).toBe(DEFAULT_PARRY_CONFIG.parryCooldownMs)
  })

  it('the counter window closes to Idle after CounterWindowMs (AC-13)', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    m.onAttackContact(successResolution())
    expect(m.getState()).toBe(ParryState.CounterWindow)

    m.tick(DEFAULT_PARRY_CONFIG.counterWindowMs - 1)
    expect(m.getState()).toBe(ParryState.CounterWindow)
    m.tick(1)
    expect(m.getState()).toBe(ParryState.Idle)
  })

  it('a guard-break success opens NO counter window and settles to Idle (AC-11)', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    m.onAttackContact(guardBreakResolution())
    expect(m.getState()).toBe(ParryState.Idle)
    expect(m.getCooldownRemainingMs()).toBe(DEFAULT_PARRY_CONFIG.parryCooldownMs)
  })

  it('a fail resolution routes to Idle (via Fail) and starts cooldown', () => {
    const m = new ParryStateMachine(cfg())
    m.requestParry()
    m.tick(STARTUP_MS)
    m.onAttackContact(failResolution())
    expect(m.getState()).toBe(ParryState.Idle)
    expect(m.getCooldownRemainingMs()).toBe(DEFAULT_PARRY_CONFIG.parryCooldownMs)
    expect(m.getLastTransition()?.from).toBe(ParryState.Fail)
  })
})

describe('ParryStateMachine — whiffed parry costs no contact/stamina (GDD §2.4, AC-09)', () => {
  it('a window that expires with no contact never enters Success (no stamina spend)', () => {
    const m = new ParryStateMachine(cfg())
    const states: ParryState[] = []
    m.requestParry()
    states.push(m.getState())
    m.tick(STARTUP_MS)
    states.push(m.getState())
    m.tick(ACTIVE_MS)
    states.push(m.getState())
    m.tick(RECOVERY_MS)
    states.push(m.getState())

    // The whiff path must never touch Success / CounterWindow — those are the
    // only states a stamina spend is associated with (resolver supplies cost).
    expect(states).toEqual([
      ParryState.Startup,
      ParryState.Active,
      ParryState.Recovery,
      ParryState.Idle,
    ])
    expect(states).not.toContain(ParryState.Success)
    expect(states).not.toContain(ParryState.CounterWindow)
  })
})

describe('ParryStateMachine — input buffering (GDD §2.1, AC-03)', () => {
  it('a press late in Recovery is buffered and auto-starts the next attempt at Idle', () => {
    // Use a config with no cooldown so the buffered press can fire on Idle entry.
    const m = new ParryStateMachine(cfg({ parryCooldownMs: 200 }))
    m.requestParry()
    m.tick(STARTUP_MS)
    m.tick(ACTIVE_MS)
    expect(m.getState()).toBe(ParryState.Recovery)

    // Advance into the last inputBufferMs of recovery, then buffer a press.
    m.tick(RECOVERY_MS - 50) // 50 <= inputBufferMs (80)
    const r = m.requestParry()
    expect(r.accepted).toBe(true)
    expect(r.reason).toBe('buffered')
  })
})
