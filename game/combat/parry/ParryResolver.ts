/**
 * Pure parry-resolution logic.
 *
 * Given an incoming attack, the current FSM state and timing/stamina context,
 * this module decides the {@link Outcome} and the resulting damage-negation
 * fraction. It is engine-free: collider overlap, the damage pipeline and the
 * stamina system are all represented as plain data in / out.
 *
 * Implements GDD §3.1 (damage negation), §3.2 (stamina cost), §2.4 (zero-
 * stamina guard-break), §3.6 (perfect parry) and the relevant edge cases in
 * §4.1 (unparryable), §4.2 (projectiles) and §4.4 (boss attacks).
 *
 * @see design/gdd/melee-parry-system.md §3.1, §3.2, §2.4, §3.6, §4.1, §4.2, §4.4
 */

import { ParryConfig } from './ParryConfig'
import { Outcome, ParryState } from './ParryState'
import { isPerfect } from './ParryWindow'

/**
 * Discrete tier assigned to each attack, driving stamina cost (GDD §3.2).
 * 0 = light, 1 = medium, 2 = heavy.
 */
export type AttackTier = 0 | 1 | 2

/**
 * What kind of entity launched the attack (GDD §4.4).
 *
 * - `'normal'` — standard enemy; standard rules.
 * - `'boss'`   — applies {@link ParryConfig.bossStaminaMultiplier} and uses
 *   the Poise-Break meter rather than the standard stagger (GDD §4.4).
 */
export type AttackerKind = 'normal' | 'boss'

/**
 * Minimal, engine-agnostic description of an incoming attack hitbox.
 *
 * Mirrors the hitbox metadata required by GDD §5.3 plus the per-attack flags
 * referenced throughout §4. Only the fields the pure resolver needs are
 * modelled here; engine adapters populate them from attack-data assets.
 *
 * @see design/gdd/melee-parry-system.md §5.3, §4.1, §4.2, §4.3, §4.4
 */
export interface IncomingAttack {
  /** Base (pre-mitigation) damage this hit would deal. GDD §3.1. */
  readonly baseDamage: number
  /** Stamina tier of the attack (0/1/2). Ignored for projectiles. GDD §3.2. */
  readonly tier: AttackTier
  /** Flagged `Unparryable` — cannot be deflected, always full damage. GDD §4.1. */
  readonly unparryable: boolean
  /** True when this contact is a projectile. GDD §4.2. */
  readonly isProjectile: boolean
  /** For projectiles only: whether it can be parried/returned. GDD §4.2. */
  readonly projectileParryable: boolean
  /** Boss special attack requiring a perfect parry for counter/stagger. GDD §4.4. */
  readonly bossParryResistance: boolean
}

/**
 * The fully-resolved result of a parry interaction.
 *
 * This is a value object: it carries every consequence the engine adapters
 * must apply (damage, stamina, counter window, stagger), so the pure layer
 * never reaches into engine systems directly.
 */
export interface ParryResolution {
  /** Semantic classification of the interaction. GDD §3.1, §4.1, §4.2. */
  readonly outcome: Outcome
  /** Fraction of base damage negated: 1.0 / 0.5 / 0.0. GDD §3.1. */
  readonly damageNegation: number
  /** Final damage the player receives after negation. GDD §3.1. */
  readonly damageReceived: number
  /** Stamina spent as a result of this interaction (0 unless a parry succeeded). GDD §3.2, §2.4. */
  readonly staminaCost: number
  /** True when the interaction qualifies as a perfect parry. GDD §3.6. */
  readonly perfect: boolean
  /** Whether a counter window should open. False on guard-break / boss-resist / fail. GDD §2.4, §4.4. */
  readonly opensCounterWindow: boolean
  /** Attacker stagger duration in ms (0 when none, e.g. boss / guard-break). GDD §2.5, §3.6, §4.4. */
  readonly attackerStaggerMs: number
  /** FSM state the machine should transition into as a consequence. GDD §2.2. */
  readonly nextState: ParryState.Success | ParryState.Fail
}

/**
 * Compute the stamina cost of a successful parry (GDD §3.2, §4.4).
 *
 * ```
 * StaminaCost = BaseParryStaminaCost + (AttackStaminaWeight * AttackTier)
 * ```
 *
 * Projectiles ignore tier scaling and cost the flat base only (GDD §4.2).
 * Boss attacks multiply the result by `bossStaminaMultiplier` (GDD §4.4).
 *
 * @param config Tuning configuration.
 * @param attack The incoming attack (supplies tier / projectile flag).
 * @param attackerKind Whether the attacker is a boss.
 * @returns Stamina that would be spent on a successful parry.
 */
export function staminaCostFor(
  config: ParryConfig,
  attack: IncomingAttack,
  attackerKind: AttackerKind,
): number {
  const tierComponent = attack.isProjectile ? 0 : config.attackStaminaWeight * attack.tier
  const raw = config.baseParryStaminaCost + tierComponent
  return attackerKind === 'boss' ? raw * config.bossStaminaMultiplier : raw
}

/** Build a "no deflection, full damage" resolution → PARRY_FAIL. GDD §3.1, §4.1. */
function failResolution(attack: IncomingAttack): ParryResolution {
  return {
    outcome: Outcome.Fail,
    damageNegation: 0,
    damageReceived: attack.baseDamage,
    staminaCost: 0,
    perfect: false,
    opensCounterWindow: false,
    attackerStaggerMs: 0,
    nextState: ParryState.Fail,
  }
}

/** Build an "ignored" resolution: parry hitbox does not interact, full damage. GDD §4.2. */
function ignoredResolution(attack: IncomingAttack): ParryResolution {
  return {
    outcome: Outcome.Ignored,
    damageNegation: 0,
    damageReceived: attack.baseDamage,
    staminaCost: 0,
    perfect: false,
    opensCounterWindow: false,
    attackerStaggerMs: 0,
    // The attack was never deflected; the parry simply whiffs and the machine
    // proceeds as a miss (Fail edge per §2.2 "lands outside active window").
    nextState: ParryState.Fail,
  }
}

/**
 * Resolve an incoming attack against the parry system.
 *
 * Decision order (GDD §2.2, §3.1, §4):
 * 1. Contact outside PARRY_ACTIVE → fail, full damage (GDD §2.2 fail edge).
 * 2. Unparryable attack → fail, full damage, PARRY_FAIL (GDD §4.1, AC-20/21).
 * 3. Non-parryable projectile → ignored, full damage (GDD §4.2, AC-23).
 * 4. Otherwise the parry connects (GDD §2.2 success edge):
 *    - Zero stamina → guard-break: 50% negation, no counter, no stagger (GDD §2.4, AC-11).
 *    - Boss-resistance + non-perfect → damage negated but no counter/stagger (GDD §4.4).
 *    - Else full success: 100% negation, counter window, stagger (perfect amplifies — §3.6).
 *
 * @param attack The incoming attack descriptor.
 * @param state Current FSM state (only {@link ParryState.Active} can deflect).
 * @param elapsedInActiveMs Milliseconds since PARRY_ACTIVE began (for perfect timing).
 * @param stamina Player's current stamina (drives the guard-break branch).
 * @param attackerKind Whether the attacker is a boss.
 * @param config Tuning configuration (defaults caller-supplied at call sites).
 * @returns A fully-resolved {@link ParryResolution}.
 */
export function resolve(
  attack: IncomingAttack,
  state: ParryState,
  elapsedInActiveMs: number,
  stamina: number,
  attackerKind: AttackerKind,
  config: ParryConfig,
): ParryResolution {
  // 1. Only the active window can deflect; any other state is a mistimed hit.
  //    (GDD §2.2: "Enemy attack lands OUTSIDE active window … → PARRY_FAIL".)
  if (state !== ParryState.Active) {
    return failResolution(attack)
  }

  // 2. Unparryable attacks bypass the parry entirely (GDD §4.1, AC-20/21).
  if (attack.unparryable) {
    return failResolution(attack)
  }

  // 3. Projectiles: non-parryable ones pass through for full damage (GDD §4.2, AC-23).
  if (attack.isProjectile && !attack.projectileParryable) {
    return ignoredResolution(attack)
  }

  // 4. The parry connects. Determine perfect timing once up front (GDD §3.6).
  const perfect = isPerfect(elapsedInActiveMs, config)

  // 4a. Guard-break: zero stamina halves negation and grants no reward (GDD §2.4, AC-11).
  if (stamina <= 0) {
    const negation = config.parryDamageNegation * 0.5
    return {
      outcome: Outcome.GuardBreak,
      damageNegation: negation,
      damageReceived: attack.baseDamage * (1 - negation),
      staminaCost: 0,
      perfect,
      opensCounterWindow: false,
      attackerStaggerMs: 0,
      nextState: ParryState.Success,
    }
  }

  // Successful parry: full negation and the standard stamina spend (GDD §3.1, §3.2).
  const negation = config.parryDamageNegation
  const staminaCost = staminaCostFor(config, attack, attackerKind)

  // 4b. Boss-resistance specials: a non-perfect parry still negates damage but
  //     yields no counter window and no Poise-Break stagger (GDD §4.4).
  const bossResistedNonPerfect = attack.bossParryResistance && !perfect

  // Perfect parries extend stagger (GDD §3.6). Bosses do not enter the standard
  // STAGGER state (GDD §4.4) — the meter increment is an engine-side concern, so
  // we report 0 ms standard stagger for boss attackers here.
  let staggerMs = 0
  if (!bossResistedNonPerfect && attackerKind !== 'boss') {
    staggerMs = perfect
      ? config.attackerStaggerMs * config.perfectParryStaggerMultiplier
      : config.attackerStaggerMs
  }

  return {
    outcome: Outcome.Success,
    damageNegation: negation,
    damageReceived: attack.baseDamage * (1 - negation),
    staminaCost,
    perfect,
    opensCounterWindow: !bossResistedNonPerfect,
    attackerStaggerMs: staggerMs,
    nextState: ParryState.Success,
  }
}
