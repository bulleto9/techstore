# Melee Parry System — VFX & Shader Specification

**Document version:** 1.0
**Date:** 2026-06-08
**Author:** Tech Art (Combat Team)
**Status:** Draft
**Source GDD:** `design/gdd/melee-parry-system.md` (v1.0) — see §2.2 state machine, §3.6 perfect parry, §4.4 boss attacks, §5.6 A/V feedback, §7 acceptance criteria.

---

## 0. Scope & Conventions

This is an **engine-agnostic authoring spec**. There is no engine in this repo; the deliverable is the description of VFX events, shader inputs, timing, accessibility cues, and budgets that an implementer would translate into engine assets.

- **Frame rate baseline:** 60 fps. **1 frame = 16.667 ms.** All "frames" below are at 60 fps unless noted.
- **Hit-stop convention:** "hit-stop N frames" = global time scale set to ~0 for N rendered frames, then restored. VFX simulation is paused during hit-stop unless flagged `IgnoreHitStop` (used by flash/UI cues that must keep reading).
- **Time scale:** `1.0` = real time. Slow-mo values are absolute target time scales.
- **Color notation:** linear-ish sRGB hex + an HDR intensity multiplier (`I=`) for bloom. `I=1.0` is screen-white reference; emissive cores exceed `1.0` to bloom.
- **Trigger signals** are the animation events / state transitions named in GDD §2.2 and §5.1: `OnParryActiveBegin`, `OnParryActiveEnd`, `OnParrySuccess`, `OnCounterWindowOpen`, `OnCounterWindowClose`, plus resolution outcomes from the Parry Resolution logic (§5.3).
- **Anchor sockets:** `WeaponContact` (sword/shield leading edge — the parry hitbox capsule origin, §5.3), `PlayerRoot`, `Camera`, `ScreenSpace` (post overlay), `AttackerRoot`, `BossRoot`.

---

## 1. VFX Event Table

One row per gameplay event. Durations are the **visual lifetime** of the effect (emission + tail), independent of the gameplay state duration unless they coincide. "Trigger signal" is the exact gameplay/anim event that spawns the VFX.

| # | Event | Trigger signal | Visual description | Particle / decal elements | Color / intensity | Duration (ms) |
|---|---|---|---|---|---|---|
| 1 | **Parry startup** | `Parry_Startup` state enter (input accepted) → anim event `OnParryStartup` | Faint anticipatory glint sliding along the weapon/shield leading edge; tells the player the parry is "arming." No world impact. | 1 thin additive ribbon along `WeaponContact`; soft edge-glow material pulse on weapon mesh. | Cool steel-blue `#5B8FCF`, `I=0.6`. Low intensity by design (must not read as success). | ~50 ms (matches `ParryStartupFrames`=3f). Fades as state ends. |
| 2 | **Parry active (window open)** | `OnParryActiveBegin` (hitbox enabled, §5.3) | Steady shimmering "guard plane" — a faint translucent capsule/arc hovering at the parry hitbox, signaling the live window. Subtle, readable, not flashy. | 1 looping shader quad/arc (the guard-plane, see §2.1 ancillary); 2–4 slow drifting motes. | Cyan-white `#8FD4E8`, `I=0.5`, additive, ~25% opacity. Gentle 6 Hz opacity breathe. | Loops for `EffectiveParryWindowMs` (default 200 ms, clamp 80–400). Ends on `OnParryActiveEnd`. |
| 3 | **Normal parry success** | `OnParrySuccess` AND outcome=`PARRY_SUCCESS` (non-perfect, sufficient stamina) | Sharp metallic **clash burst** at contact point: radial spark fan + a single hard flash + a fast expanding shock ring. Reads as "clean deflection." | Spark burst (see §1.1 counts); 1 flash card (camera-facing); 1 shock-ring mesh (expanding); short smoke wisp; optional ground spark-scatter decal (faded). | Hot white core `#FFFFFF` `I=2.2`, spark gradient white→amber `#FFC24A`, ring steel-cyan `#7FB8D6` `I=1.2`. | ~280 ms total (flash 60 ms, sparks 250 ms tail, ring 180 ms). Paired hit-stop 3f (§3). |
| 4 | **PERFECT parry success** | `OnParrySuccess` AND outcome=`PARRY_SUCCESS` AND contact within first `PerfectParryWindowMs` (default 60 ms) of `PARRY_ACTIVE` (§3.6) | Everything in #3, amplified, **plus** a signature reading: bright omni flash, expanding chromatic shock ring, radial speed-lines, and a brief slow-mo pulse. This is the "achievement" beat. | Larger spark burst (≈1.6× count); 2 nested shock rings; 8–12 radial speed-line ribbons; chromatic-pulse fullscreen shader (§2.2); lingering ember motes. | Core `#FFFFFF` `I=3.0`; signature accent **gold-white** `#FFE9A8`; rings shift cyan→magenta via chromatic split. Distinctly brighter + gold-tinted vs normal. | ~420 ms total. Slow-mo pulse 50 ms @ 0.3× time scale (§5.6) overlapping hit-stop. |
| 5 | **Guard-break (zero-stamina parry)** | outcome=`PARRY_SUCCESS` with `GetCurrentStamina()==0` → guard-break variant (§2.4 / §3.1, 50% negation, no counter) | Strained, "cracked" deflection: weaker sparks, a visible **guard crack** overlay flickering on the shield/weapon, a downward shower of dim embers, no triumphant ring. Reads as "you barely held." | Reduced spark burst (≈0.5×); cracked-glass decal flicker on guard mesh; falling ember trickle; brief desaturation vignette. | Dull amber→grey `#C9A05A`→`#6E6E6E`, `I=0.8`. Deliberately dim, desaturated — clearly "worse" than success. | ~300 ms. **No** hit-stop boost (use reduced 1f). |
| 6 | **Parry fail (mistimed / unparryable)** | outcome=`PARRY_FAIL` (wrong timing per §2.2, or `Unparryable=true` contact per §4.1) | Heavy dull impact, no sparks: a muddy concussion puff at contact, a red screen-edge flash, and (unparryable only) a red "broke-through" burst + screen shake (§4.1, §5.6). | Concussion puff (smoke, no sparks); 1 impact-dust decal; `ScreenSpace` red edge-flash; (unparryable) extra red shard burst at contact. | Desaturated grey-brown `#5A4A3E` `I=0.6`; screen edge red `#D23A2A` `I=1.0` (alpha pulse). No bright core. | ~250 ms. Red edge-flash 180 ms. Unparryable adds shake 120 ms. |
| 7 | **Counter-window open** | `OnCounterWindowOpen` (state `COUNTER_WINDOW` enter, §2.2) | Player-attractor cue: warm screen-edge glow + a pulsing ring/chevron at the player and on the attack-button prompt, inviting the counter. Persistent but subtle. | Looping `ScreenSpace` edge-glow (warm); pulsing world ring at `PlayerRoot`; UI prompt pulse (handled by UI but VFX-mirrored as a 3D chevron). | Warm gold `#FFB347` `I=0.9`, ~2 Hz pulse. Reads as "opportunity," not "danger." | Loops for `CounterWindowMs` (default 600 ms). Ends on `OnCounterWindowClose`. |
| 8 | **Counter hit** | First attack landed during `COUNTER_WINDOW` (the bonus-damage hit, §3.5) | Empowered strike impact: gold-tinted slash trail + a punchy crit-style burst on the target, heavier than a normal hit to sell the bonus damage. | Weapon slash trail (gold); target impact burst (sparks + blood/energy per target type); brief gold rim-light flash on target (shader §2.x rim). | Gold `#FFD24A` `I=1.8` core, white sparks. Notably "premium" vs normal hit. | ~300 ms. Optional micro hit-stop 2f. |
| 9 | **Boss poise-break** | Poise Break Meter fills → boss enters `VULNERABLE` phase (§4.4) — NOT standard stagger | Large-scale signature: a **poise shatter** — fractured energy plates burst outward from the boss, a ground shock-ring + dust kick, a sustained vulnerable aura, and a strong slow-mo emphasis. The "you broke it" payoff. | Shatter shards (energy-plate mesh fragments, §2.4); large ground shock-ring; radial dust; sustained looping vulnerable aura at `BossRoot`; column light flash. | Shards white-hot `#FFFFFF` `I=2.6` → cooling cyan `#6FD0E0`; aura pulsing magenta-cyan to mark vulnerability. High intensity, screen-dominant. | Shatter burst ~600 ms; vulnerable aura loops for full `VULNERABLE` phase. Slow-mo 120 ms @ 0.35×. |
| 10 | **Projectile deflect** | Parryable projectile (`Parryable=true`) redirected at attacker (§4.2) | Crisp deflection spark at contact + a redirected energy/streak trail following the projectile back toward the attacker, plus a small ring pulse. Reads as "sent it back." | Contact spark burst (small, ≈0.5× of #3); redirected projectile trail (re-tinted to "player-owned" color); small shock ring; faint motion-line. | Contact white `#FFFFFF` `I=2.0`; redirected trail tinted player-cyan `#5BD6FF` `I=1.4` (visually distinct from incoming enemy projectile color). | Contact burst ~200 ms; redirected trail lives with the projectile until it hits/expires. |

### 1.1 Per-event particle counts (peak live particles)

| Event | Sparks | Ribbons/trails | Ring meshes | Smoke/dust | Decals | Peak total |
|---|---|---|---|---|---|---|
| Parry startup | 0 | 1 | 0 | 0 | 0 | ~1 |
| Parry active (loop) | 0 | 1 | 0 (1 guard-plane quad) | 0 | 0 | ~5 (w/ motes) |
| Normal success | 24–32 | 0 | 1 | 4 | 1 | ~40 |
| **Perfect success** | 40–52 | 8–12 | 2 | 6 | 1 | ~70 |
| Guard-break | 10–14 | 0 | 0 | 6 | 1 (crack) | ~24 |
| Parry fail | 0 | 0 | 0 | 8–12 | 1–2 | ~16 |
| Counter-window (loop) | 0 | 0 | 1 | 0 | 0 (UI) | ~4 |
| Counter hit | 16–24 | 1 | 0 | 3 | 1 | ~30 |
| **Boss poise-break** | 30–40 | 0 | 1–2 | 12–16 | 1 | ~24 shards + ~70 = **~110** |
| Projectile deflect | 10–16 | 1 | 1 | 2 | 0 | ~24 |

> Boss poise-break is the only event permitted to exceed the standard per-event budget (§5); it is rare and cinematic.

---

## 2. Shader Effects

All shaders are described by **purpose, inputs/parameters, and behavior**, not engine syntax. Parameters marked `[anim]` are driven over the effect lifetime by a normalized curve `t01 ∈ [0,1]`.

### 2.1 Spark / Clash shader (`S_ParryClash`)

Used by: normal success, perfect (amplified), guard-break (dimmed), projectile deflect, counter hit.

Drives both the **spark particles** (additive, stretched-billboard) and the **shock-ring mesh**.

| Input | Type | Default | Notes |
|---|---|---|---|
| `SparkColorCore` | color HDR | `#FFFFFF I=2.2` | Hot center of each spark. Perfect raises to `I=3.0`, gold-tinted. |
| `SparkColorTail` | color | `#FFC24A` | Spark gradient endpoint (amber). |
| `SparkStretch` | float | 3.0 | Velocity-aligned billboard stretch; sells speed. |
| `SparkIntensity` | float `[anim]` | curve 2.2→0 | Decays over spark life; feeds bloom. |
| `RingColor` | color HDR | `#7FB8D6 I=1.2` | Shock-ring tint. Perfect: chromatic-split (see §2.2). |
| `RingRadius` | float `[anim]` | 0→1.4 m | Expansion curve (ease-out). |
| `RingThickness` | float `[anim]` | 0.25→0 m | Thins as it expands; fades out. |
| `RingErosion` | float `[anim]` | 0→1 | Noise-driven dissolve so the ring breaks up at the end. |
| `ContactNormal` | vec3 | from overlap | Orients spark fan along the deflection plane (parry-hitbox normal, §5.3). |
| `IntensityScale` | float | 1.0 | Master multiplier: perfect=1.6, guard-break=0.5, projectile=0.8. |
| `DesaturateAmount` | float | 0.0 | Guard-break sets ~0.6 to read "strained/worse." |

Behavior: spark emission is a single-frame burst on trigger; ring is a one-shot mesh scaled by `RingRadius`. Core uses HDR > 1 to bloom; tail stays in-range to avoid a white blob.

**Ancillary — Guard-plane (`S_ParryGuardPlane`, event #2):** simple additive Fresnel-edged arc/capsule shell. Inputs: `EdgeColor` (`#8FD4E8`), `Opacity` (0.25), `BreatheHz` (6), `FresnelPower` (3.0). Pure readability cue for the active window; no impact response.

### 2.2 Perfect-parry flash / chromatic pulse (`PP_ChromaPulse`)

Fullscreen post overlay, additive. Flagged `IgnoreHitStop` so it animates while the game is frozen (the flash must be seen during the freeze).

| Input | Type | Default | Notes |
|---|---|---|---|
| `FlashColor` | color HDR | `#FFE9A8 I=1.8` | Signature gold-white. The distinctive perfect-parry tell (AC-16). |
| `FlashCurve` | float `[anim]` | 0→1→0 over 120 ms | Fast in (~16 ms), slower out. |
| `ChromaOffset` | float `[anim]` | 0→6 px→0 | RGB channel split magnitude radiating from contact screen-pos. |
| `ChromaCenterUV` | vec2 | contact→screen | Split radiates from the clash point, not screen center. |
| `RadialBlurStrength` | float `[anim]` | 0→0.4→0 | Brief speed-line radial blur toward edges. |
| `VignetteBoost` | float | 0.15 | Slight darken at edges to focus the eye on the flash. |
| `ShapePulse` | float `[anim]` | — | Drives the **non-color** ring/burst-shape overlay for accessibility (see §4). |

Behavior: triggered only on perfect outcome. Total post-pulse ~150 ms; overlaps the 50 ms slow-mo and the 3f hit-stop. Chromatic split must be subtle enough to avoid motion-sickness complaints (cap 6 px at 1080p, scale with resolution).

### 2.3 Slow-mo / hit-stop visual (`HS_TimeEmphasis`)

This is the **visual dressing** that accompanies the gameplay time-manipulation (hit-stop on success, slow-mo pulse on perfect/poise-break, §5.6). The actual time-scale change is gameplay-owned; this shader sells it.

| Input | Type | Default | Notes |
|---|---|---|---|
| `Mode` | enum | `HitStop` | `HitStop` (freeze), `SlowMo` (sustained), `None`. |
| `FreezeFrames` | int | 3 | Number of frozen frames for `HitStop` (success). |
| `SlowMoScale` | float | 0.3 | Target time scale for `SlowMo` (perfect=0.3, poise-break=0.35). |
| `SlowMoDurationMs` | float | 50 | 50 ms perfect; 120 ms poise-break. |
| `EaseInMs` / `EaseOutMs` | float | 8 / 60 | Ramp the time scale to avoid a jarring snap on exit. |
| `DesatDuringFreeze` | float | 0.2 | Slight global desaturation during freeze to punch the contact color. |
| `EdgeSharpen` | float | 0.15 | Subtle sharpen during freeze to make the frozen frame "crisp." |

Behavior: during hit-stop, world particle sim pauses (except `IgnoreHitStop` flagged FX). On exit, ease the time scale back over `EaseOutMs` so the resume reads smooth. Hit-stop and the perfect flash are coincident (the flash is most legible against the frozen frame).

### 2.4 Boss poise-break shatter (`S_PoiseShatter`)

Used by event #9. Combines a fractured-mesh burst with a sustained vulnerable aura.

| Input | Type | Default | Notes |
|---|---|---|---|
| `ShardMesh` | mesh set | energy-plate frags | Pre-fractured boss "poise shell." |
| `ShardCount` | int | 30–40 | Outward-launched fragments. |
| `ShardColorHot` | color HDR | `#FFFFFF I=2.6` | Initial shard emissive. |
| `ShardColorCool` | color `[anim]` | →`#6FD0E0` | Shards cool to cyan as they fly + dissolve. |
| `ShardLaunchSpeed` | float `[anim]` | 6→0 m/s | Burst then decelerate. |
| `ShardDissolve` | float `[anim]` | 0→1 | Noise dissolve so shards vanish rather than pop off. |
| `ShockRingRadius` | float `[anim]` | 0→3 m | Large ground ring (reuses §2.1 ring). |
| `AuraColor` | color HDR | magenta↔cyan `I=1.5` | **Sustained** vulnerable-state aura; loops the whole `VULNERABLE` phase as the on-state read (AC-27 distinct from stagger). |
| `AuraPulseHz` | float | 1.5 | Slow pulse so "vulnerable" stays legible without flicker. |
| `ColumnFlashIntensity` | float `[anim]` | 4→0 | One-shot vertical light column at break moment. |

Behavior: one-shot shatter (~600 ms) launched at the poise-break frame, then hands off to the looping `AuraColor` state effect that persists until the boss exits `VULNERABLE`. Pair with the 120 ms @ 0.35× slow-mo (`HS_TimeEmphasis`).

---

## 3. Timing & Hit-Stop (frame-by-frame, 60 fps)

All anchored to GDD §2.2 (state durations), §5.6 (feedback), and §7.1/§7.5 (acceptance frames). **1 frame = 16.667 ms.**

### 3.1 Master parry timeline (input → success)

| Frame (0-idx) | t (ms) | Gameplay (GDD) | VFX / anim-event sync |
|---|---|---|---|
| 0 | 0 | Parry input accepted; enter `PARRY_STARTUP` | `OnParryStartup` → spawn startup glint (#1). |
| 1–3 | 16–50 | Startup (`ParryStartupFrames`=3) | Glint slides along edge; intensity holds low. |
| 4 | ~67 | Hitbox **active** (AC-01: enabled frame 4) → `OnParryActiveBegin` | Start guard-plane loop (#2). Perfect sub-window opens here. |
| 4 → ~7.6 | 67 → 127 | **Perfect window** = first `PerfectParryWindowMs` (60 ms) of active (§3.6) | Contact here ⇒ perfect branch (#4 + §2.2 + slow-mo). |
| 4 → ~16 | 67 → 267 | `PARRY_ACTIVE` for `ParryWindowMs` (200 ms) | Guard-plane loops; awaiting contact. |
| C (contact) | — | Attack hitbox overlaps → Parry Resolution | On `PARRY_SUCCESS`: fire `OnParrySuccess`. |
| C | — | `PARRY_SUCCESS`, dmg=0, stamina spent, attacker stagger, counter opens | **Hit-stop begins (3 frames, AC-34).** Spark clash burst (#3) at contact same frame as state transition (AC-31 parity w/ SFX). Camera shake 100 ms mag 0.03 (§5.6, AC-35). Rumble (AC-36). |
| C → C+3 | +50 | Hit-stop active (§5.6: 3 frames) | World sim frozen; flash card + perfect post (`IgnoreHitStop`) keep animating. Sparks "held" on frozen frames, then resume. |
| C+3 | — | Hit-stop ends; time scale eased back (`EaseOutMs`≈60) | Sparks resume sim; shock ring expands; smoke wisps. |
| C → C+~36 | +600 | `COUNTER_WINDOW` (600 ms) → `OnCounterWindowOpen` | Counter-window cue loop (#7) starts within 1 frame (AC-12). |
| C+~36 | — | Window closes if no attack → `OnCounterWindowClose` | Stop counter cue (#7). |

### 3.2 Hit-stop & slow-mo summary

| Outcome | Time effect | Frames / ms | Source | VFX coupling |
|---|---|---|---|---|
| Normal success | Hit-stop | **3 frames** (50 ms) | §5.6, AC-34 | Spark burst held during freeze; ring/smoke resume after. |
| Perfect success | Hit-stop 3f **+** slow-mo pulse | 50 ms @ **0.3×** | §5.6 | Chromatic pulse (§2.2) animates through freeze; slow-mo overlaps then eases out. |
| Guard-break | Reduced hit-stop | 1 frame (~17 ms) | derived (weaker beat than full success) | Dim sparks, crack overlay; no slow-mo. |
| Counter hit | Optional micro hit-stop | 2 frames (~33 ms) | derived (sells bonus dmg) | Gold burst on target. |
| Boss poise-break | Slow-mo pulse | **120 ms @ 0.35×** | derived from §4.4 emphasis | Shatter + column flash through the slow-mo. |
| Parry fail / unparryable | No hit-stop (concussion only) | — | §4.1 / §5.6 | Red edge-flash; unparryable adds 120 ms shake. |

### 3.3 Anim-event → VFX binding (authoring contract)

Bind VFX spawns to the §5.1 animation events, never to wall-clock timers, so VFX stays in sync if anims are retimed:

- `OnParryStartup` → #1 startup glint.
- `OnParryActiveBegin` → #2 guard-plane loop **on**; arm perfect sub-window VFX branch.
- `OnParryActiveEnd` → #2 guard-plane loop **off**.
- `OnParrySuccess` → branch by Parry Resolution outcome: #3 / #4 (perfect) / #5 (guard-break); trigger hit-stop + camera shake + rumble.
- `OnCounterWindowOpen` / `OnCounterWindowClose` → #7 loop on/off.
- Counter attack's own impact event → #8 counter hit.
- Boss poise-meter-full event → #9 shatter + aura handoff.
- Projectile deflect resolution → #10.

> All success VFX spawn on the **same frame** as the state transition (AC-31/AC-34 require frame-coincident feedback). Do not defer to the next tick.

---

## 4. Accessibility (non-color cues)

Satisfies GDD §5.7 and **AC-39** (success/fail distinguishable by shape/rumble with color removed). Principle: **every state must be readable by shape + motion + rumble alone.** Color is an enhancement, never the sole signal.

| Event | Shape cue (color-independent) | Motion cue | Rumble (gamepad) | Distinct from |
|---|---|---|---|---|
| Parry active | Thin steady **arc** outline at guard | Gentle breathe (low motion) | none | Idle (no arc). |
| Normal success | **Radial star-burst** spark fan + single clean ring | Fast outward expand + 3f freeze | Short sharp pulse | Fail (no burst, no freeze). |
| **Perfect success** | Burst **+ double concentric ring** + radial speed-lines (a unique multi-ring silhouette) | Slow-mo pulse (unmistakable time change) | Double-tap rumble (distinct pattern) | Normal success (single ring, no slow-mo, no double-tap). |
| Guard-break | **Cracked / fractured** overlay silhouette (jagged lines) | Downward ember drip (gravity, not radial) | Long low rumble (strained) | Success (jagged vs clean radial). |
| Parry fail / unparryable | **No spark shape**; muddy puff + screen-edge **inward** flash; unparryable adds shake | Inward flash + shake (vs outward expand) | Buzz / harsh rumble (negative) | Success (inward vs outward motion; no freeze). |
| Counter-window open | Pulsing **chevron** at prompt + screen-edge glow shape | 2 Hz pulse (rhythmic, inviting) | Soft rhythmic rumble | Steady-state (chevron only appears in window). |
| Boss poise-break | **Shatter** silhouette (fragmenting plates) + sustained aura outline | Slow-mo + large outward shatter | Strong sustained rumble | Normal boss hit (no shatter, no aura). |

Additional rules:
- **Colorblind safety:** never rely on the success-cyan vs fail-red distinction alone. Shapes above (radial star vs jagged crack vs inward puff) are the primary read; provide a **High-Contrast VFX** toggle that boosts outline thickness and `I` of these shape cues.
- **Motion direction encodes outcome:** good outcomes expand **outward** (sparks, rings); bad outcomes pull **inward** (edge flash, puff). This works even in grayscale.
- **Time as a signal:** hit-stop (success) and slow-mo (perfect/poise-break) are color-free, universally legible cues; lean on them.
- **Rumble patterns are unique per outcome** (single sharp / double-tap / long strained / harsh buzz) so the controller alone disambiguates (AC-36, AC-39).
- **Photosensitivity:** cap chromatic-pulse and flash flicker; the perfect flash is a single in-out (no strobe). Provide a "Reduce Flashes" option that lowers `FlashColor I` and disables radial blur.

---

## 5. Performance Budget

Targets assume a 60 fps frame budget (~16.6 ms) on mid-tier hardware. Parry VFX must be **cheap and frequent** (sparks fire constantly in skilled play); only boss poise-break is allowed to be expensive (rare, cinematic).

### 5.1 Cost targets per event

| Event | Peak particles (§1.1) | GPU target (ms) | Overdraw budget | Notes |
|---|---|---|---|---|
| Parry startup | ~1 | < 0.05 | low | Single ribbon. |
| Parry active (loop) | ~5 | < 0.10 | low | Guard-plane is 1 translucent quad; keep opacity low to limit overdraw. |
| Normal success | ~40 | **< 0.30** | medium | The common case — must stay cheap. Sparks are additive billboards (no shadow, no lights). |
| Perfect success | ~70 | < 0.50 | medium-high | Adds fullscreen chromatic post (~0.10 ms alone). Rare relative to normal. |
| Guard-break | ~24 | < 0.25 | medium | Crack decal is 1 quad. |
| Parry fail | ~16 | < 0.20 | low-medium | Smoke can be costly (overdraw) — keep particle size modest. |
| Counter-window (loop) | ~4 | < 0.10 | low | Edge glow is screen-space, 1 pass. |
| Counter hit | ~30 | < 0.30 | medium | Shares spark shader with success. |
| **Boss poise-break** | ~110 | **< 1.2** (one-shot) | high (transient) | Exception budget; rare + cinematic. Aura loop after must drop to < 0.20 ms. |
| Projectile deflect | ~24 | < 0.25 | medium | Redirected trail is 1 ribbon. |

### 5.2 Budget rules & overdraw

- **Hard cap — overlapping parries:** in fast exchanges, up to ~3 success bursts may overlap. Combined transient particle ceiling **≤ 150 live particles**; combined GPU **≤ 1.0 ms**. Pool and cap; if exceeded, **cull oldest burst's tail** (sparks first, smoke last) — never the most recent contact.
- **Overdraw is the main risk** (additive sparks + translucent smoke/glow stack). Mitigations: keep additive sparks small; limit translucent layers to ≤ 3 stacked at the contact point; the guard-plane and counter-glow use low opacity; smoke uses soft-particle depth fade to avoid hard overdraw walls.
- **No dynamic lights** from parry sparks by default (emissive + bloom only). One optional short-lived point light on **perfect** and **poise-break** only (budget permitting), radius small, 1–2 frame life.
- **Pooling:** all spark/ring/decal systems are pre-warmed pools (no runtime allocation mid-combat). Decals fade and recycle within ~2 s; cap simultaneous parry decals at 8 (matches §5.2 of GDD's UI cap mindset).
- **LOD / distance:** beyond ~15 m, drop spark count by 50% and disable the chromatic post (it's a player-centric cue). Off-screen parries (other entities) spawn audio + minimal/no particles.
- **Hit-stop interaction:** because particle sim pauses during hit-stop, held sparks cost no sim time during the freeze — but they still draw (overdraw persists for those 3 frames). Account for the frozen burst remaining on screen when budgeting overlapping events.
- **Mobile / low-spec scalability:** a "Low VFX" tier reduces spark counts to the §1.1 lower bound, replaces the chromatic post with a flat flash, and disables smoke; shape/motion accessibility cues (§4) must remain intact at all tiers.

---

## 6. Open Items / Hand-off Notes

- **Color palette confirmation:** success-cyan vs counter-gold vs fail-red must be validated against the project's enemy-projectile and UI palettes to avoid collisions (projectile deflect §10 specifically re-tints to player-cyan — confirm no clash with friendly projectile colors).
- **Perfect-parry slow-mo length** (50 ms) is taken directly from §5.6; if QA finds it imperceptible at 60 fps (3 frames), consider raising to 80–100 ms — coordinate with combat design, do not change unilaterally.
- **Boss poise-break** timing (120 ms slow-mo, ~600 ms shatter) is derived, not GDD-specified; needs combat-design sign-off per encounter.
- **Multi-hit attacks (§4.3):** only the first deflected hit plays the success burst; remaining hits, if they land, use their normal enemy-attack impact VFX (out of scope here). `MultiHitParry=true` plays a single success burst for the whole negated sequence.
- Spec is engine-agnostic by design (no engine in repo); shader inputs map 1:1 to a node-graph or HLSL implementation when an engine is selected.

---

*End of Document*
