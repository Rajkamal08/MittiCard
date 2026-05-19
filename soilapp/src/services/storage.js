import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY          = '@mitticard_token';
const USER_KEY           = '@mitticard_user';
const SCAN_ID_KEY        = '@mitticard_last_scan_id';
const LANGUAGE_KEY       = '@mitticard_language';
const PROFILE_DONE_KEY   = '@mitticard_profile_done';
const ADVISORY_CACHE_KEY = '@mitticard_advisory_cache'; // offline cache

// ─── Token ────────────────────────────────────────────────────────────────────
export const saveToken   = async token => AsyncStorage.setItem(TOKEN_KEY, token);
export const getToken    = async ()    => AsyncStorage.getItem(TOKEN_KEY);
export const removeToken = async ()    => AsyncStorage.removeItem(TOKEN_KEY);

// ─── User ─────────────────────────────────────────────────────────────────────
export const saveUser   = async user => AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
export const getUser    = async ()   => {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};
export const removeUser = async () => AsyncStorage.removeItem(USER_KEY);

// ─── Last scan ID ─────────────────────────────────────────────────────────────
export const saveLastScanId = async scanId => AsyncStorage.setItem(SCAN_ID_KEY, String(scanId));
export const getLastScanId  = async ()     => AsyncStorage.getItem(SCAN_ID_KEY);

// ─── Language ─────────────────────────────────────────────────────────────────
export const saveLanguage = async lang => AsyncStorage.setItem(LANGUAGE_KEY, lang);
export const getLanguage  = async ()   => AsyncStorage.getItem(LANGUAGE_KEY);

// ─── Profile done flag ────────────────────────────────────────────────────────
export const markProfileDone = async () => AsyncStorage.setItem(PROFILE_DONE_KEY, 'true');
export const isProfileDone   = async () => {
  const val = await AsyncStorage.getItem(PROFILE_DONE_KEY);
  return val === 'true';
};

// ─── Offline advisory cache ───────────────────────────────────────────────────
// Saves the last fetched advisory so HomeScreen / CropCalendar work without internet
export const cacheAdvisory = async (scanId, advisoryData) => {
  try {
    const cache = { scanId, data: advisoryData, cachedAt: Date.now() };
    await AsyncStorage.setItem(ADVISORY_CACHE_KEY, JSON.stringify(cache));
  } catch { /* fail silently — cache is best-effort */ }
};

export const getCachedAdvisory = async () => {
  try {
    const raw = await AsyncStorage.getItem(ADVISORY_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    // Cache valid for 7 days
    const ageMs = Date.now() - (cache.cachedAt || 0);
    if (ageMs > 7 * 24 * 60 * 60 * 1000) return null;
    return cache.data;
  } catch { return null; }
};

// ─── Clear everything on logout ───────────────────────────────────────────────
export const clearStorage = async () => {
  await AsyncStorage.multiRemove([
    TOKEN_KEY,
    USER_KEY,
    SCAN_ID_KEY,
    LANGUAGE_KEY,
    PROFILE_DONE_KEY,
    ADVISORY_CACHE_KEY,
  ]);
};
