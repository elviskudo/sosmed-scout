/**
 * ThreadScout — Universal Prompt-Driven Scoring Engine (Strict Relevance Gate)
 *
 * Fixes:
 * 1. Extracts smart Threads search queries directly from the user's natural language prompt.
 * 2. Enforces a STRICT Topic Gate: if a post does NOT match any topic/keyword from the user's
 *    prompt, its score is capped at < 35 ("Skip") so random timeline posts NEVER show up as leads.
 * 3. Expands common Indonesian product/service synonyms so natural prompts match buyer posts.
 */

const SYNONYM_GROUPS = [
  ["website", "web", "landing page", "landingpage", "situs", "wordpress", "toko online", "ecommerce", "web dev", "developer"],
  ["aplikasi", "app", "apps", "mobile app", "android", "ios", "software", "sistem", "programmer", "coding"],
  ["desain", "design", "designer", "ui", "ux", "ui/ux", "grafis", "logo", "branding", "illustrator", "canva", "figma"],
  ["video", "videografer", "editor video", "video editor", "reels", "tiktok", "capcut", "motion graphic", "shooting"],
  ["foto", "fotografer", "photographer", "photoshoot", "dokumentasi", "wedding", "prewed", "wisuda", "studio"],
  ["rumah", "hunian", "perumahan", "cluster", "townhouse", "tempat tinggal", "properti", "property", "kpr"],
  ["tanah", "kavling", "lahan", "pekarangan", "kebun", "shm", "sertifikat"],
  ["kos", "kost", "kosan", "kontrakan", "apartemen", "sewa kamar", "indekos"],
  ["ruko", "kios", "lapak", "gudang", "tempat usaha", "sewa tempat"],
  ["mobil", "car", "otomotif", "sedan", "suv", "mpv", "mobil bekas", "mobil second"],
  ["motor", "vespa", "matic", "motor bekas", "motor second"],
  ["laptop", "macbook", "notebook", "pc", "komputer", "rakit pc", "thinkpad"],
  ["hp", "handphone", "iphone", "smartphone", "android", "ipad", "tablet", "gadget"],
  ["katering", "catering", "nasi kotak", "snack box", "tumpeng", "makanan acara", "konsumsi"],
  ["kue", "cake", "hampers", "parcel", "bakery", "cookies", "roti", "brownies"],
  ["baju", "kaos", "kemeja", "konveksi", "sablon", "custom kaos", "hoodie", "seragam", "jersey", "fashion"],
  ["skincare", "makeup", "mua", "makeup artist", "rias", "salon", "treatment", "klinik"],
  ["les", "privat", "guru les", "tutor", "kursus", "bimbel", "belajar", "mentor", "kelas"],
  ["pajak", "akuntansi", "pembukuan", "konsultan pajak", "laporan keuangan", "legal", "notaris", "pt", "cv"],
  ["iklan", "ads", "meta ads", "fb ads", "google ads", "tiktok ads", "digital marketing", "sosmed", "admin sosmed", "kol", "endorse"],
  ["penulis", "copywriter", "artikel", "content writer", "ghostwriter", "terjemahan", "translator", "skripsi", "olahan data"],
  ["bersih", "cleaning", "cleaning service", "cuci ac", "service ac", "tukang", "renovasi", "interior", "kontraktor", "arsitek"]
];

const BUYER_INTENT_RULES = [
  {
    pattern: /\b(lagi cari|sedang mencari|nyari|cari|butuh|perlu|mau beli|pengen beli|ingin beli|mau sewa|mau pesan|mau order|wtb|want to buy|looking for|need|dicari)\b/i,
    points: 20,
    label: "Kalimat aktif mencari / butuh"
  },
  {
    pattern: /\b(rekomendasi|rekomen|infoin|spill|ada yang jual|barangkali ada yang jual|ada yang punya|ada kenalan|saranin|minta saran|vendor|jasa|tempat beli)\b/i,
    points: 15,
    label: "Meminta rekomendasi / info penjual"
  },
  {
    pattern: /\b(serius beli|siap bayar|siap tf|siap transfer|dana siap|budget siap|cash|langganan|kontrak|hire|hiring)\b/i,
    points: 12,
    label: "Kesiapan transaksi / pembayaran"
  },
  {
    pattern: /\b(cek harga|pricelist|price list|rate card|portofolio|lihat sampel|survey|testimoni|konsultasi|estimasi biaya)\b/i,
    points: 10,
    label: "Menanyakan harga / portofolio / survey"
  }
];

const SPECIFICITY_RULES = [
  {
    pattern: /\b((?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|m|miliar|milyar)|budget\s*\S+|harga\s*(?:dibawah|di bawah|maks|max|sekitar|kisaran)\s*\S+)\b/i,
    points: 9,
    label: "Menyebutkan angka budget / harga"
  },
  {
    pattern: /\b(daerah|area|lokasi|wilayah|domisili|kota|cod|kirim ke|sekitar)\s+[a-z0-9]+/i,
    points: 6,
    label: "Menyebutkan lokasi / area"
  },
  {
    pattern: /\b(\d+\s*(?:pcs|unit|buah|paket|orang|hari|bulan|jam|m2|meter|kg|gram|liter|kt|kamar)|custom|garansi|ori|original|second|bekas|baru)\b/i,
    points: 6,
    label: "Menyebutkan spesifikasi / kuantitas"
  },
  {
    pattern: /\b(buat\s+[a-z]+|untuk\s+[a-z]+|karena\s+[a-z]+|acara\s+[a-z]+|kebutuhan\s+[a-z]+)\b/i,
    points: 5,
    label: "Menjelaskan tujuan kebutuhan"
  }
];

const URGENCY_RULES = [
  {
    pattern: /\b(butuh cepat|segera|urgent|mendesak|hari ini|besok|minggu ini|bulan ini|asap|secepatnya|deadline|mepet)\b/i,
    points: 6,
    label: "Urgensi waktu tinggi"
  },
  {
    pattern: /\b(capek nyari|capek cari|udah keliling|belum nemu|susah banget|pusing cari|bingung cari|bantu info|tolong info)\b/i,
    points: 5,
    label: "Pain point / kesulitan mencari"
  },
  {
    pattern: /\b(dm ya|langsung dm|wa aja|hubungi saya|drop info|drop link|drop portofolio|komen di bawah|tawarkan|reply ya)\b/i,
    points: 5,
    label: "Meminta penawaran di DM / komentar"
  }
];

const SELLER_PENALTY_RULES = [
  {
    pattern: /\b(ready stock|open po|pre-order|kami menyediakan|saya jual|kami pasarkan|promo khusus|diskon hingga|klik link di bio|order via wa|wa\s*08\d{7,}|hubungi admin|slot terbatas|free ongkir seluruh|open order|buka jasa)\b/i,
    penalty: -45,
    label: "Postingan promosi penjual / kompetitor"
  }
];

// Meta words that describe the user's act of selling/searching rather than the product topic itself
const PROMPT_STOPWORDS = new Set([
  "saya", "aku", "gue", "kami", "kita", "jual", "jualan", "menjual", "tawarkan", "menawarkan",
  "menyediakan", "buka", "open", "cari", "mencari", "nyari", "carikan", "tolong", "orang",
  "yang", "sedang", "lagi", "butuh", "perlu", "mau", "ingin", "pengen", "beli", "membeli",
  "sewa", "pesan", "order", "untuk", "buat", "dengan", "dan", "atau", "di", "ke", "dari",
  "pada", "dalam", "itu", "ini", "ada", "bisa", "harga", "kisaran", "mulai", "sekitar",
  "daerah", "area", "lokasi", "wilayah", "kota", "jasa", "produk", "barang", "layanan",
  "calon", "pembeli", "klien", "customer", "pelanggan", "lead", "leads", "threads", "thread",
  "post", "postingan", "status", "bikin", "buatkan", "mulai", "sampai", "ribu", "juta",
  "miliar", "murah", "bagus", "terbaik", "profesional", "berkualitas", "cepat", "siap",
  "the", "and", "for", "with", "nya", "dong", "ya", "kak", "gan", "bang", "pak", "bu"
]);

export function normalizeText(rawText = "") {
  return rawText
    .toLowerCase()
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse natural language prompt into:
 * - coreKeywords: strict topic words from user's prompt
 * - expandedKeywords: coreKeywords + domain synonyms
 * - searchQueries: ready-to-use Threads search queries (e.g., "cari website", "rekomendasi fotografer")
 */
export function parseSellerPrompt(context = {}) {
  const rawPrompt = (context.prompt || "").trim();
  const cleaned = rawPrompt
    .replace(/[()[\]{}"'?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Extract core topic words (ignoring stopwords and pure numbers/prices like "1.5jt")
  const tokens = cleaned
    .toLowerCase()
    .split(/[\s,;/|]+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter((w) => {
      if (w.length < 2) return false;
      if (PROMPT_STOPWORDS.has(w)) return false;
      if (/^\d+([.,]\d+)?(rb|ribu|k|jt|juta|m|miliar)?$/i.test(w)) return false;
      return true;
    });

  const coreKeywords = Array.from(new Set(tokens));

  // Expand with synonyms if any core keyword belongs to a synonym group
  const expandedSet = new Set(coreKeywords);
  for (const kw of coreKeywords) {
    for (const group of SYNONYM_GROUPS) {
      if (group.includes(kw)) {
        for (const syn of group) expandedSet.add(syn);
      }
    }
  }

  // Build concise offering summary for outreach templates
  let offeringSummary = rawPrompt.split(/(?:\.\s+|\n)/)[0].trim();
  offeringSummary = offeringSummary
    .replace(/^(saya|aku|kami)\s+(jual|jualan|menjual|menyediakan|menawarkan|punya|buka jasa|open jasa)\s+/i, "")
    .replace(/^(cari|mencari|nyari|tolong carikan)\s+(orang|calon pembeli|klien|lead|leads)\s+(yang\s+)?(lagi\s+|sedang\s+)?(cari|nyari|butuh|mau beli)\s+/i, "")
    .replace(/\.$/, "")
    .trim();
  if (offeringSummary.length > 75) {
    offeringSummary = offeringSummary.slice(0, 72).trim() + "...";
  }

  // Build smart Threads search queries so the extension can navigate Threads search directly
  const topTerms = coreKeywords.slice(0, 3);
  const primaryTerm = topTerms[0] || "rekomendasi";
  const secondaryTerm = topTerms[1] ? `${primaryTerm} ${topTerms[1]}` : primaryTerm;

  const searchQueries = Array.from(
    new Set([
      `cari ${secondaryTerm}`,
      `butuh ${primaryTerm}`,
      `rekomendasi ${primaryTerm}`,
      `info ${secondaryTerm}`
    ])
  );

  return {
    rawPrompt,
    offeringSummary: offeringSummary || "produk/layanan yang sesuai",
    coreKeywords,
    expandedKeywords: Array.from(expandedSet),
    searchQueries,
    primarySearchQuery: searchQueries[0]
  };
}

/**
 * Parse Threads relative time or ISO timestamp into recency score (max 20)
 */
export function scoreRecency(timestampText = "", isoTime = "") {
  if (isoTime) {
    const parsed = Date.parse(isoTime);
    if (!Number.isNaN(parsed)) {
      const diffHours = (Date.now() - parsed) / (1000 * 60 * 60);
      if (diffHours <= 24) return { score: 20, label: "Postingan < 24 jam" };
      if (diffHours <= 72) return { score: 14, label: "Postingan 1–3 hari lalu" };
      if (diffHours <= 168) return { score: 8, label: "Postingan 4–7 hari lalu" };
      return { score: 3, label: "Postingan > 7 hari lalu" };
    }
  }

  const t = (timestampText || "").toLowerCase().trim();
  if (!t) return { score: 10, label: "Waktu post baru" };

  if (/^(baru saja|just now|\d+\s*(dtk|detik|s|mnt|menit|m|jam|j|h))$/i.test(t) || /\b(\d+\s*(menit|jam|hours?|minutes?))\b/i.test(t)) {
    return { score: 20, label: `Terbaru (${timestampText})` };
  }

  const dayMatch = t.match(/(\d+)\s*(hari|h|d|days?)/i);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    if (days <= 1) return { score: 20, label: `Terbaru (${timestampText})` };
    if (days <= 3) return { score: 14, label: `1–3 hari (${timestampText})` };
    if (days <= 7) return { score: 8, label: `4–7 hari (${timestampText})` };
    return { score: 3, label: `> 7 hari (${timestampText})` };
  }

  return { score: 8, label: `Waktu (${timestampText})` };
}

export function extractPostDetails(text = "", parsedPrompt = {}, matchedKeywords = []) {
  const budgetMatch = text.match(
    /\b((?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|m|miliar|milyar)(?:\s*-\s*\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta|m|miliar|milyar))?)/i
  );

  const locationMatch = text.match(/\b(?:daerah|area|lokasi|sekitar|domisili|di)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);

  return {
    matchedKeywords,
    mentionedBudget: budgetMatch ? budgetMatch[1].trim() : null,
    mentionedLocation: locationMatch ? locationMatch[1].trim() : null,
    offeringSummary: parsedPrompt.offeringSummary
  };
}

/**
 * Deterministic scoring function with STRICT Prompt Relevance Gate
 */
export function calculateLeadScore(post, context = {}) {
  const rawText = post.text || "";
  const normText = normalizeText(rawText);
  const parsedPrompt = parseSellerPrompt(context);
  const signals = [];

  // Match against coreKeywords (exact prompt words) and expandedKeywords (synonyms)
  const matchedCore = [];
  const matchedSynonyms = [];

  for (const kw of parsedPrompt.coreKeywords) {
    const regex = kw.length >= 4 ? new RegExp(escapeRegex(kw), "i") : new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
    if (regex.test(normText)) {
      matchedCore.push(kw);
    }
  }

  for (const syn of parsedPrompt.expandedKeywords) {
    if (matchedCore.includes(syn)) continue;
    const regex = syn.length >= 4 ? new RegExp(`\\b${escapeRegex(syn)}`, "i") : new RegExp(`\\b${escapeRegex(syn)}\\b`, "i");
    if (regex.test(normText)) {
      matchedSynonyms.push(syn);
    }
  }

  const allMatchedTopicWords = [...matchedCore, ...matchedSynonyms];
  const hasTopicMatch = allMatchedTopicWords.length > 0;

  // 1. Explicit Intent & Topic Match (Max 35)
  let rawIntentPts = 0;
  for (const rule of BUYER_INTENT_RULES) {
    if (rule.pattern.test(normText)) {
      rawIntentPts += rule.points;
      signals.push({
        dimension: "intent",
        label: rule.label,
        points: rule.points
      });
    }
  }

  const hasBuyerIntent = rawIntentPts > 0;

  if (matchedCore.length > 0) {
    const corePts = Math.min(18, matchedCore.length * 9);
    rawIntentPts += corePts;
    signals.push({
      dimension: "intent",
      label: `Cocok kata kunci prompt: "${matchedCore.slice(0, 4).join(", ")}"`,
      points: corePts
    });
  } else if (matchedSynonyms.length > 0) {
    const synPts = Math.min(12, matchedSynonyms.length * 6);
    rawIntentPts += synPts;
    signals.push({
      dimension: "intent",
      label: `Topik serupa: "${matchedSynonyms.slice(0, 3).join(", ")}"`,
      points: synPts
    });
  }

  // Check seller penalty
  let isSellerPost = false;
  for (const rule of SELLER_PENALTY_RULES) {
    if (rule.pattern.test(normText)) {
      isSellerPost = true;
      rawIntentPts = Math.max(0, rawIntentPts + rule.penalty);
      signals.push({
        dimension: "intent",
        label: rule.label,
        points: rule.penalty
      });
    }
  }

  let intentPoints = Math.min(35, Math.max(0, rawIntentPts));

  // 2. Specificity & Prompt Criteria (Max 25)
  let specificityPoints = 0;
  if (allMatchedTopicWords.length >= 2) {
    const multiPts = Math.min(14, allMatchedTopicWords.length * 5);
    specificityPoints += multiPts;
    signals.push({
      dimension: "specificity",
      label: `${allMatchedTopicWords.length} kata kunci relevan ditemukan`,
      points: multiPts
    });
  }

  for (const rule of SPECIFICITY_RULES) {
    if (rule.pattern.test(normText)) {
      specificityPoints += rule.points;
      signals.push({
        dimension: "specificity",
        label: rule.label,
        points: rule.points
      });
    }
  }
  specificityPoints = Math.min(25, specificityPoints);

  // 3. Recency (Max 20)
  const recencyResult = scoreRecency(post.timestampText, post.isoTime);
  let recencyPoints = Math.min(20, recencyResult.score);

  // 4. Profile Quality (Max 10)
  let profilePoints = 0;
  if (post.author && post.author !== "unknown" && !/bot|official|promo|iklan|store|shop/i.test(post.author)) {
    profilePoints += 5;
  }
  if (post.postUrl && post.postUrl.includes("/post/")) {
    profilePoints += 3;
  }
  if (rawText.length >= 45) {
    profilePoints += 2;
  }
  profilePoints = Math.min(10, profilePoints);

  // 5. Urgency & Pain (Max 10)
  let urgencyPoints = 0;
  for (const rule of URGENCY_RULES) {
    if (rule.pattern.test(normText)) {
      urgencyPoints += rule.points;
      signals.push({
        dimension: "urgency",
        label: rule.label,
        points: rule.points
      });
    }
  }
  urgencyPoints = Math.min(10, urgencyPoints);

  // =========================================================================
  // STRICT RELEVANCE GATE:
  // If the post has ZERO topic match with the user's prompt, it MUST NOT pass
  // as a qualified lead (>= 40), regardless of recency or profile quality!
  // =========================================================================
  let totalScore = intentPoints + specificityPoints + recencyPoints + profilePoints + urgencyPoints;

  if (!hasTopicMatch) {
    // Cap unrelated posts at max 15 ("Skip") so random timeline posts never clutter the user's results
    totalScore = Math.min(15, intentPoints);
    signals.unshift({
      dimension: "intent",
      label: "Tidak cocok dengan topik prompt Anda",
      points: 0
    });
  } else if (!hasBuyerIntent && matchedCore.length < 2) {
    // Mentions 1 topic word casually without any buying/recommendation intent -> cap at 38 ("Skip")
    totalScore = Math.min(38, totalScore);
    signals.push({
      dimension: "intent",
      label: "Menyebut topik namun belum ada sinyal niat beli jelas",
      points: 0
    });
  }

  if (isSellerPost) {
    totalScore = Math.min(25, totalScore);
  }

  totalScore = Math.min(100, Math.max(0, totalScore));

  let category = "Skip";
  if (totalScore >= 80) category = "Hot";
  else if (totalScore >= 60) category = "Warm";
  else if (totalScore >= 40) category = "Watch";

  const breakdown = [
    { key: "intent", name: "Intent & Kecocokan Prompt", score: intentPoints, max: 35 },
    { key: "specificity", name: "Spesifisitas Kebutuhan", score: specificityPoints, max: 25 },
    { key: "recency", name: "Recency (Kebaruan)", score: recencyPoints, max: 20 },
    { key: "profile", name: "Kualitas Profil", score: profilePoints, max: 10 },
    { key: "urgency", name: "Urgensi & Pain", score: urgencyPoints, max: 10 }
  ];

  return {
    score: totalScore,
    category,
    hasTopicMatch,
    hasBuyerIntent,
    matchedKeywords: allMatchedTopicWords,
    breakdown,
    signals,
    extractedDetails: extractPostDetails(rawText, parsedPrompt, allMatchedTopicWords)
  };
}
