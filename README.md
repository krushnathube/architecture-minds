# ARCHITECTURE://MINDS

*An AI Council for Human-Approved Infrastructure — built for Happiest Minds, BLITZ 2026.*

A booth-ready demo built for BLITZ 2026 (AI Experience Booths track).

Speak or type a system requirement in plain English → an AI Architect agent proposes an AWS
architecture diagram + Terraform code → a human engineer reviews and approves or flags it
before anything is treated as final. No live cloud resources are provisioned — this is a
safe, self-contained architecture-proposal tool, ideal for a live demo on unreliable venue WiFi.

## Business value — pre-sales / solution-scoping accelerator

Solution architects currently spend hours sketching a first-draft architecture after a client
requirement call, before a proposal or SOW can even start. This tool compresses that first
draft — plus an independent cost/security/reliability review — into minutes, giving architects
a validated starting point to build the actual client proposal around. It's not a replacement
for the proposal process; it's the accelerator that gets architects from a blank page to a
reviewed candidate, live, in the room with the client.

## Human + AI story

- **AI does:** reasons through the requirement, proposes an architecture (nodes + edges),
  generates Terraform, and calls out real tradeoffs/considerations.
- **Then the AI Architecture Council convenes:** three independent specialist agents
  (Cost, Security, Reliability) review the *same* proposal in parallel, each scoped to
  its own concern, and can genuinely disagree with each other.
- **Human does:** reads the architect's proposal, weighs the three specialists' verdicts
  (which sometimes conflict — e.g. Cost wants cheaper, Reliability wants more redundancy),
  and explicitly approves or flags the architecture for revision. Nothing is auto-shipped.
- **Refine loop:** if the Council flags something, a "Regenerate with Council feedback"
  button feeds their concerns back into a fresh Architect call — so the demo visibly shows
  propose → critique → revise → decide, not just a single pass.

The Approve/Flag decision only appears *after* the Council finishes reviewing — by design,
so a visitor can't approve an architecture before hearing what the specialists flagged.

This is a real multi-agent pipeline: one architect call, then three concurrent specialist
calls (`Promise.allSettled`, ~2x a single call's latency, not 4x), all using the Claude API
with distinct system prompts/personas per agent — the same pattern production frameworks
like LangGraph/CrewAI use for multi-agent orchestration, just hand-rolled for this demo.

## Page sections (top to bottom)

1. **Describe** — the live demo itself (voice/text input, example chips)
2. **Result** — proposed architecture diagram, Terraform, AI notes, Council review, decision
3. **How it works** — a static explainer diagram of the Architect → Council → Human pipeline
4. **Why this matters** — Problem, Business Value, Impact Metrics, Tech Stack
5. **Use cases** — four concrete ways this fits into Happiest Minds workflows
6. **What's next** — an honest roadmap (multi-cloud, CI/CD integration, more specialists,
   proposal export), each labeled "Next up" or "Exploring" — good for judge Q&A on
   where this goes beyond the booth

## Tech stack

- Node.js + Express (backend, single service)
- Claude API (`claude-sonnet-4-6`) for reasoning + structured JSON output
- Vanilla HTML/CSS/JS frontend (no build step — deploys as-is)
- Web Speech API for voice input, with a text fallback (important for noisy booth environments)
- Hand-rolled SVG diagram renderer (no external diagram library / CDN dependency, so it works offline once loaded)

## Local setup

**Suggested repo/service name:** `architecture-minds` — lowercase, hyphenated (GitHub/Render
don't allow `:` or `/`). Using this exact name means your Render URL will automatically match
the QR code already baked into `/poster/generate_poster.py` (`architecture-minds.onrender.com`),
so you won't need to regenerate the poster after deploying.

```bash
npm install
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY
npm start
```

Then open http://localhost:3000

## Deploying to Render

1. Push this project to a GitHub repo.
2. In Render, click **New → Web Service** and connect the repo.
   (Render will auto-detect `render.yaml` if it's present — or configure manually:)
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Runtime:** Node
3. Add an environment variable:
   - `ANTHROPIC_API_KEY` = your Anthropic API key (get one at console.anthropic.com)
4. Deploy. Render will give you a public URL — that's your booth demo link.

**Note:** Get your own Anthropic API key for this — a project deployed outside claude.ai
needs its own key and is billed separately from any Claude.ai subscription.

## Booth demo tips

- Pre-test the 3 example chips on the homepage — they're tuned to produce clean, reliable
  diagrams and are your safety net if a visitor's phrasing confuses the model.
- If venue WiFi is spotty, the text input always works as a fallback to voice.
- The "Approve" / "Flag for revision" buttons only appear after the Council finishes — don't
  skip waiting for that in your demo, it's the whole point of the human-in-the-loop story.
- Talking point for judges: nothing here executes against real AWS. That's a deliberate design
  choice, not a limitation — it keeps the human as the final authority before infrastructure
  actually gets built, which is the "Human Engineered" half of the BLITZ theme.

**Pre-flight checklist (do this before the event, not on the day):**
- [ ] Confirm Anthropic Console billing shows a real balance, not "processing" — a credit
      error live in front of judges is the one failure mode that actually violates the
      "must have live demo capability" rule.
- [ ] Run the full flow once end-to-end: Architect → Council → Refine → Approve.
- [ ] Test on a connection close to what the venue will actually have, not just home WiFi.
- [ ] Have a phone hotspot as backup connectivity — not a recorded video as backup, since a
      static video would fail the "no static displays" requirement outright.

## Booth poster

`/poster/generate_poster.py` generates a print-ready A3 PDF matching the app's visual identity
— problem/business value, the Architect → Council → Human diagram, specialist cards, impact
metrics, and a QR code linking to the live demo.

```bash
pip install reportlab "qrcode[pil]" --break-system-packages
cd poster
# Edit DEMO_URL at the top of generate_poster.py once you've deployed to Render
python3 generate_poster.py
```

Outputs `poster_architecture_minds.pdf`. If you change the app's color palette (`:root` in
`style.css`) or its Happiest Minds phrasing, update the matching constants at the top of
`generate_poster.py` too — they're kept in sync manually, not shared with the CSS.

## Extending it

The in-app "What's Next" section already states these as booth talking points; this is the
engineering-level version for whoever picks this up after BLITZ:

- **Multi-cloud support** — the Architect + Council pattern isn't AWS-specific; the schema in
  `server.js` would need a `cloud` field and provider-specific node types/Terraform providers.
- **CI/CD pipeline integration** — gate merges on Council severity, auto-attach generated
  tests, post results as a PR comment via the GitHub API.
- **More specialists** — a Compliance agent (BFSI/Healthcare) and Performance agent would
  slot into `COUNCIL_AGENTS` in `server.js` with their own system prompt, no architecture change needed.
- **Proposal export** — turn an approved architecture + Terraform + Council review into a
  client-ready document (the `docx` or `pdf` generation pattern used for the poster could
  extend here).

## Changelog

- 2026-07-03: README updated with minor edits and clarifications.
