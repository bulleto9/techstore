# Melee Parry System — Game Design Document

**Document version:** 1.0  
**Date:** 2026-06-08  
**Author:** Combat Team  
**Status:** Draft

---

## Table of Contents

1. [Mechanic Overview](#1-mechanic-overview)
2. [Detailed Rules](#2-detailed-rules)
3. [Formulas](#3-formulas)
4. [Edge Cases](#4-edge-cases)
5. [Dependencies](#5-dependencies)
6. [Tuning Knobs](#6-tuning-knobs)
7. [Acceptance Criteria](#7-acceptance-criteria)

---

## 1. Mechanic Overview

### What Is Parrying?

A parry is a skilled, deliberate deflection of an incoming melee attack. The player presses a dedicated input at the moment an enemy attack is about to connect. A successful parry negates incoming damage, costs the attacker stamina (and optionally staggers them), and grants the player a brief counter-attack window. A mistimed parry either does nothing or, depending on configuration, leaves the player briefly vulnerable.

### Player Fantasy

The parry system should make the player feel like a razor-sharp duelist who reads their opponent rather than simply tanks hits or rolls away. Mastery of the parry should feel earned: a beginner survives by dodging; an expert dances through enemy offensives, deflecting every blow and punishing every opening. The satisfaction arc is:

- **First contact:** Player discovers parrying by accident or tutorial, sees the dramatic clang effect, and wants to reproduce it.
- **Learning curve:** Timing varies by enemy attack; players study telegraphs and adjust.
- **Mastery:** Expert players chain parry-counter sequences rhythmically, turning combat into a high-risk, high-reward performance.

Key feel targets:

- **Responsive:** Input latency from button press to parry-frame entry must be imperceptible (< 2 frames at 60 fps).
- **Readable:** The success state must be visually and aurally distinct from a block, a miss, and a dodge.
- **Fair:** Failed parries should feel like a timing mistake, never like a system fault. Hitbox and input registration must be deterministic.
- **Rewarding:** A successful parry should grant a concrete, usable advantage — a stagger, an open counter window, or a stamina drain on the attacker.

---

## 2. Detailed Rules

### 2.1 Input

| Property | Value |
|---|---|
| Default binding | L1 / LB (configurable) |
| Input type | Tap (single press); held input is NOT treated as repeated parry attempts |
| Minimum press duration to register | 1 frame (16 ms at 60 fps) — prevents phantom triggers |
| Input buffer window | 80 ms before the parry-active frame begins (allows slight early presses) |

### 2.2 State Machine

```
IDLE
 │
 │  [Player presses parry input]
 ▼
PARRY_STARTUP  (duration: ParryStartupFrames, default 3 frames / ~50 ms)
 │
 │  [Startup completes — parry hitbox becomes active]
 ▼
PARRY_ACTIVE ◄──────────────────────────────────────────────────────────┐
 │                                                                       │
 │  [No incoming attack within ParryWindowMs]                            │
 ├──────────────────────────────────────────────────────────────────────►│ (held: stays active until window expires)
 │
 │  [Parry window expires without contact]
 ▼
PARRY_RECOVERY  (duration: ParryRecoveryFrames, default 12 frames / ~200 ms)
 │
 │  [Recovery completes]
 ▼
IDLE (with cooldown timer running if parry was used)


PARRY_ACTIVE
 │
 │  [Enemy attack hitbox enters parry hitbox during active window]
 ▼
PARRY_SUCCESS
 │  - Incoming damage = 0
 │  - Player stamina cost applied
 │  - Attacker stagger triggered
 │  - Counter-attack window opens (CounterWindowMs)
 │  - Visual/audio feedback: success FX
 │
 ▼
COUNTER_WINDOW  (duration: CounterWindowMs, default 600 ms)
 │
 │  [Player presses attack] → executes ParryCounter attack (bonus damage)
 │  [Window expires without attack] → returns to IDLE
 ▼
IDLE


PARRY_ACTIVE
 │
 │  [Enemy attack lands OUTSIDE active window (startup or recovery phase)]
 ▼
PARRY_FAIL
 │  - Full damage applied (no reduction)
 │  - Player enters HIT_STUN state (normal hit reaction)
 │  - No stamina cost for the failed parry attempt
 ▼
IDLE
```

### 2.3 Parry States — Summary Table

| State | Invincible? | Parry Hitbox Active? | Duration |
|---|---|---|---|
| PARRY_STARTUP | No | No | `ParryStartupFrames` (~50 ms) |
| PARRY_ACTIVE | No (only parry hitbox deflects) | Yes | `ParryWindowMs` (default 200 ms) |
| PARRY_RECOVERY | No | No | `ParryRecoveryFrames` (~200 ms) |
| PARRY_SUCCESS | Yes (brief, ~4 frames) | No | Until counter window ends or IDLE |
| COUNTER_WINDOW | No | No | `CounterWindowMs` (default 600 ms) |
| PARRY_FAIL | No | No | Merged into HIT_STUN |

### 2.4 Stamina Rules

- Stamina is only spent on a **successful** parry. A failed parry attempt (no contact) costs no stamina.
- If the player has **zero stamina** when a parry attempt succeeds, the parry registers but the guard is partially broken: damage reduction is halved and no counter window opens (guard-break variant).
- Stamina regeneration is paused for `StaminaRegenPauseMs` (default 1000 ms) after a successful parry.

### 2.5 Attacker Stagger

A successfully parried attacker enters the STAGGER state for `AttackerStaggerMs` (default 800 ms). During stagger the attacker cannot attack, block, or dodge. Bosses use a separate stagger threshold system (see Section 4.4).

---

## 3. Formulas

All variables marked **[TUNABLE]** are exposed in the tuning knobs table in Section 6.

### 3.1 Incoming Damage After Parry

```
DamageReceived = BaseDamage * (1 - DamageNegationPercent)
```

- On full successful parry with sufficient stamina: `DamageNegationPercent = ParryDamageNegation` (default 1.0, i.e. 100% negation).
- On successful parry with zero stamina (guard-break): `DamageNegationPercent = ParryDamageNegation * 0.5`.
- On failed parry: `DamageNegationPercent = 0` (full damage).

### 3.2 Stamina Cost

```
StaminaCost = BaseParryStaminaCost + (AttackStaminaWeight * AttackTier)
```

- `BaseParryStaminaCost` **[TUNABLE]** — flat stamina spent per successful parry.
- `AttackStaminaWeight` **[TUNABLE]** — per-tier stamina scaling (heavier attacks cost more to parry).
- `AttackTier` — integer assigned to each attack (0 = light, 1 = medium, 2 = heavy).

Example: `BaseParryStaminaCost = 15`, `AttackStaminaWeight = 8`, heavy attack (`AttackTier = 2`) costs `15 + 8*2 = 31` stamina.

### 3.3 Parry Window Duration

The active parry window scales slightly with player-character level or a perk, but has a hard cap:

```
EffectiveParryWindowMs = clamp(
    ParryWindowMs + (ParryWindowBonusPerLevel * CharacterLevel),
    ParryWindowMinMs,
    ParryWindowMaxMs
)
```

- Without any level/perk scaling, `EffectiveParryWindowMs = ParryWindowMs`.
- `ParryWindowMinMs = 80 ms` (hard floor — below this, mechanic is unfair).
- `ParryWindowMaxMs = 400 ms` (hard ceiling — above this, parrying trivializes combat).

### 3.4 Cooldown

The cooldown prevents spam. It begins when PARRY_RECOVERY ends (whether parry hit or not).

```
CooldownRemainingMs = ParryCooldownMs - TimeSinceLastParryAttemptMs
```

While `CooldownRemainingMs > 0`, the parry input is consumed but no parry state is entered. No stamina is spent. UI indicator (e.g., dulled parry icon) communicates unavailability.

### 3.5 Counter-Attack Damage Bonus

```
CounterDamage = BaseAttackDamage * (1 + CounterAttackBonusPercent)
```

- `CounterAttackBonusPercent` **[TUNABLE]** — bonus multiplier applied to the first attack during `COUNTER_WINDOW`.
- Only the first attack within the counter window receives the bonus; subsequent hits deal normal damage.
- The bonus applies before armor/resistance calculations on the target.

### 3.6 Perfect Parry (Optional Variant)

A "perfect parry" is defined as a parry where the attack hitbox contact occurs within the first `PerfectParryWindowMs` of the `PARRY_ACTIVE` phase. Rewards:

```
PerfectCounterDamage = BaseAttackDamage * (1 + CounterAttackBonusPercent * PerfectParryMultiplier)
AttackerStaggerDuration = AttackerStaggerMs * PerfectParryStaggerMultiplier
```

- `PerfectParryMultiplier` (default 1.5) — amplifies counter bonus for perfect timing.
- `PerfectParryStaggerMultiplier` (default 1.4) — extends attacker stagger.
- Perfect parry triggers a distinct visual/audio effect to communicate the achievement.

---

## 4. Edge Cases

### 4.1 Unparryable Attacks

Certain attacks are flagged `Unparryable = true` in the attack data asset. When such an attack contacts the parry hitbox during `PARRY_ACTIVE`:

- The attack is **not** deflected.
- The player takes **full damage** as if no parry was attempted.
- The parry state machine transitions to `PARRY_FAIL`, not `PARRY_SUCCESS`.
- No stamina is spent.
- Visual/audio cue (distinct clang + red flash or screen shake) communicates to the player that this attack cannot be parried.
- Unparryable attacks must be telegraphed by animation (red glow, charge indicator, or audio cue) with at least 300 ms of visible warning before the attack hitbox activates.

Examples of unparryable attack types:
- Grab / throw attacks
- Charged smash attacks flagged by designers
- Environmental hazards (falling boulders, spike traps)
- Certain boss ultimate abilities

### 4.2 Projectiles

Projectiles (arrows, thrown objects, spells) interact with the parry system as follows:

| Projectile Type | Parryable? | Behavior on Parry |
|---|---|---|
| Physical (arrow, spear) | Yes (if `Parryable = true` on projectile asset) | Deflected back at attacker for `ProjectileReturnDamage` |
| Magic / energy bolt | No by default | Passes through parry hitbox; full damage |
| Explosive | No | Triggers explosion on contact regardless of parry state |
| Boss projectile | Per-asset flag | Defined per encounter |

Parrying a returnable projectile:
- Uses the same `ParryWindowMs` timing window.
- Costs `BaseParryStaminaCost` (no tier scaling for projectiles).
- Opens a counter window only if the projectile is flagged `ProjectileCounterEnabled = true`.

### 4.3 Multi-Hit Attacks

A multi-hit attack is a single animation that delivers multiple discrete hit events (e.g., a spin attack with 3 hits, a rapid stab combo).

Rules:
- The parry hitbox deflects the **first hit only** that contacts it during `PARRY_ACTIVE`.
- After the first hit is deflected, the state transitions to `PARRY_SUCCESS`; subsequent hits within the same attack **are not** automatically blocked.
- The player must dodge, block, or re-parry remaining hits (subject to cooldown).
- Exception: attacks flagged `MultiHitParry = true` are treated as a single logical parry event — all hits in the sequence are negated during the stagger window. This flag should be used sparingly (e.g., a rapid needle jab where individual parries would be impossible).

### 4.4 Boss Attacks

Bosses use a modified parry interaction:

- **Standard boss attacks** are parryable normally but apply `BossStaminaMultiplier` (default 1.5x) to stamina cost.
- **Boss special attacks** may carry `BossParryResistance = true` — these require a **perfect parry** (Section 3.6) to gain the counter window; a normal (non-perfect) parry still negates damage but grants no counter and no stagger.
- **Boss ultimate attacks** are always `Unparryable = true`.
- Bosses do not enter the standard STAGGER state. Instead, a successful parry increments the boss's **Poise Break Meter** by `ParryPoiseBreakValue`. When the meter fills, the boss enters a `VULNERABLE` phase (distinct from standard stagger).
- The Poise Break Meter resets at the start of each boss phase.

### 4.5 Player-in-Air / Aerial Parry

- Parrying is **disabled** while the player is airborne by default (`AerialParryEnabled = false`).
- If enabled via perk/design flag, aerial parries use the same window and cost but have the following restriction: the player cannot initiate a counter attack from the air unless they first land.

### 4.6 Simultaneous Parries (Mirror Match / Co-op)

When two player-controlled characters attempt to parry each other (PvP scenario) or two enemies parry simultaneously:

- The parry that was initiated first (by timestamp) wins.
- If timestamps are within the same frame (same tick), a coin-flip (deterministic RNG seeded by entity IDs) determines the winner.
- The losing parry transitions to `PARRY_FAIL` with no stamina cost.

### 4.7 Parry While Staggered or Crowd-Controlled

- Parry input is ignored while the player is in any of: `HIT_STUN`, `KNOCKED_DOWN`, `GRABBED`, `STUNNED`.
- The input buffer does **not** store the parry press during these states — there is no queued parry on recovery.

---

## 5. Dependencies

### 5.1 Animation State Machine

| Requirement | Detail |
|---|---|
| States required | `Parry_Startup`, `Parry_Active`, `Parry_Recovery`, `Parry_Success`, `Parry_Fail`, `Counter_Attack` |
| Blend in/out | Startup must interrupt any non-locked locomotion/idle animation in ≤ 1 frame |
| Animation events | `OnParryActiveBegin` (activates hitbox), `OnParryActiveEnd` (deactivates hitbox), `OnParrySuccess` (triggers FX), `OnCounterWindowOpen`, `OnCounterWindowClose` |
| Blend tree priority | Parry state must override movement layer but yield to death/ragdoll state |
| Mirror support | Left-hand and right-hand weapon variants require mirrored animation sets |

### 5.2 Input System

| Requirement | Detail |
|---|---|
| Input action | `Action_Parry` — mapped via the project's input binding table |
| Input buffer | 80 ms pre-buffer; consumed on state entry or discarded at buffer expiry |
| Conflicting inputs | Simultaneous parry + dodge: dodge takes priority; parry input is discarded |
| Simultaneous parry + block: parry takes priority | |
| Rebinding | `Action_Parry` must be rebindable via accessibility menu without code changes |
| Gamepad / KBM | Both schemes must expose the action; default KBM binding is `Q` |

### 5.3 Hitbox System

| Requirement | Detail |
|---|---|
| Parry hitbox shape | Capsule, positioned in front of player weapon/shield (art-defined per character) |
| Activation | Enabled on `OnParryActiveBegin`, disabled on `OnParryActiveEnd` |
| Collision layer | `ParryDetection` layer — must not interact with environment or player self-hitboxes |
| Overlap query type | Continuous (swept) overlap during active window; point-in-time query is insufficient for fast attacks |
| Attack hitbox tagging | Every attack hitbox must carry metadata: `IsParryable (bool)`, `AttackTier (int)`, `IsProjectile (bool)`, `IsMultiHit (bool)`, `IsUnparryable (bool)` |
| Overlap callback | On `ParryHitbox_Overlap(attackHitbox)`, route to Parry Resolution logic before damage pipeline |

### 5.4 Stamina System

- Must expose: `GetCurrentStamina()`, `SpendStamina(float amount)`, `PauseRegeneration(float durationMs)`.
- Parry system calls `SpendStamina` only after `PARRY_SUCCESS` is confirmed.
- Stamina system must support querying whether a spend would result in 0 stamina (for guard-break calculation).

### 5.5 Damage Pipeline

- Parry system must intercept the damage event **before** it is applied to the player's health.
- Interface: `OnIncomingDamage(DamageEvent) → DamageEvent` (modifier pattern).
- Parry system returns a modified `DamageEvent` with `FinalDamage = 0` on success, or passes it unmodified on fail.

### 5.6 Audio / Visual Feedback System

| Event | Required Feedback |
|---|---|
| `PARRY_SUCCESS` | Metallic clang SFX, spark particle burst, brief camera shake (0.1 s, magnitude 0.03), hit-stop (3 frames) |
| `PARRY_SUCCESS` (perfect) | Enhanced clang SFX, larger spark burst, slow-motion pulse (0.05 s at 0.3x time scale) |
| `PARRY_FAIL` | Dull thud SFX variant, red flash on player health bar |
| `COUNTER_WINDOW` open | Subtle UI pulse on attack button prompt, optional screen-edge glow |
| Unparryable contact | Distinct "blocked but broke through" SFX + red screen-edge flash |

### 5.7 UI System

- Parry cooldown must be visually represented (e.g., icon desaturation + radial fill timer).
- Counter window must display a transient prompt visible for `CounterWindowMs`.
- Accessibility: all parry timing feedback must have a non-color alternative (e.g., controller rumble, screen flash shape).

---

## 6. Tuning Knobs

All values below are exposed as data assets (not hardcoded) and can be modified without recompile. Safe ranges are defined to prevent degenerate gameplay states.

| Parameter | Default Value | Safe Min | Safe Max | Notes |
|---|---|---|---|---|
| `ParryWindowMs` | 200 ms | 80 ms | 400 ms | Core timing window during which parry hitbox is active |
| `ParryStartupFrames` | 3 frames (~50 ms) | 1 frame | 6 frames | Delay between input and hitbox activation |
| `ParryRecoveryFrames` | 12 frames (~200 ms) | 6 frames | 20 frames | Vulnerability window after parry attempt ends |
| `BaseParryStaminaCost` | 15 | 5 | 40 | Flat stamina cost per successful parry |
| `AttackStaminaWeight` | 8 | 0 | 20 | Additional stamina cost per attack tier |
| `ParryDamageNegation` | 1.0 (100%) | 0.5 (50%) | 1.0 (100%) | Fraction of incoming damage negated; below 50% feels unrewarding |
| `CounterAttackBonusPercent` | 0.35 (35%) | 0.10 (10%) | 1.00 (100%) | Damage multiplier bonus for counter attack |
| `CounterWindowMs` | 600 ms | 300 ms | 1200 ms | Duration player can execute a counter attack |
| `ParryCooldownMs` | 500 ms | 200 ms | 1500 ms | Mandatory wait between parry attempts |
| `AttackerStaggerMs` | 800 ms | 300 ms | 1500 ms | Duration attacker is staggered after successful parry |
| `PerfectParryWindowMs` | 60 ms | 20 ms | 100 ms | Sub-window within `ParryWindowMs` that qualifies as perfect |
| `PerfectParryMultiplier` | 1.5 | 1.0 | 2.5 | Counter damage multiplier bonus for perfect parry |
| `PerfectParryStaggerMultiplier` | 1.4 | 1.0 | 2.0 | Stagger duration multiplier for perfect parry |
| `BossStaminaMultiplier` | 1.5 | 1.0 | 3.0 | Scales stamina cost for boss attack parries |
| `ParryPoiseBreakValue` | 25 | 5 | 50 | Poise meter increment per successful boss parry |
| `StaminaRegenPauseMs` | 1000 ms | 500 ms | 2000 ms | Delay before stamina regeneration resumes after parry |
| `InputBufferMs` | 80 ms | 40 ms | 150 ms | Pre-buffer window for parry input |
| `ProjectileReturnDamage` | 50% of original projectile damage | 10% | 100% | Damage dealt to attacker when projectile is parried back |
| `AerialParryEnabled` | false | — | — | Toggle; no numeric range |

### Interaction Warnings

- Setting `ParryWindowMs` above 350 ms while `ParryCooldownMs` is below 400 ms allows back-to-back parries with near-zero gap — monitor for exploit potential.
- `PerfectParryWindowMs` must always be less than `ParryWindowMs / 2`; enforce via data validation at asset save.
- `BaseParryStaminaCost + AttackStaminaWeight * 2` (heavy attack cost) should never exceed the player's maximum stamina at level 1, or the mechanic becomes unusable early game. Validate in editor tooling.

---

## 7. Acceptance Criteria

Each criterion is a discrete pass/fail test runnable by QA or automated testing.

### 7.1 Core Timing

| ID | Criterion | Pass Condition |
|---|---|---|
| AC-01 | Parry hitbox activates after startup delay | Hitbox enabled at frame 4 (0-indexed) after input, not before |
| AC-02 | Parry hitbox deactivates after window expires | Hitbox disabled exactly `ParryWindowMs` after activation |
| AC-03 | Input buffer accepts early press | Pressing parry 60 ms before valid state activates correctly |
| AC-04 | Input outside buffer is ignored | Pressing parry 200 ms before valid state does nothing |
| AC-05 | Cooldown prevents immediate re-parry | Second parry attempt within `ParryCooldownMs` does not activate hitbox |
| AC-06 | Cooldown resets after full duration | Parry succeeds normally after `ParryCooldownMs` has elapsed |

### 7.2 Success and Failure

| ID | Criterion | Pass Condition |
|---|---|---|
| AC-07 | Successful parry negates damage | Player health unchanged after parried attack |
| AC-08 | Stamina deducted on success | Player stamina reduced by correct formula amount after success |
| AC-09 | No stamina deducted on miss | Player stamina unchanged when parry window passes with no contact |
| AC-10 | Failed parry (wrong timing) deals full damage | Player takes 100% of attack damage when hit outside active window |
| AC-11 | Zero-stamina parry: guard break | Player with 0 stamina takes 50% damage on parry; no counter window |
| AC-12 | Counter window opens after success | `COUNTER_WINDOW` state entered; UI prompt visible within 1 frame of success |
| AC-13 | Counter window closes correctly | Counter window exits after `CounterWindowMs` if no attack input |
| AC-14 | Counter attack deals bonus damage | Attack during counter window deals `BaseAttackDamage * (1 + CounterAttackBonusPercent)` |
| AC-15 | Only first counter attack gets bonus | Second attack during counter window deals base damage, no multiplier |

### 7.3 Perfect Parry

| ID | Criterion | Pass Condition |
|---|---|---|
| AC-16 | Perfect parry triggers within sub-window | Contact within first `PerfectParryWindowMs` triggers distinct SFX/VFX |
| AC-17 | Perfect parry counter bonus applied | Counter damage equals `BaseAttackDamage * (1 + CounterAttackBonusPercent * PerfectParryMultiplier)` |
| AC-18 | Perfect parry extends attacker stagger | Attacker stagger duration equals `AttackerStaggerMs * PerfectParryStaggerMultiplier` |
| AC-19 | Late parry (non-perfect) does NOT trigger perfect | Contact after `PerfectParryWindowMs` triggers normal success FX, not perfect |

### 7.4 Edge Cases

| ID | Criterion | Pass Condition |
|---|---|---|
| AC-20 | Unparryable attack ignores parry hitbox | Attack flagged `Unparryable = true` deals full damage during active parry window |
| AC-21 | Unparryable attack transitions to PARRY_FAIL | State machine enters PARRY_FAIL, not PARRY_SUCCESS |
| AC-22 | Parryable projectile deflected | Projectile flagged `Parryable = true` is redirected; attacker takes `ProjectileReturnDamage` |
| AC-23 | Non-parryable projectile bypasses parry | Magic/explosive projectile deals full damage during active parry |
| AC-24 | Multi-hit: only first hit deflected | Second hit of a multi-hit attack deals damage after parry success transitions state |
| AC-25 | `MultiHitParry = true` attack fully negated | All hits in flagged multi-hit attack are negated for duration of attacker stagger |
| AC-26 | Boss attack costs more stamina | Boss attack stamina cost equals formula result with `BossStaminaMultiplier` |
| AC-27 | Boss does not enter STAGGER | Boss enters Poise Break meter increment, not STAGGER state |
| AC-28 | Boss ultimate is unparryable | Attack flagged as boss ultimate deals full damage during parry |
| AC-29 | Aerial parry disabled by default | Parry input during airborne state does nothing when `AerialParryEnabled = false` |
| AC-30 | Parry ignored while in HIT_STUN | Input pressed during HIT_STUN does not queue or execute a parry |

### 7.5 Feedback and UI

| ID | Criterion | Pass Condition |
|---|---|---|
| AC-31 | Success SFX plays on PARRY_SUCCESS | Metallic clang audio event fires within same frame as state transition |
| AC-32 | Fail SFX plays on full-damage hit during recovery | Dull thud variant plays; distinct from success SFX |
| AC-33 | Cooldown UI reflects unavailability | Parry icon shows desaturated/fill animation for full `ParryCooldownMs` duration |
| AC-34 | Hit-stop applied on success | Game pauses for 3 frames (at 60 fps) on PARRY_SUCCESS |
| AC-35 | Camera shake on success | Camera shake fires with correct magnitude and duration |
| AC-36 | Controller rumble fires on success | Rumble event with non-zero intensity plays on PARRY_SUCCESS (gamepad only) |

### 7.6 Accessibility

| ID | Criterion | Pass Condition |
|---|---|---|
| AC-37 | Parry action is rebindable | Changing binding in menu takes effect immediately without restart |
| AC-38 | KBM default binding functional | Default `Q` key triggers parry action on keyboard |
| AC-39 | Color-blind: non-color feedback present | Success/fail states are distinguishable by shape/rumble alone (color removed) |

---

*End of Document*
