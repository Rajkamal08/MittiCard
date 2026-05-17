import axios from 'axios';

// ─── BASE URL ─────────────────────────────────────────────────────────────────
// Backend is deployed on Render — always use this URL
// (App runs on real device, not emulator, so localhost doesn't apply)
const BASE_URL = 'https://mitticard-backend.onrender.com';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,          // 30s for regular calls
  headers: {
    'Content-Type': 'application/json',
  },
});

// Separate instance for OCR — Tesseract downloads ~30MB on first call
// and then processes the image. Needs 2 minutes on slow connections.
export const ocrApi = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,         // 2 minutes for OCR
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Attach JWT token to every request automatically ────────────────────────
// The token is injected by setAuthToken() after login
api.interceptors.request.use(
  config => config,
  error => Promise.reject(error)
);

// ─── Global response error handler ──────────────────────────────────────────
api.interceptors.response.use(
  response => response,
  error => {
    const message =
      error?.response?.data?.message ||
      error?.message ||
      'Something went wrong. Please try again.';
    return Promise.reject({ message, status: error?.response?.status });
  }
);

// ─── Set / Clear Authorization header ────────────────────────────────────────
export const setAuthToken = token => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    ocrApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
    delete ocrApi.defaults.headers.common['Authorization'];
  }
};

// ─── Auth API calls ───────────────────────────────────────────────────────────
export const sendOTP = phone =>
  api.post('/auth/send-otp', { phone });

export const verifyOTP = (phone, otp, name) =>
  api.post('/auth/verify-otp', { phone, otp, name }); // role always 'farmer', set by backend

export const getMe = () =>
  api.get('/auth/me');

export const saveFCMToken = fcm_token =>
  api.post('/auth/save-fcm-token', { fcm_token });

// ─── Advisory API calls ───────────────────────────────────────────────────────
export const submitSoilData = data =>
  api.post('/advisory/manual', data);

export const getAdvisory = scanId =>
  api.get(`/advisory/${scanId}`);

export const updateSowingDate = (scanId, sowingDate) =>
  api.put(`/advisory/${scanId}/sowing-date`, { sowing_date: sowingDate });

// OCR: send base64 image → get extracted soil values back
// Uses ocrApi (120s timeout) — Tesseract downloads 30MB language data on first run
export const scanImageForOCR = (image_base64) =>
  ocrApi.post('/advisory/ocr-scan', { image_base64 });

// OCR: submit the confirmed extracted values as a scan
export const submitOCRSoilData = data =>
  api.post('/advisory/ocr', data);

// ─── FPO Dashboard API calls ──────────────────────────────────────────────────
export const getFPOFarms = () =>
  api.get('/fpo/farms');

export const getFPOStats = () =>
  api.get('/fpo/stats');

export const getFPODistrictFarms = () =>
  api.get('/fpo/district-farms');

export const addFarmToFPO = (farm_id) =>
  api.post('/fpo/members', { farm_id });

export { api };
export default api;


