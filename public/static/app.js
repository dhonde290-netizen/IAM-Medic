// ===================================================================
// IAM Medic Interactive Frontend Logic
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const presetChipsContainer = document.getElementById('presetChipsContainer');
  const errorInput = document.getElementById('errorInput');
  const contextInput = document.getElementById('contextInput');
  const toggleContext = document.getElementById('toggleContext');
  const contextDrawer = document.getElementById('contextDrawer');
  const diagnoseBtn = document.getElementById('diagnoseBtn');
  const diagnoseBtnText = document.getElementById('diagnoseBtnText');
  const clearBtn = document.getElementById('clearBtn');
  const chevronIcon = document.getElementById('chevronIcon');

  const outputSection = document.getElementById('outputSection');
  const loadingState = document.getElementById('loadingState');
  const resultContent = document.getElementById('resultContent');
  const triageStatus = document.getElementById('triageStatus');

  const triageBox = document.getElementById('triageBox');
  const anatomyGrid = document.getElementById('anatomyGrid');
  const proseContent = document.getElementById('proseContent');
  const policyCodeBlock = document.getElementById('policyCodeBlock');
  const cliCodeBlock = document.getElementById('cliCodeBlock');
  const copyPolicyBtn = document.getElementById('copyPolicyBtn');
  const copyPolicyText = document.getElementById('copyPolicyText');
  const copyCliBtn = document.getElementById('copyCliBtn');
  const copyCliText = document.getElementById('copyCliText');

  let currentDiagnosis = null;

  // Resilient API Fetch Helper (Supports both /api/* and root /* environments)
  async function apiFetch(endpoint, options = {}) {
    const fullPath = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    try {
      let res = await fetch('/api' + fullPath, options);
      if (res && res.ok) return res;
      let resAlt = await fetch(fullPath, options);
      if (resAlt && resAlt.ok) return resAlt;
      return res || resAlt;
    } catch (e) {
      return fetch(fullPath, options);
    }
  }

  // 1. Fetch and render 1-click Preset Error Samples
  async function loadSamples() {
    try {
      const res = await apiFetch('/samples');
      const data = await res.json();
      if (data.samples && data.samples.length > 0) {
        presetChipsContainer.innerHTML = '';
        data.samples.forEach(sample => {
          const btn = document.createElement('button');
          btn.className = 'chip-btn';
          btn.textContent = sample.title;
          btn.addEventListener('click', () => {
            errorInput.value = sample.raw_error;
            errorInput.focus();
            runDiagnosis();
          });
          presetChipsContainer.appendChild(btn);
        });
      }
    } catch (err) {
      console.error('Failed to load samples:', err);
    }
  }

  // 2. Toggle optional developer context drawer
  toggleContext.addEventListener('click', () => {
    const isHidden = contextDrawer.classList.contains('hidden');
    if (isHidden) {
      contextDrawer.classList.remove('hidden');
      if (chevronIcon) chevronIcon.style.transform = 'rotate(90deg)';
      contextInput.focus();
    } else {
      contextDrawer.classList.add('hidden');
      if (chevronIcon) chevronIcon.style.transform = 'rotate(0deg)';
    }
  });

  // 3. Clear input and hide output section
  clearBtn.addEventListener('click', () => {
    errorInput.value = '';
    contextInput.value = '';
    outputSection.classList.add('hidden');
    resultContent.classList.add('hidden');
    loadingState.classList.add('hidden');
    currentDiagnosis = null;
    errorInput.focus();
  });

  // 4. Main Diagnosis Workflow
  async function runDiagnosis() {
    const errorText = errorInput.value.trim();
    if (!errorText) {
      alert('Please paste an AWS error message or select a sample above.');
      errorInput.focus();
      return;
    }

    // Reveal output section below and show loading
    outputSection.classList.remove('hidden');
    resultContent.classList.add('hidden');
    loadingState.classList.remove('hidden');
    diagnoseBtn.disabled = true;
    diagnoseBtnText.textContent = 'Analyzing...';

    // Smooth scroll down to loading state
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const response = await apiFetch('/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error_text: errorText,
          user_context: contextInput.value.trim() || null
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      const data = await response.json();
      currentDiagnosis = data;
      renderDiagnosis(data);
    } catch (err) {
      console.error('Diagnosis failed:', err);
      alert('Error during diagnosis. Check backend server logs.');
      outputSection.classList.add('hidden');
    } finally {
      loadingState.classList.add('hidden');
      diagnoseBtn.disabled = false;
      diagnoseBtnText.textContent = 'Diagnose & Prescribe Fix';
    }
  }

  diagnoseBtn.addEventListener('click', runDiagnosis);

  // 5. Render Diagnosis UI Below
  function renderDiagnosis(data) {
    const anatomy = data.parsed_anatomy;
    const policy = data.policy;

    // Parse clean names
    const actionParts = (anatomy.action || 'Unknown:Action').split(':');
    const servicePrefix = actionParts[0] || 'aws';
    const operationName = actionParts[1] || anatomy.action;

    // Principal display logic
    let principalShort = anatomy.principal || 'Caller Identity';
    if (principalShort.includes('/')) {
      const parts = principalShort.split('/');
      principalShort = parts.slice(1).join(' / ');
    } else if (principalShort.includes(':')) {
      principalShort = principalShort.split(':').pop();
    }

    // Resource display logic
    let resourceShort = anatomy.resource || 'Target Resource';
    if (resourceShort.includes(':')) {
      const parts = resourceShort.split(':');
      resourceShort = parts[parts.length - 1];
    }

    // 1. Sleek Triage Banner
    triageBox.innerHTML = `
      <div class="triage-card">
        <div class="triage-card-header">
          <div class="triage-tag-row">
            <span class="badge-deny">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              403 ACCESS DENIED
            </span>
            <span class="badge-service">${servicePrefix.toUpperCase()}</span>
            <span class="badge-eval">EVALUATION FAILED</span>
          </div>
          <div class="triage-action-pill">
            <span class="action-tag">ACTION</span>
            <code>${anatomy.action}</code>
          </div>
        </div>

        <div class="triage-headline">
          <div class="triage-headline-title">
            Authorization Denied on <code>${anatomy.action}</code>
          </div>
          <div class="triage-headline-sub">
            The caller was blocked because AWS IAM evaluated all applicable policies and found no matching <strong>Allow</strong> statement.
          </div>
        </div>

        <div class="triage-meta-table">
          <div class="triage-meta-row">
            <span class="meta-label">TARGET:</span>
            <span class="meta-val" title="${anatomy.resource}"><code>${anatomy.resource}</code></span>
            <button class="mini-copy-btn" data-copy="${anatomy.resource}" title="Copy Resource ARN">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
          </div>
          <div class="triage-meta-row">
            <span class="meta-label">CALLER:</span>
            <span class="meta-val" title="${anatomy.principal}"><code>${anatomy.principal}</code></span>
            <button class="mini-copy-btn" data-copy="${anatomy.principal}" title="Copy Principal ARN">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    // 2. Anatomy Grid Cards
    anatomyGrid.innerHTML = `
      <div class="anatomy-card card-principal">
        <div class="anatomy-header">
          <div class="anatomy-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>Principal (Who)</span>
          </div>
          <span class="anatomy-subtag subtag-indigo">Caller</span>
        </div>
        <div class="anatomy-hero-name" title="${principalShort}">${principalShort}</div>
        <div class="anatomy-sub-arn" title="${anatomy.principal}">
          <code>${anatomy.principal}</code>
        </div>
      </div>

      <div class="anatomy-card card-action">
        <div class="anatomy-header">
          <div class="anatomy-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            <span>Action (What)</span>
          </div>
          <span class="anatomy-subtag subtag-cyan">Operation</span>
        </div>
        <div class="anatomy-hero-name text-cyan" title="${operationName}">${operationName}</div>
        <div class="anatomy-sub-arn">
          <code>${anatomy.action}</code>
        </div>
      </div>

      <div class="anatomy-card card-resource">
        <div class="anatomy-header">
          <div class="anatomy-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2"/>
              <path d="M3 9h18"/>
              <path d="M9 21V9"/>
            </svg>
            <span>Resource (Where)</span>
          </div>
          <span class="anatomy-subtag subtag-emerald">Target</span>
        </div>
        <div class="anatomy-hero-name text-amber" title="${resourceShort}">${resourceShort}</div>
        <div class="anatomy-sub-arn" title="${anatomy.resource}">
          <code>${anatomy.resource}</code>
        </div>
      </div>
    `;

    // Hook mini copy buttons on ARNs
    document.querySelectorAll('.mini-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = btn.getAttribute('data-copy');
        if (val) {
          navigator.clipboard.writeText(val);
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
          setTimeout(() => {
            btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
          }, 1500);
        }
      });
    });

    // 3. Prose Breakdown (Modular & Scannable)
    proseContent.innerHTML = formatModularDiagnosis(data.human_diagnosis, anatomy);

    // 4. Code Blocks with Syntax Highlighting
    policyCodeBlock.innerHTML = highlightJson(policy.formatted_json);
    cliCodeBlock.innerHTML = highlightCli(data.cli_remediation);

    // Reveal result content
    resultContent.classList.remove('hidden');
    triageStatus.innerHTML = '<span class="status-indicator ready"></span> Prescription Ready';

    // Smooth scroll down to the newly generated diagnosis
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // 6. Copy to Clipboard Handlers
  copyPolicyBtn.addEventListener('click', () => {
    if (currentDiagnosis) {
      navigator.clipboard.writeText(currentDiagnosis.policy.formatted_json).then(() => {
        copyPolicyText.textContent = 'Copied!';
        setTimeout(() => { copyPolicyText.textContent = 'Copy Policy'; }, 1800);
      });
    }
  });

  copyCliBtn.addEventListener('click', () => {
    if (currentDiagnosis) {
      navigator.clipboard.writeText(currentDiagnosis.cli_remediation).then(() => {
        copyCliText.textContent = 'Copied!';
        setTimeout(() => { copyCliText.textContent = 'Copy CLI'; }, 1800);
      });
    }
  });

  // Modular Diagnosis Formatter (Innovative, Fun, Analogy-Driven, Helpful)
  function formatModularDiagnosis(text, anatomy) {
    if (!text) return '';

    // 1. Strip emojis
    let clean = text.replace(/[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/gu, '');
    clean = clean.replace(/\r\n/g, '\n');

    // 2. Strip code blocks
    clean = clean.replace(/(?:```json[\s\S]*?```|``json[\s\S]*?``|```[\s\S]*?```|``[\s\S]*?``)/gi, '');
    clean = clean.replace(/(?:`\{[\s\S]*?\}`)/gi, '');

    // 3. Normalize headers FIRST so every valid section starts with \n###
    clean = clean.replace(/(?:^|\n)\s*(?:###\s*|\*\*)?(The Real-World Analogy|Real-World Analogy|Analogy)\s*[:\*]*/gi, '\n### The Real-World Analogy\n');
    clean = clean.replace(/(?:^|\n)\s*(?:###\s*|\*\*)?(Plain-English Triage|Triage & Plain-English Translation|Triage & Error Breakdown|Triage & Human Translation|Triage)\s*[:\*]*/gi, '\n### Plain-English Triage\n');
    clean = clean.replace(/(?:^|\n)\s*(?:###\s*|\*\*)?(Why AWS IAM Said No|Why AWS IAM Evaluated AccessDenied|Evaluation Pathway|IAM Decision Logic|Evaluation Logic|Why Access Denied|Decision Gate)\s*[:\*]*/gi, '\n### Why AWS IAM Said No\n');
    clean = clean.replace(/(?:^|\n)\s*(?:###\s*|\*\*)?(Anatomy of the Failure|Authorization Anatomy|Failure Breakdown|Failure Anatomy)\s*[:\*]*/gi, '\n### Anatomy of the Failure\n');
    clean = clean.replace(/(?:^|\n)\s*(?:###\s*|\*\*)?(Architectural Pro-Tips|Security & Architectural Recommendations|Security Recommendations|Recommendations|Pro-Tips)\s*[:\*]*/gi, '\n### Architectural Pro-Tips\n');
    clean = clean.replace(/(?:^|\n)\s*(?:###\s*|\*\*)?(The Surgical Prescription|Prescribed Least-Privilege Policy|Prescribed Policy|The Prescription)\s*[:\*]*/gi, '\n### Prescribed Policy\n');

    // 4. Strip duplicate prescription block safely between ### Prescribed Policy and the next ###
    clean = clean.replace(/\n### Prescribed Policy\n[\s\S]*?(?=\n###|$)/gi, '');

    // Split sections by ###
    const sections = clean.split(/(?=###\s+)/);
    let analogyHtml = '';
    let triageHtml = '';
    let decisionGateHtml = '';
    let anatomyHtml = '';
    let recsHtml = '';

    for (let sec of sections) {
      const trimmed = sec.trim();
      if (!trimmed) continue;

      const lower = trimmed.toLowerCase();

      // Section 1: The Real-World Analogy
      if (lower.includes('analogy')) {
        const body = trimmed.replace(/^###\s*[^\n]+\n+/, '').trim();
        const paras = body.split(/\n\n+/).filter(Boolean).map(p => {
          let formatted = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
          return `<p class="analogy-text">${formatted}</p>`;
        }).join('');

        if (paras) {
          analogyHtml = `
            <div class="prose-block analogy-block">
              <div class="prose-block-header">
                <div class="prose-title-wrap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                  <span>The Real-World Analogy</span>
                </div>
                <span class="gate-tag analogy-tag">MENTAL MODEL</span>
              </div>
              <div class="prose-block-body">
                ${paras}
              </div>
            </div>
          `;
        }
      }
      // Section 2: Plain-English Triage
      else if (lower.includes('triage') || lower.includes('human translation') || lower.includes('plain-english') || lower.includes('error breakdown')) {
        const body = trimmed.replace(/^###\s*[^\n]+\n+/, '').trim();
        const paras = body.split(/\n\n+/).filter(Boolean).map(p => {
          let formatted = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
          return `<p>${formatted}</p>`;
        }).join('');

        triageHtml = `
          <div class="prose-block triage-summary-block">
            <div class="prose-block-header">
              <div class="prose-title-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>Plain-English Triage</span>
              </div>
              <span class="gate-tag triage-tag">INTENT VS REALITY</span>
            </div>
            <div class="prose-block-body">
              ${paras || '<p>Authorization blocked by AWS IAM evaluation engine.</p>'}
            </div>
          </div>
        `;
      }
      // Section 3: Why AWS IAM Said No (Evaluation Gate)
      else if (lower.includes('why aws iam') || lower.includes('said no') || lower.includes('evaluation gate') || lower.includes('decision logic') || lower.includes('evaluation pathway')) {
        const body = trimmed.replace(/^###\s*[^\n]+\n+/, '').trim();
        const paras = body.split(/\n\n+/).filter(Boolean).map(p => {
          let formatted = p.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
          return `<p>${formatted}</p>`;
        }).join('');

        const isExplicit = anatomy.is_explicit_deny || lower.includes('explicit deny');
        const isKms = anatomy.is_kms || lower.includes('kms') || lower.includes('two-key');

        decisionGateHtml = `
          <div class="prose-block decision-gate-block">
            <div class="prose-block-header">
              <div class="prose-title-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>Why AWS IAM Said No (Evaluation Gate)</span>
              </div>
              <span class="gate-tag decision-tag">EVALUATION LOGIC</span>
            </div>
            <div class="prose-block-body">
              <div class="decision-pipeline">
                <span class="pipeline-step step-checked">1. Request Dispatched</span>
                <span class="pipeline-arrow">&rarr;</span>
                <span class="pipeline-step ${isExplicit ? 'step-deny' : 'step-warn'}">${isExplicit ? '2. Explicit Deny Encountered' : (isKms ? '2. Two-Key Policy Evaluation' : '2. Default Deny (No Allow Found)')}</span>
                <span class="pipeline-arrow">&rarr;</span>
                <span class="pipeline-step step-blocked">3. Access Blocked</span>
              </div>
              <div class="decision-text">
                ${paras || '<p>AWS IAM evaluated the request against all policies and rejected it under default deny rules.</p>'}
              </div>
            </div>
          </div>
        `;
      }
      // Section 3: Failure Anatomy & Root Cause
      else if (lower.includes('anatomy') || lower.includes('failure') || lower.includes('authorization anatomy')) {
        const body = trimmed.replace(/^###\s*[^\n]+\n+/, '').trim();
        
        // Parse items (split on dashes or newlines)
        let rawItems = [];
        if (body.includes(' - Action Attempted:') || body.includes(' - Resource Target:')) {
          rawItems = body.split(/\s*-\s*/).filter(x => x.trim());
        } else {
          rawItems = body.split(/\n+/).map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
        }

        let breakdownItemsHtml = '';
        rawItems.forEach(item => {
          if (!item) return;
          let cleaned = item.trim();
          // Filter out stray commentary
          if (cleaned.toLowerCase().startsWith('this policy') || cleaned.toLowerCase().startsWith('to resolve') || cleaned.toLowerCase().startsWith('here is an example')) {
            return;
          }
          const colonIdx = cleaned.indexOf(':');
          let key = 'Finding';
          let val = cleaned;
          if (colonIdx > 0 && colonIdx < 50) {
            key = cleaned.substring(0, colonIdx).replace(/\*\*/g, '').replace(/^[-*]\s*/, '').trim();
            val = cleaned.substring(colonIdx + 1).replace(/^[\s*]+/, '').trim();
          } else {
            val = cleaned.replace(/^[\s*]+/, '').trim();
          }

          let formattedVal = val.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          formattedVal = formattedVal.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

          const isRootCause = key.toLowerCase().includes('root cause');
          breakdownItemsHtml += `
            <div class="breakdown-item ${isRootCause ? 'breakdown-root-cause' : ''}">
              <span class="breakdown-key">${key}</span>
              <span class="breakdown-val">${formattedVal}</span>
            </div>
          `;
        });

        anatomyHtml = `
          <div class="prose-block failure-analysis-block">
            <div class="prose-block-header">
              <div class="prose-title-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="12 8 8 12 12 16 16 12 12 8"/></svg>
                <span>Failure Breakdown &amp; Root Cause</span>
              </div>
              <span class="gate-tag failure-tag">ANATOMY</span>
            </div>
            <div class="prose-block-body">
              <div class="breakdown-grid">
                ${breakdownItemsHtml}
              </div>
            </div>
          </div>
        `;
      }
      // Section 5: Architectural Pro-Tips
      else if (lower.includes('pro-tip') || lower.includes('recommendation') || lower.includes('security')) {
        const body = trimmed.replace(/^###\s*[^\n]+\n+/, '').trim();
        
        // Parse numbered items: split on "1. ", "2. ", etc.
        const recMatches = body.split(/(?=(?:^|\s+)\d+\.\s+)/).map(s => s.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
        
        let recsListHtml = '';
        recMatches.forEach((rec, idx) => {
          let colonIdx = rec.indexOf(':');
          let title = '';
          let desc = rec;
          if (colonIdx > 0 && colonIdx < 50) {
            title = rec.substring(0, colonIdx).replace(/\*\*/g, '').trim();
            desc = rec.substring(colonIdx + 1).replace(/^[\s*]+/, '').trim();
          } else {
            desc = rec.replace(/^[\s*]+/, '').trim();
          }

          let formattedDesc = desc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
          formattedDesc = formattedDesc.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

          recsListHtml += `
            <div class="rec-item">
              <span class="rec-badge">0${idx + 1}</span>
              <div class="rec-content">
                ${title ? `<strong class="rec-title">${title}:</strong> ` : ''}
                <span class="rec-desc">${formattedDesc}</span>
              </div>
            </div>
          `;
        });

        recsHtml = `
          <div class="prose-block recommendations-block">
            <div class="prose-block-header">
              <div class="prose-title-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Architectural Pro-Tips &amp; Best Practices</span>
              </div>
              <span class="gate-tag pro-tag">WELL-ARCHITECTED</span>
            </div>
            <div class="prose-block-body">
              <div class="recommendations-list">
                ${recsListHtml}
              </div>
            </div>
          </div>
        `;
      }
    }

    // 4. Guarantee an Analogy Block if Bedrock didn't produce one
    if (!analogyHtml) {
      const act = (anatomy.action || '').toLowerCase();
      const res = (anatomy.resource || '').toLowerCase();
      let dynamicAnalogy = '';

      if (act.includes('decrypt') || act.includes('kms') || res.includes('kms')) {
        dynamicAnalogy = 'Think of this like a bank vault containing a locked safety deposit box. Your identity had the key to enter the front lobby, but the file is locked inside a titanium safe requiring a second, separate key (AWS KMS). Even with bucket permissions, without clearance on the KMS Key Policy, you are holding a lockbox you cannot open.';
      } else if (act.includes('putobject') || act.includes('s3') || res.includes('s3')) {
        dynamicAnalogy = `Think of this like an office delivery locker. Your courier arrived with a package to drop off, but security never programmed the electronic keycard to unlock that specific locker door. The package is ready and the courier is at the locker, but the latch won't pop open without an explicit Allow badge.`;
      } else if (act.includes('assumerole') || act.includes('sts')) {
        dynamicAnalogy = 'Think of this like an international embassy checkpoint. Your domestic passport (source account) confirms your identity, but the foreign embassy (target account) will not let you through without an official entry visa (the role Trust Relationship Policy) explicitly stamped by their border control.';
      } else if (act.includes('query') || act.includes('dynamodb') || res.includes('table')) {
        dynamicAnalogy = 'Think of this like a university library. Your library card gives you access to the main book catalog, but you walked into the restricted microfiche archive without the special archive pass. In DynamoDB, secondary indexes are distinct sub-resources that need their own explicit clearance.';
      } else if (act.includes('secret') || res.includes('secret')) {
        dynamicAnalogy = 'Think of this like a diplomatic courier pouch with a wax seal. Your container app knows the folder name on the label, but security refuses to break the wax seal and reveal the database password because your container badge lacks the confidential handler clearance stamp.';
      } else {
        dynamicAnalogy = `Think of AWS IAM as a meticulous nightclub bouncer with a clipboard. Even if your identity is totally legit, if the action is not explicitly written on the guest list for this exact resource, the velvet rope stays firmly in place.`;
      }

      analogyHtml = `
        <div class="prose-block analogy-block">
          <div class="prose-block-header">
            <div class="prose-title-wrap">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
              <span>The Real-World Analogy</span>
            </div>
            <span class="gate-tag analogy-tag">MENTAL MODEL</span>
          </div>
          <div class="prose-block-body">
            <p class="analogy-text">${dynamicAnalogy}</p>
          </div>
        </div>
      `;
    }

    // 5. Guarantee a Decision Gate Block if Bedrock didn't produce one
    if (!decisionGateHtml) {
      const isExplicit = anatomy.is_explicit_deny;
      const isKms = anatomy.is_kms;
      let reasonText = '';
      if (isExplicit) {
        reasonText = 'AWS IAM encountered an <strong>Explicit Deny</strong> statement. In the AWS policy evaluation hierarchy, an explicit Deny is an absolute veto that immediately overrides every Allow statement across identity policies, resource policies, boundaries, and SCPs.';
      } else if (isKms) {
        reasonText = 'AWS evaluated this request against the <strong>Two-Key Rule</strong>. Decrypt operations require matching Allow statements in both the IAM identity policy AND the target KMS Key Policy. Since the key policy had no statement for this caller, IAM slammed the door.';
      } else {
        reasonText = `AWS IAM operates on <strong>Default Deny</strong> mechanics. Because no attached identity policy or resource policy explicitly granted <code>${anatomy.action}</code> on this resource, the evaluation engine stopped the request cold.`;
      }

      decisionGateHtml = `
        <div class="prose-block decision-gate-block">
          <div class="prose-block-header">
            <div class="prose-title-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Why AWS IAM Said No (Evaluation Gate)</span>
            </div>
            <span class="gate-tag decision-tag">EVALUATION LOGIC</span>
          </div>
          <div class="prose-block-body">
            <div class="decision-pipeline">
              <span class="pipeline-step step-checked">1. Request Dispatched</span>
              <span class="pipeline-arrow">&rarr;</span>
              <span class="pipeline-step ${isExplicit ? 'step-deny' : 'step-warn'}">${isExplicit ? '2. Explicit Deny Encountered' : (isKms ? '2. Two-Key Policy Evaluation' : '2. Default Deny (No Allow Found)')}</span>
              <span class="pipeline-arrow">&rarr;</span>
              <span class="pipeline-step step-blocked">3. Access Blocked</span>
            </div>
            <div class="decision-text">
              <p>${reasonText}</p>
            </div>
          </div>
        </div>
      `;
    }

    // Combine all 5 modular blocks
    return analogyHtml + triageHtml + decisionGateHtml + anatomyHtml + recsHtml;
  }

  // JSON Syntax Highlighter
  function highlightJson(jsonStr) {
    if (!jsonStr) return '';
    const escaped = jsonStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          return `<span class="tok-key">${match}</span>`;
        } else {
          if (match === '"Allow"') return `<span class="tok-allow">${match}</span>`;
          if (match === '"Deny"') return `<span class="tok-deny">${match}</span>`;
          if (match.includes('arn:') || match.includes(':secret:') || match.includes(':table/') || match.includes(':role/')) {
            return `<span class="tok-arn">${match}</span>`;
          }
          if (match.includes(':')) {
            return `<span class="tok-action">${match}</span>`;
          }
          return `<span class="tok-str">${match}</span>`;
        }
      } else if (/true|false/.test(match)) {
        return `<span class="tok-bool">${match}</span>`;
      } else if (/null/.test(match)) {
        return `<span class="tok-null">${match}</span>`;
      }
      return `<span class="tok-num">${match}</span>`;
    });
  }

  // AWS CLI Syntax Highlighter
  function highlightCli(cliStr) {
    if (!cliStr) return '';
    const escaped = cliStr
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return escaped
      .replace(/^(aws\s+[\w-]+(?:\s+[\w-]+)?)/gm, '<span class="cli-cmd">$1</span>')
      .replace(/(--[\w-]+)/g, '<span class="cli-flag">$1</span>');
  }

  // Initialize
  loadSamples();
});
