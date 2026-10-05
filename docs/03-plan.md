# 03 · Plan

_Process: [Research](01-research.md) → [Design](02-design.md) → **Plan**_

Assumptions: solo developer, **~20 hours/week**, using AI coding help; free-first strategy; numbers in USD.

---

## 1. Cost estimate

### 1.1 Unit costs

| Item | Cost | Notes |
|---|---|---|
| Chrome Web Store registration | **$5 one-time** | Up to 20 extensions |
| Edge Add-ons | $0 | |
| Domain | ~$12/yr | Landing page, privacy policy |
| Apple Developer Program (Safari) | **$99/yr** | Needed from Phase 5; also requires a Mac with Xcode |
| Landing page hosting (Cloudflare Pages) | $0 | |
| Waitlist / email (Tally, Buttondown, or Resend free tiers) | $0 | Until ~1k subscribers |
| Product analytics (PostHog free tier, 1M events/mo) | $0 | Anonymous events only |
| Error monitoring (Sentry free tier) | $0 | Strip clip content from reports |
| Backend (Cloudflare Workers) | $0 → **$5/mo** | Free tier is fine until Pro launches |
| Image storage (R2) | $0.015/GB-month, $0 egress | First 10 GB free |
| On-device AI (rules, embeddings, Gemini Nano) | **$0** | Runs on the user's machine |
| Cloud AI: Haiku 4.5, per transform (~600 in / 250 out tokens) | **~$0.002** | $1/$5 per M tokens |
| Cloud AI: Haiku 4.5, per title/classify (~300 in / 20 out) | ~$0.0004 | Only for devices without Nano |
| Cloud AI: Sonnet 5.5, per research Compose (~4k in / 800 out) | **~$0.016** | $2/$10 per M tokens |
| Payment fees (ExtensionPay 5% + Stripe ~2.9% + $0.30) | ~9% on $36/yr · ~15% on $4/mo | **Push annual plans** |

### 1.2 Scenarios

| Stage | Users | Monthly cost | Monthly revenue | Notes |
|---|---|---|---|---|
| **Build + free launch** | 0–1k | **$0–5** (+ ~$17 one-time) | $0 | All local; no backend needed except the waitlist form |
| **Free growth** | 10k | **$0–10** | $0 | If you add a small free cloud-AI quota for devices without Nano (30 actions/mo): +~$90/mo. **Recommendation: don't at first** |
| **Pro launched** | 10k free + 150 paying (1.5%) | ~$135: fees ~$50 · AI ~$75 · infra ~$10 | **~$490** | ~70% margin |
| **Scale** | 100k free + 1,500 paying | ~$1.3k: fees ~$500 · AI ~$750 · infra ~$50 | **~$4.9k** | Cap Pro cloud AI (e.g. 300 actions/mo) to protect margin |

**Bottom line:** under **$25 to launch** on Chrome/Edge (+$99/yr when Safari ships) and roughly **$0–10/month until Pro**, because all free AI runs on the user's device. The real cost is **time**: ~200–300 hours to a polished v1.0.

Spending that's optional but worth it later: a privacy-friendly analytics upgrade ($9/mo), a designer for the icon and store assets ($100–300 one-time), a trademark search before committing to a name.

---

## 2. How hard is it to launch a Chrome extension?

| Part | Difficulty | Why |
|---|---|---|
| Publishing mechanics | 🟢 Easy | $5, 2-step verification, upload a zip, fill in the listing. A day of work |
| Passing review | 🟡 Medium | Usually 2–5 business days. **All-sites access can trigger an in-depth review (possibly weeks)**; we request it as an optional permission (Design §4) and test early with an unlisted build. Rejections come from vague permission justifications or a privacy policy that doesn't match the manifest |
| Building it well | 🟡 Medium | MV3 clipboard limits, offscreen documents, capture on tricky sites, image storage, Nano feature detection |
| Getting discovered | 🔴 Hard | 90% of extensions stay under 1,000 users. The GTM plan below matters more than code |
| Keeping trust | 🟡 Medium | Secure updates, a clear privacy story, fast replies to reviews |

### 2.1 Launch checklist
- [ ] Developer account + 2-step verification (use a dedicated Google account; hardware key recommended)
- [ ] Privacy policy page that lists every permission and exactly what data is used (local only)
- [ ] Single-purpose statement: "Save, organize, and paste things you copy"
- [ ] A justification for each permission (write it during development, not at submission)
- [ ] Data-usage disclosure form (certify Limited Use)
- [ ] Assets: 128px icon, 3–5 screenshots at 1280×800, 440×280 promo tile, 30–60 s demo video (YouTube)
- [ ] Store copy with keywords: "clipboard manager", "clipboard history", "copy paste", "AI"
- [ ] Unlisted beta listing first (tests the review process early and gets testers on real installs)
- [ ] Edge Add-ons submission
- [ ] Support email + feedback link + uninstall survey URL (`chrome.runtime.setUninstallURL`)

---

## 3. Go-to-market plan

### 3.1 Positioning & message
- **Category:** AI clipboard manager for Chrome.
- **Headline:** "Your clipboard, organized by AI, private on your device."
- **Three proof points:** organizes itself · find anything by describing it · paste it the way you need it.
- **Trust line:** free, no account, open source, nothing leaves your device.
- **Competitive hook:** "The Clipboard History Pro alternative that handles images, organizes itself, and never uploads your data."

### 3.2 Target segments & channels

| Segment | Where they are | Angle |
|---|---|---|
| Students (primary, if chosen) | r/GetStudying, r/college, r/studytips, Chromebook communities, TikTok/YouTube study creators, Discord study servers | Research mode + citations; "Chromebook clipboard history is too short" |
| Knowledge workers | r/productivity, LinkedIn, Product Hunt, newsletters (e.g. productivity roundups) | Paste-as, templates, time saved |
| Developers / early adopters | Hacker News (Show HN), r/chrome_extensions, r/webdev, GitHub, X | Open source, privacy, local AI architecture |
| Privacy-minded | r/privacy, r/degoogle-adjacent, privacy newsletters | Local-only, malware context, Guard |

### 3.3 Timeline (relative to public launch week **L**)

**Pre-launch (L-8 → L-1): build an audience while building the product**
- L-8: name + domain + landing page (hero, 3 proof points, GIF, waitlist). Set up X/Bluesky and a GitHub repo.
- L-8 → L-1: **build in public**, posting 1–2 updates/week (GIFs of features, the AI architecture, privacy decisions) on X, r/SideProject, Indie Hackers.
- L-3: **private beta** via unlisted listing to 30–50 waitlist users plus a feedback form and Discord or GitHub Discussions.
- L-2: collect testimonials; prepare launch assets (video, screenshots, PH gallery, HN post, Reddit posts tailored per subreddit).
- L-1: submit the final version early (review buffer); line up 10–20 people to try it and leave honest reviews on launch week (never incentivized fake reviews; that's against policy).

**Launch (L)**
- Chrome Web Store + Edge go public (listed).
- Show HN (open-source + local-AI angle), Tue–Thu morning US time.
- Reddit: one genuine post per relevant subreddit, staggered over the week, following each sub's self-promo rules.
- Submit to directories: AlternativeTo (as an alternative to Clipboard History Pro, Paste, Ditto), SaaSHub, BetaList, There's An AI For That, Futurepedia, Toolify.
- Email the waitlist.

**Post-launch (L+1 → L+12)**
- **Product Hunt** when the v1.1 AI release lands (~L+4), with a second, bigger moment.
- **SEO content** on the landing site, one article/week: "Best clipboard manager for Chrome (2026)", "Clipboard History Pro alternative", "How to see clipboard history on a Chromebook", "How to copy multiple things at once", "Clipboard managers and privacy: what extensions can see".
- **Short-form video:** 15–30 s demos (TikTok/Reels/Shorts): "paste as bullets", "find that link from last week", "research → cited summary".
- **Micro-creators:** offer early lifetime Pro to 10–20 study and productivity creators (disclosed partnerships).
- **In-product loops:** shareable boards (later), the "Made with ___" footer on Compose output (optional, off by default), review prompt after a value moment (e.g. the 20th paste from history), never on first use.
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
| Intent | Fake-door "Pro" waitlist (sync, cloud storage, cloud AI) | ≥ 3–5% of weekly users |
| North star | **Weekly active users who paste from history** | 1,000 by ~L+12 |

### 3.5 GTM budget
**$0–300** for the first 3 months: domain, optional icon/asset design, optional lifetime-Pro giveaways (no cash cost). No paid ads until the funnel converts.

### 3.6 Decision gate (≈ L+12)
- ✅ ≥ 1k WAU, D30 ≥ 25%, waitlist ≥ 3% → **build Pro** (§4, Phase 6).
- ⚠️ Users love it but no paying intent → **Teams/templates** direction (Text Blaze model).
- ❌ < 300 WAU or poor retention → revisit persona and hero feature (interview churned users) before adding features.

---

## 4. Development roadmap

| Phase | Weeks | Goal | Key deliverables | Exit criteria |
|---|---|---|---|---|
| **0. Research** | done | Understand market, constraints | [01-research.md](01-research.md) | ✅ |
| **1. Design** | 1–2 | Lock decisions, de-risk tech | Name (when ready) · wireframes for the 7 key flows · mini design system (colors, type, components) · technical spike · **unlisted test submission** (with optional all-sites permission) | Design approved; spike confirms capture works on ≥ 90% of top 30 sites; Nano and embeddings performance measured |
| **2. MVP build** | 3–7 | Free core + hero AI | See week-by-week below | All MVP features in Design §6 working; e2e tests pass |
| **3. Private beta** | 8–9 | Real-world feedback | Unlisted listing · 30–50 testers · bug fixes · onboarding tuning | Activation ≥ 40% in beta; no P0 bugs; listing approved |
| **4. Public launch v1.0** | 10 | Distribution | Listed on Chrome + Edge · launch campaign (§3.3) | Live; launch posts out |
| **5. v1.1 AI release + growth + Safari** | 11–16 | Second launch moment, retention, new platform | Research Compose with citations · paste stack · cloud-AI fallback **behind a waitlist/fake door** · Product Hunt launch · SEO articles · **Safari build** (popup/tab UI, no Nano) via Mac App Store | KPIs tracked weekly; Safari approved |
| **6. Pro** (if gate passes) | 17–22 | Revenue | Accounts · E2E encrypted sync · R2 image storage · cloud AI credits · payments (ExtensionPay) · lifetime early-bird | First paying users; refund rate < 5% |
| **7. Expansion** | 23+ | Moat | Remote MCP server / "Send to AI" · shareable boards · phone handoff · Firefox · Teams · desktop companion | Driven by data |

### 4.1 Phase 1: Design (weeks 1–2) in detail
- **Week 1:** decide license (and name if ready) · wireframes (side panel, palette, clip card, onboarding + permission explainer, research mode, pause/blocklist, AI status).
- **Week 2: technical spike** (throwaway code):
  - Copy capture via content script on 30 top sites (Google Docs, Gmail, Notion, GitHub, Figma, ChatGPT, Wikipedia, YouTube…), measuring what's captured.
  - Context-menu image save + OPFS storage + clipboard write of an image from the panel.
  - Gemini Nano: detection, download consent flow, latency for a title or rewrite on 2–3 machines.
  - transformers.js MiniLM: model load time, embedding throughput, search latency at 5k clips.
  - Submit a minimal **unlisted** build with optional `<all_urls>` to learn how review treats it and what reviewers ask for.
- Output: a final architecture note added to the design doc, and an updated scope.

### 4.2 Phase 2: MVP build (weeks 3–7), week by week

| Week | Build |
|---|---|
| 3 | WXT + React + TS scaffold · manifest + permissions · Dexie schema · capture (shortcut, context menu, paste/drop, grab-clipboard) · side panel list + clip card |
| 4 | Images (OPFS, thumbnails, screenshot region) · keyword search + filters · pins + manual collections · quick-paste palette overlay · write-to-clipboard paths |
| 5 | Smart types + actions · opt-in auto-capture (optional permission) + pause toggle + site blocklist + seed exclusions · permission explainer · retention settings |
| 6 | Embeddings pipeline (offscreen worker) · **semantic search** · **smart collections** · AI status + Nano titles + **Paste as** (deterministic + Nano) · emoji/symbol board |
| 7 | Onboarding · settings (incl. configurable shortcuts) · export/import/wipe · anonymous analytics (opt-out) · error reporting (content-free) · privacy policy · store assets · Playwright e2e tests · performance pass |

### 4.3 Engineering practices
- TypeScript strict, ESLint/Prettier, Vitest unit tests, Playwright e2e against the loaded extension (Chromium is available in CI).
- CI on GitHub Actions: lint, test, build, zip artifact; release tags → manual upload to the store (automate with the Chrome Web Store API later).
- Security: 2FA everywhere, dependency review, no remote code, CSP, signed tags.
- Versioning: semver; a changelog visible in the extension ("What's new").

---

## 5. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| In-depth review delays launch | Med | Med | Optional all-sites permission; unlisted build in week 2; precise justification; privacy policy matches manifest exactly |
| Gemini Nano unavailable for many users | High | Med | Tiered AI: embeddings + rules work everywhere; cloud fallback later |
| Capture fails on custom-editor sites | Med | Med | Spike measures it; panel "grab clipboard" fallback; document known sites |
| Low discovery | High | High | Build in public, SEO articles, Chromebook/student angle, two launch moments |
| Competitor copies the AI features | Med | Med | Move fast, privacy + open-source brand, community |
| Low paid conversion | High | Med | Free-first; fake-door validation; Teams pivot path |
| Passwords copied on web pages get stored (no secret detection in MVP) | Med | Med | Seed site exclusions, pause + blocklist, local-only storage; add detection post-MVP |
| Safari API gaps (no side panel, no Nano, no offscreen) | High | Low | Browser adapters from day one; Safari as fast-follow |
| Security incident / compromised account | Low | Critical | Hardware 2FA, minimal dependencies, reproducible builds, open source |
| Local storage limits with many images | Med | Low | `unlimitedStorage`, image compression, retention policy |

---

## 6. Immediate next steps
1. Create wireframes for the 7 key flows.
2. Run the technical spike (Phase 1, week 2), including the unlisted store submission.
