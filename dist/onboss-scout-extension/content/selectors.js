/**
 * ThreadScout — Multi-layered Selectors for Threads (A7 Risk Mitigation & NFR-06)
 * Supports both www.threads.net and www.threads.com DOM structures + JSON fallbacks.
 */

window.ThreadScoutSelectors = {
  // Primary & fallback post container selectors
  postContainers: [
    '[data-pressable-container="true"]',
    'article',
    'div[role="article"]',
    'div:has(> div > div a[href*="/post/"])'
  ],

  // Permalink selectors pointing to individual posts
  postLinks: [
    'a[href*="/post/"]',
    'a[href*="/t/"]'
  ],

  // Author username selectors
  authorLinks: [
    'a[href^="/@"]:not([href*="/post/"])',
    'a[role="link"][href*="/@"]'
  ],

  // Timestamp selectors
  timestamps: [
    'time[datetime]',
    'time',
    'a[href*="/post/"] span'
  ],

  // Text body candidates inside a post container
  textBlocks: [
    'div[dir="auto"]',
    'span[dir="auto"]'
  ],

  // JSON script tags embedded by Threads Relay/SSR for fallback parsing
  jsonScripts: [
    'script[type="application/json"]',
    'script[data-sjs]'
  ]
};
