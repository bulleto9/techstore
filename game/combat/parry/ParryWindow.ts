/**
 * Parry-window timing helpers.
 *
 * Pure functions implementing the timing formulas in GDD §3.3 (effective
 * window with hard clamp), §3.6 (perfect-parry sub-window) and §2.1 (input
 * pre-buffer). No engine dependencies.
 *
 * @see design/gdd/melee-parry-system.md §3.3, §3.6, §2.1
 */

import {
  ParryConfig,
  PARRY_WINDOW_MAX_MS,
  PARRY_WINDOW_MIN_MS,
} from './ParryConfig'

/** Clamp `value` into the inclusive `[min, max]` range. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Compute the effective parry-active window length, in milliseconds.
 *
 * Implements GDD §3.3:
 *
 * ```
 * EffectiveParryWindowMs = clamp(
 *     ParryWindowMs + (ParryWindowBonusPerLevel * CharacterLevel),
 *     ParryWindowMinMs,   // 80 ms hard floor
 *     ParryWindowMaxMs    // 400 ms hard ceiling
 * )
 * ```
 *
 * The GDD's `ParryWindowBonusPerLevel` is not one of the §6 knobs (it is a
 * "perk or level" scaling source), so it is passed in explicitly and
 * defaults to `0` — meaning, with no scaling, the result equals
 * `config.parryWindowMs` (GDD §3.3 note).
 *
 * @param config Tuning configuration supplying `parryWindowMs`.
 * @param characterLevel The player-character level (>= 0).
 * @param windowBonusPerLevel Per-level window bonus in ms (default 0).
 * @returns Clamped window length in ms, always within [80, 400].
 */
export function effectiveWindowMs(
  config: ParryConfig,
  characterLevel: number,
  windowBonusPerLevel = 0,
): number {
  const scaled =
    config.parryWindowMs + windowBonusPerLevel * Math.max(0, characterLevel)
  return clamp(scaled, PARRY_WINDOW_MIN_MS, PARRY_WINDOW_MAX_MS)
}

/**
 * Determine whether contact at `elapsedMs` into PARRY_ACTIVE qualifies as a
 * "perfect" parry.
 *
 * Implements GDD §3.6: contact within the first `perfectParryWindowMs` of the
 * active phase is perfect. The boundary is treated as exclusive of the upper
 * edge to match AC-19 ("contact after `PerfectParryWindowMs` … is not
 * perfect"): an event exactly at the edge is still inside the first window,
 * so we use `< perfectParryWindowMs` for the strictly-after case being false.
 *
 * @param elapsedMs Milliseconds since PARRY_ACTIVE began (>= 0).
 * @param config Tuning configuration supplying `perfectParryWindowMs`.
 * @returns True if the timing is within the perfect sub-window.
 */
export function isPerfect(elapsedMs: number, config: ParryConfig): boolean {
  return elapsedMs >= 0 && elapsedMs <= config.perfectParryWindowMs
}

/**
 * Determine whether an early parry press falls inside the pre-activation
 * input buffer.
 *
 * Implements GDD §2.1 / §5.2: a press up to `inputBufferMs` before the
 * active frame begins is accepted and consumed on state entry (AC-03); a
 * press earlier than that is ignored (AC-04).
 *
 * @param pressAheadMs How far ahead of the active window the press occurred
 *   (>= 0; e.g. 60 means "pressed 60 ms early").
 * @param config Tuning configuration supplying `inputBufferMs`.
 * @returns True if the early press should be buffered and honored.
 */
export function isWithinBuffer(pressAheadMs: number, config: ParryConfig): boolean {
  return pressAheadMs >= 0 && pressAheadMs <= config.inputBufferMs
}
