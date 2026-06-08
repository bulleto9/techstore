# Melee Parry System — Audio Event List & Mixing Spec

**Document version:** 1.0
**Date:** 2026-06-08
**Author:** Combat Audio (Sound Design)
**Status:** Draft (approved demo)
**Companion design doc:** `design/gdd/melee-parry-system.md` (see §5.6 Audio/Visual Feedback)

---

## 0. Scope & Conventions

This document specifies the audio event list and mixing/spatialization spec for the melee parry system. It maps every audible gameplay moment to a concrete sound-design brief that an implementer can author and wire to engine signals. There is no game engine in this repo; this is a design doc only.

### 0.1 Terminology

- **Event** — a named, fire-and-forget audio trigger requested by gameplay. Engine-agnostic naming used here: `Play_<Event>`.
- **Layer** — a discrete sound element summed into one event. We use a three-part anatomy:
  - **Transient** — the attack/onset (0–20 ms): click, tick, snap. Carries readability and timing.
  - **Body** — the sustained tone/texture (20–150 ms): the "what it is" of the sound.
  - **Tail** — the decay/reverb/ring-out (150 ms–2 s): carries weight, space, and "satisfaction."
- **Priority** — voice-stealing rank when the voice budget is exceeded. `Critical > High > Med > Low`. Critical never steals-out; Low is first to drop.
- **Triggering signal** — the gameplay/state-machine event or animation notify that fires the audio. Names taken directly from the GDD where possible.

### 0.2 Reference levels (integrated, see §6.5)

- Mix reference: **-23 LUFS** integrated target for the full combat mix; impacts allowed to peak transient-loud but RMS-controlled.
- True-peak ceiling: **-1.0 dBTP** on the master.

---

## 1. Audio Event List

One row per event. "Var." = number of round-robin variations authored. "PV" = pitch variation range applied at playback.

| # | Event ID | Trigger signal (from GDD) | Short description | Layers (Transient / Body / Tail) | Variation strategy | Priority |
|---|----------|---------------------------|-------------------|----------------------------------|--------------------|----------|
| 1 | `Play_Parry_Startup_Whoosh` | `OnParryActiveBegin` (start of `PARRY_ACTIVE`, ~frame 4) | Light, fast air/metal "ready" swipe as the guard comes up. Quiet, anticipatory. | T: short air tick · B: filtered whoosh (band-passed mid) · Tail: short air decay (~120 ms) | 4 RR samples · PV ±2 semitones · ±1.5 dB gain jitter | Low |
| 2 | `Play_Parry_Clang_Normal` | `OnParrySuccess` where contact is **after** `PerfectParryWindowMs` (AC-19) | The signature metallic clang. Bright, sharp deflection. Satisfying but "standard." | T: metal-on-metal click (sharp, 0–8 ms) · B: struck-blade ring (200–300 ms) · Tail: metallic shimmer decay (~600 ms) | 6 RR samples across transient + body, decorrelated · PV ±2.5 semitones · velocity→brightness (see §2.4) | Critical |
| 3 | `Play_Parry_Clang_Perfect` | `OnParrySuccess` where contact ≤ `PerfectParryWindowMs` (AC-16) | Elevated clang variant — see §3 for the full distinction spec. Cleaner, richer, with a sub thump + sweetener shimmer. | T: tight metal click + transient designer snap · B: harmonically richer struck-blade with added sub-octave layer · Tail: long bell-like ring + dedicated lush reverb send (~1.4 s) | 4 hero RR samples (fewer, higher quality) · PV ±1 semitone only (keep it consistent & recognizable) | Critical |
| 4 | `Play_Guard_Break` | `PARRY_SUCCESS` with `GetCurrentStamina()==0` (guard-break variant, GDD §2.4 / AC-11) | A "cracked guard" — clang that splinters/detunes, half-strength, with a stamina-depleted downward sweep. Communicates partial failure. | T: dull metal click (less bright than normal) · B: detuned/cracked ring with grit · Tail: short downward pitch sweep + low buzz (~400 ms) | 3 RR samples · PV ±1.5 semitones · always pitch-bend tail downward (signature of depletion) | High |
| 5 | `Play_Parry_Whiff` | `PARRY_RECOVERY` entered with no contact (window expired, IDLE-bound) **or** `PARRY_FAIL` mistimed hit | Empty deflection / failed timing. Dull thud + airy whiff, NO bright ring. Distinct from any clang. (GDD §5.6 PARRY_FAIL, AC-32) | T: soft body thud · B: dull wood/leather knock · Tail: short air whiff (~150 ms), no metal shimmer | 5 RR samples · PV ±2 semitones · gain jitter ±2 dB | Med |
| 6 | `Play_Counter_Window_Cue` | `OnCounterWindowOpen` (`COUNTER_WINDOW` entered, AC-12) | Crisp, musical UI affordance: "now!" A clean rising two-note pluck/chime telling the player the counter is live. Routes to UI bus. | T: pluck attack · B: short tonal chime (in key with combat music if scored) · Tail: light verb (~300 ms) | 2 RR · PV ±1 semitone (keep musical & recognizable) · do NOT randomize pitch widely | High |
| 7 | `Play_Counter_Window_Close` | `OnCounterWindowClose` (window expired without attack, AC-13) | Subtle, low "opportunity lost" downward blip. Optional/quiet; informs without punishing. | T: soft tick · B: short low tone · Tail: tiny fade (~120 ms) | 2 RR · PV ±1 semitone · downward bend | Low |
| 8 | `Play_Counter_Hit_Impact` | First attack landing during `COUNTER_WINDOW` (counter damage applied, AC-14) | Beefy, rewarding counter strike. Heavier than a normal hit — extra low-end punch + flesh/armor crunch to sell the bonus damage. Perfect-counter variant adds weight. | T: weapon impact crack · B: flesh/armor crunch + low punch · Tail: low boom + meat decay (~500 ms) | 4 RR · PV ±2 semitones · perfect-counter routes a hotter mix snapshot (+2 dB low shelf) | Critical |
| 9 | `Play_Boss_PoiseBreak` | Poise Break Meter fills → boss enters `VULNERABLE` (GDD §4.4, AC-27) | The big payoff. A deep, cinematic shatter/roar: armor-crack + sub drop + boss vocal strain. Triggers music duck (see §2.3). | T: massive armor-shatter crack · B: layered sub drop + boss grunt/strain · Tail: long cavernous reverb + debris settle (~2.0 s) | 3 hero RR (rare event, author for impact) · PV ±0.5 semitone (near-fixed, it's a signature moment) | Critical |
| 10 | `Play_Projectile_Deflect_Ping` | Parryable projectile redirected (`Parryable==true`, AC-22) | Sharp, high "ping" of a deflected arrow/bolt — tighter and brighter than a sword clang, with a Doppler-style outgoing whoosh as it flies back. | T: high metal ping click · B: short bright ring (higher register than clang) · Tail: outgoing whoosh that pans toward attacker (~400 ms) | 5 RR · PV ±3 semitones (wider OK, projectiles vary) · tail whoosh pitch tracks return velocity | High |
| 11 | `Play_Unparryable_Break` | `Unparryable==true` attack contacts active parry hitbox → `PARRY_FAIL` (GDD §4.1, AC-20/21) | "Blocked but broke through" — a clang that COLLAPSES into a heavy impact, signalling the hit landed anyway. Distinct, slightly dissonant. | T: metal click that immediately distorts · B: dissonant crack collapsing into body thud · Tail: low ominous rumble (~600 ms) | 3 RR · PV ±1 semitone · always resolves downward into impact (signature "you can't parry this") | Critical |

### 1.1 Event-to-state cross-reference

| GDD state / signal | Audio event(s) |
|--------------------|----------------|
| `PARRY_STARTUP` → `PARRY_ACTIVE` (`OnParryActiveBegin`) | #1 Startup Whoosh |
| `PARRY_SUCCESS` (normal, late contact) | #2 Clang Normal |
| `PARRY_SUCCESS` (perfect, ≤ `PerfectParryWindowMs`) | #3 Clang Perfect |
| `PARRY_SUCCESS` (0 stamina / guard-break) | #4 Guard Break |
| `PARRY_FAIL` / window expiry (whiff) | #5 Parry Whiff |
| `OnCounterWindowOpen` | #6 Counter Window Cue |
| `OnCounterWindowClose` | #7 Counter Window Close |
| Counter attack lands in `COUNTER_WINDOW` | #8 Counter Hit Impact |
| Boss Poise Break Meter fills → `VULNERABLE` | #9 Boss Poise-Break |
| Parryable projectile deflected | #10 Projectile Deflect Ping |
| Unparryable attack contacts parry hitbox | #11 Unparryable Break |

### 1.2 Anti-repetition fatigue — global strategy

Parry combat is rhythmic and repetitive (the GDD explicitly targets "chain parry-counter sequences rhythmically"). Repetition fatigue is the #1 audio risk. Tactics, applied per the table above:

- **Round-robin (RR):** never repeat the same sample twice in a row; use a shuffle-bag (each variation plays once before any repeats) rather than pure random.
- **Pitch variation (PV):** small real-time transpose per play; ranges chosen so signature events (perfect parry, counter cue, boss break) stay recognizable while filler events (whoosh, whiff) vary widely.
- **Layered decorrelation:** randomize transient and body RR independently so combinations multiply (e.g., 6 transients × 6 bodies for the normal clang → many perceived variants from few assets).
- **Gain jitter:** ±1.5–2 dB per play on non-signature events to soften mechanical sameness.
- **Velocity / context mapping:** see §2.4 — heavier attacks brighten and add low-end so successive parries of different attacks already sound different.
- **Signature events excluded from heavy randomization:** perfect parry, counter cue, and boss break must read consistently every time — they are the "leitmotifs" of the system.

---

## 2. Mixing Notes

### 2.1 Bus routing

```
                                   ┌─────────────────────────┐
#2 Clang Normal ───┐               │                         │
#3 Clang Perfect ──┤               │                         │
#4 Guard Break ────┼──► IMPACTS_BUS├───────┐                 │
#5 Parry Whiff ────┤   (compressor,        │                 │
#8 Counter Impact ─┤    transient shaper)  │                 │
#10 Deflect Ping ──┤               │       ├──► COMBAT_SUBMIX ├──► MASTER ──► (limiter, -1 dBTP)
#11 Unparryable ───┘               │       │                 │
                                   │       │                 │
#9 Boss PoiseBreak ──► IMPACTS_BUS─┘       │                 │
   (also sends sidechain key ─────────┐    │                 │
                                       ▼    │                 │
#1 Startup Whoosh ──► WEAPON_FOLEY_BUS─────┤                 │
                                            │                 │
#6 Counter Cue ────┐                        │                 │
#7 Counter Close ──┼──► UI_CUE_BUS ─────────┤                 │
                   │   (2D, no spatialize)  │                 │
                                            │                 │
MUSIC ──────────────────────────► MUSIC_BUS┘ (ducked, §2.3)  │
                                                              │
                                            (master listens at -23 LUFS integrated)
```

Routing rules:

- **IMPACTS_BUS** — all physical parry/hit sounds (clangs, breaks, counter impacts, deflects, boss break). Bus compressor (slow-ish, glue) + transient shaper to keep clicks punchy. This bus is the loudest combat element.
- **WEAPON_FOLEY_BUS** — light movement/whoosh layer (#1). Lower in the mix; ducks slightly under IMPACTS_BUS.
- **UI_CUE_BUS** — counter cues (#6, #7). **2D / non-spatialized**, always centered and consistent volume so the player never misses the counter window regardless of camera. Exempt from impact-bus ducking.
- **MUSIC_BUS** — scored combat music; target of ducking (§2.3).
- **COMBAT_SUBMIX** — convenience group for snapshot transitions (e.g., boss-vulnerable snapshot).

### 2.2 Dynamic range

- Parry combat should breathe: keep crest factor high on IMPACTS_BUS so clangs feel snappy. Avoid over-compression that flattens the perfect-parry distinction.
- Use a **gentle bus compressor** (ratio ≤ 2:1, slow attack ~15 ms to let transients through, auto-release) for glue only.
- Master **limiter** catches peaks at -1.0 dBTP; it should rarely engage hard during normal play.
- Provide a **Dynamic Range** accessibility option (Night / Standard / Cinematic) — see §5.4.

### 2.3 Ducking

| Source event | Duck target | Amount | Attack | Hold | Release |
|--------------|-------------|--------|--------|------|---------|
| #9 Boss Poise-Break | MUSIC_BUS | -9 dB | 30 ms | 600 ms | 800 ms |
| #9 Boss Poise-Break | WEAPON_FOLEY_BUS | -6 dB | 20 ms | 400 ms | 500 ms |
| #3 Clang Perfect | MUSIC_BUS | -3 dB | 20 ms | 120 ms | 250 ms |
| #8 Counter Impact (perfect-counter only) | MUSIC_BUS | -3 dB | 20 ms | 120 ms | 250 ms |

- Boss poise-break is the headline duck: music drops hard and briefly so the shatter/roar (#9) owns the moment, then swells back as the boss enters `VULNERABLE`. Pair with the GDD slow-mo/vulnerable beat.
- Implement via **sidechain key** from the triggering event, not a hardcoded timeline, so it stays in sync if timing is tuned.
- UI_CUE_BUS is **never** ducked — counter readability is sacrosanct.

### 2.4 Velocity / attack-tier mapping (readability + variety)

Drive timbre from gameplay metadata that already exists on the attack hitbox (`AttackTier` per GDD §5.3):

- `AttackTier 0` (light): brighter, thinner clang, less low-end.
- `AttackTier 1` (medium): reference clang.
- `AttackTier 2` (heavy): +low-shelf, longer tail, more transient weight. Boss attacks (×`BossStaminaMultiplier`) treated as heavy-plus.

This makes parrying different attacks audibly different "for free," directly fighting repetition fatigue, and reinforces readability (the GDD's "Readable" feel target).

### 2.5 Hit-stop interaction

The GDD specifies **3-frame hit-stop on `PARRY_SUCCESS`** and a **0.05 s slow-mo pulse at 0.3× time scale on perfect parry**. Audio behavior:

- **Hit-stop (3 frames ≈ 50 ms): audio does NOT freeze.** The clang transient and ring continue playing in real time through the visual freeze. Freezing audio for such a short window causes an audible glitch/gate and kills the "satisfying" feel. The visual freeze + continuous ringing tail is what sells the impact — this is standard for action games (e.g., character-action titles).
  - Implementation note: the clang event must be fired by the **`OnParrySuccess` notify**, not gated behind the hit-stop timeline. Hit-stop is a render/sim pause only; the audio voice plays on the audio clock.
- **Perfect-parry slow-mo (0.05 s @ 0.3× time scale):** here we DO want an audible effect to match the visual.
  - Apply a brief, synchronized **pitch/time pull on the perfect-clang tail only** — a short downward pitch dip and low-pass smear during the slow-mo window, resolving back to normal as time scale returns to 1.0. This reads as a tasteful "slow-mo whoomph" rather than a glitch.
  - Music and ambience are NOT time-stretched (would sound broken); only the dedicated perfect-clang tail layer and a one-shot "slow-mo riser" sweetener follow the time scale.

---

## 3. Perfect-Parry Distinction

The perfect parry (contact within `PerfectParryWindowMs`, default 60 ms) must be **instantly and unmistakably** more satisfying than a normal parry — it is the skill-expression payoff of the whole system (GDD §3.6, AC-16/17/18). It is made distinct on five axes simultaneously, so even a player with reduced hearing in one range catches it:

1. **Dedicated sub-layer (felt weight):** the perfect clang (#3) adds a tuned **sub-octave thump (~60–90 Hz)** absent from the normal clang. This is the single biggest "feel" differentiator — it adds body the normal parry lacks and pairs with stronger controller rumble (GDD AC-36).
2. **Pitch & harmonic content:** perfect clang body is authored from a **cleaner, more harmonically rich struck-blade** (bell-like, in tune) versus the normal clang's grittier, slightly detuned ring. Perfect uses **near-fixed pitch (PV ±1 semitone)** so it always rings "true" and recognizable; normal clang's wider variation makes it feel comparatively "rougher."
3. **Reverb tail:** perfect clang routes to a **dedicated lush reverb send** (long, bright plate/hall, ~1.4 s) that the normal clang does not use (normal gets a short ~600 ms shimmer). The extended bloom is the sonic "halo" of a perfect read.
4. **Transient sweetener:** an added designed **snap/sparkle transient** sits on top of the metal click — a tiny "ting" overtone that the ear registers as "cleaner / more precise."
5. **Slow-mo audio pull (§2.5):** the synchronized brief pitch dip + low-pass smear during the 0.05 s slow-mo pulse gives perfect parries a unique temporal signature no other event has.

Mix support: perfect clang is allowed **+2 dB** over the normal clang on IMPACTS_BUS and triggers the -3 dB music duck (§2.3). The combination of sub-thump, lush tail, brighter transient, time-pull, and a momentary music dip makes the perfect parry feel like the room briefly opens up around the player.

**Contrast guarantee:** a normal parry must never accidentally sound "perfect." Keep the sub-layer, lush reverb send, and slow-mo pull strictly gated to the `PerfectParryWindowMs` branch (AC-19). If the contact is even 1 ms late, the player hears the plainer normal clang — this trains timing through audio alone.

---

## 4. Spatialization

### 4.1 3D positioning

- **Player's own parries (#1–#5, #8, #10, #11):** emitted from the **player weapon/contact point**. Because the camera is near the player, these are effectively front-and-center but still benefit from a small amount of 3D pan tied to the contact point (e.g., a deflect on the player's left pans slightly left). Keep spread modest so they stay punchy and present.
- **Counter cues (#6, #7):** **fully 2D / non-diegetic UI** — always centered, no attenuation, no occlusion. This guarantees the counter window is never missed due to camera angle or distance (critical for the rhythmic mastery loop and for accessibility).
- **Boss poise-break (#9):** emitted from the **boss's position** (large-source spread), so its direction reinforces where the now-vulnerable boss is. Generous 3D spread + the reverb tail give it cinematic scale.
- **Projectile deflect (#10):** the ping originates at the deflection point; the **tail whoosh pans/Dopplers from the player toward the attacker's position** to sell the redirect (GDD §4.2 returnable projectile).

### 4.2 Distance attenuation — parries by OTHER combatants

In co-op, crowd fights, or PvP (GDD §4.6), other entities also parry. To avoid a cacophony of clangs:

- **Attenuation curve:** other-combatant parry clangs use a tighter rolloff than the player's. Suggested: full level to ~3 m, then a smooth rolloff to silence by ~25 m (logarithmic). The player's own parries ignore this (always near-field).
- **Low-pass over distance:** progressively low-pass distant parries (e.g., -6 dB/oct above 4 kHz starting at ~8 m) so far clangs read as "someone parried over there" without competing with the player's bright near-field clangs.
- **Priority & voice limiting (see §1 Priority column):** cap concurrent non-player parry clangs (suggested max 3 simultaneous on IMPACTS_BUS from non-player sources); excess steals lowest-priority/farthest voices first. The local player's parry is `Critical` and never steals-out.
- **"Importance" duck:** when the local player parries, briefly duck other-combatant impact voices by ~3 dB so the player's own action stays legible in a crowd.
- **Reverb by environment:** parry tails feed the environment reverb send so a parry in a cave rings longer than one in the open — reinforces space without extra assets.

---

## 5. Accessibility

Design goal: the parry system must be **fully playable with strong reliance on audio**, complementing (not duplicating) the GDD's non-color visual requirements (§5.7, AC-39). Every state that has a distinct visual must have a distinct, learnable sound.

### 5.1 Distinct, non-overlapping audio identities

Each outcome occupies a different sonic "slot" so it's identifiable by ear alone, even out of the player's central vision:

| Outcome | Audio identity (one-line "what you hear") |
|---------|-------------------------------------------|
| Normal parry | Bright metallic clang, medium ring |
| Perfect parry | Cleaner, fuller clang + sub-thump + long lush tail (obviously "better") |
| Guard break (0 stamina) | Clang that cracks and bends downward (obviously "weaker/failed") |
| Whiff / mistimed | Dull thud + air, NO metal ring (obviously "nothing happened") |
| Counter window open | Crisp rising 2-note chime (UI, always centered) |
| Counter window closing | Soft downward blip (window lost) |
| Counter hit | Heavy, low-punch impact (clearly a big hit) |
| Boss poise-break | Huge shatter + sub + roar, music ducks (unmistakable milestone) |
| Projectile deflect | High ping + outgoing whoosh (clearly a redirect) |
| Unparryable broke through | Clang collapsing into a downward impact (clearly "that one got me") |

The key contrasts an audio-reliant player must distinguish are reinforced by **direction of pitch movement** (perfect = stable/up-bright; guard-break and unparryable = bend downward = "bad") and **presence/absence of the metal ring** (success has it; whiff doesn't). These are coarse, low-frequency-discriminable cues, not subtle timbral ones.

### 5.2 Counter window — audio-first affordance

The `COUNTER_WINDOW` cue (#6) is the most important accessibility cue: it is a **clean, musical, always-centered, never-ducked 2D sound** so a player relying on audio knows precisely when to press attack. Optionally expose a setting to add a **looping tick or pulse for the duration of the counter window** (paced to `CounterWindowMs`) so the player can hear the window counting down, not just its opening.

### 5.3 Redundancy with rumble (cross-modal)

Per GDD AC-36, success fires controller rumble. Map rumble intensity to outcome so a player can also feel the distinction: perfect parry = strongest rumble (matches sub-layer), normal = medium, guard-break = short stuttery rumble, whiff = none/very light. This gives a third channel (audio + haptics + visual) for the same information.

### 5.4 Loudness & comfort

- **Loudness normalization:** ship the integrated -23 LUFS reference (§0.2). Avoid sudden spikes; the boss poise-break — the loudest event — must still respect the -1 dBTP true-peak ceiling and the chosen Dynamic Range setting.
- **Dynamic Range presets:**
  - *Night/Compressed:* tighter compression, boss break and counter impacts pulled down, quiet sounds (startup whoosh, counter cue) brought up — narrow range for low-volume / shared-space play.
  - *Standard:* the spec as written.
  - *Cinematic:* widest range, full impact of the boss break.
- **Independent volume sliders:** expose separate sliders for **Impacts (SFX)**, **UI Cues**, and **Music** so an audio-reliant player can raise UI/counter cues and lower music to taste. Counter cue audibility must hold up even at low overall volume (it's on its own bus for this reason).
- **No information conveyed by stereo position alone:** all gameplay-critical cues (counter window, perfect vs normal, unparryable) remain identifiable in **mono** and when centered, for players with single-sided hearing or mono output. Spatialization is reinforcement, never the sole carrier of meaning.
- **Hearing-safety:** no sustained tones near the limiter; the brightest transients (deflect ping, perfect snap) are short and band-limited to avoid fatigue over long sessions.

---

## 6. Implementation Hooks (summary for integration)

So engine integration is unambiguous, here are the exact GDD signals each event must bind to:

| Event ID | Bind to |
|----------|---------|
| `Play_Parry_Startup_Whoosh` | anim notify `OnParryActiveBegin` |
| `Play_Parry_Clang_Normal` | `OnParrySuccess` + branch: contact time > `PerfectParryWindowMs` |
| `Play_Parry_Clang_Perfect` | `OnParrySuccess` + branch: contact time ≤ `PerfectParryWindowMs` |
| `Play_Guard_Break` | `PARRY_SUCCESS` + `GetCurrentStamina()==0` |
| `Play_Parry_Whiff` | `PARRY_RECOVERY` (no contact) or `PARRY_FAIL` (mistimed, parryable) |
| `Play_Counter_Window_Cue` | anim notify `OnCounterWindowOpen` |
| `Play_Counter_Window_Close` | anim notify `OnCounterWindowClose` |
| `Play_Counter_Hit_Impact` | first attack damage event inside `COUNTER_WINDOW` |
| `Play_Boss_PoiseBreak` | Poise Break Meter fill → `VULNERABLE` transition |
| `Play_Projectile_Deflect_Ping` | parryable projectile redirect resolution |
| `Play_Unparryable_Break` | `Unparryable==true` contact during `PARRY_ACTIVE` → `PARRY_FAIL` |

Mix-critical reminders:
- Fire clang on the audio clock, NOT gated by hit-stop (§2.5).
- Music/foley ducks are sidechained off events #9 / #3 / perfect-#8 (§2.3).
- UI_CUE_BUS is 2D and never ducked (§2.1, §4.1, §5.2).

---

*End of Document*
