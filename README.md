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

This is a real multi-agent pipeline: one architect call, then three concurrent specialist
calls (`Promise.allSettled`, ~2x a single call's latency, not 4x), all using the Claude API
with distinct system prompts/personas per agent — the same pattern production frameworks
like LangGraph/CrewAI use for multi-agent orchestration, just hand-rolled for this demo.

## Tech stack

- Node.js + Express (backend, single service)
- Claude API (`claude-sonnet-4-6`) for reasoning + structured JSON output
- Vanilla HTML/CSS/JS frontend (no build step — deploys as-is)
- Web Speech API for voice input, with a text fallback (important for noisy booth environments)
- Hand-rolled SVG diagram renderer (no external diagram library / CDN dependency, so it works offline once loaded)

## Local setup

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
- The "Approve" / "Flag for revision" buttons are there specifically to make the human-in-the-loop
  story visible and interactive for judges — use them live, don't skip that step in your demo.
- Talking point for judges: nothing here executes against real AWS. That's a deliberate design
  choice, not a limitation — it keeps the human as the final authority before infrastructure
  actually gets built, which is the "Human Engineered" half of the BLITZ theme.

## Extending it

- Swap the Terraform-only output for a second Claude call that also generates a matching
  Lambda handler skeleton.
- Wire the "Approve" button to actually create a PR with the Terraform file via the GitHub API.
- Add a CI/CD stage (GitHub Actions or AWS CodePipeline) that re-validates AI-proposed
  architectures against a policy checklist before merge.
