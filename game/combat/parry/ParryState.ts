/**
 * Parry finite-state-machine states and shared result types.
 *
 * Mirrors the state diagram in GDD §2.2 "State Machine" and the summary
 * table in §2.3. This module is pure data/types — no engine dependencies.
 *
 * @see design/gdd/melee-parry-system.md §2.2, §2.3
 */

/**
 * The discrete states a parry attempt can occupy.
 *
 * Naming follows the GDD diagram (§2.2) but uses PascalCase enum members:
 * - {@link ParryState.Idle}          — no parry in progress (GDD `IDLE`).
 * - {@link ParryState.Startup}       — input received, hitbox not yet active (`PARRY_STARTUP`).
 * - {@link ParryState.Active}        — parry hitbox live, can deflect (`PARRY_ACTIVE`).
 * - {@link ParryState.Recovery}      — window expired with no contact (`PARRY_RECOVERY`).
 * - {@link ParryState.Success}       — an attack was deflected (`PARRY_SUCCESS`).
 * - {@link ParryState.CounterWindow} — post-success counter opportunity (`COUNTER_WINDOW`).
 * - {@link ParryState.Fail}          — mistimed / unparryable contact (`PARRY_FAIL`).
 */
export enum ParryState {
  Idle = 'Idle',
  Startup = 'Startup',
  Active = 'Active',
  Recovery = 'Recovery',
  Success = 'Success',
  CounterWindow = 'CounterWindow',
  Fail = 'Fail',
}

/**
 * The semantic outcome of a parry resolution against an incoming attack.
 *
 * @see design/gdd/melee-parry-system.md §3.1, §2.4, §4.1
 */
export enum Outcome {
  /** Full successful parry with sufficient stamina (100% negation). GDD §3.1. */
  Success = 'Success',
  /** Successful parry at zero stamina: 50% negation, no counter window. GDD §2.4. */
  GuardBreak = 'GuardBreak',
  /** Mistimed or unparryable contact: full damage, transitions to Fail. GDD §2.2, §4.1. */
  Fail = 'Fail',
  /** Contact that the parry hitbox does not interact with (e.g. magic bolt). GDD §4.2. */
  Ignored = 'Ignored',
}

/**
 * A single, validated state transition the FSM may perform.
 *
 * Used to describe and (optionally) log legal edges of the machine defined
 * in GDD §2.2. The FSM enforces that only declared transitions occur.
 */
export interface ParryTransition {
  /** State the machine is leaving. */
  readonly from: ParryState
  /** State the machine is entering. */
  readonly to: ParryState
  /** Human-readable reason / trigger label (e.g. "startup-complete"). */
  readonly reason: string
}
