/**
 * ThreadScout — Side Panel Application Logic
 * Includes:
 * - Real-time prompt parser that generates smart Threads search queries
 * - One-click "Cari di Threads Sesuai Prompt & Analisis" (auto-navigates Threads search + extracts + filters)
 * - Strict filtering so unrelated posts never appear as qualified leads
 */

import { parseSellerPrompt } from "../lib/scoring.js";

const STORAGE_KEYS = {
  CONTEXT: "threadscout_context",
  LEADS: "threadscout_leads",
  DISCLAIMER_ACCEPTED: "threadscout_disclaimer_accepted"
};

const DEFAULT_PROMPT =
  "Saya jual jasa pembuatan website, aplikasi, dan landing page UMKM. Cari orang yang lagi butuh developer, bikin web bisnis, atau toko online.";

const state = {
  context: {
    prompt: DEFAULT_PROMPT
  },
  customSearchQuery: "",
  leads: [],
  lastScanStats: null,
  activeCategory: "ALL_QUALIFIED",
  searchQuery: "",
  statusFilter: "ALL",
  contextCollapsed: false
};

// DOM Elements
const els = {
  disclaimerModal: document.getElementById("disclaimerModal"),
  acceptDisclaimerCheck: document.getElementById("acceptDisclaimerCheck"),
  acceptDisclaimerBtn: document.getElementById("acceptDisclaimerBtn"),
  openDisclaimerBtn: document.getElementById("openDisclaimerBtn"),

  contextForm: document.getElementById("contextForm"),
  toggleContextBtn: document.getElementById("toggleContextBtn"),
  toggleContextHeader: document.getElementById("toggleContextHeader"),
  contextSummaryText: document.getElementById("contextSummaryText"),
  promptTextarea: document.getElementById("promptTextarea"),
  presetChips: Array.from(document.querySelectorAll(".preset-chip")),
  searchQueryInput: document.getElementById("searchQueryInput"),
  suggestedQueriesWrap: document.getElementById("suggestedQueriesWrap"),

  autoSearchScanBtn: document.getElementById("autoSearchScanBtn"),
  scanPageBtn: document.getElementById("scanPageBtn"),
  demoScanBtn: document.getElementById("demoScanBtn"),
  cooldownBanner: document.getElementById("cooldownBanner"),
  errorBanner: document.getElementById("errorBanner"),

  scanProgressBox: document.getElementById("scanProgressBox"),
  progressStageText: document.getElementById("progressStageText"),
  progressPercentText: document.getElementById("progressPercentText"),
  progressBarFill: document.getElementById("progressBarFill"),
  stepScan: document.getElementById("stepScan"),
  stepIntent: document.getElementById("stepIntent"),
  stepScore: document.getElementById("stepScore"),

  countHot: document.getElementById("countHot"),
  countWarm: document.getElementById("countWarm"),
  countWatch: document.getElementById("countWatch"),
  countTotal: document.getElementById("countTotal"),

  filterTabs: Array.from(document.querySelectorAll(".filter-tab")),
  statChips: Array.from(document.querySelectorAll(".stat-chip")),
  searchLeadInput: document.getElementById("searchLeadInput"),
  statusFilterSelect: document.getElementById("statusFilterSelect"),
  showingCountText: document.getElementById("showingCountText"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),

  skeletonList: document.getElementById("skeletonList"),
  leadsContainer: document.getElementById("leadsContainer"),
  toastNotification: document.getElementById("toastNotification")
};

async function initApp() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.CONTEXT,
    STORAGE_KEYS.LEADS,
    STORAGE_KEYS.DISCLAIMER_ACCEPTED
  ]);

  if (!stored[STORAGE_KEYS.DISCLAIMER_ACCEPTED]) {
    els.disclaimerModal.classList.remove("hidden");
  }

  const savedCtx = stored[STORAGE_KEYS.CONTEXT];
  if (savedCtx && typeof savedCtx.prompt === "string" && savedCtx.prompt.trim()) {
    state.context = { prompt: savedCtx.prompt.trim() };
  } else {
    await chrome.storage.local.set({ [STORAGE_KEYS.CONTEXT]: state.context });
  }

  if (Array.isArray(stored[STORAGE_KEYS.LEADS])) {
    state.leads = stored[STORAGE_KEYS.LEADS];
  }

  populateContextForm();
  updateStatsAndRender();
  bindEvents();
}

function populateContextForm() {
  els.promptTextarea.value = state.context.prompt || "";
  refreshSearchQueriesFromPrompt(true);
  updateContextSummaryHeader();
}

function refreshSearchQueriesFromPrompt(overwriteInput = true) {
  const promptText = els.promptTextarea.value.trim();
  const parsed = parseSellerPrompt({ prompt: promptText });

  if (overwriteInput || !els.searchQueryInput.value.trim()) {
    els.searchQueryInput.value = parsed.primarySearchQuery || "";
  }

  els.suggestedQueriesWrap.innerHTML = "";
  for (const q of parsed.searchQueries) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "query-pill";
    btn.textContent = `🔍 ${q}`;
    btn.addEventListener("click", () => {
      els.searchQueryInput.value = q;
      runScanFlow({ autoSearch: true, useDemo: false });
    });
    els.suggestedQueriesWrap.appendChild(btn);
  }
}

function updateContextSummaryHeader() {
  const raw = (state.context.prompt || "").trim();
  if (!raw) {
    els.contextSummaryText.textContent = "Prompt belum diatur";
    return;
  }
  els.contextSummaryText.textContent = raw.length > 52 ? `${raw.slice(0, 52)}…` : raw;
}

function bindEvents() {
  els.acceptDisclaimerCheck.addEventListener("change", () => {
    els.acceptDisclaimerBtn.disabled = !els.acceptDisclaimerCheck.checked;
  });

  els.acceptDisclaimerBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.DISCLAIMER_ACCEPTED]: true });
    els.disclaimerModal.classList.add("hidden");
    showToast("Preferensi kepatuhan disimpan.");
  });

  els.openDisclaimerBtn.addEventListener("click", () => {
    els.acceptDisclaimerCheck.checked = true;
    els.acceptDisclaimerBtn.disabled = false;
    els.disclaimerModal.classList.remove("hidden");
  });

  els.toggleContextHeader.addEventListener("click", () => {
    state.contextCollapsed = !state.contextCollapsed;
    els.contextForm.classList.toggle("hidden", state.contextCollapsed);
    els.toggleContextBtn.textContent = state.contextCollapsed ? "Ubah" : "Sembunyikan";
    els.toggleContextBtn.setAttribute("aria-expanded", String(!state.contextCollapsed));
  });

  // Update suggested search queries live as user types in prompt textarea
  els.promptTextarea.addEventListener("input", () => {
    refreshSearchQueriesFromPrompt(true);
  });

  // Preset Prompt Chips
  for (const chip of els.presetChips) {
    chip.addEventListener("click", async () => {
      els.promptTextarea.value = chip.dataset.preset || "";
      refreshSearchQueriesFromPrompt(true);
      await savePromptAndRescore();
    });
  }

  // Primary Action: Auto-Search Threads & Scan
  els.autoSearchScanBtn.addEventListener("click", () => {
    runScanFlow({ autoSearch: true, useDemo: false });
  });

  // Secondary Action: Scan current active page only
  els.scanPageBtn.addEventListener("click", () => {
    runScanFlow({ autoSearch: false, useDemo: false });
  });

  // Demo Simulation Mode
  els.demoScanBtn.addEventListener("click", () => {
    runScanFlow({ autoSearch: false, useDemo: true });
  });

  // Filter Tabs
  for (const tab of els.filterTabs) {
    tab.addEventListener("click", () => {
      for (const t of els.filterTabs) t.classList.remove("active");
      tab.classList.add("active");
      state.activeCategory = tab.dataset.category;
      renderLeadCards(false);
    });
  }

  // Stat Chips quick filter
  for (const chip of els.statChips) {
    chip.addEventListener("click", () => {
      const filterCat = chip.dataset.filter;
      state.activeCategory = filterCat === "ALL" ? "ALL_QUALIFIED" : filterCat;
      for (const t of els.filterTabs) {
        t.classList.toggle("active", t.dataset.category === state.activeCategory);
      }
      renderLeadCards(false);
    });
  }

  els.searchLeadInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    renderLeadCards(false);
  });

  els.statusFilterSelect.addEventListener("change", (e) => {
    state.statusFilter = e.target.value;
    renderLeadCards(false);
  });

  els.exportCsvBtn.addEventListener("click", exportLeadsToCsv);

  els.clearHistoryBtn.addEventListener("click", async () => {
    const res = await chrome.runtime.sendMessage({ type: "THREADSCOUT_CLEAR_LEADS" });
    if (res?.ok) {
      state.leads = [];
      state.lastScanStats = null;
      updateStatsAndRender();
      showToast("Daftar hasil telah dibersihkan.");
    }
  });
}

async function savePromptAndRescore() {
  const promptVal = els.promptTextarea.value.trim();
  if (!promptVal) return;
  state.context = { prompt: promptVal };
  updateContextSummaryHeader();
  const response = await chrome.runtime.sendMessage({
    type: "THREADSCOUT_SAVE_CONTEXT",
    payload: state.context
  });
  if (response?.ok) {
    state.leads = response.leads || [];
    updateStatsAndRender();
  }
}

/**
 * Stepped Scan Flow (Auto-Search Threads OR Scan Active Tab)
 */
async function runScanFlow({ autoSearch = false, useDemo = false }) {
  const currentPrompt = els.promptTextarea.value.trim();
  if (!currentPrompt || currentPrompt.length < 4) {
    showError("Mohon tulis apa yang Anda jual / cari di kolom Prompt terlebih dahulu.");
    return;
  }

  state.context = { prompt: currentPrompt };
  updateContextSummaryHeader();
  await chrome.storage.local.set({ [STORAGE_KEYS.CONTEXT]: state.context });

  const customSearchQuery = els.searchQueryInput.value.trim();

  hideError();
  els.cooldownBanner.classList.add("hidden");
  els.autoSearchScanBtn.disabled = true;
  els.scanPageBtn.disabled = true;
  els.demoScanBtn.disabled = true;

  els.scanProgressBox.classList.remove("hidden");
  els.skeletonList.classList.remove("hidden");

  if (autoSearch) {
    setProgressStage(1, `Membuka pencarian Threads "${customSearchQuery}"…`, 25);
  } else {
    setProgressStage(1, "Memindai post di halaman Threads aktif…", 30);
  }

  const scanPromise = chrome.runtime.sendMessage({
    type: "THREADSCOUT_SCAN",
    payload: {
      context: state.context,
      useDemo,
      autoSearch,
      customSearchQuery
    }
  });

  await sleep(autoSearch ? 1200 : 300);
  setProgressStage(2, "Menyaring post yang cocok dengan topik Prompt…", 65);
  await sleep(autoSearch ? 1200 : 300);
  setProgressStage(3, "Menghitung skor intent (0–100) & membuat draft DM…", 90);

  const response = await scanPromise;
  setProgressStage(3, "Selesai!", 100);
  await sleep(180);

  els.scanProgressBox.classList.add("hidden");
  els.skeletonList.classList.add("hidden");
  els.autoSearchScanBtn.disabled = false;
  els.scanPageBtn.disabled = false;
  els.demoScanBtn.disabled = false;

  if (!response || !response.ok) {
    showError(response?.error || "Terjadi kendala saat memindai halaman.");
    return;
  }

  state.leads = response.allLeads || [];
  state.lastScanStats = response.stats || null;

  // Always switch back to "Cocok Prompt (>=40)" tab so user sees relevant leads first
  state.activeCategory = "ALL_QUALIFIED";
  for (const t of els.filterTabs) {
    t.classList.toggle("active", t.dataset.category === "ALL_QUALIFIED");
  }

  updateStatsAndRender(true);

  const scannedCount = response.stats?.scannedCount || 0;
  const relevantCount = (response.stats?.hotCount || 0) + (response.stats?.warmCount || 0) + (response.stats?.watchCount || 0);
  const skipCount = response.stats?.skipCount || 0;

  showToast(`${scannedCount} post diperiksa • ${relevantCount} cocok prompt (${skipCount} di-skip)`);
}

function setProgressStage(stageNum, label, percent) {
  els.progressStageText.textContent = label;
  els.progressPercentText.textContent = `${percent}%`;
  els.progressBarFill.style.width = `${percent}%`;

  const steps = [els.stepScan, els.stepIntent, els.stepScore];
  steps.forEach((el, idx) => {
    const stepIndex = idx + 1;
    el.classList.remove("active", "done");
    if (stepIndex < stageNum) el.classList.add("done");
    else if (stepIndex === stageNum) el.classList.add("active");
  });
}

function updateStatsAndRender(animateScores = false) {
  const hot = state.leads.filter((l) => l.category === "Hot").length;
  const warm = state.leads.filter((l) => l.category === "Warm").length;
  const watch = state.leads.filter((l) => l.category === "Watch").length;
  const qualifiedTotal = hot + warm + watch;

  els.countHot.textContent = String(hot);
  els.countWarm.textContent = String(warm);
  els.countWatch.textContent = String(watch);
  els.countTotal.textContent = String(qualifiedTotal);

  renderLeadCards(animateScores);
}

function getFilteredLeads() {
  return state.leads.filter((lead) => {
    if (state.activeCategory === "ALL_QUALIFIED") {
      if (lead.score < 40) return false;
    } else if (state.activeCategory !== "ALL") {
      if (lead.category !== state.activeCategory) return false;
    }

    if (state.statusFilter !== "ALL" && lead.status !== state.statusFilter) {
      return false;
    }

    if (state.searchQuery) {
      const hay = `${lead.author} ${lead.text} ${(lead.signals || []).map((s) => s.label).join(" ")}`.toLowerCase();
      if (!hay.includes(state.searchQuery)) return false;
    }

    return true;
  });
}

function renderLeadCards(animateScores = false) {
  const filtered = getFilteredLeads();
  const skipCount = state.leads.filter((l) => l.category === "Skip").length;
  els.showingCountText.textContent = `Menampilkan ${filtered.length} lead relevan (${skipCount} tidak cocok di-skip)`;
  els.leadsContainer.innerHTML = "";

  if (filtered.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "empty-state";

    if (state.leads.length > 0 && skipCount > 0 && state.activeCategory !== "Skip") {
      emptyEl.innerHTML = `
        <h3>0 Postingan Cocok di Halaman Ini (${skipCount} Post Di-skip)</h3>
        <p>Berhasil membaca <strong>${state.leads.length} postingan</strong> di halaman ini, tetapi isinya tidak ada yang membahas topik prompt Anda.</p>
        <p style="margin-top:6px;">👉 Klik tombol biru <strong>🚀 Cari di Threads Sesuai Prompt & Analisis</strong> di atas agar ekstensi otomatis mencari topik <em>"${escapeHtml(els.searchQueryInput.value)}"</em> di Threads!</p>
      `;
    } else {
      emptyEl.innerHTML = `
        <h3>Siap Mencari Calon Pembeli</h3>
        <p>Tulis apa yang Anda tawarkan di kolom <strong>Prompt</strong> di atas, lalu klik tombol biru <strong>🚀 Cari di Threads Sesuai Prompt & Analisis</strong>.</p>
      `;
    }

    els.leadsContainer.appendChild(emptyEl);
    return;
  }

  for (const lead of filtered) {
    const card = buildLeadCardElement(lead, animateScores);
    els.leadsContainer.appendChild(card);
  }
}

function buildLeadCardElement(lead, animateScores) {
  const card = document.createElement("article");
  card.className = `lead-card cat-${lead.category}`;

  const signalsHtml = (lead.signals || [])
    .map((sig) => {
      const sign = sig.points >= 0 ? `+${sig.points}` : `${sig.points}`;
      const negClass = sig.points < 0 ? "negative" : "";
      return `<span class="signal-chip ${negClass}">${escapeHtml(sig.label)} <span class="pts">${sign}</span></span>`;
    })
    .join("");

  const breakdownHtml = (lead.breakdown || [])
    .map((b) => {
      const pct = Math.min(100, Math.round((b.score / b.max) * 100));
      return `
        <div class="bd-row">
          <span>${escapeHtml(b.name)}</span>
          <div class="bd-bar"><div class="bd-fill" style="width:${pct}%"></div></div>
          <span class="bd-val">${b.score}/${b.max}</span>
        </div>
      `;
    })
    .join("");

  card.innerHTML = `
    <div class="lead-top">
      <div class="author-meta">
        <a href="${escapeAttr(lead.postUrl)}" target="_blank" rel="noopener noreferrer" class="author-handle">
          @${escapeHtml(lead.author)}
        </a>
        <div class="time-meta">
          <span>🕒 ${escapeHtml(lead.timestampText || "Baru")}</span>
        </div>
      </div>

      <div class="score-badge cat-${lead.category}" title="Kategori ${lead.category} (Skor ${lead.score}/100)">
        <span>${lead.category.toUpperCase()}</span>
        <span>•</span>
        <span class="score-num" data-target="${lead.score}">${animateScores ? "0" : lead.score}</span>
      </div>
    </div>

    <p class="lead-text">${escapeHtml(lead.text)}</p>

    <div class="signals-wrap" aria-label="Sinyal Pemicu Skor">
      ${signalsHtml}
    </div>

    <details class="breakdown-details">
      <summary>Lihat Breakdown 5 Dimensi Skor (${lead.score}/100)</summary>
      <div class="breakdown-list">
        ${breakdownHtml}
      </div>
    </details>

    <div class="draft-preview-box hidden" data-role="draft-box">
      <strong data-role="draft-title">Draft Pesan:</strong>
      <textarea class="draft-textarea" data-role="draft-textarea"></textarea>
    </div>

    <div class="card-footer">
      <div class="action-buttons">
        <button type="button" class="action-btn" data-action="open-post">
          ↗ Buka Post
        </button>
        <button type="button" class="action-btn" data-action="copy-reply">
          💬 Salin Reply
        </button>
        <button type="button" class="action-btn primary-action" data-action="copy-dm">
          ✉️ Salin Draft DM
        </button>
      </div>

      <div class="status-row">
        <span>Status Follow-up:</span>
        <select class="status-select" data-action="status-select" aria-label="Ubah Status Lead">
          <option value="new" ${lead.status === "new" ? "selected" : ""}>🟢 Baru</option>
          <option value="contacted" ${lead.status === "contacted" ? "selected" : ""}>📤 Dihubungi</option>
          <option value="negotiation" ${lead.status === "negotiation" ? "selected" : ""}>🤝 Negosiasi</option>
          <option value="closed" ${lead.status === "closed" ? "selected" : ""}>🏆 Closing</option>
          <option value="skip" ${lead.status === "skip" ? "selected" : ""}>⏭️ Skip</option>
        </select>
      </div>
    </div>
  `;

  if (animateScores) {
    const scoreEl = card.querySelector(".score-num");
    animateCountUp(scoreEl, lead.score, 480);
  }

  const openBtn = card.querySelector('[data-action="open-post"]');
  const replyBtn = card.querySelector('[data-action="copy-reply"]');
  const dmBtn = card.querySelector('[data-action="copy-dm"]');
  const statusSelect = card.querySelector('[data-action="status-select"]');
  const draftBox = card.querySelector('[data-role="draft-box"]');
  const draftTitle = card.querySelector('[data-role="draft-title"]');
  const draftTextarea = card.querySelector('[data-role="draft-textarea"]');

  openBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: lead.postUrl });
  });

  replyBtn.addEventListener("click", async () => {
    const text = lead.replyDraft || "";
    draftTitle.textContent = "Draft Balasan Publik (Tersalin ke Clipboard):";
    draftTextarea.value = text;
    draftBox.classList.remove("hidden");
    await copyToClipboard(text);
    showToast("Draft Reply disalin ke clipboard!");
  });

  dmBtn.addEventListener("click", async () => {
    const text = lead.dmDraft || "";
    draftTitle.textContent = "Draft DM Kontekstual (Tersalin ke Clipboard):";
    draftTextarea.value = text;
    draftBox.classList.remove("hidden");
    await copyToClipboard(text);
    showToast("Draft DM disalin ke clipboard!");
  });

  statusSelect.addEventListener("change", async (e) => {
    const newStatus = e.target.value;
    const res = await chrome.runtime.sendMessage({
      type: "THREADSCOUT_UPDATE_LEAD_STATUS",
      payload: { leadId: lead.id, status: newStatus }
    });
    if (res?.ok) {
      state.leads = res.leads;
      showToast(`Status @${lead.author} diubah ke "${newStatus}".`);
    }
  });

  return card;
}

function animateCountUp(el, targetScore, durationMs = 450) {
  if (!el) return;
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = String(Math.round(targetScore * eased));
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = String(targetScore);
    }
  }
  requestAnimationFrame(frame);
}

function exportLeadsToCsv() {
  const leadsToExport = getFilteredLeads();
  if (leadsToExport.length === 0) {
    showToast("Tidak ada lead untuk diekspor.");
    return;
  }

  const headers = [
    "Author",
    "Skor",
    "Kategori",
    "Status Follow-up",
    "Waktu Post",
    "Sinyal Pemicu",
    "Teks Post",
    "URL Post",
    "Draft DM"
  ];

  const rows = leadsToExport.map((l) => [
    `@${l.author}`,
    l.score,
    l.category,
    l.status,
    l.timestampText,
    (l.signals || []).map((s) => `${s.label} (${s.points})`).join("; "),
    l.text,
    l.postUrl,
    l.dmDraft
  ]);

  const csvContent =
    "\uFEFF" +
    [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `threadscout-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  showToast(`Berhasil mengekspor ${leadsToExport.length} lead ke CSV.`);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function showError(msg) {
  els.errorBanner.textContent = `⚠️ ${msg}`;
  els.errorBanner.classList.remove("hidden");
}

function hideError() {
  els.errorBanner.classList.add("hidden");
}

let toastTimer = null;
function showToast(msg) {
  els.toastNotification.textContent = msg;
  els.toastNotification.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toastNotification.classList.add("hidden");
  }, 2600);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str = "") {
  return escapeHtml(str);
}

initApp();
