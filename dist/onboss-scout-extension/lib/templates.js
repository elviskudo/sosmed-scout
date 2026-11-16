/**
 * ThreadScout — Universal Signal-Based Outreach Templates (FR-06, US-05, US-08, AC-04)
 * Generates contextual, non-spammy Reply & DM drafts for ANY product/service
 * referencing specific details mentioned by the lead and the user's prompt.
 */

import { parseSellerPrompt } from "./scoring.js";

/**
 * Pick specific details from the lead's post to prove a human read it (AC-04)
 */
function buildSpecificSignalPhrase(lead) {
  const details = lead.extractedDetails || {};
  const parts = [];

  if (Array.isArray(details.matchedKeywords) && details.matchedKeywords.length > 0) {
    parts.push(`kebutuhan terkait ${details.matchedKeywords.slice(0, 3).join(" / ")}`);
  }

  if (details.mentionedLocation) {
    parts.push(`untuk area ${details.mentionedLocation}`);
  }

  if (details.mentionedBudget) {
    parts.push(`dengan kisaran budget ${details.mentionedBudget}`);
  }

  if (parts.length > 0) {
    return parts.join(" ");
  }

  const snippet = (lead.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `postingan tentang "${snippet}${lead.text && lead.text.length > 60 ? "..." : ""}"`;
}

/**
 * Generate public reply draft (short, helpful, low-friction)
 */
export function generateReplyDraft(lead, context = {}) {
  const authorHandle = lead.author ? `@${lead.author.replace(/^@/, "")}` : "Kak";
  const signalPhrase = buildSpecificSignalPhrase(lead);
  const parsed = parseSellerPrompt(context);

  return `Halo ${authorHandle}, kebetulan saya baca postingannya soal ${signalPhrase}. Saya menyediakan ${parsed.offeringSummary} yang sesuai dengan kebutuhan tersebut. Boleh saya kirim detail singkat & infonya lewat DM buat bahan pertimbangan? 🙏`;
}

/**
 * Generate conversational DM draft (consultative, non-hard-selling, signal-referenced)
 */
export function generateDmDraft(lead, context = {}) {
  const authorHandle = lead.author ? `@${lead.author.replace(/^@/, "")}` : "Kak";
  const signalPhrase = buildSpecificSignalPhrase(lead);
  const parsed = parseSellerPrompt(context);
  const snippet = (lead.text || "").replace(/\s+/g, " ").trim().slice(0, 75);

  return `Halo ${authorHandle}, salam kenal! 👋\n\nTadi saya sempat baca postingan Threads-nya: "${snippet}${lead.text && lead.text.length > 75 ? "..." : ""}" (${signalPhrase}).\n\nKebetulan saya menawarkan ${parsed.offeringSummary} yang bisa bantu kebutuhan tersebut.\n\nKalau berkenan dan masih mencari, boleh saya share info detail / portofolio singkatnya di sini? Santai saja, siapa tahu cocok buat bahan perbandingan dulu. Terima kasih!`;
}
