require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Allowed node types — keeps diagrams consistent and renderable on the frontend.
const ALLOWED_NODE_TYPES = [
  'APIGateway', 'Lambda', 'S3', 'DynamoDB', 'SQS', 'SNS',
  'EventBridge', 'StepFunctions', 'Cognito', 'CloudFront',
  'RDS', 'CloudWatch', 'KMS', 'Client'
];

const SYSTEM_PROMPT = `You are an AWS solutions architect agent. Given a plain-English or spoken system requirement, you produce a proposed serverless-first AWS architecture.

STRICT OUTPUT RULES:
- Respond with ONLY valid JSON. No markdown fences, no preamble, no explanation outside the JSON.
- Use this exact schema:

{
  "summary": "one or two sentence plain-English description of the proposed architecture",
  "nodes": [
    { "id": "string, short unique id", "type": "one of: ${ALLOWED_NODE_TYPES.join(', ')}", "label": "short human readable label" }
  ],
  "edges": [
    { "from": "node id", "to": "node id", "label": "short description of the interaction, e.g. 'invokes', 'writes to', 'triggers'" }
  ],
  "terraform": "a single string containing valid, minimal Terraform HCL for the core resources (use placeholders for account-specific values like bucket names)",
  "considerations": ["short bullet points on tradeoffs, risks, or things a human engineer should double check before shipping this — always include at least 2"]
}

CONSTRAINTS:
- Only use node types from the allowed list above. If something doesn't fit, pick the closest allowed type.
- Keep nodes between 3 and 9 for readability on a booth screen.
- Always include a "Client" node representing the end user or calling system where relevant.
- Prefer serverless, event-driven patterns (Lambda, SQS, EventBridge, DynamoDB) over servers/VMs.
- The Terraform should be illustrative and correct in structure, not exhaustive production-grade IaC. Keep it concise: core resource blocks only, minimal repeated boilerplate, no exhaustive policy documents when a short one demonstrates the same pattern. Prioritize finishing the full JSON response over completeness of any single section.
- Always populate "considerations" with genuine architectural tradeoffs (e.g. cold starts, eventual consistency, cost at scale, security review needed) — this is where human judgment overrides the AI, so never leave it generic or empty.`;

// ---- Council agents: specialist reviewers that critique a proposed architecture in parallel ----
const COUNCIL_AGENTS = [
  {
    id: 'cost',
    name: 'Cost Agent',
    focus: 'cloud cost efficiency',
    systemPrompt: `You are a FinOps / cloud cost specialist reviewing a proposed AWS architecture. You care ONLY about cost: overprovisioning, better-priced service alternatives, idle-resource risk, and pricing model mismatches (e.g. provisioned vs on-demand). You do not comment on security or reliability — another specialist handles those.

Respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "severity": "low" | "medium" | "high",
  "verdict": "one sentence overall cost assessment of this architecture",
  "flags": ["short, specific cost concern or recommendation", "..."]
}
Include at most 3 flags, each under 20 words. If the architecture is genuinely cost-efficient, say so plainly in the verdict and keep flags minimal or empty.`
  },
  {
    id: 'security',
    name: 'Security Agent',
    focus: 'security posture',
    systemPrompt: `You are an application security specialist reviewing a proposed AWS architecture. You care ONLY about security: IAM over-permissioning, missing encryption, auth/authorization gaps, exposed surfaces, and data protection. You do not comment on cost or reliability — other specialists handle those.

Respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "severity": "low" | "medium" | "high",
  "verdict": "one sentence overall security assessment of this architecture",
  "flags": ["short, specific security concern or recommendation", "..."]
}
Include at most 3 flags, each under 20 words. If the architecture is genuinely sound, say so plainly in the verdict and keep flags minimal or empty.`
  },
  {
    id: 'reliability',
    name: 'Reliability Agent',
    focus: 'resilience & scalability',
    systemPrompt: `You are a site reliability engineering specialist reviewing a proposed AWS architecture. You care ONLY about reliability: single points of failure, missing retries/dead-letter queues, scaling limits, and failure handling. You do not comment on cost or security — other specialists handle those.

Respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "severity": "low" | "medium" | "high",
  "verdict": "one sentence overall reliability assessment of this architecture",
  "flags": ["short, specific reliability concern or recommendation", "..."]
}
Include at most 3 flags, each under 20 words. If the architecture is genuinely resilient, say so plainly in the verdict and keep flags minimal or empty.`
  }
];

async function callClaude(systemPrompt, userContent, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic API error:', response.status, errText);
    throw new Error('ANTHROPIC_API_ERROR');
  }

  const data = await response.json();
  const textBlock = data.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('NO_TEXT_BLOCK');
  if (data.stop_reason === 'max_tokens') throw new Error('MAX_TOKENS');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

app.post('/api/architect', async (req, res) => {
  try {
    const { requirement } = req.body;

    if (!requirement || typeof requirement !== 'string' || requirement.trim().length < 5) {
      return res.status(400).json({ error: 'Please provide a requirement description (at least a few words).' });
    }

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in your environment variables.' });
    }

    let parsed;
    try {
      parsed = await callClaude(SYSTEM_PROMPT, `Requirement: ${requirement.trim()}`, 4096);
    } catch (e) {
      if (e.message === 'MAX_TOKENS') {
        return res.status(502).json({ error: 'The AI response was cut off because the architecture got too large. Try describing a smaller/simpler system, or ask for fewer components.' });
      }
      if (e.message === 'ANTHROPIC_API_ERROR' || e.message === 'NO_TEXT_BLOCK') {
        return res.status(502).json({ error: 'The AI service returned an error. Please try again.' });
      }
      console.error('JSON parse failure:', e);
      return res.status(502).json({ error: 'AI returned malformed output. Please try rephrasing your requirement, or simplify it slightly.' });
    }

    // Basic validation / sanitization before sending to frontend
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return res.status(502).json({ error: 'AI output missing required structure. Please try again.' });
    }

    parsed.nodes = parsed.nodes.filter(n => n && n.id && ALLOWED_NODE_TYPES.includes(n.type));
    const validIds = new Set(parsed.nodes.map(n => n.id));
    parsed.edges = parsed.edges.filter(e => e && validIds.has(e.from) && validIds.has(e.to));

    return res.json(parsed);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
});

app.post('/api/council', async (req, res) => {
  try {
    const { architecture } = req.body;

    if (!architecture || !Array.isArray(architecture.nodes)) {
      return res.status(400).json({ error: 'A valid architecture is required to convene the council.' });
    }

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in your environment variables.' });
    }

    const architectureSummary = `Architecture summary: ${architecture.summary || ''}

Components: ${architecture.nodes.map(n => `${n.label} (${n.type})`).join(', ')}

Connections: ${architecture.edges.map(e => `${e.from} -> ${e.to} (${e.label || ''})`).join('; ')}

Terraform:
${architecture.terraform || ''}`;

    const results = await Promise.allSettled(
      COUNCIL_AGENTS.map(agent => callClaude(agent.systemPrompt, architectureSummary, 500))
    );

    const council = results.map((result, i) => {
      const agent = COUNCIL_AGENTS[i];
      if (result.status === 'fulfilled') {
        const r = result.value;
        return {
          id: agent.id,
          name: agent.name,
          severity: ['low', 'medium', 'high'].includes(r.severity) ? r.severity : 'low',
          verdict: typeof r.verdict === 'string' ? r.verdict : '',
          flags: Array.isArray(r.flags) ? r.flags.slice(0, 3) : []
        };
      }
      console.error(`Council agent ${agent.id} failed:`, result.reason);
      return {
        id: agent.id,
        name: agent.name,
        severity: 'unknown',
        verdict: 'This specialist could not complete review — try again.',
        flags: []
      };
    });

    return res.json({ council });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Unexpected server error convening the council.' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`ARCHITECTURE://MINDS running on port ${PORT}`);
});
