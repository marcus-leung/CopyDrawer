# 04 · Design Resources (animation, UI, icons, Claude skills & prompts)

_Research date: October 2026 · Purpose: a vetted shortlist to pick from when we design the UI. Nothing here is final until we choose._

Every resource is screened against four rules:

| Rule | Why |
|---|---|
| **Free + commercial use allowed** | We plan paid tiers |
| **GPL-3.0 compatible** | Our extension is GPL-3.0. Bundled code must be permissive (MIT / ISC / BSD / Apache-2.0 / OFL for fonts), with its license added to `BUNDLED` in `wxt.config.ts` |
| **MV3-safe** | Chrome extensions can't load remote code or use `eval` / `new Function`. Only `'self'` and `'wasm-unsafe-eval'` are allowed in script CSP. Everything is bundled locally |
| **Secure** | Maintained, popular, minimal dependencies, no telemetry, no CDN fetches at runtime |

Legend: ✅ recommended · 🟡 usable with care · ❌ avoid

---

## 1. Claude skills & plugins for design

### 1.1 Installed in this repo (project skill, committed)
| Skill | Source | License | What it does |
|---|---|---|---|
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) @ `683bc88` → `.claude/skills/frontend-design/` | Apache-2.0 (LICENSE.txt included) | Opinionated visual direction: subject-first design, typography, restrained purposeful motion, anti-"AI-default" checklist, plan → review → build → critique process |

Any Claude Code session opened in this repo can use it.

### 1.2 Already available in this environment (Design plugin by Anthropic)
`design:design-critique` · `design:design-system` · `design:design-handoff` · `design:accessibility-review` · `design:ux-copy` · `design:user-research` · `design:research-synthesis`. Plus built-in `artifact-design` and `artifact-diagramming` for shareable design pages and diagrams.

### 1.3 Worth installing on your Claude account (Anthropic Directory)
| Plugin | Publisher | Notes |
|---|---|---|
| **frontend-design** | Anthropic (official) | Same skill as above, account-wide |
| **Design** | Anthropic (official) | The `design:*` skills above, account-wide |
| design-skills (incl. `interaction-design`, `design-elevation`) | Community (Carlos Cuellar) | 🟡 Review the skill files before enabling; community content |
| tailwind-design-system | Community | 🟡 Same caution |

Security rule for skills: read every SKILL.md before installing (skills are instructions Claude follows). Prefer official Anthropic publishers. Never install skills that bundle scripts or hooks you haven't read.

### 1.4 Optional MCP servers for UI work
| Server | Use | Caution |
|---|---|---|
| shadcn/ui registry MCP | Browse and install shadcn components | 🟡 Third-party server; only for dev machines, never shipped |
| Magic UI MCP | Pull Magic UI animated components | 🟡 Same |

---

## 2. Animation libraries (code)

| Library | License | GPL-3 compat | MV3-safe | Verdict | Notes |
|---|---|---|---|---|---|
| **CSS transitions / keyframes + Web Animations API** | Native | ✅ | ✅ | ✅ **Default** | Zero bytes; best for content-script overlay (palette) |
| **View Transitions API** | Native (Chrome 111+) | ✅ | ✅ | ✅ | Smooth list ↔ detail transitions in side panel |
| **Motion** (`motion`, formerly Framer Motion) | MIT | ✅ | ✅ | ✅ **Primary React animation lib** | Layout/presence animations (clip added/removed/reordered, panel transitions). Use `LazyMotion` + `m` to keep bundle small. Motion+ (paid) examples are also MIT once bought, but not needed |
| **AutoAnimate** (`@formkit/auto-animate`) | MIT | ✅ | ✅ | ✅ (alternative) | One-line list add/remove animations; tiny |
| **React Spring** | MIT | ✅ | ✅ | 🟡 | Good physics, but redundant with Motion |
| **tw-animate-css** | MIT | ✅ | ✅ | ✅ | Tailwind v4 utilities (fade, slide, accordion), shadcn-compatible |
| **GSAP** | Proprietary "Standard No-Charge" license (Webflow) | ❌ **Not GPL-compatible** | ✅ | ❌ | Free since Apr 2025 but license is proprietary, revocable, and bans tools competing with Webflow. Conflicts with our GPL-3.0 release |
| **Animate.css** | Hippocratic License 2.1 | ❌ Not OSI/GPL-compatible | ✅ | ❌ | Ethical-use clauses; avoid license complexity |

## 3. Animated assets (designer-made animations)

| Resource | License | MV3 notes | Verdict |
|---|---|---|---|
| **Rive** runtimes (`@rive-app/react-canvas`) + Rive editor (free plan) | Runtimes MIT; files you make are yours | Uses WASM → add `'wasm-unsafe-eval'` to `extension_pages` CSP; **bundle the `.wasm` locally** (point the runtime to a local URL; don't fetch it from a CDN) | ✅ For 1–2 hero moments (onboarding, empty state); interactive state machines |
| **dotLottie player** (`@lottiefiles/dotlottie-react`) | MIT | WASM; known CSP issues in extensions; requires `'wasm-unsafe-eval'` and a **local wasm URL** | 🟡 Works with setup |
| **lottie-web** (full) | MIT | ❌ Uses `eval` / `new Function` for expressions → blocked by MV3 | ❌ |
| **lottie-web `lottie_light`** | MIT | No expressions, no eval (some bundler warnings reported) | 🟡 Only for simple animations |
| **LottieFiles free animations** | Lottie Simple License: free commercial use, no attribution, **but no redistributing as standalone files** | Our repo is public (GPL) → the raw `.lottie` files would be publicly downloadable standalone | 🟡 Legal grey area for an open repo. Prefer **our own animations** or CC0 assets |

## 4. UI component kits (React + Tailwind)

| Kit | License | Verdict | Notes |
|---|---|---|---|
| **shadcn/ui** | MIT | ✅ **Base kit** | Copy-paste components you own; built on Radix |
| **Radix UI primitives** | MIT | ✅ | Accessible headless components (dialogs, menus, tooltips) |
| **Magic UI** | MIT (free tier) | ✅ Pick a few | 150+ animated components (Motion + Tailwind); Pro $199 not needed |
| **Motion Primitives** | MIT | ✅ Pick a few | Animated building blocks (text effects, transitions) |
| **Aceternity UI** | Free tier for commercial use; reported MIT core | 🟡 Verify the license on each component before copying | Flashy effects; many are too heavy for a side panel |

## 5. Icons

| Set | License | Verdict |
|---|---|---|
| **Lucide** | ISC | ✅ Base icon set |
| **lucide-animated** (pqoqubbw/icons) | MIT | ✅ 350+ Motion-powered animated Lucide icons (hover/tap micro-interactions) |

## 6. Fonts

- Use **Google Fonts / Fontsource** families (SIL OFL: free, commercial, GPL-friendly as separate assets).
- **Bundle font files locally** (e.g. `@fontsource/*` npm packages). Don't load from Google's CDN, for privacy and offline use.

---

## 7. Extension-specific motion guidelines (draft)

1. **Motion answers actions.** Clip saved → small "pop" on the toolbar badge; clip pasted → brief confirmation; item removed → collapse. No decorative loops.
2. **One signature moment:** the first-run onboarding or the "collections forming" animation. Everything else stays quiet.
3. **Speed:** 120–200 ms for micro-interactions, ≤ 300 ms for panel transitions; ease-out on enter, ease-in on exit.
4. **`prefers-reduced-motion`** respected everywhere (Motion's `useReducedMotion`, CSS media query).
5. **Content-script overlay (palette):** CSS-only animations, inside Shadow DOM, so the injected bundle stays tiny and never clashes with page styles.
6. **Performance:** animate only `transform` / `opacity`; virtualize long clip lists before animating them.

## 8. Security checklist for any design dependency

- [ ] License is MIT / ISC / BSD / Apache-2.0 (or OFL for fonts); recorded in `THIRD_PARTY_NOTICES`
- [ ] No `eval` / `new Function` in the shipped bundle (grep the build output)
- [ ] No runtime CDN fetches (wasm, fonts, JSON animations all bundled)
- [ ] Actively maintained (release within ~12 months), widely used
- [ ] Pinned version + lockfile; review the diff on upgrades
- [ ] Bundle-size check (side panel target: fast first paint)

## 9. Proposed starting stack (to confirm in design phase)

**Tailwind v4 + shadcn/ui (Radix) + tw-animate-css + Motion (LazyMotion) + Lucide / lucide-animated + Fontsource fonts**, with **Rive** reserved for one onboarding moment. GSAP, Animate.css, and full lottie-web are excluded.

---

## 10. Reusable prompts (for the design phase)

Use these in Claude Code from this repo; they reference the installed skills.

**P1: Visual direction**
> Use the `frontend-design` skill. Our product is described in `docs/02-design.md` (a private clipboard manager for Chrome; general audience of students and knowledge workers). Propose 2 distinct visual directions as compact token systems (4–6 named hex colors, typefaces from Fontsource, layout concept with ASCII wireframes for the 400px-wide side panel, principles). Review each against the generic-AI defaults list and revise. Don't write code yet.

**P2: Wireframes for key flows**
> Using the chosen direction, create low-fidelity wireframes (ASCII or a single HTML page) for the key flows in `docs/02-design.md` §4: first run → first capture → first paste; search; Paste as…; pausing/blocking a site; turning on auto-capture (permission explainer); naming a collection and picking its color in place.

**P3: Design tokens + system**
> Use `design:design-system`. Turn the chosen direction into a token set (color incl. dark mode, type scale, spacing, radius, shadow, motion durations/easings) as Tailwind v4 theme variables, plus component inventory mapped to shadcn/ui components.

**P4: Motion spec**
> Write a motion spec for the extension following `docs/04-design-resources.md` §7: for each interaction (clip captured, clip pasted, collection formed, item deleted, panel open, palette open/close) give trigger, property, duration, easing, reduced-motion fallback, and library (CSS vs Motion). Only use libraries marked ✅ in that doc.

**P5: Microcopy**
> Use `design:ux-copy`. Write onboarding, permission-explainer, empty-state, and error copy for the extension. Plain, active voice, privacy-first, no hype.

**P6: Review**
> Use `design:design-critique` and `design:accessibility-review` on the wireframes/mockups: hierarchy, keyboard flow, focus states, contrast (WCAG 2.1 AA), reduced motion.

**P7: Handoff**
> Use `design:design-handoff` to produce component specs (props, states, tokens, animation details) for the side panel, clip card, palette overlay, and onboarding.

**P8: Dependency vetting**
> Before adding any UI/animation package, check it against `docs/04-design-resources.md` §8: license (GPL-3.0 compatible), no eval/new Function in build output, no runtime CDN fetches, maintenance status, bundle size. Report a pass/fail table.

---

## Sources
- Anthropic frontend-design skill: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- GSAP free announcement: https://gsap.com/blog/3-13/ · license terms: https://gsap.com/community/standard-license/ · https://scancode-licensedb.aboutcode.org/gsap-standard-no-charge-2025.html · discussion: https://news.ycombinator.com/item?id=43868273
- Motion: https://github.com/motiondivision/motion · https://motion.dev/plus · https://motion.dev/docs/gsap-vs-motion
- AutoAnimate: https://www.npmjs.com/package/@formkit/auto-animate
- React Spring license: https://github.com/pmndrs/react-spring/blob/main/LICENSE
- tw-animate-css: https://github.com/Wombosvideo/tw-animate-css
- Animate.css license: https://github.com/animate-css/animate.css/blob/main/LICENSE · https://github.com/animate-css/animate.css/issues/1364
- Lottie CSP/eval: https://github.com/airbnb/lottie-web/issues/323 · https://github.com/airbnb/lottie-web/issues/2927 · https://github.com/Gamote/lottie-react/issues/146
- dotLottie in extensions: https://github.com/LottieFiles/dotlottie-web/issues/434 · https://github.com/LottieFiles/dotlottie-web/issues/562
- LottieFiles license: https://lottiefiles.com/page/license · https://help.lottiefiles.com/hc/en-us/articles/45243303062681-Commercial-Use-Attribution
- Rive runtimes: https://www.npmjs.com/package/@rive-app/react-canvas · https://rive.app/docs/runtimes/getting-started · pricing: https://rive.app/docs/account-admin/pricing
- Chrome extension CSP (`wasm-unsafe-eval`, no remote code): https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy · https://groups.google.com/a/chromium.org/g/chromium-extensions/c/sJiaTnFMLHQ
- Magic UI: https://github.com/magicuidesign/magicui · https://magicui.net/pricing/
- Motion Primitives: https://github.com/ibelick/motion-primitives
- Aceternity UI: https://ui.aceternity.com/pricing
- lucide-animated: https://github.com/pqoqubbw/icons · https://lucide-animated.com/
