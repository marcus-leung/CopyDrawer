# Clipboard Extension — Research & Product Plan

_Research date: October 2026_

## 1. Market snapshot

| Product | Platform | What it does well | Price | Gap we can exploit |
|---|---|---|---|---|
| Clipboard History Pro | Chrome (~100k users, 4.4★) | History, tags, favorites, text expander, floating panel | Free: 100 clips · Pro: 10k clips, sync, export, password lock | Text-first, dated UI, image support weak, no real AI |
| Permanent Clipboard | Chrome (~40k) | Saved snippets you reuse | Free | Basically a snippet list |
| Text Blaze | Chrome (~200k+) | Templates / text expansion | Freemium | Not a clipboard history; no images |
| Paste | Mac / iOS | Polished design, pinboards; **Paste MCP** (Jun 2026) lets AI tools read your clipboard | $29.99/yr or $99.99 lifetime | Apple only, no browser product |
| Raycast | Mac | Clipboard + OCR on copied images + AI | Free 3-month history; Pro $8–10/mo | Mac only, launcher-first |
| Pieces | Desktop + browser | AI "long-term memory" for developers, snippet enrichment | Free / ~$10–15/mo | Developer-only, heavy |
| CopyQ / Ditto / Maccy | Desktop | Scripts, regex transforms, fast search | Free | Power-user tools, no AI, no browser |
| ClipAI, Auto Web Clipper, Kosmik | Chrome | AI tags, semantic search for _web clips_ | Freemium | Not clipboard managers; you have to save on purpose |

**Takeaways**
- Chrome clipboard extensions are text-first, look and feel like 2015, and their image support is often broken (reviews mention failed saves and "coming soon" features).
- The AI features on the market live in **web clippers** (save-a-page tools) or **Mac apps**. No Chrome extension combines a clipboard history, AI organization, and AI actions.
- Paste MCP (letting AI agents read your clipboard) is less than six months old and **Mac only**. Nothing like it exists for the browser.
- **Trust is a weak point across the category.** In August 2026, 19 malicious extensions were found stealing crypto, credentials, and clipboard data; the largest was "Enable Right Click and Copy", with 80k installs. A privacy-first, provably safe clipboard can be a selling point on its own.

## 2. Technical constraints (they shape the product)

- **A Chrome extension cannot watch the OS clipboard in the background.** In MV3, service workers have no `navigator.clipboard`. Reading the clipboard needs a document (offscreen doc, side panel, popup) and usually focus or a user gesture.
- What works:
  - A content script listens to `copy`/`cut` events on web pages and grabs the selection, with the source URL and title. This covers most of what people copy in a browser.
  - Image capture: right-click "Save to Clipboard" on images, paste or drag into the side panel, and region screenshots via `chrome.tabs.captureVisibleTab`.
  - A "sync from system clipboard" button / hotkey when the panel is open, for things copied outside Chrome.
  - Later: a small desktop companion (Tauri) for true OS-wide capture. This is also a natural Pro feature.
- **Chrome built-in AI (Gemini Nano)**: the Prompt, Summarizer, Writer, Rewriter, and Translator APIs are stable (Prompt API since Chrome 138 for extensions). They run on the device for free, with no API key and nothing leaving the browser. **This lets us offer AI in the free tier at zero cost.** Fall back to a cloud model on unsupported hardware (Nano needs about 4 GB of disk plus a decent GPU or CPU).
- `<all_urls>` content-script permission brings a scary install warning and stricter store review. Be very transparent about it, or consider open-sourcing the capture code.

## 3. Feature ideas — what makes this unique

### Core (expected)
- History of text, rich text/HTML, links, images, code, and colors; pins, favorites, search
- Collections/boards (manual and smart), tags, keyboard-first command palette (`Ctrl+Shift+V`)
- Side panel UI (Chrome Side Panel API) plus a quick-paste popup overlay
- Emoji / kaomoji / symbol / GIF board with recents, as its own tab
- Snippets/templates with variables (`{name}`, `{date}`): basic text expansion

### Signature differentiators
1. **Smart types and one-click actions ("clip intents")**: detect the clip type and offer actions
   - Tracking number → open carrier tracking · Address → map / copy formatted · Hex/RGB → swatch and convert · Date/time → add to calendar · JSON/CSV → pretty-print, convert, or make a table · Code → language detection and syntax highlighting · Phone/email → call/compose · Math expression → result · URL → strip tracking params (UTM) automatically
2. **AI auto-categorization (on-device, free)**: clips sort themselves into smart collections (Work, Shopping, Code, Recipes, Research…) with AI titles, so you never have to tag
3. **"Paste as…" AI transforms**: paste as plain text / Markdown / bullet list / summary / translated / fixed grammar / formal or casual tone / reply. Gemini Nano Rewriter/Writer runs these locally
4. **Context-aware paste suggestions**: focus a form field and the extension suggests the relevant clip (address field → your address; GitHub → code clips; Gmail → email templates). Uses semantic matching between the page/field and your clips
5. **Research mode / collect stack**: toggle it on, and every copy goes into a stack **with its source URL and a text-fragment link (`#:~:text=`) back to the exact passage**. Then "Compose": AI merges the stack into a summary, outline, or doc **with citations**. Very useful for students and researchers
6. **Paste stack / sequential paste**: copy 5 things, then paste them one by one in order (fill forms from a spreadsheet). Few managers have this, and no Chrome extension does
7. **Ask your clipboard**: natural-language search and chat over your history ("the Airbnb link I copied last week", "the SQL query with the join on orders"). Uses local embeddings (transformers.js, MiniLM) for semantic search
8. **Clipboard Guard (security)**:
   - Detects passwords, API keys, credit cards, and SSNs, then masks them, auto-expires them, and keeps them out of sync
   - **Crypto-address swap protection**: warns if what you paste doesn't match what you copied (defends against clipper malware). Good marketing given the 2026 malware news
   - Incognito-aware, with a per-site blocklist (banks, password managers)
9. **Image superpowers**: OCR text from images and screenshots (makes images searchable), region screenshot to clip, background removal, AI alt text/description, image to palette (color extraction)
10. **AI bridge / MCP**: "Send to Claude/ChatGPT" with a selected bundle of clips as context, plus a **remote MCP server** (Pro) so AI agents can read and write your clip boards. A browser version of Paste MCP; nobody has this yet
11. **Shareable boards**: publish a collection as a link (a resource list, design inspo, a code-snippet kit). Gives a viral loop and SEO pages
12. **Phone ↔ browser handoff**: PWA plus a QR code to beam a clip to or from your phone without an account (WebRTC or a short-lived relay)

### Nice-to-have / later
- Team shared boards (support macros, sales snippets, brand assets)
- Desktop companion for OS-wide capture
- Weekly "clip digest", stale-clip cleanup suggestions, duplicate merge
- Firefox/Edge ports (Edge accepts Chrome extensions almost unchanged)

## 4. Monetization

Benchmarks: freemium extensions convert about **0.5–5%** (realistically 1–2%). ExtensionPay charges a 5% fee and handles subscriptions and trials; Stripe or Paddle are the alternatives. Paste's price ($30/yr, $100 lifetime) shows people pay for clipboard tools.

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Local only, 500-clip history, unlimited pins, emoji board, smart types and actions, **on-device AI** (costs us nothing), Clipboard Guard |
| **Pro** | ~$4/mo · $36/yr · ~$79 lifetime (early-bird) | Unlimited history, **end-to-end encrypted cloud sync** across devices, 10 GB image storage (fair use, not "infinite"), OCR, cloud AI credits (stronger model when Nano is unavailable or you want better results), Research Compose, MCP server, export, phone handoff, password lock |
| **Teams** | ~$6/user/mo | Shared boards, roles, snippet library, admin, SSO later |
| Add-on | AI credit packs | For heavy cloud-AI users |

Notes
- Avoid promising "infinite storage"; it attracts abuse and is expensive. Say "unlimited clips" with a media fair-use cap. Cloudflare R2 (no egress fees) keeps storage cheap.
- E2E encryption conflicts with server-side AI. Answer: AI runs locally by default, and cloud AI is opt-in per request ("send this clip to cloud AI").
- Honest revenue math: 10k users × 1.5% × ~$3.50 ≈ **$525 MRR**; 100k users ≈ $5k MRR. Distribution (store SEO, shareable boards, Product Hunt, Reddit, student communities) matters more than features.

## 5. Suggested tech stack
- **WXT** (modern MV3 extension framework, Vite, HMR, cross-browser) + **React or Svelte** + Tailwind
- **IndexedDB via Dexie** for clips; OPFS for image blobs
- Chrome built-in AI APIs, with **transformers.js** for local embeddings/semantic search and **Tesseract.js** for OCR fallback
- Backend (Pro only): **Cloudflare Workers + D1 + R2** or **Supabase**; client-side encryption (WebCrypto, AES-GCM, key derived from a passphrase)
- Payments: ExtensionPay to start, moving to Stripe/Paddle when there's a web dashboard

## 6. Phased roadmap

| Phase | Scope | Goal |
|---|---|---|
| **0. Spike (1 wk)** | Copy-event capture, side panel, IndexedDB, image save via context menu, test Gemini Nano availability | Prove the capture approach |
| **1. MVP (3–5 wks)** | History, search, pins, collections, emoji board, smart types and actions, command palette, Clipboard Guard basics | Ship free on the Chrome Web Store, collect reviews |
| **2. AI (3–4 wks)** | Auto-categorize, Paste-as transforms, semantic search / Ask, OCR | Main differentiator; launch on Product Hunt |
| **3. Pro (4 wks)** | Accounts, E2E sync, image cloud storage, payments, export, lifetime early-bird | Start revenue |
| **4. Growth** | Research mode + Compose, shareable boards, MCP server, phone handoff, Edge/Firefox | Viral loop and power-user lock-in |
| **5. Teams / desktop** | Shared boards, desktop companion | Higher revenue per user |

## 7. Open decisions
1. **Target user for v1**: general users vs. students/researchers vs. developers vs. support/sales. This drives which differentiator leads (Research mode vs. code smarts vs. templates).
2. **Positioning**: "AI clipboard" vs. "private and secure clipboard". Can be both, but one headline.
3. **Accounts in free tier?** Recommendation: no account needed until Pro.
4. **Open-source the capture core** for trust? Recommendation: yes (the client), with the backend closed.
5. **Name/brand** (examples: Clipwise, Stash, Pastel, ClipMind, Snag).

## Sources
- Clipboard History Pro: https://chromewebstore.google.com/detail/clipboard-history-pro-%E2%80%93-b/ajiejmhbejpdgkkigpddefnjmgcbkenk · https://clipboardextension.com/pro
- Pieces' list of clipboard history extensions: https://pieces.app/blog/best-clipboard-history-chrome-extensions
- Paste pricing: https://pasteapp.io/blog/best-clipboard-manager-for-mac
- Paste MCP: https://9to5mac.com/2026/06/02/paste-launches-mcp-support-to-connect-your-clipboard-history-to-ai-tools/
- Raycast: https://www.therundown.ai/tools/raycast
- Pieces: https://aicodingtools.dev/tools/pieces/
- MV3 clipboard limits: https://dev.to/khaled_kmp/building-a-clipboard-listener-chrome-extension-in-manifest-v3what-i-learned-the-hard-way-126l · https://groups.google.com/a/chromium.org/g/chromium-extensions/c/GD59r-FOeuQ
- Chrome built-in AI: https://appbooster.net/blog/chrome-prompt-api-guide-extension-developers/ · https://pasqualepillitteri.it/en/news/3145/gemini-nano-chrome-built-in-ai-client-side-en
- Monetization: https://konabayev.com/blog/extension-monetization-statistics-2026/ · https://fungies.io/monetize-chrome-extension-2026/
- Malware: https://www.ghacks.net/2026/09/04/popular-chrome-extensions-weaponized-to-steal-crypto-from-80000-users/ · https://www.bleepingcomputer.com/news/security/quicklens-chrome-extension-steals-crypto-shows-clickfix-attack/
- Paste stack comparison: https://dev.to/abhijith_p_subash/best-clipboard-managers-in-2026-mac-windows-linux-compared-i-tested-them-all-8a3
- AI web clippers: https://chromewebstore.google.com/detail/clipai-ai-web-clipper/flidicgbaijaifmdgkknkcefljnkhegc
- Extension counts: https://www.debugbear.com/blog/counting-chrome-extensions
