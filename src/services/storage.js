import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY    = '@mitticard_token';
const USER_KEY     = '@mitticard_user';
const SCAN_ID_KEY  = '@mitticard_last_scan_id';
const LANGUAGE_KEY = '@mitticard_language';     // 'hi' or 'en'
const PROFILE_DONE_KEY = '@mitticard_profile_done'; // 'true' once profile is saved

// ─── Save token after login ───────────────────────────────────────────────────
export const saveToken = async token => {
  await AsyncStorage.setItem(TOKEN_KEY, token);
};

// ─── Get stored token (used on app start to check if already logged in) ──────
export const getToken = async () => {
  return await AsyncStorage.getItem(TOKEN_KEY);
};

// ─── Remove token on logout ───────────────────────────────────────────────────
export const removeToken = async () => {
  await AsyncStorage.removeItem(TOKEN_KEY);
};

// ─── Save user object ─────────────────────────────────────────────────────────
export const saveUser = async user => {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
};

// ─── Get stored user ─────────────────────────────────────────────────────────
export const getUser = async () => {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};

// ─── Remove user on logout ────────────────────────────────────────────────────
export const removeUser = async () => {
  await AsyncStorage.removeItem(USER_KEY);
};

// ─── Clear everything on logout ───────────────────────────────────────────────
export const clearStorage = async () => {
  await AsyncStorage.multiRemove([
    TOKEN_KEY,
    USER_KEY,
    SCAN_ID_KEY,
    LANGUAGE_KEY,       // so next user on same phone picks their own language
    PROFILE_DONE_KEY,   // so next user fills profile fresh
  ]);
};

// ─── Save last scan ID after soil submission (used by HomeScreen) ─────────────
export const saveLastScanId = async scanId => {
  await AsyncStorage.setItem(SCAN_ID_KEY, String(scanId));
};

// ─── Get last scan ID ─────────────────────────────────────────────────────────
export const getLastScanId = async () => {
  return await AsyncStorage.getItem(SCAN_ID_KEY);
};

// ─── Save chosen language ('hi' or 'en') ─────────────────────────────────────
export const saveLanguage = async (langCode) => {
  await AsyncStorage.setItem(LANGUAGE_KEY, langCode);
};

// ─── Get saved language (returns null if never set) ───────────────────────────
export const getLanguage = async () => {
  return await AsyncStorage.getItem(LANGUAGE_KEY);
};

// ─── Mark profile as done (so we skip ProfileScreen on next login) ─────────
export const markProfileDone = async () => {
  await AsyncStorage.setItem(PROFILE_DONE_KEY, 'true');
};

// ─── Check if profile was already completed ───────────────────────────────────
export const isProfileDone = async () => {
  const val = await AsyncStorage.getItem(PROFILE_DONE_KEY);
  return val === 'true';
};

