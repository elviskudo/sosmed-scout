/**
 * ThreadScout — Content Script Extractor (FR-02, FR-03, AC-01, AC-05, NFR-06)
 * Passively reads already-rendered DOM elements on the active Threads page
 * only when triggered by the user from the Side Panel.
 * Zero automated scrolling, zero network requests, zero auto-actions.
 */

(function initThreadScoutExtractor() {
  if (window.__threadScoutExtractorLoaded) return;
  window.__threadScoutExtractorLoaded = true;

  const S = window.ThreadScoutSelectors || {};

  /**
   * Extract post ID from a Threads post URL
   */
  function extractPostIdFromUrl(url = "") {
    const match = url.match(/\/(?:post|t)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Clean author handle from URL or text
   */
  function extractAuthorFromHref(href = "") {
    const match = href.match(/\/@([A-Za-z0-9._]+)/);
    return match ? match[1] : null;
  }

  /**
   * Layer 1: Extract posts from rendered DOM containers
   */
  function extractFromDOM() {
    const postsMap = new Map();
    const containerSelectors = S.postContainers || ['[data-pressable-container="true"]', "article"];

    let containers = [];
    for (const sel of containerSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(sel));
        if (found.length > 0) {
          containers = containers.concat(found);
        }
      } catch (_) {
        // Ignore unsupported selector syntax in older browsers
      }
    }

    // Also inspect all post permalinks directly and walk up to their card container
    const permalinkNodes = Array.from(document.querySelectorAll('a[href*="/post/"]'));
    for (const link of permalinkNodes) {
      const card =
        link.closest('[data-pressable-container="true"]') ||
        link.closest("article") ||
        link.closest('div[role="article"]') ||
        link.parentElement?.parentElement?.parentElement?.parentElement;
      if (card && !containers.includes(card)) {
        containers.push(card);
      }
    }

    for (const container of containers) {
      try {
        const postLinkEl = container.querySelector('a[href*="/post/"], a[href*="/t/"]');
        const rawHref = postLinkEl ? postLinkEl.getAttribute("href") : "";
        const postUrl = rawHref ? new URL(rawHref, window.location.origin).href : "";
        const postId = extractPostIdFromUrl(postUrl);

        // Extract author
        let author = "";
        if (rawHref) {
          author = extractAuthorFromHref(rawHref) || "";
        }
        if (!author) {
          const authorEl = container.querySelector('a[href^="/@"]');
          if (authorEl) {
            author = extractAuthorFromHref(authorEl.getAttribute("href") || "") || authorEl.textContent.trim();
          }
        }
        author = (author || "threads_user").replace(/^@/, "").trim();

        // Extract timestamp
        const timeEl = container.querySelector("time[datetime], time");
        const isoTime = timeEl ? timeEl.getAttribute("datetime") || "" : "";
        const timestampText = timeEl
          ? (timeEl.textContent || "").trim()
          : postLinkEl
          ? (postLinkEl.textContent || "").trim()
          : "";

        // Extract text content from dir="auto" blocks while excluding username & UI buttons
        const textCandidates = Array.from(container.querySelectorAll('div[dir="auto"], span[dir="auto"]'));
        const textFragments = [];
        const seenFragments = new Set();

        for (const node of textCandidates) {
          // Skip nested dir="auto" if parent is already dir="auto"
          if (node.parentElement && node.parentElement.closest('[dir="auto"]') && node.querySelector('[dir="auto"]')) {
            continue;
          }
          const txt = (node.innerText || node.textContent || "").trim();
          if (!txt) continue;
          if (txt === author || txt === `@${author}` || txt === timestampText) continue;
          if (/^(ikuti|follow|balas|reply|suka|like|bagikan|share|terjemahkan|translate|\d+)$/i.test(txt)) continue;

          if (!seenFragments.has(txt)) {
            seenFragments.add(txt);
            textFragments.push(txt);
          }
        }

        const fullText = textFragments.join(" ").replace(/\s+/g, " ").trim();
        if (!fullText || fullText.length < 10) continue;

        // Deduplicate key (FR-03)
        const id = postId || `dom_${hashString(`${author}_${fullText.slice(0, 80)}`)}`;

        // Extract engagement metadata if visible
        const likesMatch = (container.innerText || "").match(/(\d+)\s*(?:suka|likes?)/i);
        const repliesMatch = (container.innerText || "").match(/(\d+)\s*(?:balasan|replies)/i);

        if (!postsMap.has(id)) {
          postsMap.set(id, {
            id,
            postUrl: postUrl || window.location.href,
            author,
            text: fullText,
            timestampText: timestampText || "Baru",
            isoTime,
            metadata: {
              likes: likesMatch ? parseInt(likesMatch[1], 10) : 0,
              replies: repliesMatch ? parseInt(repliesMatch[1], 10) : 0,
              source: "dom"
            }
          });
        }
      } catch (_) {
        // Continue to next container gracefully
      }
    }

    return Array.from(postsMap.values());
  }

  /**
   * Layer 2: Fallback JSON parser from embedded Threads Relay script blocks (A7 & B7)
   */
  function extractFromEmbeddedJSON() {
    const results = new Map();
    const scripts = Array.from(document.querySelectorAll('script[type="application/json"], script[data-sjs]'));

    function walkJson(obj) {
      if (!obj || typeof obj !== "object") return;

      // Threads GraphQL / Relay post node pattern
      const captionText = obj.caption?.text || obj.text_post_app_info?.share_info?.quoted_post?.caption?.text;
      const code = obj.code || obj.shortcode;
      const username = obj.user?.username || obj.owner?.username;
      const takenAt = obj.taken_at;

      if (typeof captionText === "string" && captionText.trim().length >= 10) {
        const cleanUser = username || "threads_user";
        const postId = code || `json_${hashString(`${cleanUser}_${captionText.slice(0, 80)}`)}`;
        const postUrl = code
          ? `${window.location.origin}/@${cleanUser}/post/${code}`
          : window.location.href;
        const isoTime = typeof takenAt === "number" ? new Date(takenAt * 1000).toISOString() : "";

        if (!results.has(postId)) {
          results.set(postId, {
            id: postId,
            postUrl,
            author: cleanUser,
            text: captionText.trim(),
            timestampText: formatRelativeTime(isoTime),
            isoTime,
            metadata: {
              likes: obj.like_count || 0,
              replies: obj.text_post_app_info?.direct_reply_count || 0,
              source: "json_fallback"
            }
          });
        }
      }

      if (Array.isArray(obj)) {
        for (const item of obj) walkJson(item);
      } else {
        for (const key of Object.keys(obj)) {
          walkJson(obj[key]);
        }
      }
    }

    for (const script of scripts) {
      try {
        const raw = script.textContent;
        if (!raw || (!raw.includes('"caption"') && !raw.includes('"text_post_app_info"'))) continue;
        const parsed = JSON.parse(raw);
        walkJson(parsed);
      } catch (_) {
        // Ignore non-JSON or malformed blocks
      }
    }

    return Array.from(results.values());
  }

  function formatRelativeTime(isoString) {
    if (!isoString) return "Baru";
    const diffMs = Date.now() - Date.parse(isoString);
    if (Number.isNaN(diffMs) || diffMs < 0) return "Baru";
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return "Baru saja";
    if (hours < 24) return `${hours} jam`;
    const days = Math.floor(hours / 24);
    return `${days} hari`;
  }

  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  /**
   * Combined extraction with DOM primary + JSON fallback merge
   */
  function extractPostsFromCurrentPage() {
    const startTime = performance.now();
    const domPosts = extractFromDOM();
    const mergedMap = new Map();

    for (const p of domPosts) {
      mergedMap.set(p.id, p);
    }

    // Use JSON fallback if DOM extraction returned few posts or to enrich missing posts
    const jsonPosts = extractFromEmbeddedJSON();
    for (const jp of jsonPosts) {
      if (!mergedMap.has(jp.id)) {
        mergedMap.set(jp.id, jp);
      }
    }

    const allPosts = Array.from(mergedMap.values()).slice(0, 200); // Session post cap (NFR-07)
    const durationMs = Math.round(performance.now() - startTime);

    return {
      ok: true,
      posts: allPosts,
      stats: {
        totalExtracted: allPosts.length,
        domCount: domPosts.length,
        jsonCount: jsonPosts.length,
        durationMs,
        pageUrl: window.location.href
      }
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "THREADSCOUT_EXTRACT_PAGE") {
      try {
        const response = extractPostsFromCurrentPage();
        sendResponse(response);
      } catch (err) {
        sendResponse({
          ok: false,
          error: err?.message || "Gagal membaca elemen halaman Threads.",
          posts: []
        });
      }
      return true;
    }
    return false;
  });
})();
