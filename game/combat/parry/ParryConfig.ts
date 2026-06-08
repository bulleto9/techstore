/**
 * Parry tuning configuration.
 *
 * Every field corresponds 1:1 with a row in the GDD "Tuning Knobs" table
 * (§6). Defaults come from that table's "Default Value" column, and
 * {@link validateParryConfig} enforces the "Safe Min" / "Safe Max" columns
 * plus the "Interaction Warnings" sub-section.
 *
 * @see design/gdd/melee-parry-system.md §6
 */

/** Frame budget assumption used to convert frame-based knobs to milliseconds. GDD §6 ("~50 ms" @ 3 frames, 60 fps). */
export const MS_PER_FRAME = 1000 / 60

/**
 * The 19 designer-facing tuning knobs for the parry system.
 *
 * Field order follows the GDD §6 table top-to-bottom.
 */
export interface ParryConfig {
  /** Core active window during which the parry hitbox is live (ms). GDD §6. */
  parryWindowMs: number
  /** Delay between input and hitbox activation (frames). GDD §6. */
  parryStartupFrames: number
  /** Vulnerability window after a parry attempt ends (frames). GDD §6. */
  parryRecoveryFrames: number
  /** Flat stamina cost per successful parry. GDD §3.2, §6. */
  baseParryStaminaCost: number
  /** Additional stamina cost per attack tier. GDD §3.2, §6. */
  attackStaminaWeight: number
  /** Fraction of incoming damage negated on a full parry (0..1). GDD §3.1, §6. */
  parryDamageNegation: number
  /** Counter-attack damage multiplier bonus (fraction). GDD §3.5, §6. */
  counterAttackBonusPercent: number
  /** Duration the player may execute a counter attack (ms). GDD §3.5, §6. */
  counterWindowMs: number
  /** Mandatory wait between parry attempts (ms). GDD §3.4, §6. */
  parryCooldownMs: number
  /** Duration an attacker is staggered after a successful parry (ms). GDD §2.5, §6. */
  attackerStaggerMs: number
  /** Sub-window within parryWindowMs that qualifies as a perfect parry (ms). GDD §3.6, §6. */
  perfectParryWindowMs: number
  /** Counter-damage multiplier bonus for a perfect parry. GDD §3.6, §6. */
  perfectParryMultiplier: number
  /** Stagger-duration multiplier for a perfect parry. GDD §3.6, §6. */
  perfectParryStaggerMultiplier: number
  /** Scales stamina cost for boss-attack parries. GDD §4.4, §6. */
  bossStaminaMultiplier: number
  /** Poise-meter increment per successful boss parry. GDD §4.4, §6. */
  parryPoiseBreakValue: number
  /** Delay before stamina regeneration resumes after a parry (ms). GDD §2.4, §6. */
  staminaRegenPauseMs: number
  /** Pre-buffer window for parry input (ms). GDD §2.1, §6. */
  inputBufferMs: number
  /** Damage dealt to attacker when a projectile is parried back (fraction of original). GDD §4.2, §6. */
  projectileReturnDamage: number
  /** Whether parrying is permitted while airborne. GDD §4.5, §6. */
  aerialParryEnabled: boolean
}

/**
 * Hard clamp bounds for the effective parry window (GDD §3.3).
 *
 * These are mechanic-level invariants, not designer knobs: below the floor
 * the mechanic is unfair, above the ceiling it trivializes combat.
 */
export const PARRY_WINDOW_MIN_MS = 80
export const PARRY_WINDOW_MAX_MS = 400

/**
 * Default configuration — the "Default Value" column of GDD §6.
 *
 * Frame-based knobs store frame counts; ms conversions are derived at use
 * sites via {@link MS_PER_FRAME}.
 */
export const DEFAULT_PARRY_CONFIG: Readonly<ParryConfig> = {
  parryWindowMs: 200,
  parryStartupFrames: 3,
  parryRecoveryFrames: 12,
  baseParryStaminaCost: 15,
  attackStaminaWeight: 8,
  parryDamageNegation: 1.0,
  counterAttackBonusPercent: 0.35,
  counterWindowMs: 600,
  parryCooldownMs: 500,
  attackerStaggerMs: 800,
  perfectParryWindowMs: 60,
  perfectParryMultiplier: 1.5,
  perfectParryStaggerMultiplier: 1.4,
  bossStaminaMultiplier: 1.5,
  parryPoiseBreakValue: 25,
  staminaRegenPauseMs: 1000,
  inputBufferMs: 80,
  projectileReturnDamage: 0.5,
  aerialParryEnabled: false,
}

/** Severity of a {@link ValidationIssue}. */
export type ValidationSeverity = 'error' | 'warning'

/** A single problem found while validating a {@link ParryConfig}. */
export interface ValidationIssue {
  /** `'error'` = value outside a safe range (degenerate). `'warning'` = a flagged interaction. */
  readonly severity: ValidationSeverity
  /** The config field this issue concerns. */
  readonly field: keyof ParryConfig | '(interaction)'
  /** Human-readable explanation referencing the GDD constraint. */
  readonly message: string
}

/** Aggregate result of {@link validateParryConfig}. */
export interface ValidationResult {
  /** True when no `'error'`-severity issues were found (warnings allowed). */
  readonly ok: boolean
  /** All discovered issues, errors and warnings combined, in discovery order. */
  readonly issues: readonly ValidationIssue[]
}

/** Internal range spec for numeric knobs (inclusive bounds). */
interface Range {
  readonly field: keyof ParryConfig
  readonly min: number
  readonly max: number
}

/** Safe Min / Safe Max columns from GDD §6, in table order. */
const SAFE_RANGES: readonly Range[] = [
  { field: 'parryWindowMs', min: 80, max: 400 },
  { field: 'parryStartupFrames', min: 1, max: 6 },
  { field: 'parryRecoveryFrames', min: 6, max: 20 },
  { field: 'baseParryStaminaCost', min: 5, max: 40 },
  { field: 'attackStaminaWeight', min: 0, max: 20 },
  { field: 'parryDamageNegation', min: 0.5, max: 1.0 },
  { field: 'counterAttackBonusPercent', min: 0.1, max: 1.0 },
  { field: 'counterWindowMs', min: 300, max: 1200 },
  { field: 'parryCooldownMs', min: 200, max: 1500 },
  { field: 'attackerStaggerMs', min: 300, max: 1500 },
  { field: 'perfectParryWindowMs', min: 20, max: 100 },
  { field: 'perfectParryMultiplier', min: 1.0, max: 2.5 },
  { field: 'perfectParryStaggerMultiplier', min: 1.0, max: 2.0 },
  { field: 'bossStaminaMultiplier', min: 1.0, max: 3.0 },
  { field: 'parryPoiseBreakValue', min: 5, max: 50 },
  { field: 'staminaRegenPauseMs', min: 500, max: 2000 },
  { field: 'inputBufferMs', min: 40, max: 150 },
  { field: 'projectileReturnDamage', min: 0.1, max: 1.0 },
]

/**
 * Validate a {@link ParryConfig} against the GDD §6 safe ranges and the
 * "Interaction Warnings" sub-section.
 *
 * Range violations are reported as `'error'`; flagged interactions (which
 * are valid but exploit-prone) are reported as `'warning'`. The result is
 * `ok` only when there are zero errors.
 *
 * Interaction checks implemented (GDD §6 "Interaction Warnings"):
 * 1. `parryWindowMs > 350` while `parryCooldownMs < 400` → near-zero-gap
 *    back-to-back parries (warning).
 * 2. `perfectParryWindowMs >= parryWindowMs / 2` → perfect window too wide
 *    relative to the active window (error — GDD says "enforce via data
 *    validation").
 * 3. heavy-attack cost `baseParryStaminaCost + attackStaminaWeight * 2`
 *    exceeding `maxStaminaAtLevel1`, when that ceiling is supplied — early
 *    game unusable (error).
 *
 * @param config The configuration to validate.
 * @param maxStaminaAtLevel1 Optional level-1 max stamina; enables check #3.
 * @returns A {@link ValidationResult} with all issues found.
 * @see design/gdd/melee-parry-system.md §6
 */
export function validateParryConfig(
  config: ParryConfig,
  maxStaminaAtLevel1?: number,
): ValidationResult {
  const issues: ValidationIssue[] = []

  // Safe-range checks (GDD §6 table).
  for (const range of SAFE_RANGES) {
    const value = config[range.field]
    if (typeof value !== 'number' || Number.isNaN(value)) {
      issues.push({
        severity: 'error',
        field: range.field,
        message: `${range.field} must be a finite number, got ${String(value)}.`,
      })
      continue
    }
    if (value < range.min || value > range.max) {
      issues.push({
        severity: 'error',
        field: range.field,
        message: `${range.field} = ${value} is outside the safe range [${range.min}, ${range.max}] (GDD §6).`,
      })
    }
  }

  // Interaction warning #1: wide window + short cooldown (GDD §6).
  if (config.parryWindowMs > 350 && config.parryCooldownMs < 400) {
    issues.push({
      severity: 'warning',
      field: '(interaction)',
      message:
        `parryWindowMs (${config.parryWindowMs}) > 350 with parryCooldownMs (${config.parryCooldownMs}) < 400 ` +
        'allows back-to-back parries with near-zero gap — monitor for exploit potential (GDD §6).',
    })
  }

  // Interaction warning #2: perfect window must be < half the active window (GDD §6 — enforced).
  if (config.perfectParryWindowMs >= config.parryWindowMs / 2) {
    issues.push({
      severity: 'error',
      field: 'perfectParryWindowMs',
      message:
        `perfectParryWindowMs (${config.perfectParryWindowMs}) must be less than parryWindowMs / 2 ` +
        `(${config.parryWindowMs / 2}) (GDD §6).`,
    })
  }

  // Interaction warning #3: heavy-attack cost must fit level-1 stamina (GDD §6).
  if (typeof maxStaminaAtLevel1 === 'number') {
    const heavyCost = config.baseParryStaminaCost + config.attackStaminaWeight * 2
    if (heavyCost > maxStaminaAtLevel1) {
      issues.push({
        severity: 'error',
        field: '(interaction)',
        message:
          `Heavy-attack parry cost (${heavyCost} = baseParryStaminaCost + attackStaminaWeight * 2) ` +
          `exceeds level-1 max stamina (${maxStaminaAtLevel1}); mechanic unusable early game (GDD §6).`,
      })
    }
  }

  const ok = issues.every((issue) => issue.severity !== 'error')
  return { ok, issues }
}
