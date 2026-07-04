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
const exportPngBtn = document.getElementById('exportPngBtn');
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
// ---- Layered auto-layout: rank nodes by longest path from a root, so the diagram
// flows left-to-right by actual data flow instead of raw array order. This is what
// eliminates messy diagonal lines cutting through unrelated boxes.
//
// Uses DFS with back-edge detection rather than plain Kahn's algorithm topological
// sort, because Kahn's algorithm requires at least one node with zero incoming edges
// to start from. Architecture graphs often have bidirectional-feeling edges (e.g. a
// "Client authenticates" edge AND a separate "Cognito returns JWT" edge between the
// same two nodes), which gives every node at least one incoming edge and leaves no
// valid starting point — collapsing the whole layout into a single column. DFS with
// back-edge skipping always makes progress regardless of cycles. ----
function computeLayers(nodes, edges) {
  const ids = nodes.map(n => n.id);
  const idSet = new Set(ids);
  const adj = {};
  ids.forEach(id => { adj[id] = []; });
  edges.forEach(e => {
    if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to) return;
    adj[e.from].push(e.to);
  });

  // DFS post-order, skipping edges back to a node still on the current path (cycle edges).
  const color = {}; ids.forEach(id => color[id] = 0); // 0=unvisited 1=in-progress 2=done
  const postOrder = [];

  function dfs(id) {
    color[id] = 1;
    adj[id].forEach(targetId => {
      if (color[targetId] === 0) dfs(targetId);
      // color[targetId] === 1 means a back-edge (cycle) — intentionally skipped here;
      // it's still drawn later, just not used to compute layer order.
    });
    color[id] = 2;
    postOrder.push(id);
  }
  ids.forEach(id => { if (color[id] === 0) dfs(id); });

  const topoOrder = postOrder.slice().reverse();
  const topoIndex = {}; topoOrder.forEach((id, i) => topoIndex[id] = i);

  const layer = {}; ids.forEach(id => layer[id] = 0);
  topoOrder.forEach(id => {
    adj[id].forEach(targetId => {
      if (topoIndex[targetId] > topoIndex[id]) {
        layer[targetId] = Math.max(layer[targetId], layer[id] + 1);
      }
    });
  });
  return layer;
}

function cubicBezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
  const y = mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;
  return { x, y };
}

function drawDiagram(nodes, edges) {
  diagramSvg.innerHTML = '';
  if (!nodes.length) return;

  const boxW = 168, boxH = 60;
  const colWidth = 220, rowHeight = 104;
  const marginX = 40, marginY = 50;

  const layer = computeLayers(nodes, edges);
  const layerGroups = {};
  nodes.forEach(node => {
    const l = layer[node.id];
    if (!layerGroups[l]) layerGroups[l] = [];
    layerGroups[l].push(node);
  });
  const numLayers = Math.max(...Object.values(layer)) + 1;
  const maxRows = Math.max(...Object.values(layerGroups).map(g => g.length));

  // Same-layer and backward edges route with a loop that extends past the box edge —
  // reserve extra width for that so the routing never gets clipped outside the viewBox.
  const needsLoopRoom = edges.some(e => {
    const fl = layer[e.from], tl = layer[e.to];
    return fl !== undefined && tl !== undefined && tl <= fl;
  });
  const loopPadding = needsLoopRoom ? 70 : 0;

  const totalWidth = marginX * 2 + boxW + (numLayers - 1) * colWidth + loopPadding;
  const totalHeight = marginY * 2 + maxRows * rowHeight;
  diagramSvg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

  const positions = {};
  for (let l = 0; l < numLayers; l++) {
    const group = layerGroups[l] || [];
    const layerHeight = group.length * rowHeight;
    const startY = marginY + (maxRows * rowHeight - layerHeight) / 2 + rowHeight / 2;
    group.forEach((node, i) => {
      positions[node.id] = {
        x: marginX + boxW / 2 + l * colWidth,
        y: startY + i * rowHeight,
        layer: l
      };
    });
  }

  const svgNS = 'http://www.w3.org/2000/svg';

  const defs = document.createElementNS(svgNS, 'defs');
  defs.innerHTML = `<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="#8ACD47"></path>
  </marker>`;
  diagramSvg.appendChild(defs);

  // edges first (so nodes draw on top), with box-edge-to-box-edge routing instead of center-to-center
  edges.forEach((edge, idx) => {
    const from = positions[edge.from];
    const to = positions[edge.to];
    if (!from || !to) return;

    let p0, p1, p2, p3;
    if (to.layer > from.layer) {
      // forward flow: right edge of source -> left edge of target
      p0 = { x: from.x + boxW / 2, y: from.y };
      p3 = { x: to.x - boxW / 2, y: to.y };
      const midX = (p0.x + p3.x) / 2;
      p1 = { x: midX, y: p0.y };
      p2 = { x: midX, y: p3.y };
    } else if (to.layer === from.layer) {
      // same column: loop out to the right side
      p0 = { x: from.x + boxW / 2, y: from.y };
      p3 = { x: to.x + boxW / 2, y: to.y };
      const bulge = p0.x + 46;
      p1 = { x: bulge, y: p0.y };
      p2 = { x: bulge, y: p3.y };
    } else {
      // backward edge: route below via left edges, dipping down to avoid crossing boxes
      p0 = { x: from.x - boxW / 2, y: from.y };
      p3 = { x: to.x + boxW / 2, y: to.y };
      p1 = { x: p0.x, y: p0.y + 55 };
      p2 = { x: p3.x, y: p3.y + 55 };
    }

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`);
    path.setAttribute('class', 'edge-line');
    path.setAttribute('marker-end', 'url(#arrow)');
    diagramSvg.appendChild(path);

    if (edge.label) {
      const labelText = truncate(edge.label, 24);
      const mid = cubicBezierPoint(p0, p1, p2, p3, 0.5);
      // Stagger overlapping labels slightly so fanned-out edges don't stack exactly on top of each other.
      const jitter = (idx % 3 - 1) * 13;
      const lx = mid.x, ly = mid.y + jitter;

      const approxWidth = labelText.length * 5.4 + 12;
      const bg = document.createElementNS(svgNS, 'rect');
      bg.setAttribute('x', lx - approxWidth / 2);
      bg.setAttribute('y', ly - 11);
      bg.setAttribute('width', approxWidth);
      bg.setAttribute('height', 15);
      bg.setAttribute('rx', 3);
      bg.setAttribute('class', 'edge-label-bg');
      diagramSvg.appendChild(bg);

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', lx);
      label.setAttribute('y', ly);
      label.setAttribute('class', 'edge-label');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = labelText;
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
    typeLabel.setAttribute('y', pos.y - 8);
    typeLabel.setAttribute('text-anchor', 'middle');
    typeLabel.setAttribute('class', 'node-type');
    typeLabel.textContent = node.type;
    g.appendChild(typeLabel);

    const nameLabel = document.createElementNS(svgNS, 'text');
    nameLabel.setAttribute('x', pos.x);
    nameLabel.setAttribute('y', pos.y + 14);
    nameLabel.setAttribute('text-anchor', 'middle');
    nameLabel.setAttribute('class', 'node-label');
    nameLabel.textContent = truncate(node.label || node.id, 20);
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

// ---- Rasterize the diagram SVG to a PNG data URL (reused by PNG export + PDF report) ----
// The diagram's colors come from CSS classes (node-box, edge-line, etc). A standalone
// exported SVG has no access to that external stylesheet, so we inline the *computed*
// style of every element onto a clone before rasterizing — otherwise the export comes
// out as unstyled black shapes.
function renderDiagramToDataUrl() {
  return new Promise((resolve, reject) => {
    try {
      const svgEl = document.getElementById('diagramSvg');
      const clone = svgEl.cloneNode(true);

      const origEls = svgEl.querySelectorAll('*');
      const cloneEls = clone.querySelectorAll('*');
      const props = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'opacity'];

      origEls.forEach((origEl, i) => {
        const cs = getComputedStyle(origEl);
        let styleStr = '';
        props.forEach(p => {
          const v = cs.getPropertyValue(p);
          if (v) styleStr += `${p}:${v};`;
        });
        if (cloneEls[i]) cloneEls[i].setAttribute('style', styleStr);
      });

      const vb = svgEl.viewBox.baseVal;
      const vbWidth = vb && vb.width ? vb.width : 900;
      const vbHeight = vb && vb.height ? vb.height : 420;

      const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0A0F1C';
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', '0');
      bgRect.setAttribute('y', '0');
      bgRect.setAttribute('width', String(vbWidth));
      bgRect.setAttribute('height', String(vbHeight));
      bgRect.setAttribute('fill', bgColor);
      clone.insertBefore(bgRect, clone.firstChild);

      const svgString = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = vbWidth * scale;
        canvas.height = vbHeight * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: vbWidth, height: vbHeight });
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

exportPngBtn.addEventListener('click', () => {
  renderDiagramToDataUrl()
    .then(result => {
      const a = document.createElement('a');
      a.href = result.dataUrl;
      a.download = 'architecture-diagram.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    })
    .catch(err => console.error('Diagram export failed:', err));
});

// ---- Full PDF report: requirement, diagram, Terraform, AI notes, Council review, decision ----
async function handleDownloadReport(btn) {
  if (!lastArchitecture) return;

  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Generating…';

  try {
    const diagramResult = await renderDiagramToDataUrl();
    await buildReportPdf(diagramResult);
  } catch (err) {
    console.error('Report generation failed:', err);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

document.querySelectorAll('.btn-download-report').forEach(btn => {
  btn.addEventListener('click', () => handleDownloadReport(btn));
});

async function buildReportPdf(diagramResult) {
  const diagramDataUrl = diagramResult.dataUrl;
  const diagramAspect = diagramResult.height / diagramResult.width;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  const NAVY = [15, 23, 41];
  const GREEN = [110, 160, 60];
  const AMBER = [190, 140, 20];
  const GREY = [100, 110, 130];
  const BLACK = [30, 34, 44];

  function ensureSpace(neededHeight) {
    if (y + neededHeight > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function heading(text, color) {
    ensureSpace(26);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...color);
    doc.text(text, margin, y);
    y += 8;
    doc.setDrawColor(...color);
    doc.setLineWidth(1.2);
    doc.line(margin, y, margin + 40, y);
    y += 18;
  }

  function bodyText(text, opts = {}) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(opts.size || 10.5);
    doc.setTextColor(...(opts.color || BLACK));
    const lines = doc.splitTextToSize(text, opts.width || contentW);
    lines.forEach(line => {
      ensureSpace(opts.lineHeight || 14);
      doc.text(line, margin, y);
      y += opts.lineHeight || 14;
    });
    y += 6;
  }

  // ---- Title ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  doc.text('ARCHITECTURE://MINDS', margin, y);
  y += 20;
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('Architecture Report  \u00b7  Powered by Happiest Minds  \u00b7  Generated ' + new Date().toLocaleString(), margin, y);
  y += 28;

  // ---- Requirement ----
  heading('Requirement', GREEN);
  bodyText(originalRequirement || '(not captured)');

  // ---- Summary ----
  heading('Proposed Architecture Summary', GREEN);
  bodyText(lastArchitecture.summary || '');

  // ---- Diagram ----
  heading('Architecture Diagram', GREEN);
  const imgW = contentW;
  const imgH = imgW * diagramAspect;
  ensureSpace(imgH + 10);
  doc.addImage(diagramDataUrl, 'PNG', margin, y, imgW, imgH);
  y += imgH + 20;

  // ---- Terraform ----
  doc.addPage();
  y = margin;
  heading('Terraform (AI-generated)', GREEN);
  doc.setFont('courier', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...BLACK);
  const tfLines = doc.splitTextToSize(lastArchitecture.terraform || '(none generated)', contentW);
  tfLines.forEach(line => {
    ensureSpace(11);
    doc.text(line, margin, y);
    y += 11;
  });
  y += 16;

  // ---- AI notes ----
  heading('AI Notes', GREEN);
  (lastArchitecture.considerations || []).forEach(note => {
    bodyText('\u2022 ' + note, { lineHeight: 13 });
  });

  // ---- Council review ----
  doc.addPage();
  y = margin;
  heading('AI Architecture Council Review', AMBER);
  bodyText('Three independent AI specialists reviewed this proposal in parallel.', { color: GREY, size: 9.5 });

  const agentColors = { cost: AMBER, security: [190, 60, 60], reliability: [90, 90, 170] };
  (lastCouncil || []).forEach(agent => {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...(agentColors[agent.id] || BLACK));
    doc.text(`${agent.name}  \u2014  ${(agent.severity || '').toUpperCase()}`, margin, y);
    y += 16;
    bodyText(agent.verdict || '', { size: 10 });
    (agent.flags || []).forEach(flag => {
      bodyText('  \u2013 ' + flag, { size: 9.5, color: GREY, lineHeight: 12 });
    });
    y += 6;
  });
  if (!lastCouncil || !lastCouncil.length) {
    bodyText('(Council review not available for this architecture.)', { color: GREY });
  }

  // ---- Human decision ----
  heading('Human Decision', GREEN);
  const decisionText = reviewNote && !reviewNote.hidden
    ? reviewNote.textContent
    : 'Pending \u2014 no decision recorded yet at time of export.';
  bodyText(decisionText);

  // ---- Footer on every page ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin - 50, pageH - 24);
    doc.text('Powered by Happiest Minds', margin, pageH - 24);
  }

  const safeReq = (originalRequirement || 'architecture').slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  doc.save(`architecture-report-${safeReq || 'export'}.pdf`);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
