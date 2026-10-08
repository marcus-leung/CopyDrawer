# 01 · Research

> **Scope note:** AI features and a paid Pro tier are out of scope for now; the app ships without them. This research is kept unchanged as the record, in case they come back. Current decisions: [02-design.md](02-design.md) and [03-plan.md](03-plan.md).

_Research date: October 2026 · Process: **Research → [Design](02-design.md) → [Plan](03-plan.md)**_

This doc holds **facts and findings only**. Product decisions live in the design doc; costs, go-to-market and roadmap live in the plan.

---

## 1. Key findings

1. **People use free clipboard tools.** The leading Chrome extension has 100–130k users despite mediocre reviews. Free desktop tools have hundreds of thousands of installs. Windows and macOS ship basic clipboard history.
2. **Few people pay for clipboard _history_ alone.** It's a commodity. Money is one layer up: polish and sync (Paste, $30/yr) and team templates (Text Blaze, ~$2.4M revenue in 2024).
3. **Gap:** Chrome clipboard extensions are text-first, dated, and weak on images. Nobody combines a clipboard history with AI organization and actions in the browser. AI tools that read your clipboard (Paste MCP, June 2026) exist only on Mac.
4. **Free on-device AI exists** (Chrome's Gemini Nano), but its **hardware requirements are steep**, so many users can't run it (§5).
5. **Trust is a differentiator:** in 2026, malicious extensions stole clipboard, crypto, and credential data from 80k+ users.
6. **Launching is cheap but review-sensitive:** $5 one-time registration fee. Reading pages on every site (`<all_urls>`) triggers an in-depth manual review that can take weeks (§6).

---

## 2. Demand evidence

### 2.1 Usage (free)

| Signal | Number | Interpretation |
|---|---|---|
| Clipboard History Pro (Chrome) | ~100–130k users · ~3.99★ (784 ratings) · since 2020 · updated Mar 2026 · #23 for "clipboard" keyword | Large base that stays despite stability/sync complaints → **beatable on quality** |
| Permanent Clipboard (Chrome) | ~40k users · 4.3★ | Even a basic snippet list finds users |
| Text Blaze (Chrome, adjacent) | 200k+ users · ~5★ | Reusing text in the browser is a big, loved category |
| Maccy (Mac, free, open source) | 21k+ GitHub stars · ~#25 in Homebrew installs · 4.9★ (1.3k ratings) | Good free tools spread quickly |
| Ditto (Windows, free) | 458k+ installs via Chocolatey alone · since 2003 | Long-lasting demand |
| OS built-ins | Windows Win+V (25 items); macOS history | Confirms demand, and makes the basic feature free |
| Win+V adoption | "<30% regularly use it" (2022 Microsoft survey cited secondhand by WPS; **unverified**) | Many people don't know clipboard history exists |

### 2.2 Willingness to pay

| Product | Price | What people pay for |
|---|---|---|
| Paste (Mac/iOS) | $3.99/mo · $29.99/yr · $89.99–99.99 lifetime · on Setapp | Polish, sync, pinboards. ~10 years selling |
| Text Blaze | Freemium · **~$2.4M revenue (2024), ~16 people** | Templates and snippets for business teams |
| Raycast Pro | $8–10/mo | Unlimited clipboard history (plus AI, sync) |
| Clipboard History Pro | Pro tier | 10k clips, sync, export, password lock |
| Pieces | Free · ~$10–15/mo · Teams $10/user | AI memory and snippets for developers |

### 2.3 Extension economics

- 251,488 Chrome extensions (May 2026). **90.1% have <1,000 users; 0.7% have >100k.**
- Freemium conversion: 0.5–5%, realistically **1–2%**.
- ExtensionPay: 5% fee, no monthly fee, subscriptions, trials, lifetime purchases, 135+ currencies.
- At 10k users with 1.5% paying ~$3.50/mo ≈ **$525 MRR**. At 100k ≈ **$5k MRR**.

---

## 3. Competitive landscape

| Product | Platform | Strengths | Price | Gap |
|---|---|---|---|---|
| Clipboard History Pro | Chrome | History, tags, favorites, text expander, floating panel | Free 100 clips/10 stars/5 pins · Pro 10k clips, sync, export, lock | Dated, buggy sync, weak images, no AI; the "lock" is reportedly a UI barrier, not encryption |
| Permanent Clipboard | Chrome | Saved snippets | Free | No history or intelligence |
| Text Blaze | Chrome | Templates, team sharing | Freemium | Not a clipboard history |
| SlashPaste, Rainclip, Clip Cloud, Smart Clipboard Manager | Chrome | Snippets, basic sync | Various | Generic |
| ClipAI, Auto Web Clipper, Kosmik, AI Content Capture | Chrome | AI summaries, tags, semantic search | Freemium | **Web clippers** (save deliberately), not clipboard managers |
| "Clipboard Manager – AI Clipboard History" | Chrome | History plus an AI writing assistant | ? | Closest AI competitor. Watch it |
| Paste | Mac/iOS | Polish, sync, **MCP** (Jun 2026) | $29.99/yr | Apple only |
| Raycast | Mac | Clipboard history, OCR on images, AI | Free 3-month history · Pro $8–10/mo | Mac only |
| Pieces | Desktop + browser | AI memory, MCP | Free/Pro/Teams | Developers only, heavy |
| CopyQ | Desktop | Scripts, regex, auto-commands (e.g. strip UTM params) | Free | Power users only |
| Ditto · Maccy · Clipy | Desktop | Fast, light | Free | No AI, no browser |
| Ortu | Desktop | Full paste stack | ? | Niche |

**Unfilled in Chrome:** AI auto-organization · AI "paste as" · paste stack · source tracking + citations · crypto-address swap protection · clipboard ↔ AI assistant bridge.

User-review themes for competitors: image saving broken or "coming soon"; sync breaks after updates; privacy concerns about cloud sync.

---

## 4. Technical constraints (MV3)

- **No background clipboard watching.** Service workers have no `navigator.clipboard`. Reading needs a document (offscreen, side panel, popup) plus focus or a user gesture. There are known bugs with the async clipboard API in offscreen docs.
- **Works:** content-script `copy`/`cut` listeners (selection plus URL); context-menu image save; paste or drop into the side panel; `captureVisibleTab` screenshots; a "grab system clipboard" button in the panel; offscreen doc with the `CLIPBOARD` reason for writes.
- **To verify in the spike:** sites with custom editors (Google Docs, Figma, web IDEs) may not expose the selection in copy events. Fallback: grab via the panel button.
- **No remotely hosted code** under MV3. All JS/WASM must be bundled. Model weights are data and can be downloaded.
- OS-wide capture needs a desktop companion app (Tauri), later.

---

## 5. AI options

| Option | Cost to us | Availability | Good for |
|---|---|---|---|
| Rules/regex (not AI) | $0 | All users | Detecting types (URLs, emails, colors, tracking numbers, JSON, crypto addresses, API keys, cards) |
| Local embeddings (transformers.js, e.g. MiniLM ~25 MB) | $0 | Almost all desktops (WASM/WebGPU) | Semantic search, clustering, **auto-categorization by nearest category** |
| Chrome built-in AI: Gemini Nano (Prompt, Summarizer, Writer, Rewriter APIs) | $0 | **Only capable hardware:** ≥22 GB free disk, and 16 GB RAM + 4 cores or a GPU with >4 GB VRAM; unmetered connection for the ~2.7–4 GB download. Prompt API for extensions since Chrome 138; stable for the web in 148 | Titles, rewrite/tone, summarize, classify |
| Chrome Translator / Language Detector APIs | $0 | Separate, smaller models (verify hardware needs) | Translate clip |
| Tesseract.js OCR | $0 | All | Text from images |
| Cloud LLM: Claude Haiku 4.5 | $1 / $5 per M input/output tokens | All (needs backend) | Fallback and higher quality |
| Cloud LLM: Claude Sonnet 5.5 | $2 / $10 per M tokens | All | Long Compose and research summaries |

**Implication:** Gemini Nano can't be the only AI path. A large share of laptops (8 GB RAM, small SSDs, Chromebooks) won't qualify. There's no public data on the eligible share.

---

## 6. Launch requirements (Chrome Web Store)

- **Fee:** $5 one-time; up to 20 extensions per account. 2-step verification is required.
- **Review:** usually **2–5 business days** for a first submission. **Broad host permissions (`<all_urls>`), new accounts, and big code changes push toward a slower in-depth review, up to several weeks.** Contact support after 3 weeks pending.
- **Must justify `<all_urls>`:** explain why narrower permissions won't work. Google rejects over-broad requests.
- **Privacy:** a privacy policy URL is required when handling user data. Reviewers compare the policy against `manifest.json` permissions, and mismatches get rejected. Also required: the data-usage disclosure form, the Limited Use policy, and a single-purpose description.
- **Listing assets:** 128px icon, screenshots (1280×800), small promo tile (440×280), description.
- Edge Add-ons accepts the same package (separate free account and review).

---

## 7. Trust and security context

- Aug 2026: 19 malicious Chrome/Edge extensions (largest: "Enable Right Click and Copy", 70k Chrome + 10k Edge installs) stole crypto, credentials, and sessions.
- Feb 2026: QuickLens was compromised through an update (ClickFix malware + crypto theft).
- "Good Tab" gave a remote domain read/write access to the clipboard (password theft, wallet-address swapping).
- → Users and reviewers are rightly suspicious of clipboard extensions. Being transparent (open source, local-first, minimal permissions) is a competitive advantage.

---

## 8. Infrastructure pricing (for the plan)

| Service | Price |
|---|---|
| Cloudflare Workers | Free tier (100k req/day) · Paid $5/mo incl. 10M requests |
| Cloudflare R2 | $0.015/GB-month · free 10 GB · **$0 egress** · $4.50/M writes · $0.36/M reads |
| Cloudflare D1 | Free 5 GB · then $0.75/GB-month |
| ExtensionPay | 5% per transaction (Stripe processing on top) |

---

## Sources

**Market and competitors**
- Clipboard History Pro: https://chromewebstore.google.com/detail/clipboard-history-pro-%E2%80%93-b/ajiejmhbejpdgkkigpddefnjmgcbkenk · https://chrome-stats.com/d/ajiejmhbejpdgkkigpddefnjmgcbkenk · https://clipboardextension.com/pro
- Pieces' list of clipboard extensions: https://pieces.app/blog/best-clipboard-history-chrome-extensions
- TextExpander roundup: https://textexpander.com/blog/best-clipboard-managers
- Paste: https://pasteapp.io/blog/best-clipboard-manager-for-mac · https://josephnilo.com/blog/paste-setapp-review/
- Paste MCP: https://9to5mac.com/2026/06/02/paste-launches-mcp-support-to-connect-your-clipboard-history-to-ai-tools/
- Raycast: https://www.therundown.ai/tools/raycast
- Pieces: https://aicodingtools.dev/tools/pieces/
- Maccy: https://github.com/p0deje/Maccy · https://bundl.run/compare/copyq-vs-maccy
- Ditto: https://community.chocolatey.org/packages/ditto
- Text Blaze: https://getlatka.com/companies/blaze.today
- Desktop comparison: https://dev.to/abhijith_p_subash/best-clipboard-managers-in-2026-mac-windows-linux-compared-i-tested-them-all-8a3
- AI clippers: https://chromewebstore.google.com/detail/clipai-ai-web-clipper/flidicgbaijaifmdgkknkcefljnkhegc · https://chromewebstore.google.com/detail/auto-web-clipper/cpoccbefjhofopchjofhdlghdihklfmn · https://www.kosmik.app/blog/kosmik-web-clipper
- AI clipboard competitor: https://chromewebstore.google.com/detail/clipboard-manager-%E2%80%93-ai-cl/llfkjfjeifojlgmadnhpgiihajbbphoj
- Extension vs desktop: https://www.edgedrop.app/blog/chrome-extensions-are-not-a-desktop-clipboard
- Win+V claim: https://www.wps.com/blog/how-windows-clipboard-history-boosts-productivity/

**Economics**
- https://www.debugbear.com/blog/counting-chrome-extensions
- https://konabayev.com/blog/extension-monetization-statistics-2026/
- https://fungies.io/monetize-chrome-extension-2026/

**Technical and AI**
- https://dev.to/khaled_kmp/building-a-clipboard-listener-chrome-extension-in-manifest-v3what-i-learned-the-hard-way-126l
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/GD59r-FOeuQ
- https://issues.chromium.org/issues/41497480/resources
- https://appbooster.net/blog/chrome-prompt-api-guide-extension-developers/
- https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en
- Gemini Nano hardware: https://gurupanguji.com/2025/07/31/hardware-requirements-for-gemini-nano-shipping-since-chrome-138/ · https://windowsforum.com/windows-news.4/chrome-gemini-nano-is-4gb-but-needs-20gb-free-to-download.443375/
- Claude pricing: Anthropic API model pricing table (Haiku 4.5 $1/$5; Sonnet 5.5 $2/$10 per M tokens)

**Launch**
- https://www.extensionradar.com/blog/chrome-web-store-developer-fee-2026
- https://www.ctrlshiftcopy.com/blog/publish-chrome-extension-to-web-store
- https://pearpages.com/blog/2026/07/19/publishing-chrome-extensions-what-it-takes-what-it-costs
- https://extensionbooster.net/blog/chrome-extension-host-permission-in-depth-review-warning-fix-guide/
- https://ultrafastutilities.com/chrome-web-store-privacy-policy-requirements

**Infrastructure**
- https://makerkit.dev/pricing-calculator/cloudflare · https://egresscost.com/cloudflare/

**Security**
- https://www.ghacks.net/2026/09/04/popular-chrome-extensions-weaponized-to-steal-crypto-from-80000-users/
- https://www.bleepingcomputer.com/news/security/quicklens-chrome-extension-steals-crypto-shows-clickfix-attack/
- https://www.brightnexus.com/cybersecurity-advisory/article/3160/chrome-web-store-extensions-caught-stealing-crypto-browser-data
