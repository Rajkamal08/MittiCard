# 🌱 MittiCard — Soil Health Advisory App

> **AI-powered soil health advisory for Indian farmers, built for ICAR Soil Health Cards**

[![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-green)](https://mitticard-backend.onrender.com)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-blue)](https://render.com)
[![Mobile](https://img.shields.io/badge/Mobile-React%20Native-61DAFB)](https://reactnative.dev)
[![OTP](https://img.shields.io/badge/OTP-2Factor%20Voice%20Call-orange)](https://2factor.in)
[![AI](https://img.shields.io/badge/OCR-Gemini%20Vision%20API-purple)](https://ai.google.dev)

---

## 📱 What is MittiCard?

MittiCard is a mobile app that helps Indian farmers understand their soil health. A farmer scans their **ICAR Soil Health Card** with the camera, and the app:

1. Extracts **8 soil nutrients** (pH, N, P, K, OC, Zn, S, Fe) using Gemini Vision OCR
2. Runs them through a **rule-based advisory engine**
3. Returns **crop-specific fertilizer recommendations** in Hindi or English
4. Shows **cost estimates** and a **crop calendar** with weekly tasks

FPO (Farmer Producer Organisation) managers get a **web dashboard** showing soil health across all their member farms.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              React Native Mobile App                 │
│  Login → OTP → Language → Profile → Home            │
│  Manual Entry / Camera OCR → Advisory Result        │
│  Crop Calendar · TTS Read Aloud · FPO Dashboard     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│         Node.js + Express Backend (Render)           │
│                                                      │
│  /auth    → Voice OTP (2Factor.in)                  │
│  /advisory → Advisory Engine + Gemini Vision OCR     │
│  /fpo     → FPO Dashboard APIs + CSV Export         │
│  /fpo-dashboard → Web Dashboard (static HTML)       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           PostgreSQL Database (Render)               │
│  users · farms · soil_scans · advisories            │
│  crop_calendar · fpo_members                        │
└─────────────────────────────────────────────────────┘
```

---

## ✅ Features

### 🔐 Authentication
- Phone number login with **Voice OTP** (2Factor.in)
- Works on **any Indian mobile number** — no DLT registration needed
- JWT tokens (30-day validity)
- Role support: `farmer` / `fpo_manager`

### 📸 Soil Analysis
- **Camera OCR** — scan ICAR Soil Health Card photo → Gemini Vision extracts nutrients
- **Manual Entry** — type soil values directly
- Supports **8 parameters**: pH, Nitrogen, Phosphorus, Potassium, Organic Carbon, Zinc, Sulfur, Iron

### 🧠 Premium Advisory Engine & Live Cost Calculator
- Rule-based engine for **7 crops**: Wheat, Rice, Maize, Cotton, Sugarcane, Soybean, Groundnut
- NPK deficiency detection with recommended fertilizer quantities
- **📊 Dynamic Live Farm Size Calculator**: Dynamic stepper controller (from 0.5 to 50 acres) instantly scales chemical fertilizer bag calculations, dynamizing metric dosage weights and total dynamic cost invoices in real-time.
- **🌿 "Go Organic" Alternatives Mode**: Live toggle button that swaps chemical suggestions for verified natural alternatives (Neem cake, Vermicompost, Bone meal, Wood ash) mapped dynamically in Hindi and English.
- Soil Health Score **(0–100)** with warm golden and soft rose coral pastel color boundaries for low scores.
- Localized budget advice enriched with smart co-op bulk discounts and PM-KISAN subsidized cooperative tips.

### 📅 Crop Calendar
- Week-by-week farm task timeline from sowing date
- Stored in database, viewable anytime

### 🌐 Multilingual & Reading Aloud
- **Hindi** and **English** support (i18next)
- **TTS (Text-to-Speech)** reads advisory aloud in selected language
- Language persisted across sessions

### 👨‍🌾 FPO Dashboard (Web)
- FPO managers log in at `/fpo-dashboard`
- View all member farms + latest soil data
- District-wise deficiency breakdown (N/P/K/OC/Zn/S)
- Add farmers from district via "+ Add Farmers" modal
- Export full data as **CSV** for bulk fertilizer ordering

### 🔔 Smart Soil Alerts & Notifications
- Firebase Cloud Messaging (FCM) infrastructure
- Daily **8AM IST** cron job sends crop reminders
- **🌈 Severity-Coded Soil Alerts**: Bottom-sheet panel displays colored notification cards matching alert urgency (Red = Critical, Orange = Warning, Amber = pH Alert, Green = Tip) with high-end left-accent indicator bars.
- **🌧️ Dynamic Weather-Triggered Sowing Advisories**: Automatically checks local live forecasts from the Open-Meteo API. If upcoming rain is expected, it dynamically injects an actionable advice card telling farmers to broadcast nitrogen/urea now to maximize rain root absorption.
- **🌤️ Glowing Weather Header Capsule**: Replaced the static moon icon with a live, glowing rounded capsule in the top header row, showcasing live weather emoji, real-time Celsius degrees, and description (e.g. `[ ☀️ 34°C • Clear Sky ]`) next to the greeting.
- **🗺️ Dynamic Indian District Geocoding**: Integrated the free, secure Open-Meteo Geocoding API. Now, whenever the user edits or registers their profile with *any state/district in India* (e.g. Nagpur, Raipur, Bhopal, Lucknow, Patna, Indore, Delhi, etc.), MittiCard dynamically looks up its coordinates to fetch the actual, live real-time local weather data!
- **✏️ Account & Session Management Dashboard**: Consolidated user profile edits and session logout actions inside the **Your Farm Profile** card header with dual side-by-side premium pill buttons (`✏️ Edit` and `↩️ Logout`). Tapping Edit seamlessly navigates to `ProfileScreen.js` with instant database persistence!

---

## 🖥️ App Screens

| Screen | Description |
|--------|-------------|
| `SplashScreen` | Animated logo on launch |
| `LoginScreen` | Phone input — **English only** |
| `OTPScreen` | 6-box OTP entry — **English** |
| `LanguageScreen` | अपनी भाषा चुनें / Select Language |
| `ProfileScreen` | Name + district setup (first login) |
| `HomeScreen` | Dashboard with scan options |
| `SoilInputScreen` | Manual nutrient entry form |
| `OCRScreen` | Camera scan + Gemini Vision OCR |
| `AdvisoryResultScreen` | Full advisory with TTS |
| `CropCalendarScreen` | Week-by-week crop tasks |
| `FPODashboardScreen` | FPO manager farm overview |

---

## 🗄️ Database Schema

```sql
users          — id, name, phone, role, district, state, fcm_token
farms          — id, user_id, farm_name, size_acres, district, state
soil_scans     — id, farm_id, input_method (manual/ocr), ph, nitrogen, phosphorus,
                 potassium, organic_carbon, zinc, sulfur, iron, crop, sowing_date
advisories     — id, scan_id, recommendations (JSON), soil_health_score,
                 total_cost, language
crop_calendar  — id, scan_id, event_date, event_label, reminder_sent
fpo_members    — id, fpo_id, farm_id
```

---

## 🔌 API Reference

### Auth
```
POST /auth/send-otp      { phone }                  → sends voice OTP
POST /auth/verify-otp    { phone, otp, role }        → returns JWT token
GET  /auth/me                                        → returns user info
POST /auth/save-fcm-token { fcm_token }              → saves device token
```

### Advisory
```
POST /advisory/manual    { crop, ph, nitrogen, ... } → returns advisory
POST /advisory/ocr       { crop, ph, nitrogen, ... } → same, OCR input
POST /advisory/ocr-scan  { image_base64 }            → extracts soil values
GET  /advisory/:id                                   → fetch past advisory
```

### FPO Dashboard
```
GET  /fpo/farms          → all farms + latest scan data
GET  /fpo/stats          → deficiency %, avg score, crop distribution
GET  /fpo/export         → CSV download
POST /fpo/farms          → create new farm
POST /fpo/members        → link farm to FPO dashboard
GET  /fpo/district-farms → browse all farms in district
```

### Web Dashboard
```
GET  /fpo-dashboard      → opens FPO web dashboard (browser)
```

---

## 🚀 Deployment

### Backend (Render)
- **Live URL:** `https://mitticard-backend.onrender.com`
- **FPO Dashboard:** `https://mitticard-backend.onrender.com/fpo-dashboard`
- Auto-deploys from `main` branch on push

### Required Environment Variables (Render Dashboard)
```env
TWOFACTOR_API_KEY=your_2factor_api_key
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_jwt_secret
DB_HOST=your_postgres_host
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_NAME=your_db_name
DB_PORT=5432
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY=your_private_key
```

---

## 🛠️ Local Development

### Backend
```bash
cd backend
npm install
cp .env.example .env    # fill in your keys
node index.js
# Server runs on http://localhost:5000
```

### Mobile App
```bash
cd soilapp
npm install

# For USB-connected Android device:
adb reverse tcp:5000 tcp:5000
npx react-native run-android
```

> In `src/services/api.js`, change `BASE_URL` to `http://localhost:5000` for local dev.

### Build Release APK
```bash
cd soilapp/android
.\gradlew assembleRelease
# APK → app/build/outputs/apk/release/app-release.apk

# Install via USB:
adb install app/build/outputs/apk/release/app-release.apk
```

---

## 📁 Project Structure

```
Soil Health/
├── backend/
│   ├── engine/
│   │   ├── advisor.js        # Rule-based advisory engine (7 crops)
│   │   ├── ocrExtractor.js   # Gemini Vision API OCR
│   │   └── validate.js       # Input validation
│   ├── models/
│   │   └── createTables.js   # PostgreSQL schema (6 tables)
│   ├── routes/
│   │   ├── auth.js           # OTP auth + JWT
│   │   ├── advisory.js       # advisory + OCR endpoints
│   │   └── fpo.js            # FPO dashboard APIs
│   ├── middleware/
│   │   └── auth.js           # JWT verification middleware
│   ├── cron/
│   │   └── reminderCron.js   # 8AM daily FCM push notifications
│   ├── public/
│   │   └── fpo.html          # FPO web dashboard (self-contained)
│   └── index.js              # Express app entry point
│
└── soilapp/                  # React Native app
    └── src/
        ├── screens/          # 11 app screens
        ├── services/
        │   ├── api.js        # All backend API calls
        │   └── storage.js    # AsyncStorage helpers
        ├── theme/            # Colors, spacing, typography
        ├── i18n/             # Hindi + English translations
        └── engine/           # Client-side helpers
```

---

## 🔑 Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native 0.73 |
| Backend | Node.js + Express |
| Database | PostgreSQL (Render) |
| Auth | JWT + 2Factor.in (Voice OTP) |
| OCR | Google Gemini Vision API |
| Push Notifications | Firebase Cloud Messaging |
| Translations | i18next (Hindi + English) |
| Text-to-Speech | react-native-tts |
| Deployment | Render (backend + DB) |

---

## 👨‍💻 Built For

**MittiCard** was built as a soil health advisory platform targeting Indian farmers who receive ICAR Soil Health Cards but have no way to act on the data. The app bridges that gap by turning the printed card into actionable farming guidance — in the farmer's own language, on their phone.

---

*Made with 🌱 for Indian Agriculture*
