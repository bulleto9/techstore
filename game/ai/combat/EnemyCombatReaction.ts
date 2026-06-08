/**
 * EnemyCombatReaction
 * ===================
 *
 * AI-side reaction FSM for a (non-boss) enemy that has just had one of its
 * melee attacks parried by the player.
 *
 * Design references (see `design/gdd/melee-parry-system.md`):
 *  - §2.5 Attacker Stagger: a successfully parried attacker enters STAGGER for
 *    `AttackerStaggerMs` (default 800 ms). During stagger it cannot attack,
 *    block, or dodge. Bosses use a separate poise system (see
 *    {@link PoiseBreakComponent}) and are NOT driven by this FSM.
 *  - §3.6 Perfect Parry: a perfect parry multiplies stagger duration by
 *    `PerfectParryStaggerMultiplier` (default 1.4).
 *
 * This module owns the pure timing/state logic. The behaviour-tree / animation
 * glue that actually freezes the actor is intentionally kept thin and lives at
 * the call sites that observe {@link EnemyCombatReaction.state}.
 */

/** Tuning constants sourced directly from GDD §6 (Tuning Knobs). */
export const REACTION_TUNING = {
  /** §2.5 / §6 — base stagger duration after a successful parry. */
  AttackerStaggerMs: 800,
  /** §3.6 / §6 — multiplies stagger duration on a perfect parry. */
  PerfectParryStaggerMultiplier: 1.4,
  /**
   * Duration of the brief recovery/"wind-down" tail after stagger expires,
   * during which the enemy is animating back to a neutral guard but is not yet
   * fully combat-ready. Not a GDD knob; a small ergonomic default so the AI
   * does not snap instantly from STAGGER back into offence.
   */
  StaggerRecoveryMs: 250,
} as const;

/** Reaction FSM states. */
export enum CombatReactionState {
  /** Default combat-ready state; enemy may attack/block/dodge. */
  CombatNeutral = 'CombatNeutral',
  /** §2.5 — parried; cannot attack, block, or dodge. */
  Staggered = 'Staggered',
  /** Post-stagger wind-down before returning to {@link CombatReactionState.CombatNeutral}. */
  StaggerRecovery = 'StaggerRecovery',
}

/** Payload describing the parry event that triggered the reaction. */
export interface AttackParriedEvent {
  /** True when the player landed a perfect parry (GDD §3.6). */
  isPerfect: boolean;
}

/** Optional overrides for the reaction tuning (e.g. per-archetype data asset). */
export interface EnemyCombatReactionOptions {
  attackerStaggerMs?: number;
  perfectParryStaggerMultiplier?: number;
  staggerRecoveryMs?: number;
}

export class EnemyCombatReaction {
  private _state: CombatReactionState = CombatReactionState.CombatNeutral;

  /** Milliseconds remaining in the current timed state (0 when untimed). */
  private _stateTimerMs = 0;

  private readonly attackerStaggerMs: number;
  private readonly perfectParryStaggerMultiplier: number;
  private readonly staggerRecoveryMs: number;

  public constructor(options: EnemyCombatReactionOptions = {}) {
    this.attackerStaggerMs =
      options.attackerStaggerMs ?? REACTION_TUNING.AttackerStaggerMs;
    this.perfectParryStaggerMultiplier =
      options.perfectParryStaggerMultiplier ??
      REACTION_TUNING.PerfectParryStaggerMultiplier;
    this.staggerRecoveryMs =
      options.staggerRecoveryMs ?? REACTION_TUNING.StaggerRecoveryMs;
  }

  /**
   * Current reaction state.
   *
   * GDD §2.5 — behaviour-tree nodes should gate attack/block/dodge actions on
   * {@link canAct} rather than reading this directly where possible.
   */
  public get state(): CombatReactionState {
    return this._state;
  }

  /** Milliseconds remaining in the current timed state (>= 0). */
  public get remainingMs(): number {
    return this._stateTimerMs;
  }

  /**
   * Whether the enemy may currently attack, block, or dodge.
   *
   * GDD §2.5 — a staggered attacker can do none of these. Recovery is also
   * treated as non-actionable so the enemy finishes its wind-down animation
   * before resuming offence.
   */
  public get canAct(): boolean {
    return this._state === CombatReactionState.CombatNeutral;
  }

  /**
   * React to one of this enemy's attacks being parried.
   *
   * GDD §2.5 — enters {@link CombatReactionState.Staggered} for
   * `AttackerStaggerMs`. GDD §3.6 — on a perfect parry the duration is scaled
   * by `PerfectParryStaggerMultiplier`.
   *
   * Re-applying a stagger while already staggered refreshes (resets) the timer
   * to the new full duration rather than stacking.
   *
   * @param event Parry details (perfect or not).
   * @returns The stagger duration (ms) that was applied.
   */
  public onAttackParried(event: AttackParriedEvent): number {
    const durationMs = this.computeStaggerMs(event.isPerfect);
    this._state = CombatReactionState.Staggered;
    this._stateTimerMs = durationMs;
    return durationMs;
  }

  /**
   * Compute the stagger duration for a parry without mutating state.
   *
   * GDD §2.5 + §3.6.
   *
   * @param isPerfect Whether the triggering parry was perfect.
   */
  public computeStaggerMs(isPerfect: boolean): number {
    return isPerfect
      ? this.attackerStaggerMs * this.perfectParryStaggerMultiplier
      : this.attackerStaggerMs;
  }

  /**
   * Advance the FSM by `dtMs` milliseconds.
   *
   * GDD §2.5 — drives the Staggered → StaggerRecovery → CombatNeutral
   * progression as timers elapse. Safe to call every frame; a non-positive
   * `dtMs` is a no-op.
   *
   * @param dtMs Elapsed time since the previous tick, in milliseconds.
   */
  public tick(dtMs: number): void {
    if (dtMs <= 0) {
      return;
    }
    if (this._state === CombatReactionState.CombatNeutral) {
      return;
    }

    this._stateTimerMs -= dtMs;
    if (this._stateTimerMs > 0) {
      return;
    }

    // Carry any overshoot into the next state so timing stays frame-accurate.
    const overshootMs = -this._stateTimerMs;

    if (this._state === CombatReactionState.Staggered) {
      this._state = CombatReactionState.StaggerRecovery;
      this._stateTimerMs = this.staggerRecoveryMs;
      this.tick(overshootMs);
      return;
    }

    // StaggerRecovery elapsed → back to neutral.
    this._state = CombatReactionState.CombatNeutral;
    this._stateTimerMs = 0;
  }

  /**
   * Force the FSM back to a clean neutral state.
   *
   * Useful on enemy death/despawn, encounter reset, or teleport so a stale
   * stagger timer does not leak across lifecycles.
   */
  public reset(): void {
    this._state = CombatReactionState.CombatNeutral;
    this._stateTimerMs = 0;
  }
}
