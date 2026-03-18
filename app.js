// ===========================
// Dodo Payments — Merchant Review Dashboard
// Application Logic
// ===========================

(function () {
    'use strict';

    // --- State ---
    let currentView = 'queue';
    let selectedMerchant = null;
    let slaInterval = null;

    // --- DOM Refs ---
    const views = document.querySelectorAll('.view');
    const navItems = document.querySelectorAll('.nav-item');
    const breadcrumbActive = document.querySelector('.breadcrumb-active');
    const queueTbody = document.getElementById('queue-tbody');
    const toastContainer = document.getElementById('toast-container');

    // --- Navigation ---
    function switchView(viewId, breadcrumb) {
        views.forEach(v => v.classList.remove('active'));
        navItems.forEach(n => n.classList.remove('active'));

        const target = document.getElementById(`view-${viewId}`);
        const navTarget = document.getElementById(`nav-${viewId}`);
        if (target) {
            target.classList.add('active');
            target.style.animation = 'none';
            target.offsetHeight; // trigger reflow
            target.style.animation = '';
        }
        if (navTarget) navTarget.classList.add('active');

        breadcrumbActive.textContent = breadcrumb || viewId.charAt(0).toUpperCase() + viewId.slice(1);
        currentView = viewId;
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            const labels = {
                queue: 'Review Queue',
                review: 'Merchant Review',
                risk: 'Risk Signals',
                audit: 'Audit Trail',
                analytics: 'Analytics'
            };
            switchView(view, labels[view]);
        });
    });

    // --- Render Queue ---
    function renderQueue(filter = 'all') {
        const filtered = filter === 'all'
            ? MERCHANTS
            : MERCHANTS.filter(m => m.stage === filter);

        queueTbody.innerHTML = filtered.map(m => {
            const slaPercent = Math.max(0, (m.slaRemaining / m.slaHours) * 100);
            let slaClass = 'sla-timer-ok';
            let slaBarColor = 'var(--success)';
            if (slaPercent < 25) { slaClass = 'sla-timer-critical'; slaBarColor = 'var(--danger)'; }
            else if (slaPercent < 50) { slaClass = 'sla-timer-warning'; slaBarColor = 'var(--warning)'; }

            const stageLabels = {
                intake: 'Intake', kyb: 'KYB', aml: 'AML/PEP',
                risk: 'Risk Review', blocked: 'Blocked', approved: 'Approved'
            };

            const riskLabels = {
                low: 'Low', medium: 'Medium', high: 'High', unknown: 'Unrated'
            };

            return `
                <tr data-id="${m.id}" onclick="window.__openMerchant('${m.id}')">
                    <td>
                        <div class="merchant-cell">
                            <div class="merchant-avatar" style="background: ${m.avatarColor}">
                                ${m.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                            </div>
                            <div>
                                <div class="merchant-name">${m.name}</div>
                                <div class="merchant-id">${m.id}</div>
                            </div>
                        </div>
                    </td>
                    <td>${m.businessType}</td>
                    <td><span class="stage-badge stage-badge-${m.stage}">${stageLabels[m.stage] || m.stage}</span></td>
                    <td><span class="risk-badge risk-badge-${m.riskTier}">${riskLabels[m.riskTier]}</span></td>
                    <td>
                        <div class="sla-timer ${slaClass}">
                            ${m.slaRemaining > 0 ? formatHours(m.slaRemaining) : 'SLA Breached'}
                        </div>
                        <div class="sla-bar">
                            <div class="sla-bar-fill" style="width: ${slaPercent}%; background: ${slaBarColor}"></div>
                        </div>
                    </td>
                    <td>
                        <div class="assigned-to">
                            <div class="assigned-avatar">${m.assignedTo.initials}</div>
                            <span>${m.assignedTo.name}</span>
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-review" onclick="event.stopPropagation(); window.__openMerchant('${m.id}')">
                            Review →
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function formatHours(h) {
        const hours = Math.floor(h);
        const mins = Math.floor((h - hours) * 60);
        return `${hours}h ${mins}m`;
    }

    // --- Queue Filters ---
    document.querySelectorAll('[data-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderQueue(chip.getAttribute('data-filter'));
        });
    });

    // --- Open Merchant Review ---
    window.__openMerchant = function (id) {
        selectedMerchant = MERCHANTS.find(m => m.id === id);
        if (!selectedMerchant) return;

        renderMerchantReview(selectedMerchant);
        switchView('review', 'Merchant Review');
    };

    function renderMerchantReview(m) {
        // Header
        document.getElementById('review-merchant-info').innerHTML = `
            <h2>${m.name}</h2>
            <div class="merchant-meta">
                <span>${m.id}</span>
                <span>•</span>
                <span>${m.businessType}</span>
                <span>•</span>
                <span>${m.country}</span>
            </div>
        `;

        // SLA countdown
        updateSLACountdown(m);

        // Stage progress
        const stages = ['intake', 'kyb', 'aml', 'sanctions', 'decision'];
        const stageMap = { intake: 0, kyb: 1, aml: 2, sanctions: 3, risk: 4, decision: 4, blocked: -1 };
        const currentStageIdx = stageMap[m.stage] ?? 0;

        document.querySelectorAll('.stage-step').forEach((step, idx) => {
            step.classList.remove('completed', 'active');
            if (idx < currentStageIdx) step.classList.add('completed');
            else if (idx === currentStageIdx) step.classList.add('active');
        });

        document.querySelectorAll('.stage-connector').forEach((conn, idx) => {
            conn.classList.toggle('completed', idx < currentStageIdx);
        });

        // Profile
        document.getElementById('profile-grid').innerHTML = `
            <div class="profile-field">
                <span class="field-label">Business Name</span>
                <span class="field-value">${m.name}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Business Type</span>
                <span class="field-value">${m.businessType}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Registration No.</span>
                <span class="field-value">${m.registrationNumber}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Incorporation Date</span>
                <span class="field-value">${m.incorporationDate}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Annual Revenue</span>
                <span class="field-value">${m.annualRevenue}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Employees</span>
                <span class="field-value">${m.employees}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Director</span>
                <span class="field-value">${m.directorName}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Director ID</span>
                <span class="field-value">${m.directorId}</span>
            </div>
            <div class="profile-field full-width">
                <span class="field-label">Registered Address</span>
                <span class="field-value">${m.address}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Email</span>
                <span class="field-value">${m.email}</span>
            </div>
            <div class="profile-field">
                <span class="field-label">Website</span>
                <span class="field-value">${m.website}</span>
            </div>
        `;

        // Documents
        document.getElementById('doc-list').innerHTML = m.documents.map(doc => {
            const iconMap = { pdf: 'doc-icon-pdf', img: 'doc-icon-img', doc: 'doc-icon-doc' };
            const iconSvg = {
                pdf: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
                img: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
                doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'
            };
            return `
                <div class="doc-item">
                    <div class="doc-icon ${iconMap[doc.type] || 'doc-icon-doc'}">${iconSvg[doc.type] || iconSvg.doc}</div>
                    <div class="doc-info">
                        <div class="doc-name">${doc.name}</div>
                        <div class="doc-meta">${doc.size} • ${doc.uploadDate}</div>
                    </div>
                    <span class="doc-status doc-status-${doc.status}">${doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}</span>
                </div>
            `;
        }).join('');

        // AML Checks
        document.getElementById('check-results').innerHTML = m.checks.map(check => {
            const statusClass = { pass: 'check-pass', fail: 'check-fail', pending: 'check-pending' };
            const icons = {
                pass: '✓', fail: '✗', pending: '⏳'
            };
            return `
                <div class="check-item ${statusClass[check.status]}">
                    <div class="check-icon">${icons[check.status]}</div>
                    <span class="check-name">${check.name}</span>
                    <span class="check-result">${check.result}</span>
                </div>
            `;
        }).join('');

        // Transactions
        document.getElementById('txn-stats').innerHTML = `
            <div class="txn-stat">
                <div class="txn-stat-value">${m.transactions.volume}</div>
                <div class="txn-stat-label">Total Volume</div>
            </div>
            <div class="txn-stat">
                <div class="txn-stat-value">${m.transactions.count}</div>
                <div class="txn-stat-label">Transactions</div>
            </div>
            <div class="txn-stat">
                <div class="txn-stat-value">${m.transactions.chargebackRate}</div>
                <div class="txn-stat-label">Chargeback Rate</div>
            </div>
        `;

        // Risk signals mini
        document.getElementById('risk-number').textContent = m.riskScore;
        updateRiskRing(m.riskScore);
        document.getElementById('risk-signals-mini').innerHTML = m.riskSignals.map(s => `
            <div class="risk-signal-item">
                <span class="risk-signal-name">${s.name}</span>
                <span class="risk-signal-value signal-${s.level}">${s.value}</span>
            </div>
        `).join('');

        // Notes
        renderNotes(m);

        // Mini audit trail
        renderMiniAudit(m);
    }

    function updateRiskRing(score) {
        const circumference = 2 * Math.PI * 52; // r=52
        const offset = circumference - (score / 100) * circumference;
        const circle = document.querySelector('.risk-ring-svg circle:nth-child(2)');
        if (circle) {
            circle.setAttribute('stroke-dashoffset', offset);
        }
    }

    function updateSLACountdown(m) {
        if (slaInterval) clearInterval(slaInterval);

        const updateTimer = () => {
            const remaining = m.slaRemaining;
            if (remaining <= 0) {
                document.getElementById('sla-time').textContent = 'BREACHED';
                document.getElementById('sla-time').style.color = 'var(--danger)';
                return;
            }
            const h = Math.floor(remaining);
            const mins = Math.floor((remaining - h) * 60);
            const secs = Math.floor(((remaining - h) * 60 - mins) * 60);
            document.getElementById('sla-time').textContent =
                `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            if (remaining < 3) {
                document.getElementById('sla-time').style.color = 'var(--danger)';
            } else if (remaining < 6) {
                document.getElementById('sla-time').style.color = 'var(--warning)';
            } else {
                document.getElementById('sla-time').style.color = 'var(--success)';
            }
        };

        updateTimer();
        slaInterval = setInterval(() => {
            m.slaRemaining = Math.max(0, m.slaRemaining - 1 / 3600);
            updateTimer();
        }, 1000);
    }

    function renderNotes(m) {
        const notesList = document.getElementById('notes-list');
        notesList.innerHTML = m.notes.map(n => `
            <div class="note-item ${n.flagged ? 'flagged' : ''}">
                <div class="note-header">
                    <span class="note-author">${n.flagged ? '🚩 ' : ''}${n.author}</span>
                    <span class="note-time">${n.time}</span>
                </div>
                <div class="note-text">${n.text}</div>
            </div>
        `).join('') || '<p style="color: var(--text-muted); font-size: 0.85rem;">No notes yet.</p>';
    }

    function renderMiniAudit(m) {
        const list = document.getElementById('mini-audit-list');
        const colors = {
            stage: 'var(--accent-primary)',
            decision: 'var(--success)',
            note: 'var(--warning)',
            system: 'var(--text-muted)',
            flag: 'var(--danger)'
        };
        list.innerHTML = m.auditTrail.slice(0, 5).map(a => `
            <div class="mini-audit-item">
                <div class="mini-audit-dot" style="background: ${colors[a.type]}"></div>
                <div class="mini-audit-content">
                    <div class="mini-audit-text">${a.desc}</div>
                    <div class="mini-audit-time">${formatTimestamp(a.time)} • ${a.user}</div>
                </div>
            </div>
        `).join('');
    }

    function formatTimestamp(ts) {
        const d = new Date(ts);
        const now = new Date();
        const diff = now - d;
        const hours = Math.floor(diff / 3600000);
        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    // --- Add Note ---
    document.getElementById('add-note-btn').addEventListener('click', () => {
        const input = document.getElementById('note-input');
        const text = input.value.trim();
        if (!text || !selectedMerchant) return;

        const flagged = document.getElementById('flag-toggle').checked;
        const note = {
            author: 'Tejas A.',
            text,
            time: 'Just now',
            flagged
        };

        selectedMerchant.notes.unshift(note);
        selectedMerchant.auditTrail.unshift({
            type: flagged ? 'flag' : 'note',
            desc: flagged ? 'Flag raised' : 'Note added',
            detail: text,
            time: new Date().toISOString(),
            user: 'Tejas A.'
        });

        renderNotes(selectedMerchant);
        renderMiniAudit(selectedMerchant);
        input.value = '';
        document.getElementById('flag-toggle').checked = false;

        showToast(flagged ? 'Flag raised' : 'Note added', 'Your ' + (flagged ? 'flag' : 'note') + ' has been recorded in the audit trail.', flagged ? 'warning' : 'success');
    });

    // --- Stage Actions ---
    document.getElementById('btn-complete-stage').addEventListener('click', () => {
        if (!selectedMerchant) return;

        const stageOrder = ['intake', 'kyb', 'aml', 'risk', 'approved'];
        const currentIdx = stageOrder.indexOf(selectedMerchant.stage);
        if (currentIdx < stageOrder.length - 1) {
            const nextStage = stageOrder[currentIdx + 1];
            selectedMerchant.stage = nextStage;

            const labels = { intake: 'Intake', kyb: 'KYB Verification', aml: 'AML/PEP Check', risk: 'Risk Review', approved: 'Approved' };
            selectedMerchant.auditTrail.unshift({
                type: 'stage',
                desc: `Stage completed → Moved to ${labels[nextStage]}`,
                detail: `${labels[stageOrder[currentIdx]]} stage marked as complete.`,
                time: new Date().toISOString(),
                user: 'Tejas A.'
            });

            renderMerchantReview(selectedMerchant);
            renderQueue();
            showToast('Stage completed', `Merchant moved to ${labels[nextStage]}.`, 'success');
        }
    });

    document.getElementById('btn-escalate').addEventListener('click', () => {
        if (!selectedMerchant) return;
        selectedMerchant.auditTrail.unshift({
            type: 'flag',
            desc: 'Escalation triggered',
            detail: 'Merchant escalated for senior review at current stage.',
            time: new Date().toISOString(),
            user: 'Tejas A.'
        });
        renderMiniAudit(selectedMerchant);
        showToast('Escalated', 'Merchant has been escalated for senior review.', 'warning');
    });

    document.getElementById('btn-request-info').addEventListener('click', () => {
        document.getElementById('doc-modal-overlay').classList.add('active');
    });

    // --- Doc Request Modal ---
    document.getElementById('request-docs-btn').addEventListener('click', () => {
        document.getElementById('doc-modal-overlay').classList.add('active');
    });

    document.getElementById('doc-modal-close').addEventListener('click', closeDocModal);
    document.getElementById('doc-modal-cancel').addEventListener('click', closeDocModal);
    document.getElementById('doc-modal-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeDocModal();
    });

    function closeDocModal() {
        document.getElementById('doc-modal-overlay').classList.remove('active');
    }

    document.getElementById('doc-modal-send').addEventListener('click', () => {
        if (!selectedMerchant) return;
        const docType = document.getElementById('doc-type-select').value;
        const requeue = document.getElementById('requeue-stage').value;

        if (!docType) {
            showToast('Missing info', 'Please select a document type.', 'error');
            return;
        }

        selectedMerchant.stage = requeue;
        selectedMerchant.auditTrail.unshift({
            type: 'system',
            desc: 'Document request sent',
            detail: `Email sent to merchant requesting ${docType}. Merchant re-queued to ${requeue}.`,
            time: new Date().toISOString(),
            user: 'Tejas A.'
        });

        renderMerchantReview(selectedMerchant);
        renderQueue();
        closeDocModal();
        showToast('Request sent', 'Document request email has been sent to the merchant.', 'success');
    });

    // --- Back to Queue ---
    document.getElementById('back-to-queue').addEventListener('click', () => {
        switchView('queue', 'Review Queue');
        if (slaInterval) clearInterval(slaInterval);
    });

    // --- Risk View ---
    document.getElementById('view-full-risk').addEventListener('click', () => {
        if (selectedMerchant) {
            renderRiskView(selectedMerchant);
            switchView('risk', 'Risk Signals');
        }
    });

    function renderRiskView(m) {
        document.getElementById('gauge-number').textContent = m.riskScore;

        // Gauge fill
        const maxArc = 251;
        const fillAmount = maxArc - (m.riskScore / 100) * maxArc;
        document.getElementById('gauge-fill').setAttribute('stroke-dashoffset', fillAmount);

        // Gauge label
        let labelText = 'Low Risk';
        let labelColor = 'var(--success)';
        if (m.riskScore >= 70) { labelText = 'High Risk'; labelColor = 'var(--danger)'; }
        else if (m.riskScore >= 40) { labelText = 'Medium Risk'; labelColor = 'var(--warning)'; }

        const gaugeLabel = document.getElementById('gauge-label');
        gaugeLabel.textContent = labelText;
        gaugeLabel.style.color = labelColor;

        // Tier buttons
        document.querySelectorAll('.tier-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tier') === m.riskTier) btn.classList.add('active');
        });

        // Signal cards (summary)
        const signalConfig = [
            { name: 'Fraud Score',          icon: '🔍', iconBg: 'rgba(239, 68, 68, 0.1)',  field: 0 },
            { name: 'Transaction Velocity', icon: '⚡', iconBg: 'rgba(245, 158, 11, 0.1)', field: 1 },
            { name: 'Geo Risk',             icon: '🌍', iconBg: 'rgba(59, 130, 246, 0.1)',  field: 2 },
            { name: 'Chargeback History',   icon: '↩️', iconBg: 'rgba(168, 85, 247, 0.1)',  field: 3 },
        ];

        document.getElementById('risk-signals-grid').innerHTML = signalConfig.map((config, idx) => {
            const signal = m.riskSignals[idx];
            const levelColors = {
                low:    { bg: 'var(--success-bg)', color: 'var(--success)', label: 'LOW' },
                medium: { bg: 'var(--warning-bg)', color: 'var(--warning)', label: 'MEDIUM' },
                high:   { bg: 'var(--danger-bg)',  color: 'var(--danger)',  label: 'HIGH' },
            };
            const lc = levelColors[signal.level] || levelColors.low;
            return `
                <div class="signal-card">
                    <div class="signal-card-header">
                        <div class="signal-card-icon" style="background: ${config.iconBg}; font-size: 1.2rem;">${config.icon}</div>
                        <span class="signal-card-level" style="background: ${lc.bg}; color: ${lc.color}">${lc.label}</span>
                    </div>
                    <div class="signal-card-name">${config.name}</div>
                    <div class="signal-card-value">${signal.value}</div>
                    <div class="signal-card-detail">${getSignalDetail(config.name, signal)}</div>
                </div>
            `;
        }).join('');

        // --- Render Detailed Risk Variable Breakdowns ---
        renderRiskDetails(m);
    }

    function renderRiskDetails(m) {
        const rd = getRiskDetails(m.id);
        const container = document.getElementById('risk-detail-sections');

        // Helper: format percent
        const pct = (v) => typeof v === 'number' ? (v * 100).toFixed(1) + '%' : v;
        // Helper: risk tag based on threshold
        const tag = (val, okMax, warnMax) => {
            if (typeof val !== 'number') return `<span class="risk-var-tag risk-var-tag-muted">N/A</span>`;
            if (val <= okMax) return `<span class="risk-var-tag risk-var-tag-ok">NORMAL</span>`;
            if (val <= warnMax) return `<span class="risk-var-tag risk-var-tag-warn">ELEVATED</span>`;
            return `<span class="risk-var-tag risk-var-tag-danger">HIGH</span>`;
        };
        // Helper: boolean indicator
        const boolTag = (val, dangerIfTrue = true) => {
            if (val) return `<span class="risk-var-tag ${dangerIfTrue ? 'risk-var-tag-danger' : 'risk-var-tag-ok'}">${val ? 'YES' : 'NO'}</span>`;
            return `<span class="risk-var-tag ${dangerIfTrue ? 'risk-var-tag-ok' : 'risk-var-tag-muted'}">NO</span>`;
        };
        const valClass = (val, okMax, warnMax) => {
            if (typeof val !== 'number') return 'val-muted';
            if (val <= okMax) return 'val-ok';
            if (val <= warnMax) return 'val-warn';
            return 'val-danger';
        };

        container.innerHTML = `
            <!-- Fraud Score Breakdown -->
            <div class="risk-detail-card">
                <div class="risk-detail-header">
                    <span class="risk-detail-header-icon">🔍</span>
                    <h4>Fraud Score Breakdown</h4>
                </div>
                <div class="risk-detail-body">
                    <div class="risk-var-row">
                        <span class="risk-var-name">composite_score</span>
                        <span class="risk-var-value ${valClass(rd.fraudScore.composite, 30, 60)}">${rd.fraudScore.composite}/100</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">ml_model_score</span>
                        <span class="risk-var-value ${valClass(rd.fraudScore.mlModelScore, 30, 60)}">${rd.fraudScore.mlModelScore}/100</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">rule_engine_score</span>
                        <span class="risk-var-value ${valClass(rd.fraudScore.ruleEngineScore, 30, 60)}">${rd.fraudScore.ruleEngineScore}/100</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">model_version</span>
                        <span class="risk-var-value val-muted">${rd.fraudScore.modelVersion}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">last_updated</span>
                        <span class="risk-var-value val-muted">${new Date(rd.fraudScore.lastUpdated).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            <!-- Velocity Analysis -->
            <div class="risk-detail-card">
                <div class="risk-detail-header">
                    <span class="risk-detail-header-icon">⚡</span>
                    <h4>Velocity Analysis</h4>
                </div>
                <div class="risk-detail-body">
                    <div class="risk-var-row">
                        <span class="risk-var-name">txn_per_day_avg</span>
                        <span class="risk-var-value">${rd.velocity.txnPerDay_avg}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">txn_per_day_p95</span>
                        <span class="risk-var-value">${rd.velocity.txnPerDay_p95}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">avg_ticket_size</span>
                        <span class="risk-var-value">${rd.velocity.avgTicketSize}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">max_ticket_size</span>
                        <span class="risk-var-value">${rd.velocity.maxTicketSize}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">peak_hour_concentration</span>
                        <span class="risk-var-value">${tag(rd.velocity.peakHourConcentration, 0.25, 0.40)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">velocity_ratio</span>
                        <span class="risk-var-value ${valClass(rd.velocity.velocityRatio, 1.2, 2.0)}">${typeof rd.velocity.velocityRatio === 'number' ? rd.velocity.velocityRatio.toFixed(2) + 'x' : '—'}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">spike_detected</span>
                        <span class="risk-var-value">${boolTag(rd.velocity.spikeDetected, true)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">refund_rate</span>
                        <span class="risk-var-value">${tag(rd.velocity.refundRate, 0.04, 0.08)}</span>
                    </div>
                </div>
            </div>

            <!-- Geographic Risk -->
            <div class="risk-detail-card">
                <div class="risk-detail-header">
                    <span class="risk-detail-header-icon">🌍</span>
                    <h4>Geographic Risk</h4>
                </div>
                <div class="risk-detail-body">
                    <div class="risk-var-row">
                        <span class="risk-var-name">registration_country</span>
                        <span class="risk-var-value">🏳️ ${rd.geoRisk.registrationCountry}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">fatf_country_rating</span>
                        <span class="risk-var-value"><span class="risk-var-tag risk-var-tag-${rd.geoRisk.countryRiskRating === 'Low' ? 'ok' : rd.geoRisk.countryRiskRating === 'Medium' ? 'warn' : 'danger'}">${rd.geoRisk.countryRiskRating.toUpperCase()}</span></span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">ip_geolocation_match</span>
                        <span class="risk-var-value ${valClass(100 - rd.geoRisk.ipGeolocationMatch, 10, 20)}">${rd.geoRisk.ipGeolocationMatch}%</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">multi_geo_activity</span>
                        <span class="risk-var-value">${boolTag(rd.geoRisk.multiGeoActivity, true)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">high_risk_jurisdiction_%</span>
                        <span class="risk-var-value">${tag(rd.geoRisk.highRiskJurisdictionExposure / 100, 0.02, 0.05)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">vpn_proxy_rate</span>
                        <span class="risk-var-value">${tag(rd.geoRisk.vpnProxyDetectionRate / 100, 0.02, 0.05)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">sanctioned_country_%</span>
                        <span class="risk-var-value">${tag(rd.geoRisk.sanctionedCountryExposure / 100, 0, 0.01)}</span>
                    </div>
                </div>
            </div>

            <!-- Chargeback Intelligence -->
            <div class="risk-detail-card">
                <div class="risk-detail-header">
                    <span class="risk-detail-header-icon">↩️</span>
                    <h4>Chargeback Intelligence</h4>
                </div>
                <div class="risk-detail-body">
                    <div class="risk-var-row">
                        <span class="risk-var-name">current_rate</span>
                        <span class="risk-var-value ${valClass(rd.chargeback.currentRate, 0.01, 0.02)}">${pct(rd.chargeback.currentRate)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">rate_30d</span>
                        <span class="risk-var-value">${pct(rd.chargeback.rate_30d)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">rate_90d</span>
                        <span class="risk-var-value">${pct(rd.chargeback.rate_90d)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">trend</span>
                        <span class="risk-var-value"><span class="risk-var-tag risk-var-tag-${rd.chargeback.trend === 'stable' ? 'ok' : rd.chargeback.trend === 'increasing' ? 'danger' : 'info'}">${rd.chargeback.trend.toUpperCase()}</span></span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">disputes_90d</span>
                        <span class="risk-var-value">${rd.chargeback.totalDisputes_90d}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">dispute_win_rate</span>
                        <span class="risk-var-value ${valClass(1 - rd.chargeback.wonRate, 0.4, 0.7)}">${pct(rd.chargeback.wonRate)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">top_reason_code</span>
                        <span class="risk-var-value val-muted" style="font-size: 0.72rem;">${rd.chargeback.topReasonCode}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">visa_tc40_count</span>
                        <span class="risk-var-value ${rd.chargeback.visaTC40Count > 0 ? 'val-danger' : 'val-ok'}">${rd.chargeback.visaTC40Count}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">mc_safe_count</span>
                        <span class="risk-var-value ${rd.chargeback.mastercardSAFECount > 0 ? 'val-danger' : 'val-ok'}">${rd.chargeback.mastercardSAFECount}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">threshold_status</span>
                        <span class="risk-var-value"><span class="risk-var-tag risk-var-tag-${rd.chargeback.thresholdStatus === 'normal' ? 'ok' : rd.chargeback.thresholdStatus === 'warning' ? 'warn' : 'danger'}">${rd.chargeback.thresholdStatus.toUpperCase()}</span></span>
                    </div>
                </div>
            </div>

            <!-- Device & Behavioral -->
            <div class="risk-detail-card">
                <div class="risk-detail-header">
                    <span class="risk-detail-header-icon">📱</span>
                    <h4>Device & Behavioral</h4>
                </div>
                <div class="risk-detail-body">
                    <div class="risk-var-row">
                        <span class="risk-var-name">unique_devices_30d</span>
                        <span class="risk-var-value">${rd.deviceBehavioral.uniqueDevices_30d.toLocaleString()}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">avg_session_duration</span>
                        <span class="risk-var-value">${rd.deviceBehavioral.avgSessionDuration}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">mobile_vs_desktop</span>
                        <span class="risk-var-value val-muted">${rd.deviceBehavioral.mobileVsDesktop}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">fingerprint_collision_%</span>
                        <span class="risk-var-value">${tag(rd.deviceBehavioral.deviceFingerprintCollisionRate / 100, 0.01, 0.03)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">bot_traffic_rate</span>
                        <span class="risk-var-value">${tag(rd.deviceBehavioral.botTrafficRate / 100, 0.01, 0.05)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">3ds_adoption_rate</span>
                        <span class="risk-var-value ${valClass(1 - rd.deviceBehavioral['3dsAdoptionRate'], 0.15, 0.3)}">${pct(rd.deviceBehavioral['3dsAdoptionRate'])}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">card_testing_indicator</span>
                        <span class="risk-var-value">${boolTag(rd.deviceBehavioral.cardTestingIndicator, true)}</span>
                    </div>
                </div>
            </div>

            <!-- Business Profile Risk -->
            <div class="risk-detail-card">
                <div class="risk-detail-header">
                    <span class="risk-detail-header-icon">🏢</span>
                    <h4>Business Profile Risk</h4>
                </div>
                <div class="risk-detail-body">
                    <div class="risk-var-row">
                        <span class="risk-var-name">mcc_code</span>
                        <span class="risk-var-value">${rd.businessProfile.mcc}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">mcc_description</span>
                        <span class="risk-var-value val-muted" style="font-size: 0.72rem;">${rd.businessProfile.mccDescription}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">mcc_risk_category</span>
                        <span class="risk-var-value"><span class="risk-var-tag risk-var-tag-${rd.businessProfile.mccRiskCategory === 'Low' ? 'ok' : rd.businessProfile.mccRiskCategory === 'Medium' ? 'warn' : rd.businessProfile.mccRiskCategory === 'Critical' ? 'danger' : rd.businessProfile.mccRiskCategory === 'High' ? 'danger' : 'muted'}">${rd.businessProfile.mccRiskCategory.toUpperCase()}</span></span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">business_age</span>
                        <span class="risk-var-value">${rd.businessProfile.businessAge_months}mo</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">monthly_volume_growth</span>
                        <span class="risk-var-value">${tag(rd.businessProfile.monthlyVolumeGrowth, 0.15, 0.30)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">declared_vs_actual_rev</span>
                        <span class="risk-var-value ${valClass(1 - rd.businessProfile.declaredVsActualRevenue, 0.1, 0.25)}">${pct(rd.businessProfile.declaredVsActualRevenue)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">website_status</span>
                        <span class="risk-var-value"><span class="risk-var-tag risk-var-tag-${rd.businessProfile.websiteStatus === 'Active' ? 'ok' : 'warn'}">${rd.businessProfile.websiteStatus.toUpperCase()}</span></span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">ssl_cert_valid</span>
                        <span class="risk-var-value">${boolTag(rd.businessProfile.sslCertValid, false)}</span>
                    </div>
                    <div class="risk-var-row">
                        <span class="risk-var-name">domain_age</span>
                        <span class="risk-var-value">${rd.businessProfile.domainAge_months}mo</span>
                    </div>
                </div>
            </div>
        `;
    }

    function getSignalDetail(name, signal) {
        const details = {
            'Fraud Score': 'ML ensemble + rule engine composite',
            'Transaction Velocity': 'Txn frequency vs category benchmark',
            'Geo Risk': 'FATF rating, IP match, sanctioned exposure',
            'Chargeback History': 'Dispute rate, Visa TC40, MC SAFE alerts',
        };
        return details[name] || '';
    }

    // Tier selection
    document.querySelectorAll('.tier-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tier-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (selectedMerchant) {
                selectedMerchant.riskTier = btn.getAttribute('data-tier');
                showToast('Risk tier updated', `Merchant risk tier set to ${btn.getAttribute('data-tier')}.`, 'info');
            }
        });
    });

    // Risk decision buttons
    ['risk-approve', 'risk-monitor', 'risk-reject', 'risk-escalate'].forEach(id => {
        document.getElementById(id).addEventListener('click', () => {
            if (!selectedMerchant) return;
            const actions = {
                'risk-approve': { label: 'Approved', type: 'decision', toast: 'success', detail: 'Merchant approved for onboarding.' },
                'risk-monitor': { label: 'High-Risk Monitor', type: 'decision', toast: 'warning', detail: 'Merchant approved with high-risk monitoring flag.' },
                'risk-reject': { label: 'Rejected', type: 'decision', toast: 'error', detail: 'Merchant application rejected.' },
                'risk-escalate': { label: 'Escalated to Senior Review', type: 'flag', toast: 'warning', detail: 'Merchant escalated for senior risk officer review.' },
            };
            const action = actions[id];
            const notes = document.getElementById('risk-notes').value.trim();

            selectedMerchant.auditTrail.unshift({
                type: action.type,
                desc: `Final decision: ${action.label}`,
                detail: action.detail + (notes ? ` Notes: ${notes}` : ''),
                time: new Date().toISOString(),
                user: 'Tejas A.'
            });

            if (id === 'risk-approve') selectedMerchant.stage = 'approved';

            renderQueue();
            showToast(action.label, action.detail, action.toast);
            document.getElementById('risk-notes').value = '';
        });
    });

    // --- Audit Trail View ---
    document.getElementById('view-full-audit').addEventListener('click', () => {
        renderAuditTrail();
        switchView('audit', 'Audit Trail');
    });

    function renderAuditTrail(filter = 'all') {
        if (!selectedMerchant) return;

        const events = filter === 'all'
            ? selectedMerchant.auditTrail
            : selectedMerchant.auditTrail.filter(e => e.type === filter);

        const typeLabels = {
            stage: 'Stage Change',
            decision: 'Decision',
            note: 'Note',
            system: 'System',
            flag: 'Flag'
        };

        document.getElementById('audit-timeline').innerHTML = events.length
            ? events.map(e => `
                <div class="audit-event" data-type="${e.type}">
                    <div class="audit-event-header">
                        <span class="audit-event-type audit-type-${e.type}">${typeLabels[e.type] || e.type}</span>
                        <span class="audit-event-time">${formatTimestamp(e.time)}</span>
                    </div>
                    <div class="audit-event-desc">${e.desc}</div>
                    <div class="audit-event-detail">${e.detail}</div>
                    <div class="audit-event-user">👤 ${e.user}</div>
                </div>
            `).join('')
            : '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No events found for this filter.</p>';
    }

    // Audit filters
    document.querySelectorAll('[data-audit-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('[data-audit-filter]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderAuditTrail(chip.getAttribute('data-audit-filter'));
        });
    });

    // --- Analytics View ---
    function renderAnalytics() {
        renderTATChart();
        renderBottlenecks();
        renderVolumeStats();
    }

    function renderTATChart() {
        const container = document.getElementById('tat-chart');
        const data = ANALYTICS.tatTrend;
        const padding = { top: 20, right: 20, bottom: 30, left: 40 };
        const width = 700;
        const height = 200;
        const plotW = width - padding.left - padding.right;
        const plotH = height - padding.top - padding.bottom;

        const maxVal = Math.max(...data.map(d => d.value));
        const minVal = Math.min(...data.map(d => d.value));

        const xScale = (i) => padding.left + (i / (data.length - 1)) * plotW;
        const yScale = (v) => padding.top + plotH - ((v - minVal + 5) / (maxVal - minVal + 10)) * plotH;

        const linePoints = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(' ');
        const areaPoints = `${xScale(0)},${yScale(minVal - 5)} ` + linePoints + ` ${xScale(data.length - 1)},${yScale(minVal - 5)}`;

        // Grid lines
        let gridLines = '';
        for (let v = Math.floor(minVal / 10) * 10; v <= maxVal; v += 10) {
            const y = yScale(v);
            gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line"/>`;
            gridLines += `<text x="${padding.left - 8}" y="${y + 4}" class="chart-label" text-anchor="end">${v}h</text>`;
        }

        // X labels
        let xLabels = '';
        data.forEach((d, i) => {
            if (i % 2 === 0 || i === data.length - 1) {
                xLabels += `<text x="${xScale(i)}" y="${height - 5}" class="chart-label" text-anchor="middle">${d.day}</text>`;
            }
        });

        // Dots
        let dots = data.map((d, i) => `<circle cx="${xScale(i)}" cy="${yScale(d.value)}" r="4" class="chart-dot"/>`).join('');

        container.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" class="tat-chart-svg">
                ${gridLines}
                ${xLabels}
                <polygon points="${areaPoints}" class="chart-area" fill="url(#chartAreaGrad)"/>
                <polyline points="${linePoints}" class="chart-line" stroke="var(--accent-primary)"/>
                ${dots}
                <defs>
                    <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="var(--accent-primary)" stop-opacity="0"/>
                    </linearGradient>
                </defs>
            </svg>
        `;
    }

    function renderBottlenecks() {
        const container = document.getElementById('bottleneck-bars');
        container.innerHTML = ANALYTICS.bottlenecks.map(b => `
            <div class="bottleneck-item">
                <div class="bottleneck-header">
                    <span class="bottleneck-name">${b.name}</span>
                    <span class="bottleneck-value">${b.avgHours}h avg</span>
                </div>
                <div class="bottleneck-bar">
                    <div class="bottleneck-fill" style="width: ${b.percentage}%; background: ${b.color}"></div>
                </div>
            </div>
        `).join('');
    }

    function renderVolumeStats() {
        const container = document.getElementById('volume-stats');
        const statusColors = {
            'Reviewed This Week': 'var(--accent-primary)',
            'Approved': 'var(--success)',
            'Rejected': 'var(--danger)',
            'Escalated': 'var(--warning)',
            'Blocked': 'var(--text-muted)',
        };
        container.innerHTML = ANALYTICS.volume.map(v => `
            <div class="volume-item">
                <span class="volume-label">${v.label}</span>
                <span class="volume-count" style="color: ${statusColors[v.label] || 'var(--text-primary)'}">${v.count}</span>
            </div>
        `).join('');
    }

    // --- Global Search ---
    document.getElementById('global-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderQueue();
            return;
        }
        const results = MERCHANTS.filter(m =>
            m.name.toLowerCase().includes(query) ||
            m.id.toLowerCase().includes(query) ||
            m.businessType.toLowerCase().includes(query)
        );
        queueTbody.innerHTML = '';
        results.forEach(m => {
            const row = createQueueRow(m);
            queueTbody.innerHTML += row;
        });
    });

    function createQueueRow(m) {
        const slaPercent = Math.max(0, (m.slaRemaining / m.slaHours) * 100);
        let slaClass = 'sla-timer-ok';
        let slaBarColor = 'var(--success)';
        if (slaPercent < 25) { slaClass = 'sla-timer-critical'; slaBarColor = 'var(--danger)'; }
        else if (slaPercent < 50) { slaClass = 'sla-timer-warning'; slaBarColor = 'var(--warning)'; }

        const stageLabels = {
            intake: 'Intake', kyb: 'KYB', aml: 'AML/PEP',
            risk: 'Risk Review', blocked: 'Blocked', approved: 'Approved'
        };
        const riskLabels = {
            low: 'Low', medium: 'Medium', high: 'High', unknown: 'Unrated'
        };

        return `
            <tr data-id="${m.id}" onclick="window.__openMerchant('${m.id}')">
                <td>
                    <div class="merchant-cell">
                        <div class="merchant-avatar" style="background: ${m.avatarColor}">
                            ${m.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                            <div class="merchant-name">${m.name}</div>
                            <div class="merchant-id">${m.id}</div>
                        </div>
                    </div>
                </td>
                <td>${m.businessType}</td>
                <td><span class="stage-badge stage-badge-${m.stage}">${stageLabels[m.stage] || m.stage}</span></td>
                <td><span class="risk-badge risk-badge-${m.riskTier}">${riskLabels[m.riskTier]}</span></td>
                <td>
                    <div class="sla-timer ${slaClass}">
                        ${m.slaRemaining > 0 ? formatHours(m.slaRemaining) : 'SLA Breached'}
                    </div>
                    <div class="sla-bar">
                        <div class="sla-bar-fill" style="width: ${slaPercent}%; background: ${slaBarColor}"></div>
                    </div>
                </td>
                <td>
                    <div class="assigned-to">
                        <div class="assigned-avatar">${m.assignedTo.initials}</div>
                        <span>${m.assignedTo.name}</span>
                    </div>
                </td>
                <td>
                    <button class="btn btn-review" onclick="event.stopPropagation(); window.__openMerchant('${m.id}')">
                        Review →
                    </button>
                </td>
            </tr>
        `;
    }

    // --- Toast Notifications ---
    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = {
            success: '✓', warning: '⚠', error: '✗', info: 'ℹ'
        };
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // --- Menu Toggle (Mobile) ---
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // --- Initialize ---
    renderQueue();
    renderAnalytics();

    // Auto-select first merchant for demo purposes
    if (MERCHANTS.length > 0) {
        selectedMerchant = MERCHANTS[0];
    }

})();
