const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();

// Serve static files (FPO web dashboard)
app.use(express.static('public'));
// Redirect /fpo → /fpo.html for convenience
app.get('/fpo-dashboard', (req, res) => res.redirect('/fpo.html'));
app.get('/admin',         (req, res) => res.redirect('/admin.html'));

// Connect to PostgreSQL (tests connection on startup)
require('./db');
// Create all tables if they don't exist (safe to run every time)
const { createTables } = require('./models/createTables');
createTables();

// Start daily reminder cron (8 AM IST) for push notifications
require('./cron/reminderCron');


const PORT = process.env.PORT || 5000;


// Middleware
app.use(cors());           // allows React Native app to call this server

// ⚠️ IMPORTANT: Limit set to 25mb because OCR sends base64 images
// Phone photos are 3-4MB → base64 makes them ~5-6MB → default 1mb limit → 413 error
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Health check route — visit this to confirm server is running
app.get('/', (req, res) => {
  res.json({
    message: 'Soil Health Advisory API is running ✅',
    version: '1.0.0'
  });
});

// Gemini test route — tries multiple models to find what works
app.get('/test-gemini', async (req, res) => {
  try {
    const axios = require('axios');
    const key   = process.env.GEMINI_API_KEY;
    if (!key) return res.json({ ok: false, error: 'GEMINI_API_KEY not set' });

    const models = [
      'gemini-2.0-flash-lite',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.0-pro',
    ];

    for (const model of models) {
      try {
        const r = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { contents: [{ parts: [{ text: 'Reply: OK' }] }] },
          { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return res.json({ ok: true, model, reply: text.trim() });
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        if (!msg.includes('quota') && !msg.includes('not found')) {
          return res.json({ ok: false, model, error: msg });
        }
        // quota or 404 — try next model
      }
    }
    return res.json({ ok: false, error: 'All models quota exceeded — create new API key in fresh project' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Groq test route — tests if GROQ_API_KEY is working
app.get('/test-groq', async (req, res) => {
  try {
    const axios = require('axios');
    const key   = process.env.GROQ_API_KEY;
    if (!key) return res.json({ ok: false, error: 'GROQ_API_KEY not set in Render env vars' });

    const models = [
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'llama-3.2-11b-vision-preview',
      'llama3-8b-8192',  // text-only fallback just to test the key
    ];

    for (const model of models) {
      try {
        const r = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model,
            messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
            max_tokens: 10,
          },
          {
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            timeout: 15000,
          }
        );
        const reply = r.data?.choices?.[0]?.message?.content || '';
        return res.json({ ok: true, model, reply: reply.trim() });
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.warn(`[test-groq] ${model} failed:`, msg);
        if (!msg.includes('model') && !msg.includes('not found') && !msg.includes('decommissioned')) {
          return res.json({ ok: false, model, error: msg });
        }
      }
    }
    return res.json({ ok: false, error: 'All Groq models failed — check API key' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});


// Routes
app.use('/auth', require('./routes/auth'));
app.use('/advisory', require('./routes/advisory'));
app.use('/fpo', require('./routes/fpo'));

// More routes added in later phases:
// app.use('/calendar', require('./routes/calendar'));



// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  // Reminder cron is already scheduled above via require('./cron/reminderCron')
});


