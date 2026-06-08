/**
 * ParryReactable
 * ==============
 *
 * The contract the parry-resolution pipeline uses to ask "can this attacker be
 * parried, and what happens to it when it is?", plus a default implementation
 * ({@link EnemyParryReactable}) that wires together the two reaction components:
 *
 *  - {@link EnemyCombatReaction} — standard (non-boss) attacker stagger FSM.
 *  - {@link PoiseBreakComponent} — boss poise-break meter / VULNERABLE phase.
 *
 * Design references (see `design/gdd/melee-parry-system.md`):
 *  - §2.5 Attacker Stagger — non-boss attackers enter STAGGER for
 *    `AttackerStaggerMs`.
 *  - §3.6 Perfect Parry — perfect parries scale stagger / poise reward.
 *  - §4.1 Unparryable Attacks — attacks flagged `Unparryable = true` are never
 *    deflected; this interface exposes that flag plus a proposed rate-limit.
 *  - §4.4 Boss Attacks — bosses use poise-break instead of STAGGER, may carry
 *    `BossParryResistance`, and ultimates are always unparryable.
 *
 * Engine/behaviour-tree glue (the nodes that actually freeze the actor or play
 * the VULNERABLE animation) is intentionally thin and observes the state on the
 * components owned here.
 */

import {
  EnemyCombatReaction,
  type EnemyCombatReactionOptions,
} from './EnemyCombatReaction';
import {
  PoiseBreakComponent,
  type PoiseBreakOptions,
  type PoiseDamageResult,
  POISE_TUNING,
} from './PoiseBreakComponent';

/**
 * Default minimum interval between an enemy's *unparryable* attacks, in ms.
 *
 * PROPOSED KNOB (not in GDD §6). §4.1 requires unparryable attacks to be
 * telegraphed with >= 300 ms of visible warning. This rate-limit prevents an
 * AI from chaining unparryable attacks back-to-back faster than the player can
 * read those telegraphs, which would feel unfair. Defaulted at 1200 ms (a
 * telegraph plus a readable gap); designers should tune per archetype. Flagged
 * here so it can be promoted into the official tuning table if adopted.
 */
export const PROPOSED_UNPARRYABLE_MIN_INTERVAL_MS = 1200;

/**
 * Behaviour the parry resolution pipeline needs from any entity whose attack
 * was just contacted by the player's parry hitbox.
 *
 * @see design/gdd/melee-parry-system.md §2.5, §3.6, §4.1, §4.4
 */
export interface IParryReactable {
  /**
   * Whether the *currently resolving* attack cannot be parried.
   *
   * GDD §4.1 — when true the attack is not deflected, the player takes full
   * damage, and the player FSM goes to PARRY_FAIL (not PARRY_SUCCESS). GDD
   * §4.4 — boss ultimates are always unparryable.
   *
   * @returns True if the attack must bypass the parry entirely.
   */
  isAttackUnparryable(): boolean;

  /**
   * Whether this entity is a boss.
   *
   * GDD §4.4 — bosses do NOT enter the standard STAGGER state; a successful
   * parry feeds their poise-break meter instead. Callers use this to choose
   * between {@link applyStagger} and {@link applyPoiseDamage}.
   *
   * @returns True for boss-class entities.
   */
  isBoss(): boolean;

  /**
   * Whether the *currently resolving* attack carries parry resistance.
   *
   * GDD §4.4 — a boss special attack flagged `BossParryResistance = true`
   * still negates damage on a normal parry, but grants no counter window and
   * no stagger/poise unless the parry was perfect (GDD §3.6).
   *
   * @returns True if only a perfect parry yields the full reward.
   */
  hasParryResistance(): boolean;

  /**
   * Apply poise damage for a successful parry against a boss.
   *
   * GDD §4.4 — increments the poise-break meter by `ParryPoiseBreakValue`;
   * filling it triggers the VULNERABLE phase. GDD §3.6 — perfect parries are
   * weighted more heavily.
   *
   * @param amount Base poise damage (typically `ParryPoiseBreakValue`).
   * @param isPerfect Whether the triggering parry was perfect.
   * @returns The applied poise and whether this hit broke poise.
   */
  applyPoiseDamage(amount: number, isPerfect: boolean): PoiseDamageResult;

  /**
   * Apply standard attacker stagger for a successful parry against a non-boss.
   *
   * GDD §2.5 — enters STAGGER for `AttackerStaggerMs`. GDD §3.6 — perfect
   * parries scale the duration by `PerfectParryStaggerMultiplier`.
   *
   * @param isPerfect Whether the triggering parry was perfect.
   * @returns The stagger duration (ms) that was applied.
   */
  applyStagger(isPerfect: boolean): number;
}

/** Construction options for {@link EnemyParryReactable}. */
export interface EnemyParryReactableOptions {
  /** True for boss-class entities (drives stagger-vs-poise routing). GDD §4.4. */
  isBoss?: boolean;
  /** Tuning passthrough for the standard stagger FSM. */
  reaction?: EnemyCombatReactionOptions;
  /** Tuning passthrough for the boss poise-break meter. */
  poise?: PoiseBreakOptions;
  /**
   * Minimum interval between this enemy's unparryable attacks (ms). PROPOSED
   * knob; defaults to {@link PROPOSED_UNPARRYABLE_MIN_INTERVAL_MS}. GDD §4.1.
   */
  unparryableMinIntervalMs?: number;
}

/**
 * Per-attack metadata supplied by the resolution pipeline for the attack that
 * just contacted the parry hitbox. Mirrors the attack-hitbox tags in GDD §5.3.
 */
export interface IncomingAttackInfo {
  /** GDD §4.1 / §5.3 — attack flagged `Unparryable = true`. */
  isUnparryable?: boolean;
  /** GDD §4.4 — attack flagged `BossParryResistance = true`. */
  hasParryResistance?: boolean;
  /** GDD §4.4 — boss ultimate; always treated as unparryable. */
  isBossUltimate?: boolean;
}

/**
 * Default {@link IParryReactable} that owns one stagger FSM and one poise
 * meter, routing parry outcomes to the correct one based on {@link isBoss}.
 *
 * The "currently resolving attack" is set via {@link setIncomingAttack} just
 * before the pipeline queries {@link isAttackUnparryable} /
 * {@link hasParryResistance}, keeping those query methods side-effect free.
 *
 * @see design/gdd/melee-parry-system.md §2.5, §3.6, §4.1, §4.4
 */
export class EnemyParryReactable implements IParryReactable {
  /** Standard attacker stagger FSM (GDD §2.5). */
  public readonly reaction: EnemyCombatReaction;
  /** Boss poise-break meter (GDD §4.4). Present even for non-bosses but unused. */
  public readonly poise: PoiseBreakComponent;

  private readonly _isBoss: boolean;
  private readonly unparryableMinIntervalMs: number;

  /** Metadata for the attack currently being resolved (see {@link setIncomingAttack}). */
  private _currentAttack: IncomingAttackInfo = {};

  /**
   * Wall-clock-ish ms (accumulated via {@link tick}) of the last unparryable
   * attack this enemy was *allowed* to launch, or `null` if none yet.
   */
  private _lastUnparryableAtMs: number | null = null;

  /** Monotonic time accumulator fed by {@link tick}, in ms. */
  private _nowMs = 0;

  public constructor(options: EnemyParryReactableOptions = {}) {
    this._isBoss = options.isBoss ?? false;
    this.reaction = new EnemyCombatReaction(options.reaction);
    this.poise = new PoiseBreakComponent(options.poise);
    this.unparryableMinIntervalMs =
      options.unparryableMinIntervalMs ?? PROPOSED_UNPARRYABLE_MIN_INTERVAL_MS;
  }

  /**
   * Set the metadata for the attack about to be resolved against the parry.
   *
   * Call this immediately before {@link isAttackUnparryable} /
   * {@link hasParryResistance} so those remain pure queries. GDD §5.3 — the
   * pipeline reads these flags off the attack hitbox.
   *
   * @param attack The incoming attack's parry-relevant flags.
   */
  public setIncomingAttack(attack: IncomingAttackInfo): void {
    this._currentAttack = attack;
  }

  /**
   * Whether the current attack cannot be parried.
   *
   * GDD §4.1 — honours the `Unparryable` flag. GDD §4.4 — boss ultimates are
   * always unparryable regardless of the explicit flag.
   */
  public isAttackUnparryable(): boolean {
    return (
      this._currentAttack.isUnparryable === true ||
      this._currentAttack.isBossUltimate === true
    );
  }

  /**
   * Whether this entity is a boss.
   *
   * GDD §4.4 — selects poise-break over standard stagger.
   */
  public isBoss(): boolean {
    return this._isBoss;
  }

  /**
   * Whether the current attack carries parry resistance.
   *
   * GDD §4.4 — `BossParryResistance` attacks reward stagger/poise + counter
   * only on a perfect parry.
   */
  public hasParryResistance(): boolean {
    return this._currentAttack.hasParryResistance === true;
  }

  /**
   * Apply poise damage for a successful boss parry.
   *
   * GDD §4.4 — feeds the poise meter; GDD §3.6 — perfect parries weighted.
   * No-op poise (returns `applied: 0`) when not a boss.
   *
   * @param amount Base poise damage (typically `ParryPoiseBreakValue`).
   * @param isPerfect Whether the triggering parry was perfect.
   */
  public applyPoiseDamage(amount: number, isPerfect: boolean): PoiseDamageResult {
    if (!this._isBoss) {
      return { applied: 0, justBroke: false, state: this.poise.state };
    }
    return this.poise.applyPoiseDamage(amount, isPerfect);
  }

  /**
   * Apply standard attacker stagger for a successful non-boss parry.
   *
   * GDD §2.5 / §3.6. No-op (returns 0) for bosses, which use poise instead.
   *
   * @param isPerfect Whether the triggering parry was perfect.
   */
  public applyStagger(isPerfect: boolean): number {
    if (this._isBoss) {
      return 0;
    }
    return this.reaction.onAttackParried({ isPerfect });
  }

  /**
   * Resolve a successful parry against this entity, routing to poise (boss) or
   * stagger (non-boss) and honouring parry-resistance.
   *
   * GDD §4.4 — for a `BossParryResistance` attack a non-perfect parry negates
   * damage but yields no poise/stagger and no counter (the caller should not
   * open a counter window when `rewarded` is false). GDD §3.6 — a perfect
   * parry always rewards.
   *
   * @param isPerfect Whether the triggering parry was perfect.
   * @returns Whether the parry was rewarded with stagger/poise (and thus a
   *   counter window should open), plus the poise result for bosses.
   */
  public resolveParry(isPerfect: boolean): {
    rewarded: boolean;
    staggerMs: number;
    poise: PoiseDamageResult | null;
  } {
    // GDD §4.4 — parry-resistant attacks only reward a perfect parry.
    if (this.hasParryResistance() && !isPerfect) {
      return { rewarded: false, staggerMs: 0, poise: null };
    }

    if (this._isBoss) {
      const poise = this.poise.applyPoiseDamage(
        POISE_TUNING.ParryPoiseBreakValue,
        isPerfect,
      );
      return { rewarded: true, staggerMs: 0, poise };
    }

    const staggerMs = this.reaction.onAttackParried({ isPerfect });
    return { rewarded: true, staggerMs, poise: null };
  }

  /**
   * Whether this enemy is currently allowed to launch an unparryable attack.
   *
   * PROPOSED rate-limit (not in GDD §6). GDD §4.1 — unparryable attacks must
   * be readably telegraphed; this prevents launching another one within
   * `unparryableMinIntervalMs` of the last. Call {@link notifyUnparryableLaunched}
   * when an attack is actually committed.
   *
   * @returns True if enough time has elapsed since the last unparryable attack.
   */
  public canLaunchUnparryable(): boolean {
    if (this._lastUnparryableAtMs === null) {
      return true;
    }
    return this._nowMs - this._lastUnparryableAtMs >= this.unparryableMinIntervalMs;
  }

  /**
   * Record that this enemy has committed to an unparryable attack, starting the
   * rate-limit interval. PROPOSED helper; pairs with {@link canLaunchUnparryable}.
   * GDD §4.1.
   */
  public notifyUnparryableLaunched(): void {
    this._lastUnparryableAtMs = this._nowMs;
  }

  /**
   * Advance both owned components and the rate-limit clock by `dtMs`.
   *
   * Drives the stagger FSM (GDD §2.5) and the poise meter's VULNERABLE /
   * Recovering timers and optional decay (GDD §4.4).
   *
   * @param dtMs Elapsed time since the previous tick, in milliseconds.
   */
  public tick(dtMs: number): void {
    if (dtMs > 0) {
      this._nowMs += dtMs;
    }
    this.reaction.tick(dtMs);
    this.poise.tick(dtMs);
  }

  /**
   * Reset the boss poise meter for a phase transition.
   *
   * GDD §4.4 — "The Poise Break Meter resets at the start of each boss phase."
   */
  public resetMeter(): void {
    this.poise.resetMeter();
  }

  /**
   * Force both components back to a clean state (death / despawn / encounter
   * reset). Does not touch the unparryable rate-limit history; use a fresh
   * instance per spawn if that must be cleared too.
   */
  public reset(): void {
    this.reaction.reset();
    this.poise.resetMeter();
  }
}
