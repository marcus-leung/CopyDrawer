# 03 · Plan

_Process: [Research](01-research.md) → [Design](02-design.md) → **Plan**_

Assumptions: solo developer, **~20 hours/week**, using AI coding help; free product, no paid tier for now; numbers in USD.

---

## 1. Cost estimate

### 1.1 Unit costs

| Item | Cost | Notes |
|---|---|---|
| Chrome Web Store registration | **$5 one-time** | Up to 20 extensions |
| Domain | $0 | None bought; the privacy policy is on GitHub Pages |
| Apple Developer Program (Safari) | **$99/yr** | Needed for the Safari build; also requires a Mac with Xcode |
| Landing page hosting (Cloudflare Pages) | $0 | |
| Email updates (Buttondown or Resend free tiers) | $0 | Until ~1k subscribers |
| Backend | $0 | None: everything runs on the user's computer |

### 1.2 Scenarios

| Stage | Users | Monthly cost | Notes |
|---|---|---|---|
| **Build + free launch** | 0–1k | **$0–5** (+ $5 one-time) | All local; no backend |
| **Free growth** | 10k | **$0–5** | Still no backend; cost is optional tools |

**Bottom line:** **$5 to launch** on Chrome (+$99/yr when Safari ships) and roughly **$0–5/month**, because everything runs on the user's device. The real cost is **time**: ~200–300 hours to a polished v1.0.

Spending that's optional but worth it later: a designer for the icon and store assets ($100–300 one-time), a trademark search before committing to a name.

---

## 2. How hard is it to launch a Chrome extension?

| Part | Difficulty | Why |
|---|---|---|
| Publishing mechanics | 🟢 Easy | $5, 2-step verification, upload a zip, fill in the listing. A day of work |
| Passing review | 🟡 Medium | Usually 2–5 business days. **All-sites access can trigger an in-depth review (possibly weeks)**; we request it as an optional permission (Design §3) and test early with an unlisted build. Rejections come from vague permission justifications or a privacy policy that doesn't match the manifest |
| Building it well | 🟡 Medium | MV3 clipboard limits, capture on tricky sites, image storage |
| Getting discovered | 🔴 Hard | 90% of extensions stay under 1,000 users. The GTM plan below matters more than code |
| Keeping trust | 🟡 Medium | Secure updates, a clear privacy story, fast replies to reviews |

### 2.1 Launch checklist
- [ ] Developer account + 2-step verification (use a dedicated Google account; hardware key recommended)
- [x] Privacy policy page that lists every permission and exactly what data is used (local only): [site/privacy.md](../site/privacy.md), published at https://marcus-leung.github.io/CopyDrawer/privacy
- [x] Single-purpose statement: "Save, organize, and paste things you copy"
- [x] A justification for each permission ([07-store-listing.md](07-store-listing.md) §3)
- [ ] Data-usage disclosure form (certify Limited Use)
- [ ] Assets: 128px icon, 3–5 screenshots at 1280×800, 440×280 promo tile, 30–60 s demo video (YouTube); icon, screenshots and promo tile done ([assets/store](../assets/store)), video open
- [x] Store copy with keywords: "clipboard manager", "clipboard history", "copy paste"
- [ ] Unlisted beta listing first (tests the review process early and gets testers on real installs)
- [x] Support email: leungmarcus89@gmail.com (in the privacy policy)
- [ ] Feedback link + uninstall survey URL (`chrome.runtime.setUninstallURL`)

---

## 3. Go-to-market plan

### 3.1 Positioning & message
- **Category:** clipboard manager for Chrome.
- **Headline:** "Your clipboard, organized, private on your device."
- **Three proof points:** sorts itself · find it fast · paste it the way you need it.
- **Trust line:** free, no account, your clips never leave your device.
- **Competitive hook:** "The Clipboard History Pro alternative that handles images, sorts itself into collections, and never uploads your data."

### 3.2 Target segments & channels

| Segment | Where they are | Angle |
|---|---|---|
| Students | r/GetStudying, r/college, r/studytips, Chromebook communities, TikTok/YouTube study creators, Discord study servers | Collections with sources; "Chromebook clipboard history is too short" |
| Knowledge workers | r/productivity, LinkedIn, Product Hunt, productivity newsletters | Quick paste, Paste as, time saved |
| Developers / early adopters | Hacker News (Show HN), r/chrome_extensions, r/webdev, GitHub, X | Privacy, minimal permissions, clips never reach us (optional sync goes to your own Drive) |
| Privacy-minded | r/privacy, privacy newsletters | Local-only, malware context |

### 3.3 Timeline (relative to public launch week **L**)

**Pre-launch (L-8 → L-1): build an audience while building the product**
- L-8: name + landing page (hero, 3 proof points, GIF, email sign-up for launch news). Set up X/Bluesky.
- L-8 → L-1: **build in public**, posting 1–2 updates/week (GIFs of features, privacy decisions) on X, r/SideProject, Indie Hackers.
- L-3: **private beta** via unlisted listing to 30–50 sign-ups plus a feedback form and Discord or GitHub Discussions.
- L-2: collect testimonials; prepare launch assets (video, screenshots, PH gallery, HN post, Reddit posts tailored per subreddit).
- L-1: submit the final version early (review buffer); line up 10–20 people to try it and leave honest reviews on launch week (never incentivized fake reviews; that's against policy).

**Launch (L)**
- Chrome Web Store listing goes public.
- Show HN (privacy angle), Tue–Thu morning US time.
- Reddit: one genuine post per relevant subreddit, staggered over the week, following each sub's self-promo rules.
- Submit to directories: AlternativeTo (as an alternative to Clipboard History Pro, Paste, Ditto), SaaSHub, BetaList.
- Email the sign-up list.

**Post-launch (L+1 → L+12)**
- **Product Hunt** with the next feature release (~L+4), as a second moment.
- **SEO content** on the landing site, one article/week: "Best clipboard manager for Chrome (2026)", "Clipboard History Pro alternative", "How to see clipboard history on a Chromebook", "How to copy multiple things at once", "Clipboard managers and privacy: what extensions can see".
- **Short-form video:** 15–30 s demos (TikTok/Reels/Shorts): "quick paste into any form", "find that link from last week", "plan a trip from your clipboard".
- **Micro-creators:** reach out to 10–20 study and productivity creators (disclosed partnerships).
- **In-product loops:** review prompt after a value moment (e.g. the 20th paste from history), never on first use.
- **Respond to every store review** within 48 h; publish a changelog.
- Student-ambassador or campus pilot if the student segment is working.

### 3.4 Funnel & KPIs

| Stage | Metric | Target |
|---|---|---|
| Discover | Store listing views/week | Grows week over week |
| Install | Listing view → install | ≥ 20% |
| Activate | Within 24 h: ≥ 5 clips captured **and** ≥ 1 paste from history | ≥ 40% of installs |
| Retain | Active in week 1 / day 30 | ≥ 45% / ≥ 25% |
| Love | Store rating · review rate | ≥ 4.6★ · ≥ 1% of installs |
| North star | **Weekly active users who paste from history** | 1,000 by ~L+12 |

The extension has no analytics, so these come from the store dashboard, beta feedback and reviews.

### 3.5 GTM budget
**$0–300** for the first 3 months: optional icon/asset design. No paid ads until the funnel converts.

### 3.6 Decision gate (≈ L+12)
- ✅ ≥ 1k WAU, D30 ≥ 25% → keep building on what users use most (Phase 6).
- ❌ < 300 WAU or poor retention → revisit persona and hero feature (interview churned users) before adding features.

---

## 4. Development roadmap

| Phase | Weeks | Goal | Key deliverables | Exit criteria |
|---|---|---|---|---|
| **0. Research** | done | Understand market, constraints | [01-research.md](01-research.md) | ✅ |
| **1. Design** | 1–2 | Lock decisions | Name · design system (colors, type, components) · **unlisted test submission** (with optional all-sites permission) | ✅ Decisions locked, name chosen, design system done ([05](05-ui-design-system.md)). Unlisted test submission not yet made |
| **2. MVP build** | 3–7 | Free core | See [06-build-plan.md](06-build-plan.md) | ✅ v1.0 candidate built on `main` with unit + Playwright e2e tests, run locally before every push |
| **3. Private beta** | 8–9 | Real-world feedback | Unlisted listing · 30–50 testers · bug fixes · onboarding tuning | Activation ≥ 40% in beta; no P0 bugs; listing approved |
| **4. Public launch v1.0** | 10 | Distribution | Listed on the Chrome Web Store · launch campaign (§3.3) | Live; launch posts out |
| **5. Growth + Safari** | 11–16 | Second launch moment, retention, new platform | Paste stack · Product Hunt launch · SEO articles · **Safari build** (popup/tab UI) via Mac App Store | KPIs tracked weekly; Safari approved |
| **6. Expansion** | 17+ | Depth | Shareable boards · phone handoff · desktop companion · secret detection (Guard) | Driven by user feedback |

### 4.1 Engineering practices
- TypeScript strict, oxlint/Prettier, Vitest unit tests, Playwright e2e against the loaded extension (run locally with `pnpm check` before every push).
- No CI: `pnpm check` runs lint, typecheck, format check, unit tests, build, manifest check (all-sites access stays optional) and e2e locally before every push; `pnpm zip` → manual upload to the store (automate with the Chrome Web Store API later).
- Security: 2FA everywhere, dependency review, no remote code, Chrome's default strict CSP, signed tags.
- Versioning: semver; a changelog visible in the extension ("What's new").

---

## 5. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| In-depth review delays launch | Med | Med | Optional all-sites permission; unlisted build early; precise justification; privacy policy matches manifest exactly |
| Capture fails on custom-editor sites | Med | Med | Blank/srcdoc editor frames covered; panel "Grab clipboard" fallback; known gaps in the README |
| Low discovery | High | High | Build in public, SEO articles, Chromebook/student angle, two launch moments |
| Passwords copied on web pages get stored (no secret detection in MVP) | Med | Med | Seed site exclusions, pause + blocklist, local-only storage; add detection post-MVP |
| Safari API gaps (no side panel) | High | Low | Browser adapters from day one; Safari as fast-follow |
| Security incident / compromised account | Low | Critical | Hardware 2FA, minimal dependencies, reproducible builds |
| Local storage limits with many images | Med | Low | `unlimitedStorage`, image compression, retention policy |

---

## 6. Immediate next steps
Phases 0–2 are done, including copying several clips at once. Next is store submission (Chrome), then the **private beta** (Phase 3).
1. Screenshots and promo tile ([07-store-listing.md](07-store-listing.md) §5).
2. Trademark search ([08-branding.md](08-branding.md) §4).
3. Developer account ($5, non-trader) and the rest of the launch checklist (§2.1).
4. Upload the zip to the Chrome Web Store as an unlisted build and recruit 30–50 beta testers; then public launch (Phase 4).
