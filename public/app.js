const requirementInput = document.getElementById('requirementInput');
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const generateBtn = document.getElementById('generateBtn');
const statusLine = document.getElementById('statusLine');
const resultPanel = document.getElementById('resultPanel');
const errorPanel = document.getElementById('errorPanel');
const errorText = document.getElementById('errorText');
const summaryText = document.getElementById('summaryText');
const diagramSvg = document.getElementById('diagramSvg');
const terraformBlock = document.getElementById('terraformBlock');
const considerationsList = document.getElementById('considerationsList');
const approveBtn = document.getElementById('approveBtn');
const flagBtn = document.getElementById('flagBtn');
const reviewNote = document.getElementById('reviewNote');
const councilSection = document.getElementById('councilSection');
const councilGrid = document.getElementById('councilGrid');
const councilLoading = document.getElementById('councilLoading');
const decisionSection = document.getElementById('decisionSection');
const refineBtn = document.getElementById('refineBtn');
const steps = document.querySelectorAll('.step');

let lastArchitecture = null;
let lastCouncil = null;
let originalRequirement = '';

const AGENT_META = {
  cost: { icon: '◈', colorVar: '--cost-color' },
  security: { icon: '◆', colorVar: '--security-color' },
  reliability: { icon: '◇', colorVar: '--reliability-color' }
};

function setStep(n) {
  steps.forEach(step => {
    const stepNum = parseInt(step.dataset.step, 10);
    step.classList.toggle('done', stepNum < n);
    step.classList.toggle('active', stepNum === n);
  });
}
setStep(1);

// ---- Example chips ----
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    requirementInput.value = chip.dataset.example;
    requirementInput.focus();
  });
});

// ---- Voice input (Web Speech API) ----
let recognizing = false;
let recognition = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    recognizing = true;
    micBtn.classList.add('recording');
    micLabel.textContent = 'Listening…';
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    requirementInput.value = transcript;
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    setStatus(`Voice input error: ${event.error}. You can type instead.`, true);
    stopRecognition();
  };

  recognition.onend = () => {
    stopRecognition();
  };
} else {
  micBtn.title = 'Voice input not supported in this browser — please type instead';
  micBtn.style.opacity = '0.4';
}

function stopRecognition() {
  recognizing = false;
  micBtn.classList.remove('recording');
  micLabel.textContent = 'Speak';
}

micBtn.addEventListener('click', () => {
  if (!SpeechRecognition) return;
  if (recognizing) {
    recognition.stop();
  } else {
    requirementInput.value = '';
    recognition.start();
  }
});

// ---- Generate architecture ----
generateBtn.addEventListener('click', generateArchitecture);
requirementInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generateArchitecture();
});

async function generateArchitecture() {
  const requirement = requirementInput.value.trim();
  if (requirement.length < 5) {
    setStatus('Describe the system in a bit more detail first.', true);
    return;
  }

  hideError();
  resultPanel.hidden = true;
  reviewNote.hidden = true;
  councilSection.hidden = true;
  councilLoading.hidden = true;
  councilGrid.innerHTML = '';
  decisionSection.hidden = true;
  refineBtn.hidden = true;
  generateBtn.disabled = true;
  originalRequirement = requirement;
  setStep(2);
  setStatus('AI agent is reasoning through the architecture…', false, true);

  try {
    const res = await fetch('/api/architect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirement })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    lastArchitecture = data;
    renderResult(data);
    setStatus('Architecture proposed. Convening the review council…', false, false);
    setStep(3);
    convenCouncil(data);
  } catch (err) {
    console.error(err);
    showError(err.message || 'Failed to generate architecture. Please try again.');
    setStatus('', false, false);
  } finally {
    generateBtn.disabled = false;
  }
}

function setStatus(msg, isError, working) {
  statusLine.textContent = msg;
  statusLine.classList.toggle('working', !!working);
  statusLine.style.color = isError ? 'var(--error)' : 'var(--ai-accent)';
}

function showError(msg) {
  errorText.textContent = msg;
  errorPanel.hidden = false;
}
function hideError() {
  errorPanel.hidden = true;
}

// ---- Render result ----
function renderResult(data) {
  resultPanel.hidden = false;
  summaryText.textContent = data.summary || '';
  terraformBlock.textContent = data.terraform || '// No Terraform generated.';

  considerationsList.innerHTML = '';
  (data.considerations || []).forEach(c => {
    const li = document.createElement('li');
    li.textContent = c;
    considerationsList.appendChild(li);
  });

  drawDiagram(data.nodes || [], data.edges || []);
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- SVG diagram layout (simple auto-layout, no external library needed) ----
function drawDiagram(nodes, edges) {
  diagramSvg.innerHTML = '';
  if (!nodes.length) return;

  const width = 900, height = 420;
  const cols = Math.ceil(Math.sqrt(nodes.length * (width / height)));
  const rows = Math.ceil(nodes.length / cols);
  const cellW = width / cols;
  const cellH = height / rows;
  const boxW = Math.min(150, cellW - 30);
  const boxH = 56;

  const positions = {};
  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = cellW * col + cellW / 2;
    const cy = cellH * row + cellH / 2;
    positions[node.id] = { x: cx, y: cy };
  });

  const svgNS = 'http://www.w3.org/2000/svg';

  // arrowhead marker
  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#8ACD47"></path>
  </marker>`;
  diagramSvg.appendChild(defs);

  // edges first (so nodes draw on top)
  edges.forEach(edge => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;

    const path = document.createElementNS(svgNS, 'path');
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    path.setAttribute('d', `M${from.x},${from.y} Q${midX},${midY} ${to.x},${to.y}`);
    path.setAttribute('class', 'edge-line');
    path.setAttribute('marker-end', 'url(#arrow)');
    diagramSvg.appendChild(path);

    if (edge.label) {
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', midX);
      label.setAttribute('y', midY - 6);
      label.setAttribute('class', 'edge-label');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = edge.label;
      diagramSvg.appendChild(label);
    }
  });

  // nodes
  nodes.forEach(node => {
    const pos = positions[node.id];
    const g = document.createElementNS(svgNS, 'g');

    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', pos.x - boxW / 2);
    rect.setAttribute('y', pos.y - boxH / 2);
    rect.setAttribute('width', boxW);
    rect.setAttribute('height', boxH);
    rect.setAttribute('rx', 8);
    rect.setAttribute('class', 'node-box' + (node.type === 'Client' ? ' client' : ''));
    g.appendChild(rect);

    const typeLabel = document.createElementNS(svgNS, 'text');
    typeLabel.setAttribute('x', pos.x);
    typeLabel.setAttribute('y', pos.y - 6);
    typeLabel.setAttribute('text-anchor', 'middle');
    typeLabel.setAttribute('class', 'node-type');
    typeLabel.textContent = node.type;
    g.appendChild(typeLabel);

    const nameLabel = document.createElementNS(svgNS, 'text');
    nameLabel.setAttribute('x', pos.x);
    nameLabel.setAttribute('y', pos.y + 14);
    nameLabel.setAttribute('text-anchor', 'middle');
    nameLabel.setAttribute('class', 'node-label');
    nameLabel.textContent = truncate(node.label || node.id, 18);
    g.appendChild(nameLabel);

    diagramSvg.appendChild(g);
  });
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

// ---- Human review actions ----
approveBtn.addEventListener('click', () => {
  reviewNote.hidden = false;
  reviewNote.className = 'review-note approved';
  reviewNote.textContent = '✓ Approved by engineer — this architecture is ready to move to implementation.';
  setStep(4);
});

flagBtn.addEventListener('click', () => {
  reviewNote.hidden = false;
  reviewNote.className = 'review-note flagged';
  reviewNote.textContent = '⚑ Flagged for revision — use "Regenerate with Council feedback" below, or adjust the requirement above and try again.';
  setStep(4);
});

refineBtn.addEventListener('click', () => {
  if (!lastCouncil || !originalRequirement) return;

  const allFlags = lastCouncil.flatMap(agent => agent.flags || []);
  if (!allFlags.length) return;

  const refinedRequirement = `${originalRequirement}\n\nAlso address this feedback from a specialist review panel: ${allFlags.join('; ')}.`;
  requirementInput.value = refinedRequirement;
  generateArchitecture();
});

// ---- AI Architecture Council ----
async function convenCouncil(architecture) {
  councilLoading.hidden = false;

  try {
    const res = await fetch('/api/council', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ architecture })
    });

    const data = await res.json();
    councilLoading.hidden = true;

    if (!res.ok) {
      console.error('Council error:', data.error);
      revealDecision([]); // council failed — still let the human decide on the architecture alone
      return;
    }

    lastCouncil = data.council || [];
    renderCouncil(lastCouncil);
    revealDecision(lastCouncil);
  } catch (err) {
    console.error('Council fetch failed:', err);
    councilLoading.hidden = true;
    revealDecision([]);
  }
}

function revealDecision(council) {
  decisionSection.hidden = false;
  setStep(4);
  setStatus('Council review complete. Your call.', false, false);

  const hasFlags = council.some(agent => agent.flags && agent.flags.length);
  refineBtn.hidden = !hasFlags;

  decisionSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderCouncil(council) {
  if (!council.length) return;

  councilGrid.innerHTML = '';
  councilSection.hidden = false;

  council.forEach((agent, i) => {
    const meta = AGENT_META[agent.id] || { icon: '◈', colorVar: '--ai-accent' };

    const card = document.createElement('div');
    card.className = 'council-card';
    card.style.setProperty('--card-color', `var(${meta.colorVar})`);
    card.style.animationDelay = `${i * 0.15}s`;

    const flagsHtml = agent.flags && agent.flags.length
      ? `<ul class="council-flags">${agent.flags.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
      : `<div class="council-verdict-empty">No concerns flagged.</div>`;

    card.innerHTML = `
      <div class="council-card-head">
        <span class="council-agent-name"><span class="council-agent-icon">${meta.icon}</span>${escapeHtml(agent.name)}</span>
        <span class="severity-badge severity-${agent.severity}">${escapeHtml(agent.severity)}</span>
      </div>
      <p class="council-verdict">${escapeHtml(agent.verdict)}</p>
      ${flagsHtml}
    `;
    councilGrid.appendChild(card);
  });

  councilSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
