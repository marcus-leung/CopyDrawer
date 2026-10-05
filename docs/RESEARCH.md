# Clipboard Extension: Research & Product Plan

_Research date: October 2026 · Strategy: **free first**, monetize later_

---

## 0. Executive summary

- **There is real demand for _free_ clipboard tools.** The leading Chrome extension (Clipboard History Pro) has 100–130k users despite a ~4.0★ rating and frequent reliability complaints. Free desktop tools (Maccy, Ditto) have hundreds of thousands of installs. Windows and macOS both ship basic clipboard history.
- **Few people pay for clipboard _history_ alone.** It's a commodity: free in the OS and free open source. Money exists one layer up. Paste ($30/yr, Mac) earns from polish and sync. Text Blaze (~$2.4M revenue in 2024, mostly from businesses) earns from reusable text and templates.
- **Gap:** Chrome clipboard extensions are text-first, dated, and weak on images. Nobody combines a clipboard history with AI organization and actions in the browser. Paste added a way for AI tools to read your clipboard (MCP) in June 2026, but only on Mac.
- **Free AI is possible:** Chrome's built-in Gemini Nano runs on the user's device at zero cost to us.
- **Trust is a weapon:** 2026 saw several malicious extensions caught stealing clipboard and crypto data. A private, local, open-source clipboard stands out.
- **Plan:** ship a reliable, private, AI-assisted **free** extension. Validate with retention and a fake-door Pro waitlist. Build paid tiers only after hitting ~1,000 weekly active users with real waitlist intent. If consumers won't pay, pivot the paid side toward teams and templates.

---

## 1. Is there a market? (demand evidence)

### 1.1 Usage demand (free)

| Signal | Number | Interpretation |
|---|---|---|
| Clipboard History Pro (Chrome) | ~100–130k users, ~3.99★ from 784 ratings, created 2020, updated Mar 2026; ranks #23 for the "clipboard" keyword | Large user base that keeps using it despite recent reviews dominated by stability/sync complaints → **beatable on quality** |
| Permanent Clipboard (Chrome) | ~40k users, 4.3★ | Even a bare snippet list finds users |
| Text Blaze (Chrome, adjacent) | 200k+ users, ~5★ | Reusing text in the browser is a large, loved category |
| Maccy (Mac, free, open source) | 21k+ GitHub stars, ~#25 in Homebrew installs, 4.9★ (1.3k ratings) | Developers quickly adopt good free clipboard tools |
| Ditto (Windows, free) | 458k+ installs via Chocolatey alone; around since 2003 | Long-lasting, steady demand |
| OS built-ins | Windows Win+V (25 items), macOS history | Platform vendors confirm demand, and also make the basic feature free |
| Win+V adoption | "<30% of Windows users regularly use Win+V" (2022 Microsoft survey, cited secondhand by a WPS blog; **unverified**) | Many people don't know clipboard history exists → room to educate and convert |

### 1.2 Willingness to pay

| Product | Price | What people pay for |
|---|---|---|
| Paste (Mac/iOS) | $3.99/mo · $29.99/yr · $89.99–99.99 lifetime; also on Setapp | Polish, cross-device sync, pinboards. Selling for ~10 years |
| Text Blaze | Freemium; reportedly **$2.4M revenue (2024), ~16 people** | Templates and snippets for **business** teams (support, sales) |
| Raycast Pro | $8–10/mo | Unlimited clipboard history is one of the Pro features (plus AI, sync) |
| Clipboard History Pro | Pro tier | 10k clips, sync, export, password lock, floating mode |
| Pieces | Free / ~$10–15/mo / Teams $10/user | AI memory and snippets for developers |

**Takeaway:** individuals pay a little for polish and sync; **teams and work use** pay real money.

### 1.3 Extension economics (benchmarks)

- 251k Chrome extensions (May 2026); **90% have <1,000 users; only 0.7% exceed 100k**.
- Freemium conversion: **0.5–5%**, realistically **1–2%**.
- 10k active users with freemium typically means $2k–10k/month at higher price points. At our ~$3.50 average: 10k × 1.5% × $3.50 ≈ **$525 MRR**; 100k users ≈ **$5k MRR**.
- ExtensionPay: 5% fee, no monthly fee, supports subscriptions, trials, lifetime purchases, and multiple devices.

### 1.4 Risks

1. **Clipboard history alone is a commodity.** Undifferentiated, it won't grow.
2. **Most extensions fail to get distribution.** Store search and launch strategy matter more than features.
3. **Low conversion among consumers.** Most free users never pay.
4. **Browser limit:** the extension mostly sees copies made _inside Chrome_ (see §3), so it loses to OS tools on "everything I copy". Position it around browser-native workflows.
5. **Trust and permissions:** reading pages on every site triggers scary install warnings and stricter store review.

---

## 2. Competitive landscape

| Product | Platform | Strengths | Price | Gap |
|---|---|---|---|---|
| Clipboard History Pro | Chrome | History, tags, favorites, text expander, floating panel | Free: 100 clips, 10 stars, 5 pins · Pro: 10k clips, sync, CSV/JSON/TXT export, password lock | Dated UI, reliability/sync bugs, weak images, no real AI. Its "lock" is reportedly a UI barrier, not encryption |
| Permanent Clipboard | Chrome | Simple saved snippets | Free | No history or intelligence |
| Text Blaze | Chrome | Templates, text expansion, team sharing | Freemium | Not a clipboard history; no images |
| SlashPaste, Rainclip, Clip Cloud, Smart Clipboard Manager | Chrome | Snippets, basic sync | Various | Small, generic |
| ClipAI, Auto Web Clipper, Kosmik, AI Content Capture | Chrome | AI summaries, auto-tags, semantic search | Freemium | **Web clippers** you save to deliberately, not clipboard managers |
| "Clipboard Manager – AI Clipboard History" | Chrome | History plus an AI writing assistant | ? | Closest AI competitor. Watch it |
| Paste | Mac/iOS | Polish, pinboards, sync, **Paste MCP** (Jun 2026: Claude, Cursor, Codex can read your clipboard) | $29.99/yr | Apple only |
| Raycast | Mac | Clipboard history, OCR on copied images, AI | Free 3-month history; Pro $8–10/mo | Mac only, launcher-first |
| Pieces | Desktop + browser | AI long-term memory, snippet enrichment, MCP | Free/Pro/Teams | Developers only, heavy |
| CopyQ | Desktop | Scripting, regex transforms, auto-commands (e.g. strip UTM params) | Free | Power users only |
| Ditto, Maccy, Clipy | Desktop | Fast, lightweight | Free | No AI, no browser integration |
| Ortu | Desktop | Full paste stack / multi-paste | ? | Niche |

**Feature gaps nobody fills in Chrome:** AI auto-organization of clipboard history · AI "paste as" transforms · paste stack / sequential paste · source provenance + citations · crypto-address swap protection · clipboard ↔ AI-assistant bridge (MCP).

---

## 3. Technical constraints

- **No background clipboard watching in MV3.** Service workers have no `navigator.clipboard`. Reading the clipboard requires a document (offscreen doc, side panel, popup) and usually focus or a user gesture. There are known bugs with the async clipboard API in offscreen documents.
- **What works:**
  - A content script listens to `copy`/`cut` events on web pages → capture the selection plus source URL, title, and favicon.
  - Images: right-click "Save to clipboard" on any image, paste or drop into the side panel, region screenshot via `chrome.tabs.captureVisibleTab`.
  - A "grab system clipboard" button / hotkey while the panel is open, for things copied outside Chrome.
  - Writing to the clipboard: from the page/panel, or an offscreen doc with the `CLIPBOARD` reason.
  - Later: a desktop companion (Tauri) for OS-wide capture.
- **Chrome built-in AI (Gemini Nano):** Prompt API available to extensions since Chrome 138 and stable for the web in Chrome 148. Summarizer, Writer, Rewriter, and Translator APIs too. On-device, no API key, no per-request cost, data stays local. Needs ~2.7–4 GB of disk plus a capable GPU/CPU, so **feature-detect and degrade gracefully**.
- **Permissions:** `<all_urls>` content scripts means a strong install warning and in-depth review. Mitigate with clear onboarding copy, a per-site blocklist, and an open-source client.

---

## 4. Product: features

### 4.1 Free MVP (the install magnet)
- History of text, rich text, links, images, code, and colors; search; pins and favorites
- **Reliable image support** (the top complaint about competitors)
- Collections/boards; keyboard-first command palette (`Ctrl/Cmd+Shift+V`); Side Panel UI plus a quick popup
- Emoji / kaomoji / symbol board with recents
- **Smart types and one-click actions:** tracking number → track · address → map · hex/RGB → swatch and convert · date → calendar · JSON/CSV → pretty-print or table · code → language detection and highlighting · phone/email → call/compose · math → result · URLs → auto-strip tracking params
- **Clipboard Guard:** detect and mask passwords, API keys, card numbers, and SSNs, with auto-expiry; per-site blocklist (banks, password managers); incognito-aware; **crypto-address swap warning**
- Source provenance: every clip remembers its page and links back to the exact passage (`#:~:text=`)
- No account, local-only storage, export/import

### 4.2 Free AI layer (on-device, $0 cost)
- **Auto-categorization** into smart collections, with AI-generated titles
- **"Paste as…":** plain text / Markdown / bullet list / summary / translate / fix grammar / change tone
- **Ask your clipboard:** semantic search ("the Airbnb link from last week") using local embeddings
- Emoji suggestions for selected text

### 4.3 Growth features (still free, or partly free)
- **Research mode:** every copy goes into a stack with source and citation; "Compose" turns it into a summary or outline with citations (great for students)
- **Paste stack:** copy many, paste in sequence (form filling)
- **Context-aware suggestions:** focus a field and the relevant clip is suggested
- Snippets/templates with variables (`{name}`, `{date}`)
- **Shareable boards:** public link to a collection (viral loop and SEO)
- OCR for images and screenshots (makes images searchable)

### 4.4 Later / paid candidates
- End-to-end encrypted cloud sync and image cloud storage
- Cloud AI (stronger model; fallback when Nano is unavailable)
- **Remote MCP server / "Send to Claude/ChatGPT"**: the browser version of Paste MCP
- Phone ↔ browser handoff (PWA + QR)
- Team shared boards and snippet libraries (the Text Blaze direction)
- Desktop companion for OS-wide capture
- Background removal, color palette extraction, AI alt text

---

## 5. Free-first go-to-market & validation

### 5.1 Positioning
Headline candidates: **"The private, AI-powered clipboard for Chrome"**. Lead with reliability, images that work, privacy (local, no account, open source), and free AI.

### 5.2 Distribution
- Chrome Web Store SEO: "clipboard", "clipboard history", "copy paste", "clipboard manager". Strong screenshots and a short demo video; ask happy users for reviews at the right moment.
- Launch posts: r/chrome_extensions, r/productivity, r/GetStudying and student communities, Hacker News "Show HN" (privacy and open-source angle), Product Hunt (when the AI layer ships).
- Shareable boards and research-mode citations as built-in referral loops.
- Ship to Edge Add-ons too (almost no extra work).

### 5.3 Validation metrics (watch for 1–2 months after MVP)

| Metric | Target |
|---|---|
| Users still active after 30 days | ≥ 25% |
| Store rating | ≥ 4.6★ |
| Weekly active users | **1,000** (first milestone) |
| Fake-door "Pro coming, join waitlist" clicks on sync, cloud storage, cloud AI | Track click rate and signups; ≥ 3–5% of WAU = strong signal |
| Feature usage | Which AI and smart-type features get used weekly (decides what goes into Pro) |

Analytics must be privacy-respecting: only anonymous counts of feature usage, **never clip content**.

### 5.4 Decision gate
- **Hit 1k WAU + real waitlist intent** → build Pro (sync, storage, cloud AI, MCP).
- **Users but no paying intent** → pivot paid offering to **Teams/templates** (proven by Text Blaze).
- **No traction** → revisit positioning (e.g. students and research mode as the core) before adding features.

---

## 6. Monetization (later, gated by §5.4)

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Local, 500-clip history, unlimited pins, emoji board, smart types, Clipboard Guard, on-device AI |
| **Pro** | ~$4/mo · $36/yr · ~$79 early-bird lifetime | Unlimited history, E2E encrypted sync, 10 GB image storage (fair use; not "infinite"), OCR, cloud AI credits, research Compose, MCP server, export, phone handoff, password lock |
| **Teams** | ~$6/user/mo | Shared boards, snippet libraries, roles, admin |
| Add-on | AI credit packs | Heavy cloud-AI users |

Notes: avoid "infinite storage", since it attracts abuse and gets expensive. Cloudflare R2 (no egress fees) keeps storage cheap. E2E encryption conflicts with server-side AI, so AI runs locally by default and cloud AI is opt-in per request.

---

## 7. Tech stack
- **WXT** (MV3 framework: Vite, hot reload, cross-browser) + **React or Svelte** + Tailwind
- **IndexedDB via Dexie** for clips; OPFS for image blobs
- Chrome built-in AI APIs; **transformers.js** (MiniLM) for local embeddings; **Tesseract.js** OCR fallback
- Later backend: **Cloudflare Workers + D1 + R2** or **Supabase**; client-side encryption (WebCrypto AES-GCM, passphrase-derived key)
- Payments later: ExtensionPay → Stripe/Paddle

---

## 8. Roadmap

| Phase | Scope | Exit criteria |
|---|---|---|
| **0. Spike (1 wk)** | Copy-event capture, side panel, IndexedDB, image save via context menu, Gemini Nano detection | Capture works reliably on top sites |
| **1. Free MVP (3–4 wks)** | §4.1 | Published on Chrome + Edge stores |
| **2. AI layer (3–4 wks)** | §4.2 + OCR | Product Hunt launch |
| **3. Validate (4–8 wks)** | Growth features from §4.3, fake-door waitlist, metrics | Decision gate §5.4 |
| **4. Pro or Teams** | §6 | First revenue |
| **5. Expansion** | MCP, phone handoff, desktop companion, Firefox | — |

---

## 9. Open decisions
1. **Primary v1 audience:** students/researchers vs. developers vs. general users. Decides the lead feature (research mode vs. code smarts vs. templates).
2. **Headline:** "AI clipboard" vs. "private clipboard" (recommended: both, with privacy as the trust line).
3. **Open-source the client?** Recommended: yes.
4. **Name/brand:** e.g. Clipwise, Stash, Pastel, ClipMind, Snag.

---

## Sources

**Market and competitors**
- Clipboard History Pro (Chrome Web Store): https://chromewebstore.google.com/detail/clipboard-history-pro-%E2%80%93-b/ajiejmhbejpdgkkigpddefnjmgcbkenk
- Clipboard History Pro on chrome-stats: https://chrome-stats.com/d/ajiejmhbejpdgkkigpddefnjmgcbkenk
- Clipboard History Pro Pro features: https://clipboardextension.com/pro
- Pieces: best clipboard history extensions (user counts): https://pieces.app/blog/best-clipboard-history-chrome-extensions
- Best clipboard managers 2026 (TextExpander): https://textexpander.com/blog/best-clipboard-managers
- Paste pricing: https://pasteapp.io/blog/best-clipboard-manager-for-mac · https://josephnilo.com/blog/paste-setapp-review/
- Paste MCP: https://9to5mac.com/2026/06/02/paste-launches-mcp-support-to-connect-your-clipboard-history-to-ai-tools/
- Raycast: https://www.therundown.ai/tools/raycast
- Pieces: https://aicodingtools.dev/tools/pieces/
- Maccy: https://github.com/p0deje/Maccy · https://bundl.run/compare/copyq-vs-maccy
- Ditto (Chocolatey): https://community.chocolatey.org/packages/ditto
- Text Blaze revenue: https://getlatka.com/companies/blaze.today
- Desktop managers & paste stack comparison: https://dev.to/abhijith_p_subash/best-clipboard-managers-in-2026-mac-windows-linux-compared-i-tested-them-all-8a3
- AI web clippers: https://chromewebstore.google.com/detail/clipai-ai-web-clipper/flidicgbaijaifmdgkknkcefljnkhegc · https://chromewebstore.google.com/detail/auto-web-clipper/cpoccbefjhofopchjofhdlghdihklfmn · https://www.kosmik.app/blog/kosmik-web-clipper
- AI clipboard competitor: https://chromewebstore.google.com/detail/clipboard-manager-%E2%80%93-ai-cl/llfkjfjeifojlgmadnhpgiihajbbphoj
- Chrome extension vs desktop clipboard limits: https://www.edgedrop.app/blog/chrome-extensions-are-not-a-desktop-clipboard
- Win+V usage claim (unverified secondary source): https://www.wps.com/blog/how-windows-clipboard-history-boosts-productivity/

**Economics**
- Extension counts: https://www.debugbear.com/blog/counting-chrome-extensions
- Monetization stats: https://konabayev.com/blog/extension-monetization-statistics-2026/
- Monetization guide / ExtensionPay: https://fungies.io/monetize-chrome-extension-2026/

**Technical**
- MV3 clipboard lessons: https://dev.to/khaled_kmp/building-a-clipboard-listener-chrome-extension-in-manifest-v3what-i-learned-the-hard-way-126l
- Chromium extensions discussion: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/GD59r-FOeuQ
- Offscreen clipboard bug: https://issues.chromium.org/issues/41497480/resources
- Chrome Prompt API for extensions: https://appbooster.net/blog/chrome-prompt-api-guide-extension-developers/
- Gemini Nano in Chrome 148: https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en

**Security / trust**
- 80k users hit by weaponized extensions: https://www.ghacks.net/2026/09/04/popular-chrome-extensions-weaponized-to-steal-crypto-from-80000-users/
- QuickLens compromise: https://www.bleepingcomputer.com/news/security/quicklens-chrome-extension-steals-crypto-shows-clickfix-attack/
- Extensions stealing crypto and browser data: https://www.brightnexus.com/cybersecurity-advisory/article/3160/chrome-web-store-extensions-caught-stealing-crypto-browser-data
