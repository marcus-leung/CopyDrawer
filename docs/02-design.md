# 02 · Design

_Process: [Research](01-research.md) → **Design** → [Plan](03-plan.md)_

Status: **decisions locked** (name deferred). Next: wireframes.

---

## 1. Product definition

**One-liner:** a private, AI-powered clipboard for Chrome. Everything you copy is saved, organized automatically, and ready to paste the way you need it.

**Positioning:** _AI that organizes your clipboard, running on your device._ Lead with **free + private + smart**. Competitors are free but dumb (Clipboard History Pro), smart but Mac-only (Paste, Raycast), or smart but cloud-dependent.

**Target user**

| Persona | Pain | Lead feature | Notes |
|---|---|---|---|
| **A. Students & researchers** (proposed primary) | Copying quotes and links from many tabs, losing sources, citing | Research mode + citations, auto-organize | Huge Chromebook population (Chromebooks rely on extensions; ChromeOS clipboard history is very short); viral in communities; low willingness to pay |
| B. Knowledge workers (ops, marketing, recruiting, support) | Re-copying the same text, forms, templates | Paste-as, snippets, paste stack | Higher willingness to pay; leads toward Teams |
| C. Developers | Code snippets, JSON, tokens leaking | Smart code/JSON actions, Guard, MCP bridge | Vocal and influential; also has the most free alternatives |

✅ **Decision: general audience, targeting A and B together.** The headline uses the three universal AI points (organizes itself · find by describing · paste as you need). Research mode is a featured capability for students, and paste-as/snippets for work users. Messaging and channels address both; developer features (C) are a bonus, not the focus.

---

## 2. AI selling points (the pitch)

Ranked by marketing strength × feasibility. The first three are the **hero claims** for the store listing and launch.

| # | Selling point | Tagline | How it works | Works without Gemini Nano? |
|---|---|---|---|---|
| 1 | **It organizes itself** | "Never tag a clip again." | Embedding-based classification into smart collections (Links, Code, Shopping, Research, Contacts, Images…) plus AI titles | ✅ classification via local embeddings · titles need Nano or cloud, with a heuristic title as fallback |
| 2 | **Find anything by describing it** | "That Airbnb link from last week." | Local semantic search (embeddings) + time and source filters | ✅ fully local |
| 3 | **Paste it the way you need it** | "Paste as summary, bullets, translation, or a friendlier tone." | Command palette → transform → paste | ✅ deterministic ones (plain text, Markdown, bullets, case, strip formatting) · AI ones need Nano or cloud |
| 4 | **Research → cited summary in one click** | "Your sources, summarized, with citations." | Research-mode stack keeps source URL + text-fragment link; Compose writes a summary or outline with citations | Nano (short) · cloud (long) |
| 5 | **Private by design** | "Your clipboard never leaves your device." | On-device AI by default, no account, open-source client, cloud AI opt-in per request | ✅ |
| 6 | **Smart actions** | "Copy a tracking number, get a Track button." | Rules + light AI: tracking, address, color, date, JSON, code, math | ✅ rules |
| 7 | **Clipboard Guard** _(post-MVP)_ | "Catches passwords, keys, and swapped crypto addresses." | Rule-based secret detection, auto-expiry, paste-time address check | ✅ rules |
| 8 | **AI bridge** (later) | "Give Claude/ChatGPT your clips as context." | "Send to AI" bundle + remote MCP server | cloud |

**Messaging rule:** say "AI" only where users feel it (organizing, finding, transforming, summarizing). Guard and smart actions are mostly rules, and that's fine: users care about the result, not the technique.

---

## 3. AI architecture: tiered, so it works for everyone

```
Clip captured
   │
   ├─ Tier 0  Rules (all users, instant): type detection, secrets, smart actions
   ├─ Tier 1  Local embeddings (all users, ~25 MB model, WASM/WebGPU):
   │          semantic search · nearest-category classification · duplicate detection
   ├─ Tier 2  Chrome built-in AI (capable devices only, feature-detected):
   │          titles · rewrite/tone · summarize · short Compose · translate
   └─ Tier 3  Cloud LLM (opt-in, per request; Pro or small free quota later):
              fallback for Tier 2 on weak devices · long Compose · higher quality
```

- **Feature detection:** check `LanguageModel.availability()` and similar. Show "AI on this device: Full / Basic", with Basic users seeing an upsell or quota for cloud.
- **Model download UX:** never trigger the multi-GB Nano download silently. Explain it, then let the user start it.
- **Embeddings model:** downloaded on first run (data, not code, so MV3-compliant), stored in Cache Storage. Indexing runs in the offscreen doc or a worker, throttled.
- **Cloud requests:** sent via our backend proxy (never ship API keys in the extension). Default model **Claude Haiku 4.5** for transforms; **Sonnet 5.5** for long Compose. Content is sent only on explicit user action, and **never stored server-side**.

---

## 4. Capture & permission strategy (critical for store review and trust)

Problem: auto-capturing copies on every site needs `<all_urls>` content scripts → scary warning + in-depth review (weeks).

✅ **Decision: minimal install, auto-capture is opt-in (one click, recommended in onboarding).**

| Mode | Permissions | How capture works |
|---|---|---|
| **Default (install)** | `storage`, `unlimitedStorage`, `sidePanel`, `contextMenus`, `activeTab`, `scripting`, `clipboardRead`, `clipboardWrite`, `offscreen` | Shortcut / context menu "Save to Clipboard" on selection or image; paste or drop into panel; "Grab clipboard" button; `activeTab` grants the current page on a user gesture |
| **Auto-capture (opt-in)** | `optional_host_permissions: ["<all_urls>"]`, requested at runtime with a clear explainer. Onboarding step 2 offers "Turn on auto-capture (recommended)" | Content script listens to copy/cut on all sites; pause toggle; per-site blocklist; paused in incognito by default |

Why: a lighter install warning, a likely smoother first review, and a trust story ("we only read pages if you turn it on"), while most users still end up with auto-capture through onboarding. ⚠️ Verify in the spike how the review treats optional host permissions.

Always excluded (hardcoded + user list): `chrome://` pages, the Web Store, and a small seed list of password-manager and banking domains (cheap safety net; full secret detection is out of scope for MVP).

---

## 5. UX design

### 5.1 Surfaces
1. **Side panel (main home):** search bar (semantic + keyword), smart-collection chips, clip list/grid, research stack drawer.
2. **Quick-paste palette:** `Alt+Shift+V` overlay (proposed, user-changeable; see §10) injected on the current page (via activeTab). Type to filter, Enter to paste, `Tab` for "Paste as…" actions.
3. **Context menu:** Save selection / image · Paste as… · Add to research stack.
4. **Toolbar popup:** last 10 clips + open panel (lightweight).
5. **Onboarding:** 3 steps: privacy promise → turn on auto-capture (recommended; explains page access) + try copying something → AI setup (Nano download consent) + shortcut customization.

### 5.2 Clip card
Type icon · AI title · preview (text, image thumbnail, color swatch, code highlighted) · source favicon and domain → click jumps to the exact passage · smart-action buttons · pin / collection / delete · sensitive clips masked (click to reveal).

### 5.3 Key flows to wireframe (design phase deliverables)
- First run → first capture → first paste (activation moment, target < 60 s)
- Search by description
- Paste as… (deterministic + AI)
- Research mode on → collect 5 clips → Compose → copy cited summary
- Pausing capture / blocking a site
- Turning on auto-capture (permission explainer: why we read pages, what stays local)
- "AI on this device" status + Nano download consent

### 5.4 Design principles
Keyboard-first · zero setup · instant (local, < 100 ms search) · calm (no nagging; upsell only next to the feature that's gated) · transparent (always show what's local and what's cloud).

---

## 6. MVP feature spec (free)

| Area | In MVP | Later |
|---|---|---|
| Capture | Text, rich text (stored as HTML + plain), links, images (context menu, paste/drop, region screenshot), **auto-capture opt-in** via onboarding (pause + site blocklist) | OS-wide (desktop companion) |
| Organize | Pins, manual collections, **AI smart collections**, duplicate merge, retention setting | Shareable public boards |
| Find | Keyword + **semantic search**, filters (type, site, date) | Ask-your-clipboard chat |
| Paste | Palette, **Paste as** (deterministic + AI where available), emoji/symbol board | Paste stack, context suggestions |
| Smart | Types + actions (URL clean, color, JSON, code, date, tracking, email/phone, math) | More detectors |
| Guard | Site blocklist + seed exclusions only | Secret detection/masking, crypto-address check (post-MVP) |
| Research | Research stack with sources | Compose w/ citations (Phase 2) |
| Data | Local only, export/import JSON, wipe all | E2E sync (Pro) |
| AI status | Device capability detection, consent-based Nano download | Cloud fallback |

Limits in free: 2,000 clips **including pins** (images limited by local storage). Unlimited history, sync, and cloud AI are Pro candidates.

---

## 7. Technical architecture

```
┌──────────────── Chrome extension (MV3, WXT + React/Svelte + TS) ────────────────┐
│ Content script (opt-in)   Side panel UI      Popup        Palette overlay        │
│   copy/cut listener ─┐        │                │              │                  │
│                      ▼        ▼                ▼              ▼                  │
│               Service worker (router, context menus, commands, alarms)           │
│                      │                                                           │
│        Offscreen document: clipboard read/write · embeddings worker · OCR        │
│                      │                                                           │
│  Storage: IndexedDB (Dexie) clips + vectors · OPFS image blobs · chrome.storage  │
│  AI: rules · transformers.js embeddings · Chrome built-in AI (feature-detected)  │
└──────────────────────────────────────────────────────────────────────────────────┘
          │ (only on explicit cloud-AI action, or Pro sync)
          ▼
┌──────── Backend (Phase 3+, Cloudflare) ────────┐
│ Workers: auth, AI proxy (Claude), rate limits  │
│ D1: users, encrypted clip metadata             │
│ R2: encrypted image blobs                      │
│ Payments: ExtensionPay → Stripe/Paddle         │
└────────────────────────────────────────────────┘
```

### 7.1 Data model (IndexedDB)
```
Clip {
  id, createdAt, updatedAt, lastUsedAt, useCount,
  kind: 'text'|'html'|'link'|'image'|'code'|'color'|'emoji',
  text?, html?, imageRef?, mime?, bytes,
  title?, titleSource: 'ai'|'heuristic'|'user',
  detectedTypes: string[],        // tracking, address, json, secret...
  source?: { url, title, favicon, textFragment },
  collectionIds: string[], smartCategory?, pinned, sensitive, expiresAt?,
  embedding?: Float32Array(384), embeddingModel?
}
Collection { id, name, kind: 'manual'|'smart', icon, order }
Settings   { retention, autoCapture, blocklist, aiTier, hotkeys, theme }
```

### 7.2 Privacy & security design
- Local-first; no account in free.
- Analytics: anonymous event counts only (e.g. `clip_captured{kind}`), **never content or URLs**; opt-out toggle.
- Open-source client (GPL-3.0) with reproducible builds; strict CSP; no remote code; minimal dependencies.
- Pro sync: client-side AES-GCM encryption, key from a passphrase (PBKDF2/Argon2), so the server can't read clips.
- Supply-chain hygiene: 2FA on the store account, signed releases, lockfile and dependency review. Compromised updates are exactly how 2026's attacks happened.

---

## 8. Decisions log

| # | Decision | Status |
|---|---|---|
| 1 | Audience | ✅ General: students/researchers + knowledge workers |
| 2 | Name/brand | ⏸ Deferred (check trademarks and store name collisions when chosen) |
| 3 | UI framework | ✅ React (+ TypeScript, WXT, Tailwind) |
| 4 | Source model / license | ✅ **GPL-3.0** extension + closed backend; see §9 |
| 5–15 | Product defaults | ✅ Decided; see §10 |

## 9. Source model / license options

Chrome extension code is shipped as JavaScript that **anyone can download and read**, even if "closed". Keeping it closed protects less than people expect.

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **MIT** (permissive open source) | Anyone may copy, modify, and sell it, even closed-source, if they keep your copyright notice | Max adoption and contributions; simplest; strong trust signal | Anyone can rebrand it and publish a competing (even closed or ad-filled) clone; no recourse |
| **GPL-3.0** (copyleft open source) | Anyone may copy and modify, but if they distribute a modified version, it must also be GPL with source published | Trust signal; clones must stay open, which deters closed commercial copycats; you (the owner) can still sell Pro | Some companies avoid GPL code; to relicense later you need contributor agreements (CLA); doesn't stop open clones |
| **Source-available** (e.g. FSL, BSL) | Code is public, but commercial competing use is banned for ~2 years, after which it becomes MIT/Apache | Transparency + protection from direct clones | Not "open source" by the official definition; some developers dislike it; fewer contributors |
| **Closed source** | No public repo | Simplest; maximum legal control | Loses the trust differentiator; code is still inspectable in the store package anyway |

✅ **Decision: GPL-3.0 for the extension + a closed backend** (sync, AI proxy, payments). Pro value lives on the server, so a clone can copy the free app but not the paid service. Register the **name as a trademark** later, since licenses don't cover branding, so clones can't use your name. Accept outside contributions only with a simple CLA (or not at all initially).

## 10. Product defaults (decided)

| # | Decision | Outcome |
|---|---|---|
| 5 | Free history limit | ✅ 2,000 clips, **pins count toward the limit** |
| 6 | Retention | ✅ Keep until limit (oldest unpinned dropped first); optional auto-delete after 30/90 days |
| 7 | Auto-capture default | ✅ **Opt-in**, strongly offered in onboarding (see §4) |
| 8 | Keyboard shortcuts | ✅ Defaults Alt+Shift+V (palette), others TBD. **All configurable** (in-app settings link to `chrome://extensions/shortcuts`) |
| 9 | Main surface | ✅ Side panel + palette for MVP |
| 10 | Passwords/keys handling | ✅ **Out of scope for MVP** (no detection/masking). Only the seed site exclusions from §4 |
| 11 | Analytics | ✅ Anonymous counts with an off switch; never content or URLs |
| 12 | Cloud AI in free tier at launch | ✅ None; fake-door waitlist |
| 13 | Browsers | ✅ Chrome + Edge at launch · **Safari fast-follow** after v1.0 (see §11) · Firefox later |
| 14 | Language | ✅ English first, i18n-ready strings |
| 15 | User interviews | ✅ No pre-build interviews; feedback comes from the private beta |

## 11. Safari notes

Safari supports Web Extensions, but it's a different distribution path:
- Requires a **Mac + Xcode** and an **Apple Developer Program membership ($99/yr)**. Distributed via the **Mac App Store** (and iOS/iPadOS if desired), with Apple's App Review.
- The extension is wrapped in a small native app (WXT can build the Safari target; Apple's `safari-web-extension-converter` packages it).
- **Missing APIs vs Chrome:** no Side Panel API (use the popup + a full-page tab view instead), no Chrome built-in AI (Gemini Nano) → Tier 0 rules + Tier 1 embeddings only, no `offscreen` documents (use the extension page/popup for clipboard work), and stricter clipboard and permission behavior.
- ✅ **Decision:** ship Safari as a **fast-follow after the Chrome/Edge v1.0** (roadmap Phase 5). Building on WXT from day one keeps it cheap, and code is written with browser-specific APIs behind small adapters.
