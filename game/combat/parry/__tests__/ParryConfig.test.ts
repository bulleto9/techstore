/**
 * Tests for parry config validation.
 *
 * Covers GDD §6 safe-range enforcement and the three "Interaction Warnings"
 * (wide-window/short-cooldown warning, perfect-window < half active window
 * error, heavy-attack-cost vs level-1 stamina error).
 */

import {
  DEFAULT_PARRY_CONFIG,
  ParryConfig,
  validateParryConfig,
} from '../ParryConfig'

const cfg = (overrides: Partial<ParryConfig> = {}): ParryConfig => ({
  ...DEFAULT_PARRY_CONFIG,
  ...overrides,
})

describe('validateParryConfig — defaults', () => {
  it('the GDD default config validates clean (no errors, no warnings)', () => {
    const result = validateParryConfig(DEFAULT_PARRY_CONFIG)
    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})

describe('validateParryConfig — safe-range enforcement (GDD §6 table)', () => {
  it('flags a parryWindowMs below the safe min as an error', () => {
    const result = validateParryConfig(cfg({ parryWindowMs: 50 }))
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) => i.severity === 'error' && i.field === 'parryWindowMs',
      ),
    ).toBe(true)
  })

  it('flags a parryWindowMs above the safe max as an error', () => {
    const result = validateParryConfig(cfg({ parryWindowMs: 500 }))
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) => i.severity === 'error' && i.field === 'parryWindowMs',
      ),
    ).toBe(true)
  })

  it('accepts values exactly on the safe-range boundaries', () => {
    // parryWindowMs 80..400; pick boundary values everywhere relevant.
    const result = validateParryConfig(
      cfg({
        parryWindowMs: 400,
        parryDamageNegation: 0.5,
        // keep perfect window < parryWindowMs/2 (=200) to avoid the interaction error
        perfectParryWindowMs: 100,
      }),
    )
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
    expect(result.ok).toBe(true)
  })

  it('flags parryDamageNegation below 0.5 (unrewarding) as an error', () => {
    const result = validateParryConfig(cfg({ parryDamageNegation: 0.3 }))
    expect(
      result.issues.some(
        (i) => i.severity === 'error' && i.field === 'parryDamageNegation',
      ),
    ).toBe(true)
  })

  it('flags NaN values as errors', () => {
    const result = validateParryConfig(cfg({ baseParryStaminaCost: NaN }))
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) => i.severity === 'error' && i.field === 'baseParryStaminaCost',
      ),
    ).toBe(true)
  })
})

describe('validateParryConfig — interaction warning #1 (wide window + short cooldown)', () => {
  it('warns when parryWindowMs > 350 and parryCooldownMs < 400', () => {
    const result = validateParryConfig(
      cfg({ parryWindowMs: 360, parryCooldownMs: 300, perfectParryWindowMs: 100 }),
    )
    const warning = result.issues.find((i) => i.severity === 'warning')
    expect(warning).toBeDefined()
    expect(warning?.field).toBe('(interaction)')
    // A warning alone does not flip ok to false.
    expect(result.ok).toBe(true)
  })

  it('does NOT warn when only one of the two thresholds is crossed', () => {
    // Wide window but long cooldown.
    const result = validateParryConfig(
      cfg({ parryWindowMs: 360, parryCooldownMs: 500, perfectParryWindowMs: 100 }),
    )
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(false)
  })
})

describe('validateParryConfig — interaction error #2 (perfect window vs active window)', () => {
  it('errors when perfectParryWindowMs >= parryWindowMs / 2', () => {
    // parryWindowMs 200 -> half is 100; perfect 100 must error (>=).
    const result = validateParryConfig(
      cfg({ parryWindowMs: 200, perfectParryWindowMs: 100 }),
    )
    expect(result.ok).toBe(false)
    expect(
      result.issues.some(
        (i) => i.severity === 'error' && i.field === 'perfectParryWindowMs',
      ),
    ).toBe(true)
  })

  it('passes when perfectParryWindowMs is strictly below half the window', () => {
    const result = validateParryConfig(
      cfg({ parryWindowMs: 200, perfectParryWindowMs: 60 }),
    )
    expect(
      result.issues.some(
        (i) => i.field === 'perfectParryWindowMs' && i.severity === 'error',
      ),
    ).toBe(false)
  })
})

describe('validateParryConfig — interaction error #3 (heavy cost vs level-1 stamina)', () => {
  it('errors when heavy-attack parry cost exceeds level-1 max stamina', () => {
    // heavy cost = base 15 + weight 8*2 = 31; supply a 30-stamina ceiling.
    const result = validateParryConfig(DEFAULT_PARRY_CONFIG, 30)
    expect(result.ok).toBe(false)
    const issue = result.issues.find(
      (i) => i.severity === 'error' && i.field === '(interaction)',
    )
    expect(issue).toBeDefined()
    expect(issue?.message).toContain('31')
  })

  it('passes when level-1 stamina comfortably covers the heavy cost', () => {
    const result = validateParryConfig(DEFAULT_PARRY_CONFIG, 100)
    expect(result.ok).toBe(true)
  })

  it('skips check #3 entirely when no level-1 ceiling is supplied', () => {
    const result = validateParryConfig(DEFAULT_PARRY_CONFIG)
    expect(
      result.issues.some(
        (i) => i.field === '(interaction)' && i.message.includes('Heavy-attack'),
      ),
    ).toBe(false)
  })
})
