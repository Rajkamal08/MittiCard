// geminiOCR.js — Vision OCR using Groq (Llama 3.2 Vision) as primary
// Groq free tier: 1000 req/day, no credit card, instant activation
// Falls back to Gemini if GEMINI_API_KEY is set and Groq fails

const axios = require('axios');

const SHC_PROMPT = `You are analyzing an Indian Government Soil Health Card (SHC).
The card has a SOIL TEST RESULTS table with 12 fixed rows (same for ALL Indian states):
  Row 1: pH (no unit, value between 3.0 and 10.5)
  Row 2: EC — SKIP
  Row 3: Organic Carbon (OC) — unit: % — value is ALWAYS a small decimal like 0.38 or 0.75, NEVER 38 or 838
  Row 4: Available Nitrogen (N) — unit: kg/ha — value between 5 and 800
  Row 5: Available Phosphorus (P) — unit: kg/ha — value between 1 and 250
  Row 6: Available Potassium (K) — unit: kg/ha — value between 20 and 1000
  Row 7: Available Sulphur (S) — unit: ppm — value between 1 and 150
  Row 8: Available Zinc (Zn) — unit: ppm — value between 0.05 and 20
  Row 9: Available Boron (B) — unit: ppm — value between 0.05 and 5
  Row 10: Available Iron (Fe) — unit: ppm — value between 0.5 and 100
  Row 11: Available Manganese (Mn) — unit: ppm — value between 0.5 and 50
  Row 12: Available Copper (Cu) — unit: ppm — value between 0.05 and 20

Return ONLY this JSON (no markdown, no extra text):
{"ph":null,"organic_carbon":null,"nitrogen":null,"phosphorus":null,"potassium":null,"sulfur":null,"zinc":null,"boron":null,"iron":null,"manganese":null,"copper":null,"confidence":"High"}`;

// ── Groq Vision (Primary — Free: gsk_... key) ─────────────────────────────
// Tries two models: llama-3.2-11b-vision-preview (stable) → llama-4-scout (newer)
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-11b-vision-preview',
];

const extractWithGroq = async (base64Image) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const mimeType  = base64Image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
  const dataUrl   = `data:${mimeType};base64,${imageData}`;

  let lastErr = null;
  for (const model of GROQ_VISION_MODELS) {
    try {
      console.log(`[Groq] 🚀 Trying model: ${model}`);
      const start = Date.now();
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text',      text: SHC_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
      temperature: 0.1,
      max_tokens:  512,
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      timeout: 30000,
    }
  );
      const elapsed      = ((Date.now() - start) / 1000).toFixed(1);
      const responseText = response.data?.choices?.[0]?.message?.content || '';
      console.log(`[Groq] ✅ ${model} responded in ${elapsed}s:`, responseText.substring(0, 200));
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');
      return parseResult(JSON.parse(jsonMatch[0]), elapsed, `Groq/${model.split('/').pop()}`);
    } catch (e) {
      console.warn(`[Groq] ❌ ${model} failed:`, e.response?.data?.error?.message || e.message);
      lastErr = e;
    }
  }
  throw new Error(`All Groq models failed. Last: ${lastErr?.message}`);
};

// ── Gemini Vision (Secondary — if GEMINI_API_KEY is set) ──────────────────
const extractWithGemini = async (base64Image) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const imageData = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const mimeType  = base64Image.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
  const start     = Date.now(); // ← fixed: was missing

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: SHC_PROMPT }, { inline_data: { mime_type: mimeType, data: imageData } }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  const elapsed      = ((Date.now() - start) / 1000).toFixed(1);
  const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch    = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini no JSON');
  return parseResult(JSON.parse(jsonMatch[0]), elapsed, 'Gemini');
};

// ── Shared result parser ───────────────────────────────────────────────────
const parseResult = (parsed, elapsed, source) => {
  const KEYS = ['ph','organic_carbon','nitrogen','phosphorus','potassium',
                 'sulfur','zinc','boron','iron','manganese','copper'];
  const cleaned = {};
  for (const key of KEYS) {
    const val  = parsed[key];
    cleaned[key] = (val !== null && val !== undefined && !isNaN(Number(val))) ? Number(val) : null;
  }
  const core  = ['ph','nitrogen','phosphorus','potassium','organic_carbon'];
  const found = core.filter(k => cleaned[k] !== null).length;
  const conf  = parsed.confidence || (found >= 4 ? 'High' : found >= 2 ? 'Medium' : 'Low');
  console.log(`[${source}] ✅ Extracted:`, cleaned);
  return { ...cleaned, confidence: conf, rawText: `[${source} Vision ${elapsed}s]` };
};

// ── Main export — tries Groq first, then Gemini ───────────────────────────
const extractWithVision = async (base64Image) => {
  if (process.env.GROQ_API_KEY) {
    try { return await extractWithGroq(base64Image); }
    catch (e) { console.warn('[Groq] failed:', e.message); }
  }
  if (process.env.GEMINI_API_KEY) {
    try { return await extractWithGemini(base64Image); }
    catch (e) { console.warn('[Gemini] failed:', e.message); }
  }
  throw new Error('No Vision AI key available (set GROQ_API_KEY or GEMINI_API_KEY)');
};

module.exports = { extractWithVision, extractWithGroq, extractWithGemini };
