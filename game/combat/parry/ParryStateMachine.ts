/**
 * Deterministic parry finite-state machine.
 *
 * Drives a single character's parry attempt through the states defined in
 * GDD §2.2, advanced purely by `tick(dtMs)` and external events
 * (`requestParry`, `onAttackContact`). It is engine-free and deterministic:
 * given the same config, the same event/tick sequence always produces the
 * same transitions, which makes it directly unit-testable.
 *
 * Durations are converted from the frame-based knobs (startup / recovery) via
 * {@link MS_PER_FRAME}; everything else is already in milliseconds.
 *
 * @see design/gdd/melee-parry-system.md §2.2, §2.3, §3.3, §3.4, §3.6
 */

import {
  MS_PER_FRAME,
  ParryConfig,
} from './ParryConfig'
import { ParryState, ParryTransition } from './ParryState'
import { ParryResolution } from './ParryResolver'
import { effectiveWindowMs } from './ParryWindow'

/** Outcome of a {@link ParryStateMachine.requestParry} call. */
export interface RequestResult {
  /** True if the request started a parry (entered STARTUP) or was buffered. */
  readonly accepted: boolean
  /** Why the request was accepted/rejected (e.g. "cooldown", "busy", "buffered"). */
  readonly reason: string
}

/** Inclusive set of states in which a fresh parry request may be initiated. */
const REQUESTABLE_FROM: ReadonlySet<ParryState> = new Set([ParryState.Idle])

/**
 * A single character's parry FSM.
 *
 * The machine owns only timing/cooldown/buffer bookkeeping; damage and stamina
 * consequences are computed by {@link ParryResolution} (see `ParryResolver`)
 * and handed in via {@link ParryStateMachine.onAttackContact}.
 */
export class ParryStateMachine {
  private state: ParryState = ParryState.Idle

  /** Milliseconds remaining in the current timed phase (startup/active/recovery/counter). */
  private phaseRemainingMs = 0

  /** Milliseconds elapsed since PARRY_ACTIVE began; -1 when not active. GDD §3.6. */
  private activeElapsedMs = -1

  /** Cooldown remaining before another parry may start (GDD §3.4). */
  private cooldownRemainingMs = 0

  /** Buffered-press timer: > 0 means a press is queued for STARTUP entry (GDD §2.1). */
  private bufferRemainingMs = 0

  /** Last transition performed, for inspection/logging. */
  private lastTransition: ParryTransition | null = null

  /** Pre-resolved effective active-window length for the current attempt (GDD §3.3). */
  private windowMs: number

  constructor(
    private readonly config: ParryConfig,
    private readonly characterLevel = 1,
    private readonly windowBonusPerLevel = 0,
  ) {
    this.windowMs = effectiveWindowMs(config, characterLevel, windowBonusPerLevel)
  }

  /** Current FSM state. */
  getState(): ParryState {
    return this.state
  }

  /** Remaining cooldown in ms (0 when ready). GDD §3.4. */
  getCooldownRemainingMs(): number {
    return this.cooldownRemainingMs
  }

  /** The most recent transition, or null if none has occurred. */
  getLastTransition(): ParryTransition | null {
    return this.lastTransition
  }

  /** True when the parry hitbox should be live (state === Active). GDD §2.3. */
  isHitboxActive(): boolean {
    return this.state === ParryState.Active
  }

  /** Milliseconds since PARRY_ACTIVE began, or -1 when not active. */
  getActiveElapsedMs(): number {
    return this.activeElapsedMs
  }

  private transition(to: ParryState, reason: string): void {
    this.lastTransition = { from: this.state, to, reason }
    this.state = to
  }

  /**
   * Request a parry (player pressed the parry input).
   *
   * Gating, in order (GDD §2.2, §3.4, §2.1):
   * - If a parry is already in flight (not Idle), the press is ignored unless
   *   it can be buffered ahead of a soon-to-open window — see below.
   * - If on cooldown, the input is consumed but no state is entered; no stamina
   *   is spent (GDD §3.4, AC-05).
   * - From Idle and off cooldown, the machine enters STARTUP immediately.
   *
   * Input buffering (GDD §2.1 / §5.2): a press while still in RECOVERY within
   * `inputBufferMs` of becoming Idle is stored and consumed on the Idle
   * transition. Buffering is deliberately NOT honored while crowd-controlled —
   * that gating lives in the engine adapter (GDD §4.7), which simply won't call
   * `requestParry` in those states.
   *
   * @returns A {@link RequestResult} describing acceptance.
   */
  requestParry(): RequestResult {
    // Cooldown blocks new attempts; the press is consumed silently (GDD §3.4).
    if (this.cooldownRemainingMs > 0) {
      return { accepted: false, reason: 'cooldown' }
    }

    if (REQUESTABLE_FROM.has(this.state)) {
      this.beginStartup()
      return { accepted: true, reason: 'started' }
    }

    // Late in RECOVERY: buffer the press so it fires the instant we reach Idle
    // (GDD §2.1 pre-buffer, AC-03).
    if (
      this.state === ParryState.Recovery &&
      this.phaseRemainingMs <= this.config.inputBufferMs
    ) {
      this.bufferRemainingMs = this.config.inputBufferMs
      return { accepted: true, reason: 'buffered' }
    }

    return { accepted: false, reason: 'busy' }
  }

  private beginStartup(): void {
    this.windowMs = effectiveWindowMs(
      this.config,
      this.characterLevel,
      this.windowBonusPerLevel,
    )
    this.phaseRemainingMs = this.config.parryStartupFrames * MS_PER_FRAME
    this.activeElapsedMs = -1
    this.bufferRemainingMs = 0
    this.transition(ParryState.Startup, 'parry-requested')
  }

  /**
   * Apply an attack-contact resolution from the resolver.
   *
   * Only meaningful while the relevant phase is live. On a success/guard-break
   * resolution the machine enters SUCCESS and then (if a counter window opens)
   * COUNTER_WINDOW; otherwise it routes to FAIL. In all cases the cooldown
   * begins, since "a parry was attempted" (GDD §3.4).
   *
   * The caller is responsible for computing the {@link ParryResolution} (via
   * the resolver) using {@link getState} and {@link getActiveElapsedMs}, then
   * applying its damage/stamina effects to engine systems.
   *
   * @param resolution The resolver output for this contact.
   */
  onAttackContact(resolution: ParryResolution): void {
    if (resolution.nextState === ParryState.Success) {
      this.transition(ParryState.Success, 'attack-deflected')
      if (resolution.opensCounterWindow) {
        this.phaseRemainingMs = this.config.counterWindowMs
        this.transition(ParryState.CounterWindow, 'counter-window-open')
      } else {
        // Guard-break / boss-resist: success with no counter window → settle to Idle.
        this.phaseRemainingMs = 0
        this.toIdleWithCooldown('success-no-counter')
        return
      }
    } else {
      this.transition(ParryState.Fail, 'attack-not-deflected')
      this.toIdleWithCooldown('fail-resolved')
      return
    }
    // Counter window now running; cooldown starts as soon as the attempt ended.
    this.startCooldown()
  }

  private startCooldown(): void {
    this.cooldownRemainingMs = this.config.parryCooldownMs
  }

  private toIdleWithCooldown(reason: string): void {
    this.startCooldown()
    this.activeElapsedMs = -1
    this.phaseRemainingMs = 0
    this.transition(ParryState.Idle, reason)
  }

  /**
   * Advance the machine by `dtMs` milliseconds.
   *
   * Drives all timed transitions deterministically (GDD §2.2):
   * STARTUP → ACTIVE → RECOVERY → IDLE, plus COUNTER_WINDOW → IDLE, while
   * decrementing the cooldown (GDD §3.4) and any buffered input (GDD §2.1).
   *
   * Contact-driven transitions (SUCCESS/FAIL) are NOT produced here; they
   * arrive via {@link onAttackContact}.
   *
   * @param dtMs Elapsed time since the last tick (>= 0).
   */
  tick(dtMs: number): void {
    if (dtMs < 0) return

    // Cooldown counts down independently of the active phase (GDD §3.4).
    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - dtMs)
    }

    switch (this.state) {
      case ParryState.Startup:
        this.phaseRemainingMs -= dtMs
        if (this.phaseRemainingMs <= 0) {
          this.enterActive()
        }
        break

      case ParryState.Active:
        this.activeElapsedMs += dtMs
        this.phaseRemainingMs -= dtMs
        if (this.phaseRemainingMs <= 0) {
          // Window expired with no contact → RECOVERY (GDD §2.2 miss edge).
          this.enterRecovery()
        }
        break

      case ParryState.Recovery:
        this.phaseRemainingMs -= dtMs
        if (this.phaseRemainingMs <= 0) {
          this.exitRecovery()
        }
        break

      case ParryState.CounterWindow:
        this.phaseRemainingMs -= dtMs
        if (this.phaseRemainingMs <= 0) {
          // Counter window expired without an attack → IDLE (GDD §2.2, AC-13).
          this.transition(ParryState.Idle, 'counter-window-expired')
        }
        break

      case ParryState.Idle:
      case ParryState.Success:
      case ParryState.Fail:
        // Terminal/quiescent for tick purposes; transitions are event-driven.
        break
    }

    // Buffered press ages out independently of state (GDD §2.1).
    if (this.bufferRemainingMs > 0 && this.state !== ParryState.Idle) {
      this.bufferRemainingMs = Math.max(0, this.bufferRemainingMs - dtMs)
    }
  }

  private enterActive(): void {
    this.phaseRemainingMs = this.windowMs
    this.activeElapsedMs = 0
    this.transition(ParryState.Active, 'startup-complete')
  }

  private enterRecovery(): void {
    this.activeElapsedMs = -1
    this.phaseRemainingMs = this.config.parryRecoveryFrames * MS_PER_FRAME
    this.transition(ParryState.Recovery, 'window-expired')
  }

  private exitRecovery(): void {
    // Recovery ended; cooldown begins now (GDD §3.4 — "begins when RECOVERY ends").
    this.startCooldown()
    this.transition(ParryState.Idle, 'recovery-complete')

    // Consume a buffered early press, starting the next attempt immediately,
    // provided we are not still gated by the just-started cooldown.
    if (this.bufferRemainingMs > 0 && this.cooldownRemainingMs <= 0) {
      this.bufferRemainingMs = 0
      this.beginStartup()
    } else {
      this.bufferRemainingMs = 0
    }
  }
}
