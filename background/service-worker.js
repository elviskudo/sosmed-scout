/**
 * ThreadScout — Background Service Worker
 * Handles:
 * - Smart Auto-Search on Threads: builds a search query from the user's prompt, navigates the
 *   active tab to Threads Search (`https://www.threads.com/search?q=...&serp_type=recent`),
 *   waits for results to render, and extracts & scores them.
 * - Scanning the currently open Threads page with strict prompt relevance filtering.
 * - Replacing active scan results cleanly so old unrelated leads never pollute the new prompt.
 */

import { calculateLeadScore, parseSellerPrompt } from "../lib/scoring.js";
import { generateReplyDraft, generateDmDraft } from "../lib/templates.js";

const STORAGE_KEYS = {
  CONTEXT: "threadscout_context",
  LEADS: "threadscout_leads",
  HISTORY: "threadscout_history",
  DISCLAIMER_ACCEPTED: "threadscout_disclaimer_accepted",
  ERROR_LOGS: "threadscout_error_logs"
};

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => logError("sidePanel.setPanelBehavior", err));

async function logError(source, error) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.ERROR_LOGS);
    const logs = Array.isArray(data[STORAGE_KEYS.ERROR_LOGS]) ? data[STORAGE_KEYS.ERROR_LOGS] : [];
    logs.unshift({
      timestamp: new Date().toISOString(),
      source,
      message: error?.message || String(error)
    });
    await chrome.storage.local.set({
      [STORAGE_KEYS.ERROR_LOGS]: logs.slice(0, 50)
    });
  } catch (_) {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate dynamic realistic sample Threads posts adapted to whatever prompt the user entered
 */
function getDemoPosts(context = {}) {
  const parsed = parseSellerPrompt(context);
  const kws = parsed.coreKeywords.length > 0 ? parsed.coreKeywords : ["produk", "jasa"];
  const k1 = kws[0] || "layanan";
  const k2 = kws[1] || k1;
  const k3 = kws[2] || k2;

  return [
    {
      id: `demo_${k1}_1`,
      postUrl: "https://www.threads.com/@hendrawan.id/post/DB9xK1",
      author: "hendrawan.id",
      text: `Lagi cari ${k1} (${k2}) yang recommended dong teman-teman Threads. Budget udah siap, butuh cepat minggu ini karena udah mepet deadline. Kalau ada yang jual / melayani langsung DM ya!`,
      timestampText: "2 jam",
      isoTime: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      metadata: { likes: 14, replies: 8, source: "demo" }
    },
    {
      id: `demo_${k1}_2`,
      postUrl: "https://www.threads.com/@nadia.prasetyo/post/DB9xK2",
      author: "nadia.prasetyo",
      text: `Capek nyari ${k1} ${k3} yang kualitasnya beneran bagus dan responsif. Udah keliling belum nemu yang cocok. Siap bayar hari ini kalau speknya masuk, tolong spill rekomendasinya dong.`,
      timestampText: "5 jam",
      isoTime: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      metadata: { likes: 9, replies: 12, source: "demo" }
    },
    {
      id: `demo_${k1}_3`,
      postUrl: "https://www.threads.com/@rizky_pratama/post/DB9xK3",
      author: "rizky_pratama",
      text: `Ada yang punya info atau kenalan untuk ${k1} (${k2})? Mau cek harga / pricelist dulu, kalau cocok rencana mau order bulan ini.`,
      timestampText: "1 hari",
      isoTime: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
      metadata: { likes: 6, replies: 4, source: "demo" }
    }
  ];
}

/**
 * Score raw posts against the current prompt and return ONLY the current scan's leads
 * (whilst preserving seen/follow-up status in history)
 */
async function processAndSaveLeads(rawPosts, context) {
  const storedData = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
  const historyMap = storedData[STORAGE_KEYS.HISTORY] || {};

  const nowIso = new Date().toISOString();
  const currentScanLeads = [];
  let newlyDiscoveredCount = 0;
  let duplicateSeenCount = 0;

  for (const post of rawPosts) {
    const scored = calculateLeadScore(post, context);
    const prev = historyMap[post.id];

    const leadRecord = {
      id: post.id,
      postUrl: post.postUrl,
      author: post.author,
      text: post.text,
      timestampText: post.timestampText,
      isoTime: post.isoTime || "",
      score: scored.score,
      category: scored.category,
      hasTopicMatch: scored.hasTopicMatch,
      matchedKeywords: scored.matchedKeywords,
      breakdown: scored.breakdown,
      signals: scored.signals,
      extractedDetails: scored.extractedDetails,
      status: prev ? prev.status : "new",
      firstSeenAt: prev ? prev.firstSeenAt : nowIso,
      lastSeenAt: nowIso,
      isSeenBefore: Boolean(prev)
    };

    leadRecord.replyDraft = generateReplyDraft(leadRecord, context);
    leadRecord.dmDraft = generateDmDraft(leadRecord, context);

    if (prev) {
      duplicateSeenCount += 1;
    } else {
      newlyDiscoveredCount += 1;
    }

    // Save status metadata in lightweight history dictionary
    historyMap[post.id] = {
      status: leadRecord.status,
      firstSeenAt: leadRecord.firstSeenAt,
      lastSeenAt: nowIso
    };

    currentScanLeads.push(leadRecord);
  }

  currentScanLeads.sort((a, b) => b.score - a.score);

  // Store ONLY current scan leads in LEADS so old unrelated posts never mix with a new prompt!
  await chrome.storage.local.set({
    [STORAGE_KEYS.LEADS]: currentScanLeads,
    [STORAGE_KEYS.HISTORY]: historyMap
  });

  return {
    allLeads: currentScanLeads,
    scanLeads: currentScanLeads,
    stats: {
      scannedCount: rawPosts.length,
      matchedTopicCount: currentScanLeads.filter((l) => l.hasTopicMatch).length,
      newCount: newlyDiscoveredCount,
      duplicateCount: duplicateSeenCount,
      hotCount: currentScanLeads.filter((l) => l.category === "Hot").length,
      warmCount: currentScanLeads.filter((l) => l.category === "Warm").length,
      watchCount: currentScanLeads.filter((l) => l.category === "Watch").length,
      skipCount: currentScanLeads.filter((l) => l.category === "Skip").length
    }
  };
}

/**
 * Wait until a tab finishes loading and Threads renders post cards
 */
async function waitForTabAndPosts(tabId, maxWaitMs = 8500) {
  const start = Date.now();

  // 1. Wait for tab status === 'complete'
  while (Date.now() - start < maxWaitMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") break;
    } catch (_) {
      break;
    }
    await sleep(350);
  }

  // 2. Inject content scripts and poll until Threads SPA renders at least a few posts
  while (Date.now() - start < maxWaitMs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/selectors.js", "content/extractor.js"]
      });
      const res = await chrome.tabs.sendMessage(tabId, {
        type: "THREADSCOUT_EXTRACT_PAGE"
      });
      if (res?.ok && Array.isArray(res.posts) && res.posts.length >= 3) {
        return res;
      }
    } catch (_) {
      // Wait for SPA hydration
    }
    await sleep(600);
  }

  // Final extraction attempt
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type: "THREADSCOUT_EXTRACT_PAGE"
    });
  } catch (err) {
    return { ok: false, error: err?.message || "Waktu tunggu halaman Threads habis." };
  }
}

/**
 * Mode A: Smart Search on Threads from Prompt (`autoSearch: true`)
 * Navigates Threads to the search query generated from the user's prompt, waits for results,
 * and extracts & scores them.
 */
async function handleScanActiveTab(payload = {}) {
  const { context, useDemo = false, autoSearch = false, customSearchQuery = "" } = payload;

  if (useDemo) {
    const demoPosts = getDemoPosts(context);
    const result = await processAndSaveLeads(demoPosts, context);
    return {
      ok: true,
      mode: "demo",
      ...result
    };
  }

  const parsedPrompt = parseSellerPrompt(context);
  const searchQueryToUse = (customSearchQuery || parsedPrompt.primarySearchQuery || "").trim();

  let [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // If user clicked "Cari Otomatis di Threads Sesuai Prompt", navigate active tab to Threads Search
  if (autoSearch && searchQueryToUse) {
    const currentUrl = activeTab?.url || "";
    const domain = currentUrl.startsWith("https://www.threads.net")
      ? "https://www.threads.net"
      : "https://www.threads.com";
    const targetSearchUrl = `${domain}/search?q=${encodeURIComponent(searchQueryToUse)}&serp_type=default`;

    if (activeTab && activeTab.id) {
      await chrome.tabs.update(activeTab.id, { url: targetSearchUrl });
    } else {
      activeTab = await chrome.tabs.create({ url: targetSearchUrl });
    }

    // Give Threads SPA a moment to start navigation, then wait for rendered results
    await sleep(900);
    const extractionResponse = await waitForTabAndPosts(activeTab.id, 9000);
    if (!extractionResponse || !extractionResponse.ok) {
      return {
        ok: false,
        error:
          extractionResponse?.error ||
          "Halaman pencarian Threads belum selesai dimuat. Silakan klik 'Pindai Halaman Ini' setelah hasil tampil."
      };
    }

    const processed = await processAndSaveLeads(extractionResponse.posts || [], context);
    return {
      ok: true,
      mode: "auto_search",
      usedQuery: searchQueryToUse,
      extractionStats: extractionResponse.stats,
      ...processed
    };
  }

  // Mode B: Scan currently open Threads page without navigating
  if (!activeTab || !activeTab.id) {
    return {
      ok: false,
      error: "Tidak ada tab aktif yang terdeteksi."
    };
  }

  const tabUrl = activeTab.url || "";
  const isThreadsPage =
    tabUrl.startsWith("https://www.threads.net/") || tabUrl.startsWith("https://www.threads.com/");

  if (!isThreadsPage) {
    return {
      ok: false,
      notThreadsPage: true,
      error:
        "Tab aktif saat ini bukan Threads. Klik tombol '🚀 Cari di Threads Sesuai Prompt' agar ekstensi membuka pencarian Threads otomatis untuk Anda."
    };
  }

  let extractionResponse = null;
  try {
    extractionResponse = await chrome.tabs.sendMessage(activeTab.id, {
      type: "THREADSCOUT_EXTRACT_PAGE"
    });
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content/selectors.js", "content/extractor.js"]
      });
      extractionResponse = await chrome.tabs.sendMessage(activeTab.id, {
        type: "THREADSCOUT_EXTRACT_PAGE"
      });
    } catch (injectErr) {
      await logError("handleScanActiveTab.inject", injectErr);
      return {
        ok: false,
        error: "Gagal mengakses halaman Threads. Silakan refresh tab Threads Anda."
      };
    }
  }

  if (!extractionResponse || !extractionResponse.ok) {
    return {
      ok: false,
      error: extractionResponse?.error || "Tidak dapat mengekstrak post dari halaman ini."
    };
  }

  const processed = await processAndSaveLeads(extractionResponse.posts || [], context);
  return {
    ok: true,
    mode: "live_page",
    extractionStats: extractionResponse.stats,
    ...processed
  };
}

/**
 * Re-score existing leads when seller updates prompt context
 */
async function rescoreStoredLeads(context) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.LEADS);
  const leads = Array.isArray(data[STORAGE_KEYS.LEADS]) ? data[STORAGE_KEYS.LEADS] : [];

  const updated = leads.map((lead) => {
    const scored = calculateLeadScore(lead, context);
    const enriched = {
      ...lead,
      score: scored.score,
      category: scored.category,
      hasTopicMatch: scored.hasTopicMatch,
      matchedKeywords: scored.matchedKeywords,
      breakdown: scored.breakdown,
      signals: scored.signals,
      extractedDetails: scored.extractedDetails
    };
    enriched.replyDraft = generateReplyDraft(enriched, context);
    enriched.dmDraft = generateDmDraft(enriched, context);
    return enriched;
  });

  updated.sort((a, b) => b.score - a.score);
  await chrome.storage.local.set({ [STORAGE_KEYS.LEADS]: updated });
  return updated;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "THREADSCOUT_SCAN": {
          const res = await handleScanActiveTab(message.payload);
          sendResponse(res);
          break;
        }
        case "THREADSCOUT_SAVE_CONTEXT": {
          const context = message.payload;
          await chrome.storage.local.set({ [STORAGE_KEYS.CONTEXT]: context });
          const updatedLeads = await rescoreStoredLeads(context);
          sendResponse({ ok: true, leads: updatedLeads });
          break;
        }
        case "THREADSCOUT_UPDATE_LEAD_STATUS": {
          const { leadId, status } = message.payload;
          const data = await chrome.storage.local.get([STORAGE_KEYS.LEADS, STORAGE_KEYS.HISTORY]);
          const leads = Array.isArray(data[STORAGE_KEYS.LEADS]) ? data[STORAGE_KEYS.LEADS] : [];
          const historyMap = data[STORAGE_KEYS.HISTORY] || {};
          if (historyMap[leadId]) {
            historyMap[leadId].status = status;
          }
          const nextLeads = leads.map((l) => (l.id === leadId ? { ...l, status } : l));
          await chrome.storage.local.set({
            [STORAGE_KEYS.LEADS]: nextLeads,
            [STORAGE_KEYS.HISTORY]: historyMap
          });
          sendResponse({ ok: true, leads: nextLeads });
          break;
        }
        case "THREADSCOUT_CLEAR_LEADS": {
          await chrome.storage.local.set({ [STORAGE_KEYS.LEADS]: [] });
          sendResponse({ ok: true, leads: [] });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown command" });
      }
    } catch (err) {
      await logError("onMessage", err);
      sendResponse({ ok: false, error: err?.message || "Internal extension error" });
    }
  })();
  return true;
});
