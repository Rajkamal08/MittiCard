// ocrExtractor.js — Universal Soil Health Card (SHC) OCR Parser
//
// Government of India / ICAR SOIL HEALTH CARD — FIXED STRUCTURE (all states):
//
//   SOIL TEST RESULTS TABLE (right side of card):
//   ┌─────┬─────────────────────────────┬────────────┬────────┬────────┐
//   │S.No.│ Parameter                   │ Test Value │ Unit   │ Rating │
//   ├─────┼─────────────────────────────┼────────────┼────────┼────────┤
//   │  1  │ pH                          │            │   —    │        │
//   │  2  │ EC                          │            │ dS/m   │        │ (skip)
//   │  3  │ Organic Carbon (OC)         │            │   %    │        │
//   │  4  │ Available Nitrogen (N)      │            │ kg/ha  │        │
//   │  5  │ Available Phosphorus (P)    │            │ kg/ha  │        │
//   │  6  │ Available Potassium (K)     │            │ kg/ha  │        │
//   │  7  │ Available Sulphur (S)       │            │  ppm   │        │
//   │  8  │ Available Zinc (Zn)         │            │  ppm   │        │
//   │  9  │ Available Boron (B)         │            │  ppm   │        │
//   │ 10  │ Available Iron (Fe)         │            │  ppm   │        │
//   │ 11  │ Available Manganese (Mn)    │            │  ppm   │        │
//   │ 12  │ Available Copper (Cu)       │            │  ppm   │        │
//   └─────┴─────────────────────────────┴────────────┴────────┴────────┘
//
// OCR reads left + right columns together on each line, so line looks like:
//   "Aadhaar Number | XXXX-1234 | 5 | Available Phosphorus (P) | 18 | kg/ha | Low"
//
// KEY INSIGHT: Row numbers 1-12 are short, reliably OCR'd, and are ANCHORS.
// We extract the value from the content AFTER the row number on each line.
// This avoids false positives from Aadhaar numbers, sample numbers, etc.

const Tesseract = require("tesseract.js");

// ─── ICAR SHC standard row → parameter mapping ────────────────────────────────
const SHC_ROW_TO_PARAM = {
  1: "ph",
  3: "organic_carbon",
  4: "nitrogen",
  5: "phosphorus",
  6: "potassium",
  7: "sulfur",
  8: "zinc",
  9: "boron",
  10: "iron",
  11: "manganese",
  12: "copper",
  // Row 2 = EC → intentionally omitted
};

// ─── Valid ranges per parameter ───────────────────────────────────────────────
const RANGES = {
  ph: [3.0, 10.5],
  nitrogen: [5, 800],
  phosphorus: [1, 250],
  potassium: [20, 1000],
  organic_carbon: [0.05, 5.0],
  zinc: [0.05, 20.0],
  sulfur: [1, 150],
  iron: [0.5, 100],
  boron: [0.05, 5.0],
  manganese: [0.5, 50],
  copper: [0.05, 20],
};

// ─── Fix common OCR numeric mistakes ─────────────────────────────────────────
const fixOCRNumbers = (str) =>
  str
    .replace(/©/g, "0.") // © → 0. (OCR reads decimal as ©)
    .replace(/\bo(\d)/gi, "0.$1") // o75 → 0.75
    .replace(/\b0(\d{2,3})\b/g, "0.$1") // 078 → 0.78, 095 → 0.95
    .replace(/(\d)s\b/g, "$15") // 1s → 15 (s=5 confusion)
    .replace(/\bs(\d)/g, "5$1") // s3 → 53
    .replace(/(\d)\s+(\d)\b/g, (m, a, b) => {
      const v = parseFloat(`${a}.${b}`);
      return v >= 3 && v <= 10 ? `${a}.${b}` : m; // "7 6" → "7.6" only in pH-like range
    });

// ─── Normalize pH (OCR drops decimal points) ─────────────────────────────────
const normalizePH = (val) => {
  if (val >= 3.0 && val <= 10.5) return val;
  if (val >= 30 && val <= 104) return val / 10; // 73 → 7.3, 76 → 7.6
  if (val >= 300 && val <= 1050) return val / 100; // 615 → 6.15
  return null;
};

// ─── Extract valid number from a string ──────────────────────────────────────
const extractNumber = (str, param) => {
  const fixed = fixOCRNumbers(str);
  const nums = fixed.match(/\d+\.?\d*/g);
  if (!nums) return null;

  const [min, max] = RANGES[param] || [0, Infinity];
  const candidates = nums.map(Number).filter((n) => !isNaN(n));

  if (param === "ph") {
    for (let i = candidates.length - 1; i >= 0; i--) {
      const n = normalizePH(candidates[i]);
      if (n !== null) return n;
    }
    return null;
  }

  // Micronutrients: missing decimal is common (0.53 → 53)
  const micro = ["zinc", "boron", "copper", "iron"];
  if (micro.includes(param)) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      const n = candidates[i];
      if (n >= min && n <= max) return n;
      if (n > max && n / 10 >= min && n / 10 <= max)
        return parseFloat((n / 10).toFixed(2));
      if (n > max && n / 100 >= min && n / 100 <= max)
        return parseFloat((n / 100).toFixed(2));
    }
    return null;
  }

  // Others: last number in valid range (skip leading row index 1-12)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const n = candidates[i];
    if (n >= min && n <= max) {
      if (i === 0 && n <= 12 && candidates.length > 1) continue;
      return n;
    }
  }
  return null;
};

// ═══ STRATEGY 4 (PRIMARY): Row-number anchored extraction ═════════════════════
// Uses the fixed row numbers (1-12) as anchors.
// Extracts value from content AFTER the row number → avoids false positives
// from Aadhaar numbers, sample numbers, etc. on the left side of the card.
const parseByRowNumber = (lines) => {
  const result = {};

  // Units and rating words that ONLY appear in the Soil Test Results table
  const SOIL_ROW_MARKERS =
    /kg[/.]?ha|kotha|kona|koma|kya\b|ppm\b|pom\b|\b%\b|low\b|medium\b|high\b|medum|mesum|\bton\b|\bhon\b|\bign\b|\blow\b|\btow\b/i;

  // Try two-digit rows first (10,11,12) to avoid ambiguity with (1,2)
  const rowOrder = ["12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "1"];

  for (const line of lines) {
    // Skip lines that have no soil-table markers — they're from Farmer Details section
    if (!SOIL_ROW_MARKERS.test(line)) continue;

    for (const rowNum of rowOrder) {
      const param = SHC_ROW_TO_PARAM[rowNum];
      if (!param || result[param] != null) continue;

      // Match row number NOT preceded by letters/digits (avoids "MH-NAG-803" → 803)
      const rowRx = new RegExp(
        `(?<![a-zA-Z0-9])${rowNum}(?![0-9])[\\s|.,\\]\\[]+`,
        "g",
      );
      const matches = [...line.matchAll(rowRx)];
      if (matches.length === 0) continue;

      // Use the LAST match (rightmost = most likely in the test results table)
      const lastMatch = matches[matches.length - 1];
      const afterRowNum = line.substring(lastMatch.index + lastMatch[0].length);

      const val = extractNumber(afterRowNum, param);
      if (val !== null) {
        result[param] = val;
        console.log(
          `[OCR] S4 ✓ ${param} (row ${rowNum}) = ${val}  ← "${line.substring(0, 70)}"`,
        );
      }
    }
  }

  return result;
};

// ═══ STRATEGY 1: Pre-normalize + pattern match ════════════════════════════════
const fixOCRText = (raw) =>
  raw
    // ── STEP 0: Remove table separators (CRITICAL — reveals clean numbers) ────
    // "| 0.38 | % |"  →  " 0.38   %"   (pipe removal exposes the actual value)
    // "[838 | % |"    →  "838   %"      (bracket + pipe from cell borders)
    .replace(/[|│]/g, " ") // Remove all pipe variants
    .replace(/\{|\}/g, " ") // Remove curly braces
    .replace(/\[(?!\d)/g, " ") // Remove "[" unless followed by digit

    // ── STEP 1: Fix leading-zero decimals ─────────────────────────────────────
    // OCR drops "0." prefix: "0.38" → "38" or "038", "0.78" → "78" or "078"
    .replace(/\b0(\d{2,3})\b/g, "0.$1") // 078 → 0.78,  038 → 0.38,  095 → 0.95

    // ── STEP 2: Fix special OCR characters ──────────────────────────────────
    .replace(/©/g, "0.")
    .replace(/°/g, "0")
    // Units
    .replace(
      /kotha|kona|koma|kya\b|kg[/.]?na|kq[/.]?ha|kolha|k[qg][/.]ha/gi,
      "kg/ha",
    )
    .replace(/\bpo[mr]\b|\bppm\b/gi, "ppm")
    // pH variants (h→v/n/f/1)
    .replace(/\bp[vn]\b/gi, "pH")
    .replace(/\bpf\b/gi, "pH")
    .replace(/\bpii\b/gi, "pH")
    .replace(/\bp1\b/gi, "pH")
    // Chemical symbol fixes in parentheses
    .replace(/\(\s*1\s*\)/g, "(P)")
    .replace(/\(\s*l\s*\)/g, "(P)")
    .replace(/\(\s*[|I]\s*\)/g, "(K)")
    .replace(/\(\s*00\s*\)/g, "(OC)")
    .replace(/\(\s*0[cg]\s*\)/gi, "(OC)")
    .replace(/\(\s*vn\s*\)/gi, "(Mn)")
    .replace(/\(\s*vin\s*\)/gi, "(Mn)")
    .replace(/\(\s*fel?\s*\)/gi, "(Fe)")
    .replace(/\(\s*[il]+on?\s*\)/gi, "(Fe)")
    .replace(/\(\s*e\s*\)/g, "(B)")
    // "Available" normalization (all variants)
    .replace(/av[aei][a-z]{0,8}bl?[ei]?e?\s*/gi, "Available ")
    // Parameter name normalization
    .replace(
      /nu[oaeiu]+gen|n[iu][trz]*[oae]+g[ae]n|nit[ro]*g[ae]n/gi,
      "Nitrogen",
    )
    .replace(/ph[ao]s[a-z]{2,8}/gi, "Phosphorus")
    .replace(
      /pom[a-z]+[oui]+[mn]|por[a-z]*s[oui]+[mn]|pot[ao]s+[a-z]*/gi,
      "Potassium",
    )
    .replace(/organic\s*carb[oa]n?|org[a-z]*\s*carb[a-z]*/gi, "Organic Carbon")
    .replace(/sul[ph]+[ou]r|sug?h[ou]r/gi, "Sulphur")
    .replace(/[il]+onl?[ea]+l?\b|avail[a-z]*\s+[il]+on\b/gi, "Iron")
    .replace(/zan?[ck]k?\b|[a-z]+an[ck]\)/gi, "Zinc (Zn)")
    .replace(/[bs]oron/gi, "Boron")
    .replace(/mang[a-z]*[ns][ae][a-z]*/gi, "Manganese")
    .replace(/cop[p]?[ea]r/gi, "Copper");

const PARAM_PATTERNS = {
  ph: [/\bph\b/i, /soil\s*react/i],
  nitrogen: [/\bnitrogen\b/i, /\(n\)/i, /available\s+n\b/i],
  phosphorus: [/\bphosphorus\b/i, /\(p\)/i, /available\s+p\b/i],
  potassium: [/\bpotassium\b/i, /\(k\)/i, /available\s+k\b/i],
  organic_carbon: [
    /organic\s+carbon/i,
    /\boc\b/i,
    /\(oc\)/i,
    /\b(00|0c|0g)\b/i,
  ],
  zinc: [/\bzinc\b/i, /\(zn\)/i],
  sulfur: [/\bsulph?ur\b/i, /\(s\)/i],
  iron: [/\biron\b/i, /\(fe\)/i],
  boron: [/\bboron\b/i, /\(b\)/i],
  manganese: [/\bmanganese\b/i, /\(mn\)/i],
  copper: [/\bcopper\b/i, /\(cu\)/i],
};

const parseByPatterns = (lines) => {
  const result = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || "";
    for (const [param, patterns] of Object.entries(PARAM_PATTERNS)) {
      if (result[param] != null) continue;
      if (!patterns.some((p) => p.test(line))) continue;
      let val = extractNumber(line, param);
      if (val == null) val = extractNumber(line + " " + nextLine, param);
      if (val != null) {
        result[param] = val;
        console.log(
          `[OCR] S1 ✓ ${param} = ${val}  ← "${line.substring(0, 65)}"`,
        );
      }
    }
  }
  return result;
};

// ═══ STRATEGY 3: Unit-order fallback ══════════════════════════════════════════
// ICAR SHC ALWAYS has: OC (%), then N→P→K in kg/ha order — regardless of state.
const parseByUnitOrder = (lines) => {
  const result = {};

  // OC: first % line with valid OC-range number
  for (const line of lines) {
    if (result.organic_carbon != null) break;
    if (!/%/.test(line)) continue;
    const val = extractNumber(line, "organic_carbon");
    if (val != null) {
      result.organic_carbon = val;
      console.log(`[OCR] S3 ✓ organic_carbon = ${val}  (% unit)`);
    }
  }

  // N, P, K: first three kg/ha lines — filter out lines with alphanumeric IDs
  const kgHaLines = lines.filter((l) => {
    if (!/kg[/.]?ha|kotha|koma|kona|kya\b/i.test(l)) return false;
    // Skip lines where number is part of alphanumeric code (e.g., MH-NAG-803)
    return true;
  });

  ["nitrogen", "phosphorus", "potassium"].forEach((p, idx) => {
    if (kgHaLines[idx] && result[p] == null) {
      const val = extractNumber(kgHaLines[idx], p);
      if (val != null) {
        result[p] = val;
        console.log(`[OCR] S3 ✓ ${p} = ${val}  (kg/ha position ${idx + 1})`);
      }
    }
  });

  // pH: first line matching pH pattern
  for (const line of lines) {
    if (result.ph != null) break;
    if (/\bph\b|\bsoil\s*react/i.test(line)) {
      const val = extractNumber(line, "ph");
      if (val != null) {
        result.ph = val;
        console.log(`[OCR] S3 ✓ ph = ${val}`);
      }
    }
  }

  return result;
};

// ═══ Merge: S4 → S1 → S3 (first found wins) ══════════════════════════════════
const mergeStrategies = (...strategies) => {
  const ALL = [
    "ph",
    "nitrogen",
    "phosphorus",
    "potassium",
    "organic_carbon",
    "zinc",
    "sulfur",
    "iron",
    "boron",
    "manganese",
    "copper",
  ];
  const merged = {};
  for (const k of ALL) {
    for (const s of strategies) {
      if (s[k] != null) {
        merged[k] = s[k];
        break;
      }
    }
    if (merged[k] == null) merged[k] = null;
  }
  return merged;
};

// ─── Main entry point ─────────────────────────────────────────────────────────
const parseSoilValues = (rawText) => {
  // ── Pre-process for Strategy 1 ──
  const fixedText = fixOCRText(rawText);
  const lines = fixedText
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length >= 4);

  // ── Raw lines for Strategies 3 & 4 (before name normalization, keeps numbers intact) ──
  const rawLines = rawText
    .replace(/\r\n|\r/g, "\n")
    // Normalize units only (needed for S3)
    .replace(/kotha|kona|koma|kya\b|kg[/.]?na|kq[/.]?ha|kolha/gi, "kg/ha")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length >= 4);

  console.log("[OCR] ─ Strategy 4: Row-number anchored extraction...");
  const s4 = parseByRowNumber(rawLines); // Use RAW lines — row numbers are reliable in raw text

  console.log("[OCR] ─ Strategy 1: Pattern match on cleaned text...");
  const s1 = parseByPatterns(lines); // Use FIXED lines — better name matching

  console.log("[OCR] ─ Strategy 3: Unit-order fallback...");
  const s3 = parseByUnitOrder(rawLines); // Use RAW lines — unit positions reliable

  const result = mergeStrategies(s4, s1, s3);
  const core = ["ph", "nitrogen", "phosphorus", "potassium", "organic_carbon"];
  const found = core.filter((k) => result[k] !== null).length;
  const confidence = Math.round((found / core.length) * 100);

  console.log("[OCR] ── Final result ──", result);
  console.log(`[OCR] Confidence: ${confidence}% (${found}/5 core values)`);

  return { ...result, confidence, rawText };
};

// ─── Main OCR runner: Vision AI first, Tesseract fallback ─────────────────
const extractSoilFromImage = async (base64Image) => {
  const { extractWithVision } = require('./geminiOCR');

  // ── METHOD 1: Vision AI (Groq/Gemini — accurate, free) ───────────────────
  if (process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY) {
    try {
      console.log('[OCR] 🚀 Trying Vision AI (primary)...');
      const result = await extractWithVision(base64Image);
      console.log('[OCR] ✅ Vision AI extraction complete');
      return result;
    } catch (err) {
      console.warn('[OCR] ⚠️ Vision AI failed, falling back to Tesseract:', err.message);
    }
  } else {
    console.log('[OCR] ℹ️ No Vision AI key — using Tesseract fallback');
  }

  // ── METHOD 2: Tesseract OCR (Fallback — free but less accurate) ──────────
  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(imageData, "base64");

  let worker = null;
  try {
    const { createWorker } = Tesseract;
    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (
          ["loading tesseract core", "initializing tesseract"].includes(
            m.status,
          )
        ) {
          console.log(
            "[OCR]",
            m.status,
            Math.round((m.progress || 0) * 100) + "%",
          );
        }
      },
    });

    await worker.setParameters({ tessedit_pageseg_mode: "6" });

    const {
      data: { text },
    } = await worker.recognize(imageBuffer);
    console.log(
      "[OCR] Raw text (first 1200 chars):\n",
      text.substring(0, 1200),
    );

    return parseSoilValues(text);
  } catch (err) {
    console.error("[OCR] Tesseract error:", err.message);
    throw err;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (_) {}
    }
  }
};

module.exports = { extractSoilFromImage, parseSoilValues };
