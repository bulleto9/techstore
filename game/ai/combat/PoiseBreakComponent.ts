/**
 * PoiseBreakComponent
 * ===================
 *
 * Boss-specific replacement for the standard attacker stagger. Bosses do NOT
 * enter the normal STAGGER state (GDD §2.5); instead each successful parry
 * builds a Poise Break Meter. When the meter fills, the boss enters a
 * VULNERABLE phase distinct from standard stagger.
 *
 * Design references (see `design/gdd/melee-parry-system.md`):
 *  - §4.4 Boss Attacks:
 *      * Successful parry increments the Poise Break Meter by
 *        `ParryPoiseBreakValue` (default 25).
 *      * When the meter fills, the boss enters a VULNERABLE phase.
 *      * The meter resets at the start of each boss phase.
 *  - §3.6 Perfect Parry: perfect parries are weightier; we apply the same
 *    `PerfectParryStaggerMultiplier` (default 1.4) to poise damage so perfect
 *    timing breaks poise faster. (The GDD spells this multiplier out for
 *    stagger duration; reusing it for poise damage keeps boss/non-boss reward
 *    parity. Flagged as an interpretation, not a literal GDD number.)
 */

/** Tuning constants sourced from GDD §6 (Tuning Knobs). */
export const POISE_TUNING = {
  /** §4.4 / §6 — poise meter increment per successful boss parry. */
  ParryPoiseBreakValue: 25,
  /** §3.6 / §6 — reused to weight perfect-parry poise damage (see file note). */
  PerfectParryStaggerMultiplier: 1.4,
  /**
   * §4.4 — total poise required to break. Not an explicit GDD knob; chosen so
   * a non-boss-resistant fight breaks in 4 clean parries
   * (4 × ParryPoiseBreakValue = 100). Exposed as a tuning value.
   */
  MaxPoise: 100,
  /**
   * Duration of the VULNERABLE phase once broken, in ms. Not an explicit GDD
   * knob; sensible default for a punish window.
   */
  VulnerableDurationMs: 4000,
  /**
   * Optional passive poise regeneration while Building, in poise-per-second.
   * Defaults to 0 (no decay) to match the GDD, which only specifies increments
   * and phase resets. Exposed so designers can opt into decay.
   */
  PoiseDecayPerSecond: 0,
} as const;

/** Boss poise break state machine (GDD §4.4). */
export enum PoiseState {
  /** Accumulating poise damage; boss acts normally. */
  Building = 'Building',
  /** Meter filled; boss is in the VULNERABLE phase. */
  Broken = 'Broken',
  /** Vulnerable window elapsed; boss is standing back up. */
  Recovering = 'Recovering',
}

/** Optional overrides (e.g. per-boss data asset). */
export interface PoiseBreakOptions {
  maxPoise?: number;
  parryPoiseBreakValue?: number;
  perfectParryStaggerMultiplier?: number;
  vulnerableDurationMs?: number;
  /** Poise regenerated per second while Building (0 = no decay). */
  poiseDecayPerSecond?: number;
  /**
   * Duration of the Recovering tail before returning to Building, in ms.
   * Defaults to 0 (instant return to Building) to match GDD minimalism.
   */
  recoveryDurationMs?: number;
}

/** Result of applying poise damage, for callers that drive FX / counter logic. */
export interface PoiseDamageResult {
  /** Poise damage actually applied (after the perfect multiplier). */
  applied: number;
  /** True if this hit transitioned the boss into the Broken (vulnerable) state. */
  justBroke: boolean;
  /** State after the hit was applied. */
  state: PoiseState;
}

export class PoiseBreakComponent {
  public readonly maxPoise: number;

  private _currentPoise = 0;
  private _state: PoiseState = PoiseState.Building;
  /** Ms remaining in the current timed (Broken / Recovering) state. */
  private _stateTimerMs = 0;

  private readonly parryPoiseBreakValue: number;
  private readonly perfectParryStaggerMultiplier: number;
  private readonly vulnerableDurationMs: number;
  private readonly poiseDecayPerSecond: number;
  private readonly recoveryDurationMs: number;

  public constructor(options: PoiseBreakOptions = {}) {
    this.maxPoise = options.maxPoise ?? POISE_TUNING.MaxPoise;
    this.parryPoiseBreakValue =
      options.parryPoiseBreakValue ?? POISE_TUNING.ParryPoiseBreakValue;
    this.perfectParryStaggerMultiplier =
      options.perfectParryStaggerMultiplier ??
      POISE_TUNING.PerfectParryStaggerMultiplier;
    this.vulnerableDurationMs =
      options.vulnerableDurationMs ?? POISE_TUNING.VulnerableDurationMs;
    this.poiseDecayPerSecond =
      options.poiseDecayPerSecond ?? POISE_TUNING.PoiseDecayPerSecond;
    this.recoveryDurationMs = options.recoveryDurationMs ?? 0;
  }

  /** Current poise value (0 .. maxPoise). */
  public get currentPoise(): number {
    return this._currentPoise;
  }

  /** Current poise state (GDD §4.4). */
  public get state(): PoiseState {
    return this._state;
  }

  /** True while the boss is in the VULNERABLE phase. */
  public get isVulnerable(): boolean {
    return this._state === PoiseState.Broken;
  }

  /** Ms remaining in the current timed state (0 while Building). */
  public get remainingMs(): number {
    return this._stateTimerMs;
  }

  /** Normalised meter fill in [0, 1], for UI poise bars. */
  public get fillRatio(): number {
    return this.maxPoise <= 0 ? 0 : this._currentPoise / this.maxPoise;
  }

  /**
   * Apply poise damage from a successful boss parry.
   *
   * GDD §4.4 — increments the meter by `ParryPoiseBreakValue`; when the meter
   * fills the boss transitions to the Broken/VULNERABLE state. GDD §3.6 — a
   * perfect parry scales the increment by `PerfectParryStaggerMultiplier` (see
   * file-level note on this interpretation).
   *
   * Poise damage is ignored while already Broken or Recovering — the boss is
   * already committed to that window.
   *
   * @param amount Base poise damage (typically `ParryPoiseBreakValue`).
   * @param isPerfect Whether the triggering parry was perfect.
   * @returns What was applied and whether this hit caused the break.
   */
  public applyPoiseDamage(amount: number, isPerfect: boolean): PoiseDamageResult {
    if (this._state !== PoiseState.Building) {
      return { applied: 0, justBroke: false, state: this._state };
    }

    const applied = isPerfect
      ? amount * this.perfectParryStaggerMultiplier
      : amount;

    this._currentPoise = Math.min(this.maxPoise, this._currentPoise + applied);

    let justBroke = false;
    if (this._currentPoise >= this.maxPoise) {
      justBroke = true;
      this.enterBroken();
    }

    return { applied, justBroke, state: this._state };
  }

  /**
   * Convenience wrapper that applies the GDD default per-parry poise value.
   *
   * GDD §4.4 — increments by `ParryPoiseBreakValue`.
   *
   * @param isPerfect Whether the triggering parry was perfect.
   */
  public applyParry(isPerfect: boolean): PoiseDamageResult {
    return this.applyPoiseDamage(this.parryPoiseBreakValue, isPerfect);
  }

  /**
   * Reset the meter to empty and return to Building.
   *
   * GDD §4.4 — "The Poise Break Meter resets at the start of each boss phase."
   * Call this on every boss phase transition.
   */
  public resetMeter(): void {
    this._currentPoise = 0;
    this._state = PoiseState.Building;
    this._stateTimerMs = 0;
  }

  /**
   * Advance timed states by `dtMs`.
   *
   * GDD §4.4 — counts down the VULNERABLE (Broken) window, then any Recovering
   * tail, before returning to Building. While Building, applies optional poise
   * decay (off by default; GDD specifies only increments + phase resets).
   *
   * @param dtMs Elapsed time since the previous tick, in milliseconds.
   */
  public tick(dtMs: number): void {
    if (dtMs <= 0) {
      return;
    }

    if (this._state === PoiseState.Building) {
      if (this.poiseDecayPerSecond > 0 && this._currentPoise > 0) {
        const decay = (this.poiseDecayPerSecond * dtMs) / 1000;
        this._currentPoise = Math.max(0, this._currentPoise - decay);
      }
      return;
    }

    this._stateTimerMs -= dtMs;
    if (this._stateTimerMs > 0) {
      return;
    }

    const overshootMs = -this._stateTimerMs;

    if (this._state === PoiseState.Broken) {
      if (this.recoveryDurationMs > 0) {
        this._state = PoiseState.Recovering;
        this._stateTimerMs = this.recoveryDurationMs;
        this.tick(overshootMs);
        return;
      }
      this.exitToBuilding();
      return;
    }

    // Recovering elapsed → back to Building (meter empty for the next break).
    this.exitToBuilding();
  }

  private enterBroken(): void {
    this._state = PoiseState.Broken;
    this._stateTimerMs = this.vulnerableDurationMs;
  }

  private exitToBuilding(): void {
    this._state = PoiseState.Building;
    this._stateTimerMs = 0;
    // Meter empties after a break so the next VULNERABLE window must be earned.
    this._currentPoise = 0;
  }
}
