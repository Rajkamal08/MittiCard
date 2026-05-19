import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StatusBar,
  Animated,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import Tts from 'react-native-tts';
import i18n from '../i18n';
import { colors, spacing, fontSizes, fontWeights, shadows } from '../theme';
import api, { getAdvisory } from '../services/api';
import { getUser, getLastScanId, clearStorage } from '../services/storage';
import { setAuthToken } from '../services/api';
import { useTranslation } from 'react-i18next';

// ─── Score helpers ────────────────────────────────────────────────────────────
const getScoreColor = (score, hasScan) => {
  if (!hasScan) return '#94A3B8'; // Neutral slate gray for empty state
  if (score >= 71) return colors.statusGood;
  if (score >= 41) return colors.statusFair;
  return colors.statusPoor;
};

const getScoreLabel = (score, t, hasScan) => {
  if (!hasScan) return '—';
  if (score >= 71) return t('advisory.score_good');
  if (score >= 41) return t('advisory.score_fair');
  return t('advisory.score_poor');
};

const getScoreEmoji = (score, hasScan) => {
  if (!hasScan) return '🌱';
  if (score >= 71) return '🟢';
  if (score >= 41) return '🟡';
  return '🔴';
};

const formatDate = dateStr => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const CROPS = [
  { id: 'Wheat', en: 'Wheat', hi: 'गेहूँ' },
  { id: 'Rice', en: 'Rice', hi: 'धान' },
  { id: 'Maize', en: 'Maize', hi: 'मक्का' },
  { id: 'Cotton', en: 'Cotton', hi: 'कपास' },
  { id: 'Sugarcane', en: 'Sugarcane', hi: 'गन्ना' },
  { id: 'Soybean', en: 'Soybean', hi: 'सोयाबीन' },
  { id: 'Groundnut', en: 'Groundnut', hi: 'मूंगफली' },
  { id: 'Mustard', en: 'Mustard', hi: 'सरसों' },
  { id: 'Vegetables', en: 'Vegetables', hi: 'सब्जियां' },
];

const SOILS = [
  { id: 'Alluvial Soil', en: 'Alluvial Soil', hi: 'जलोढ़ मिट्टी' },
  { id: 'Black Soil', en: 'Black Soil', hi: 'काली मिट्टी' },
  { id: 'Red Soil', en: 'Red Soil', hi: 'लाल मिट्टी' },
  { id: 'Sandy Soil', en: 'Sandy Soil', hi: 'रेतीली मिट्टी' },
  { id: 'Clay Soil', en: 'Clay Soil', hi: 'चिकनी मिट्टी' },
  { id: 'Loamy Soil', en: 'Loamy Soil', hi: 'दोमट मिट्टी' },
];

// ─── Animated Score Ring ──────────────────────────────────────────────────────
function ScoreRing({ score, color, hasScan }) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [score, scaleAnim, fadeAnim]);

  return (
    <Animated.View style={[styles.scoreRingOuter, { borderColor: color, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      <View style={[styles.scoreRingInner, { backgroundColor: color + '18' }]}>
        <Text style={[styles.scoreNumber, { color }]}>
          {hasScan ? score : '—'}
        </Text>
        {hasScan && <Text style={[styles.scoreOutOf, { color }]}>/100</Text>}
      </View>
    </Animated.View>
  );
}

// ─── Nutrient Status Badge ─────────────────────────────────────────────────────
function NutrientBadge({ label, value, unit, threshold }) {
  const isLow = value !== null && value < threshold;
  const bg = isLow ? '#FFF0F0' : '#F0FAF4';
  const fg = isLow ? colors.statusPoor : colors.statusGood;
  const tag = isLow ? 'LOW' : 'OK';

  return (
    <View style={[styles.nutrientBadge, { backgroundColor: bg }]}>
      <Text style={[styles.nutrientLabel, { color: fg }]}>{label}</Text>
      {value !== null && (
        <Text style={[styles.nutrientValue, { color: fg }]}>{value}{unit}</Text>
      )}
      <View style={[styles.nutrientTagBox, { backgroundColor: fg + '22' }]}>
        <Text style={[styles.nutrientTag, { color: fg }]}>{tag}</Text>
      </View>
    </View>
  );
}

// ─── Main HomeScreen ──────────────────────────────────────────────────────────
export default function HomeScreen({ navigation, route }) {
  const { t } = useTranslation();
  const [user, setUser] = useState(route?.params?.user || null);
  const [lastScan, setLastScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // ── Weather state ──────────────────────────────────────────────────────────
  const [weather, setWeather] = useState(null);
  const [, setWeatherLoad] = useState(false);

  // ── Notification panel state ───────────────────────────────────────────────
  const [notifBadge, setNotifBadge] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(40)).current;
  const cardFade = useRef(new Animated.Value(0)).current;

  // ── Voice assistant state ──────────────────────────────────────────────────
  const [playingVoice, setPlayingVoice] = useState(false);
  const waveAnim1 = useRef(new Animated.Value(1)).current;
  const waveAnim2 = useRef(new Animated.Value(1)).current;
  const waveAnim3 = useRef(new Animated.Value(1)).current;
  const waveAnim4 = useRef(new Animated.Value(1)).current;
  const waveAnim5 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (playingVoice) {
      const animateWave = (anim, duration, max) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: max, duration, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          ])
        );
      };
      
      const a1 = animateWave(waveAnim1, 400, 2.5);
      const a2 = animateWave(waveAnim2, 300, 3.2);
      const a3 = animateWave(waveAnim3, 500, 2.0);
      const a4 = animateWave(waveAnim4, 350, 2.8);
      const a5 = animateWave(waveAnim5, 450, 3.5);

      Animated.parallel([a1, a2, a3, a4, a5]).start();

      return () => {
        a1.stop();
        a2.stop();
        a3.stop();
        a4.stop();
        a5.stop();
      };
    }
  }, [playingVoice, waveAnim1, waveAnim2, waveAnim3, waveAnim4, waveAnim5]);

  // ── Actual Text-To-Speech execution for Voice Assistant ────────────────────
  useEffect(() => {
    let active = true;
    if (playingVoice && lastScan) {
      const isHindi = i18n.language === 'hi';
      const scoreNum = lastScan.soil_health_score || 0;
      const cropName = lastScan.crop ? lastScan.crop.charAt(0).toUpperCase() + lastScan.crop.slice(1) : '';
      
      let text = '';
      if (isHindi) {
        text = `नमस्ते, आपकी ${cropName} की मिट्टी की स्वास्थ्य रिपोर्ट। आपका मिट्टी स्वास्थ्य स्कोर 100 में से ${scoreNum} है। `;
        if (scoreNum >= 71) text += 'आपकी मिट्टी का स्वास्थ्य बहुत अच्छा है। ';
        else if (scoreNum >= 41) text += 'आपकी मिट्टी का स्वास्थ्य सामान्य है, इसमें कुछ सुधार की आवश्यकता है। ';
        else text += 'आपकी मिट्टी का स्वास्थ्य काफी कमजोर है। कृपया सिफारिश किए गए उर्वरक समय पर डालें। ';
        
        if (lastScan.nitrogen < 140) text += 'नाइट्रोजन की कमी है, कृपया यूरिया का प्रयोग करें। ';
        if (lastScan.phosphorus < 11) text += 'फॉस्फोरस की कमी है, कृपया डी ए पी डालें। ';
        if (lastScan.potassium < 108) text += 'पोटैशियम की कमी है, कृपया एम ओ पी का प्रयोग करें। ';
        
        text += `कुल अनुमानित उर्वरक लागत ${Math.round(lastScan.total_cost || 0)} रुपये है।`;
      } else {
        text = `Hello, here is your soil health report for ${cropName}. Your soil health score is ${scoreNum} out of 100. `;
        if (scoreNum >= 71) text += 'Your soil health is excellent! ';
        else if (scoreNum >= 41) text += 'Your soil health is fair and can be improved. ';
        else text += 'Your soil health is poor. Action is highly recommended. ';
        
        if (lastScan.nitrogen < 140) text += 'Nitrogen is low, please apply Urea. ';
        if (lastScan.phosphorus < 11) text += 'Phosphorus is low, please add DAP or Single Super Phosphate. ';
        if (lastScan.potassium < 108) text += 'Potassium is low, please apply MOP. ';
        
        text += `The estimated fertilizer cost is ${Math.round(lastScan.total_cost || 0)} Rupees.`;
      }

      const startSpeak = async () => {
        try {
          await Tts.getInitStatus();
          const lang = isHindi ? 'hi-IN' : 'en-IN';
          await Tts.setDefaultLanguage(lang);
          await Tts.setDefaultRate(0.48);
          await Tts.setDefaultPitch(1.0);
          await Tts.setDucking(true);
          
          if (active) {
            Tts.speak(text, {
              androidParams: {
                KEY_PARAM_PAN: 0.0,
                KEY_PARAM_VOLUME: 1.0,
                KEY_PARAM_STREAM: 'STREAM_MUSIC',
              }
            });
          }
        } catch (err) {
          Tts.setDefaultLanguage('en-US').then(() => {
            if (active) Tts.speak(text);
          }).catch(() => {});
        }
      };

      startSpeak();

      const finishSub = Tts.addEventListener('tts-finish', () => {
        if (active) setPlayingVoice(false);
      });
      const cancelSub = Tts.addEventListener('tts-cancel', () => {
        if (active) setPlayingVoice(false);
      });
      const errorSub = Tts.addEventListener('tts-error', () => {
        if (active) setPlayingVoice(false);
      });

      return () => {
        active = false;
        finishSub.remove();
        cancelSub.remove();
        errorSub.remove();
        Tts.stop();
      };
    }
  }, [playingVoice, lastScan]);

  // ─── Run entrance animation ─────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(cardFade, { toValue: 1, duration: 700, delay: 200, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 0, duration: 600, delay: 200, useNativeDriver: true }),
    ]).start();
  }, [headerFade, cardFade, cardSlide]);

  const isHindi = i18n.language === 'hi';

  // ─── WMO weather code → emoji + description ──────────────────────────────
  const wmoWeather = (code, temp) => {
    if (code === 0) return { emoji: '☀️', desc: isHindi ? 'साफ मौसम' : 'Clear Sky' };
    if (code <= 2) return { emoji: '⛅', desc: isHindi ? 'आंशिक बादल' : 'Partly Cloudy' };
    if (code === 3) return { emoji: '☁️', desc: isHindi ? 'घने बादल' : 'Overcast' };
    if (code <= 48) return { emoji: '🌫️', desc: isHindi ? 'कोहरा' : 'Foggy' };
    if (code <= 67) return { emoji: '🌧️', desc: isHindi ? 'बारिश' : 'Rainy' };
    if (code <= 77) return { emoji: '❄️', desc: isHindi ? 'बर्फबारी' : 'Snowy' };
    if (code <= 82) return { emoji: '🌦️', desc: isHindi ? 'हल्की बौछारें' : 'Rain Showers' };
    if (code <= 99) return { emoji: '⛈️', desc: isHindi ? 'आंधी-तूफान' : 'Thunderstorm' };
    return { emoji: temp > 35 ? '🌡️' : '🌤️', desc: isHindi ? 'सुहावना मौसम' : 'Mild Weather' };
  };



  // ─── Fetch weather using dynamic coordinates ───────────────────────────────
  const loadWeather = useCallback(async () => {
    setWeatherLoad(true);
    try {
      let lat = 21.25;
      let lon = 81.63; // Default Raipur

      const userDistrict = user?.district || '';
      if (userDistrict.trim()) {
        try {
          // Dynamic Geocoding using Open-Meteo free API to look up any state/district!
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(userDistrict.trim())}&count=1&language=en&format=json`;
          const geoRes = await fetch(geoUrl);
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results[0]) {
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
          }
        } catch {
          const dist = userDistrict.toLowerCase();
          if (dist.includes('raipur')) { lat = 21.25; lon = 81.63; }
        }
      } else {
        try {
          const locRes = await fetch('https://freeipapi.com/api/json');
          const locData = await locRes.json();
          if (locData.latitude) {
            lat = locData.latitude;
            lon = locData.longitude;
          }
        } catch {}
      }

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current_weather=true&timezone=Asia%2FKolkata`;
      const wRes = await fetch(url);
      const wData = await wRes.json();
      if (wData.current_weather) {
        setWeather(wData.current_weather);
      } else {
        setWeather({ temperature: 32.5, windspeed: 8.5, weathercode: 1 });
      }
    } catch {
      setWeather({ temperature: 32.5, windspeed: 8.5, weathercode: 1 });
    } finally {
      setWeatherLoad(false);
    }
  }, [user]);

  // ─── Load user + last scan on mount ────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // Fetch latest profile details from Postgres API first to ensure dynamic changes are read
      try {
        const meRes = await api.get('/auth/me');
        if (meRes.data?.success && meRes.data?.user) {
          setUser(meRes.data.user);
        } else if (!user) {
          const storedUser = await getUser();
          if (storedUser) setUser(storedUser);
        }
      } catch {
        if (!user) {
          const storedUser = await getUser();
          if (storedUser) setUser(storedUser);
        }
      }

      // Get last scan ID → fetch advisory
      const scanId = await getLastScanId();
      if (scanId) {
        const response = await getAdvisory(scanId);
        if (response.data.success) {
          setLastScan(response.data.data);
        }
      }

      // Fetch weather updates as well
      loadWeather();
      setError(null);
    } catch (err) {
      // Don't show error if it's just "no scan yet"
      if (err?.status !== 404) {
        setError('Could not load latest scan');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, loadWeather]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Refresh when navigating back to Home after a new scan ─────────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { loadData(false); });
    return unsubscribe;
  }, [navigation, loadData]);

  // ─── Logout handler ─────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await clearStorage();
    setAuthToken(null);
    navigation.replace('Login');
  };



  // ─── Build notifications from scan data ─────────────────────────────────────
  useEffect(() => {
    if (!lastScan) { setNotifBadge(0); return; }
    const alerts = [];
    const ns = lastScan;
    if (ns.nitrogen !== null && ns.nitrogen < 140) alerts.push(1);
    if (ns.phosphorus !== null && ns.phosphorus < 11) alerts.push(1);
    if (ns.potassium !== null && ns.potassium < 108) alerts.push(1);
    if (ns.organic_carbon !== null && ns.organic_carbon < 0.5) alerts.push(1);
    if (ns.zinc !== null && ns.zinc < 0.6) alerts.push(1);
    if (ns.ph !== null && (ns.ph < 5.5 || ns.ph > 8.0)) alerts.push(1);
    setNotifBadge(alerts.length);
  }, [lastScan]);



  // ─── Notification items built from scan ──────────────────────────────────
// ─── Notification Severity Helpers ────────────────────────────────────────────
const getNotifCardStyle = (severity) => {
  switch (severity) {
    case 'critical':
      return {
        backgroundColor: '#FFF5F5',
        borderColor: '#FFE5E5',
        borderWidth: 1,
        borderLeftWidth: 5,
        borderLeftColor: '#EF4444',
      };
    case 'warning':
      return {
        backgroundColor: '#FFF9F0',
        borderColor: '#FFEBD0',
        borderWidth: 1,
        borderLeftWidth: 5,
        borderLeftColor: '#F59E0B',
      };
    case 'alert':
      return {
        backgroundColor: '#FFFBEB',
        borderColor: '#FEF3C7',
        borderWidth: 1,
        borderLeftWidth: 5,
        borderLeftColor: '#D97706',
      };
    case 'info':
    default:
      return {
        backgroundColor: '#F4FBF7',
        borderColor: '#E1F5EC',
        borderWidth: 1,
        borderLeftWidth: 5,
        borderLeftColor: '#10B981',
      };
  }
};

const getSeverityTextColor = (severity) => {
  switch (severity) {
    case 'critical': return '#991B1B';
    case 'warning': return '#92400E';
    case 'alert': return '#B45309';
    case 'info':
    default: return '#065F46';
  }
};

  const buildNotifications = () => {
    const list = [];
    if (!lastScan) {
      list.push({ 
        id: 1, 
        icon: '📋', 
        severity: 'info',
        title: isHindi ? 'कोई स्कैन उपलब्ध नहीं' : 'No Scan Yet', 
        body: isHindi ? 'व्यक्तिगत अलर्ट प्राप्त करने के लिए अपना मृदा कार्ड स्कैन करें।' : 'Scan your soil card to get personalized alerts.' 
      });
      return list;
    }
    const ns = lastScan;
    
    // 🔴 Nitrogen
    if (ns.nitrogen !== null && ns.nitrogen < 140) {
      list.push({ 
        id: 2, 
        icon: '🔴', 
        severity: 'critical',
        title: isHindi ? 'नाइट्रोजन की कमी' : 'Low Nitrogen', 
        body: isHindi 
          ? `नाइट्रोजन ${ns.nitrogen} kg/ha (कम) है। तत्काल यूरिया या कम्पोस्ट डालें।` 
          : `Nitrogen is low at ${ns.nitrogen} kg/ha. Apply Urea or Vermicompost.`
      });
    }
    
    // 🔴 Phosphorus
    if (ns.phosphorus !== null && ns.phosphorus < 11) {
      list.push({ 
        id: 3, 
        icon: '🔴', 
        severity: 'critical',
        title: isHindi ? 'फॉस्फोरस की कमी' : 'Low Phosphorus', 
        body: isHindi 
          ? `फॉस्फोरस ${ns.phosphorus} kg/ha (कम) है। जड़ों के लिए SSP या DAP डालें।` 
          : `Phosphorus is low at ${ns.phosphorus} kg/ha. Apply SSP or DAP.`
      });
    }
    
    // 🟠 Potassium
    if (ns.potassium !== null && ns.potassium < 108) {
      list.push({ 
        id: 4, 
        icon: '🟠', 
        severity: 'warning',
        title: isHindi ? 'पोटैशियम की कमी' : 'Low Potassium', 
        body: isHindi 
          ? `पोटैशियम ${ns.potassium} kg/ha (कम) है। MOP खाद का छिड़काव करें।` 
          : `Potassium is low at ${ns.potassium} kg/ha. Apply MOP fertilizer.`
      });
    }
    
    // 🟠 Organic Carbon
    if (ns.organic_carbon !== null && ns.organic_carbon < 0.5) {
      list.push({ 
        id: 5, 
        icon: '🌱', 
        severity: 'warning',
        title: isHindi ? 'जैविक कार्बन की कमी' : 'Low Organic Carbon', 
        body: isHindi 
          ? `जैविक कार्बन ${ns.organic_carbon}% है। केंचुआ या हरी खाद डालें।` 
          : `Organic carbon is low (${ns.organic_carbon}%). Add Vermicompost.`
      });
    }
    
    // 🟡 Zinc
    if (ns.zinc !== null && ns.zinc < 0.6) {
      list.push({ 
        id: 6, 
        icon: '🟡', 
        severity: 'warning',
        title: isHindi ? 'जिंक की कमी' : 'Zinc Deficient', 
        body: isHindi 
          ? `जिंक ${ns.zinc} ppm है। जिंक सल्फेट @ 25 kg/ha का प्रयोग करें।` 
          : `Zinc is low (${ns.zinc} ppm). Apply Zinc Sulphate @ 25 kg/ha.`
      });
    }
    
    // ⚠️ pH Acidity
    if (ns.ph !== null && (ns.ph < 5.5 || ns.ph > 8.0)) {
      const isAcid = ns.ph < 5.5;
      list.push({ 
        id: 7, 
        icon: '⚠️', 
        severity: 'alert',
        title: isHindi 
          ? `pH स्तर ${isAcid ? 'अम्लीय' : 'क्षारीय'} है` 
          : `pH is ${isAcid ? 'Acidic' : 'Alkaline'}`, 
        body: isHindi 
          ? (isAcid ? `pH ${ns.ph} है। उदासीन करने के लिए कृषि चूना डालें।` : `pH ${ns.ph} है। सुधार के लिए जिप्सम का प्रयोग करें।`)
          : (isAcid ? `pH is ${ns.ph}. Apply Agricultural Lime.` : `pH is ${ns.ph}. Apply Gypsum.`)
      });
    }
    
    // 🌧️ Weather-Based Actionable Alert (Injected live!)
    if (weather && weather.weathercode !== undefined) {
      const code = weather.weathercode;
      const isRain = code >= 51 && code <= 82;
      if (isRain) {
        list.push({
          id: 10,
          icon: '🌧️',
          severity: 'info',
          title: isHindi ? 'मौसम सलाह: यूरिया छिड़काव' : 'Weather: Broadcast Urea',
          body: isHindi
            ? 'बारिश होने वाली है! यूरिया का छिड़काव अभी करें ताकि बेहतर अवशोषण हो सके।'
            : 'Rain is forecast! Broadcast Urea now to maximize root absorption.'
        });
      }
    }

    if (list.length === 0) {
      list.push({ 
        id: 8, 
        icon: '🎉', 
        severity: 'info',
        title: isHindi ? 'मिट्टी पूर्णतः स्वस्थ है!' : 'All Nutrients Healthy!', 
        body: isHindi 
          ? 'बधाई हो! आपकी मिट्टी उत्तम स्थिति में है।' 
          : 'Congratulations! Your soil is in excellent condition.'
      });
    }
    
    // 💡 Best Practices Tip
    list.push({ 
      id: 9, 
      icon: '💡', 
      severity: 'info',
      title: isHindi ? 'उर्वरक छिड़काव सलाह' : 'Fertilizer Application Tip', 
      body: isHindi 
        ? 'छिड़काव सुबह या शाम को करें जब मिट्टी में नमी का स्तर अच्छा हो।' 
        : 'Broadcast in early morning or late evening for best root absorption.'
    });

    return list;
  };

  const firstName = user?.name?.split(' ')[0] || t('home.greeting_default').replace('नमस्ते, ', '').replace('Hello, ', '');

  const hasScan = !!lastScan;
  const score = hasScan ? (lastScan.soil_health_score ?? 0) : 0;
  const scoreColor = getScoreColor(score, hasScan);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B4D3E" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Animated.View style={[styles.headerTop, { opacity: headerFade }]}>
            {/* Greeting row */}
            <View style={styles.greetingRow}>
              <View>
                <Text style={styles.farmerName}>{firstName}</Text>
              </View>
              {/* Settings Action with notification dot & weather */}
              <View style={styles.headerActions}>
                {/* Weather Capsule Badge */}
                <TouchableOpacity
                  style={styles.miniWeatherBadge}
                  onPress={() => navigation.navigate('WeatherForecast')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.miniWeatherText}>
                    {wmoWeather(weather?.weathercode ?? 0, weather?.temperature ?? 32).emoji}{' '}
                    <Text style={styles.weatherTempNumber}>{Math.round(weather?.temperature ?? 32)}</Text>
                    <Text style={styles.weatherTempDegree}>°C</Text>
                  </Text>
                </TouchableOpacity>
                {/* Unified profile settings button with built-in notification dot */}
                <TouchableOpacity style={styles.iconBtnRelative} onPress={() => setShowProfileModal(true)}>
                  <Text style={styles.iconBtnText}>⚙️</Text>
                  {notifBadge > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>{notifBadge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* ── SCORE CARD ───────────────────────────────────────────────── */}
            <View style={[styles.scoreCard, shadows.md]}>
              <Text style={styles.scoreCardTitle}>🌱 {t('advisory.score_label')}</Text>

              {loading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
              ) : (
                <View style={styles.scoreCardBody}>
                  {/* Compact score ring (90px) */}
                  <ScoreRing score={score} color={scoreColor} hasScan={hasScan} />

                  {/* Right side info */}
                  <View style={styles.scoreCardRight}>
                    {lastScan ? (
                      <>
                        <View style={[styles.scoreLabelBadge, { backgroundColor: scoreColor + '20' }]}>
                          <Text style={[styles.scoreLabelText, { color: scoreColor }]}>
                            {getScoreEmoji(score, hasScan)} {getScoreLabel(score, t, hasScan)}
                          </Text>
                        </View>

                        <Text style={styles.scanInfoText}>
                          🌾 Crop:{' '}
                          <Text style={styles.scanInfoBold}>
                            {lastScan.crop?.charAt(0).toUpperCase() + lastScan.crop?.slice(1)}
                          </Text>
                        </Text>
                        <Text style={styles.scanInfoText}>
                          📅 Scanned:{' '}
                          <Text style={styles.scanInfoBold}>
                            {formatDate(lastScan.scanned_at)}
                          </Text>
                        </Text>
                        <Text style={styles.scanInfoText}>
                          💰 Est. cost:{' '}
                          <Text style={styles.scanInfoBold}>
                            ₹{lastScan.total_cost?.toLocaleString('en-IN') || '—'}
                          </Text>
                        </Text>
                      </>
                    ) : (
                      <View style={styles.noScanInfo}>
                        <Text style={styles.noScanEmoji}>🌱</Text>
                        <Text style={styles.noScanText}>No soil data yet</Text>
                        <Text style={styles.noScanSub}>Scan your soil card to start.</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* pH bar & descriptive labels (only if scan exists) */}
              {lastScan?.ph && (
                <View style={styles.phRow}>
                  <View style={styles.phHeaderRow}>
                    <Text style={styles.phLabel}>pH Level</Text>
                    <Text style={styles.phValue}>{lastScan.ph}</Text>
                  </View>
                  <View style={styles.phBarBg}>
                    <View
                      style={[
                        styles.phBarFill,
                        {
                          width: `${Math.min((lastScan.ph / 14) * 100, 100)}%`,
                          backgroundColor:
                            lastScan.ph >= 6 && lastScan.ph <= 7.5
                              ? colors.statusGood
                              : lastScan.ph >= 5.5
                                ? colors.statusFair
                                : colors.statusPoor,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.phLegend}>
                    <Text style={[styles.phLegendText, lastScan.ph < 6 && styles.phLegendActive]}>Acidic (&lt;6.0)</Text>
                    <Text style={[styles.phLegendText, lastScan.ph >= 6 && lastScan.ph <= 7.5 && styles.phLegendActive]}>Neutral (6.0-7.5)</Text>
                    <Text style={[styles.phLegendText, lastScan.ph > 7.5 && styles.phLegendActive]}>Alkaline (&gt;7.5)</Text>
                  </View>
                </View>
              )}
            </View>
          </Animated.View>
        </View>

        {/* ── BODY CONTENT ───────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.body,
            { opacity: cardFade, transform: [{ translateY: cardSlide }] },
          ]}
        >


          {/* ── FARM & RECENT ACTIVITY SUMMARY CARD ───────────────────────── */}
          <View style={[styles.summaryCard, shadows.sm]}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>🌾 Your Farm Profile</Text>
              <View style={styles.activeIndicator} />
            </View>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>District</Text>
                <Text style={styles.summaryValue}>{user?.district || 'Raipur'}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Primary Crop</Text>
                <Text style={styles.summaryValue}>
                  {lastScan?.crop ? lastScan.crop.charAt(0).toUpperCase() + lastScan.crop.slice(1) : 'No scan yet'}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Last Activity</Text>
                <Text style={styles.summaryValue}>
                  {lastScan ? formatDate(lastScan.scanned_at) : 'No scans yet'}
                </Text>
              </View>
            </View>
          </View>

          {/* ── SMART SUGGESTION ALERT CARD (Dynamic) ───────────────────────── */}
          {lastScan && (lastScan.nitrogen < 140 || lastScan.phosphorus < 11 || lastScan.potassium < 108) && (
            <View style={styles.smartAlertCard}>
              <Text style={styles.smartAlertIcon}>⚠️</Text>
              <View style={styles.smartAlertContent}>
                <Text style={styles.smartAlertTitle}>Smart Advisory Warning</Text>
                <Text style={styles.smartAlertText}>
                  {lastScan.nitrogen < 140 && '• Nitrogen (N) deficiency detected: Apply Urea as recommended. '}
                  {lastScan.phosphorus < 11 && '• Phosphorus (P) deficiency detected: Add DAP/SSP. '}
                  {lastScan.potassium < 108 && '• Potassium (K) deficiency detected: Apply MOP.'}
                </Text>
              </View>
            </View>
          )}

          {/* ── NUTRIENT QUICK BADGES (if scan exists) ─────────────────── */}
          {lastScan && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('advisory.section_status')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroll}>
                <NutrientBadge label="Nitrogen (N)" value={lastScan.nitrogen} unit=" kg/ha" threshold={140} />
                <NutrientBadge label="Phosphorus (P)" value={lastScan.phosphorus} unit=" kg/ha" threshold={11} />
                <NutrientBadge label="Potassium (K)" value={lastScan.potassium} unit=" kg/ha" threshold={108} />
                <NutrientBadge label="Organic Carbon" value={lastScan.organic_carbon} unit="%" threshold={0.5} />
                {lastScan.zinc && <NutrientBadge label="Zinc (Zn)" value={lastScan.zinc} unit="" threshold={0.6} />}
                {lastScan.sulfur && <NutrientBadge label="Sulfur (S)" value={lastScan.sulfur} unit="" threshold={10} />}
              </ScrollView>
            </View>
          )}


          {/* ── PRIMARY ACTIONS — HIERARCHICAL CTAS ────────────────────────── */}
          <View style={styles.primaryActionsCol}>
            {/* OCR camera (Primary Action) */}
            <TouchableOpacity
              style={[styles.primaryScanBtn, shadows.md]}
              onPress={() => navigation.navigate('OCR')}
              activeOpacity={0.88}
            >
              <Text style={styles.scanBtnEmoji}>📷</Text>
              <View style={styles.primaryScanBtnTextCol}>
                <Text style={styles.primaryScanBtnTitle}>{t('home.scan_card')}</Text>
                <Text style={styles.primaryScanBtnSub}>{t('home.scan_card_sub')}</Text>
              </View>
              <View style={styles.softGoldBadge}>
                <Text style={styles.softGoldBadgeText}>RECOMMENDED</Text>
              </View>
            </TouchableOpacity>

            {/* Manual entry (Secondary Action) */}
            <TouchableOpacity
              style={[styles.secondaryScanBtn, shadows.sm]}
              onPress={() => navigation.navigate('SoilInput')}
              activeOpacity={0.88}
            >
              <Text style={styles.scanBtnEmoji}>🔬</Text>
              <View style={styles.primaryScanBtnTextCol}>
                <Text style={styles.secondaryScanBtnTitle}>
                  {lastScan ? 'New Soil Entry' : t('home.enter_manual')}
                </Text>
                <Text style={styles.secondaryScanBtnSub}>{t('home.enter_manual_sub')}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* ── SECONDARY ACTIONS GRID ───────────────────────────────────── */}
          <View style={styles.actionsRow}>
            {/* View Last Report */}
            <TouchableOpacity
              style={[styles.actionCard, !lastScan && styles.actionCardDisabled, shadows.sm]}
              onPress={() =>
                lastScan
                  ? navigation.navigate('SoilHistory')
                  : null
              }
              activeOpacity={lastScan ? 0.85 : 1}
            >
              <Text style={styles.actionEmoji}>📋</Text>
              <Text style={styles.actionTitle}>View Advisory</Text>
              <Text style={styles.actionSub}>
                {lastScan ? `Health Score: ${score}/100` : 'No reports yet'}
              </Text>
            </TouchableOpacity>

            {/* Crop Calendar */}
            <TouchableOpacity
              style={[styles.actionCard, !lastScan && styles.actionCardDisabled, shadows.sm]}
              onPress={() =>
                lastScan
                  ? navigation.navigate('CropCalendar', { scan_id: lastScan.id })
                  : null
              }
              activeOpacity={lastScan ? 0.85 : 1}
            >
              <Text style={styles.actionEmoji}>📅</Text>
              <Text style={styles.actionTitle}>{t('home.crop_calendar')}</Text>
              <Text style={styles.actionSub}>
                {lastScan?.crop
                  ? `${lastScan.crop.charAt(0).toUpperCase() + lastScan.crop.slice(1)} Schedule`
                  : 'No active schedule'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── VOICE ASSISTANT ACCESSIBILITY CARD ──────────────────────────── */}
          {lastScan && (
            <TouchableOpacity 
              style={[styles.voiceAssistantCard, shadows.sm]} 
              onPress={() => setPlayingVoice(true)}
              activeOpacity={0.85}
            >
              <View style={styles.voiceAssistantLeft}>
                <Text style={styles.voiceAssistantIcon}>🔊</Text>
                <View>
                  <Text style={styles.voiceAssistantTitle}>सुनें (Listen to Advisory)</Text>
                  <Text style={styles.voiceAssistantSub}>Hear complete soil recommendations in local voice</Text>
                </View>
              </View>
              <View style={styles.listenPill}>
                <Text style={styles.listenPillText}>PLAY AUDIO</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* ── AGRI SERVICES GRID ─────────────────────────────────────────── */}
          <View style={{ marginTop: spacing.lg, marginBottom: spacing.xs }}>
            <Text style={styles.sectionTitle}>
              {isHindi ? 'कृषि सेवाएं और सहायता' : 'Agri Services & Portal'}
            </Text>
          </View>
          
          <View style={styles.actionsRow}>
            {/* Agri Helpline */}
            <TouchableOpacity
              style={[styles.actionCard, shadows.sm]}
              onPress={() => navigation.navigate('AgriServices', { tab: 'helpline' })}
              activeOpacity={0.85}
            >
              <Text style={styles.actionEmoji}>📞</Text>
              <Text style={styles.actionTitle}>{isHindi ? 'कृषि विशेषज्ञ' : 'Agri Helpline'}</Text>
              <Text style={styles.actionSub}>
                {isHindi ? 'सलाहकार संपर्क' : 'Call or Chat Expert'}
              </Text>
            </TouchableOpacity>

            {/* Seed & Fertilizer Rates */}
            <TouchableOpacity
              style={[styles.actionCard, shadows.sm]}
              onPress={() => navigation.navigate('AgriServices', { tab: 'rates' })}
              activeOpacity={0.85}
            >
              <Text style={styles.actionEmoji}>💰</Text>
              <Text style={styles.actionTitle}>{isHindi ? 'खाद-बीज दरें' : 'Market Rates'}</Text>
              <Text style={styles.actionSub}>
                {isHindi ? 'छत्तीसगढ़ सरकारी दरें' : 'Fertilizer & Seeds'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── BRAND-CONSISTENT TIP CARD ──────────────────────────────────── */}
          <View style={[styles.tipCard, { marginTop: spacing.lg, marginBottom: spacing.md }]}>
            <Text style={styles.tipIcon}>💡</Text>
            <View style={styles.tipTextBlock}>
              <Text style={styles.tipTitle}>MittiCard Pro Tip</Text>
              <Text style={styles.tipBody}>
                Soil with pH between 6.0–7.5 gives the best crop yield. Test your soil every season for best results.
              </Text>
            </View>
          </View>

          {/* ── ERROR STATE ──────────────────────────────────────────────── */}
          {error && (
            <Text style={styles.errorText}>⚠️ {error}</Text>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── STICKY FLOATING ACTION BUTTON (FAB) ─────────────────────────── */}
      <TouchableOpacity 
        style={[styles.fabButton, shadows.lg]} 
        onPress={() => navigation.navigate('OCR')}
        activeOpacity={0.9}
      >
        <Text style={styles.fabIcon}>📷</Text>
      </TouchableOpacity>

      {/* ── PROFILE & SETTINGS MODAL ────────────────────────────────────── */}
      <Modal
        visible={showProfileModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={styles.notifOverlay}>
          {/* Background overlay click-catcher to dismiss modal */}
          <TouchableWithoutFeedback onPress={() => setShowProfileModal(false)}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>

          <View style={styles.notifSheet}>
            {/* Header */}
            <View style={styles.notifSheetHeader}>
              <Text style={styles.notifSheetTitle}>⚙️ {isHindi ? 'खाता सेटिंग्स' : 'Account Settings'}</Text>
              <TouchableOpacity onPress={() => setShowProfileModal(false)} style={styles.closeBtnCircle}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Profile Content */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.profileSheetContent}>
              {/* User Avatar & Name Card */}
              <View style={styles.profileCardHeader}>
                <View style={styles.profileAvatarLarge}>
                  <Text style={styles.profileAvatarText}>
                    {(user?.name || 'F').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.profileNameText}>{user?.name || 'Farmer'}</Text>
                  <Text style={styles.profileRoleText}>🌾 {isHindi ? 'खाता: किसान' : 'Account: Farmer'}</Text>
                </View>
              </View>

              {/* Profile Details Card - Unified List Layout */}
              <View style={styles.profileDetailsCard}>
                <View style={styles.profileDetailRow}>
                  <View style={styles.profileDetailLabelCol}>
                    <Text style={styles.profileDetailRowIcon}>📞</Text>
                    <Text style={styles.profileDetailRowLabel}>{isHindi ? 'फ़ोन नंबर' : 'Phone Number'}</Text>
                  </View>
                  <Text style={styles.profileDetailRowValue}>+91 {user?.phone || 'XXXXXXXXXX'}</Text>
                </View>

                {user?.village ? (
                  <View style={styles.profileDetailRow}>
                    <View style={styles.profileDetailLabelCol}>
                      <Text style={styles.profileDetailRowIcon}>🏠</Text>
                      <Text style={styles.profileDetailRowLabel}>{isHindi ? 'ग्राम / ब्लॉक' : 'Village / Block'}</Text>
                    </View>
                    <Text style={styles.profileDetailRowValue}>{user.village}</Text>
                  </View>
                ) : null}

                <View style={styles.profileDetailRow}>
                  <View style={styles.profileDetailLabelCol}>
                    <Text style={styles.profileDetailRowIcon}>📍</Text>
                    <Text style={styles.profileDetailRowLabel}>{isHindi ? 'स्थान / जिला' : 'Location / District'}</Text>
                  </View>
                  <Text style={styles.profileDetailRowValue}>{user?.district || 'Raipur'}, {user?.state || 'Chhattisgarh'}</Text>
                </View>

                {user?.farm_size ? (
                  <View style={styles.profileDetailRow}>
                    <View style={styles.profileDetailLabelCol}>
                      <Text style={styles.profileDetailRowIcon}>📏</Text>
                      <Text style={styles.profileDetailRowLabel}>{isHindi ? 'खेत का आकार' : 'Farm Size'}</Text>
                    </View>
                    <Text style={styles.profileDetailRowValue}>{user.farm_size} {isHindi ? 'एकड़' : 'Acres'}</Text>
                  </View>
                ) : null}

                {user?.primary_crop ? (
                  <View style={styles.profileDetailRow}>
                    <View style={styles.profileDetailLabelCol}>
                      <Text style={styles.profileDetailRowIcon}>🌱</Text>
                      <Text style={styles.profileDetailRowLabel}>{isHindi ? 'प्राथमिक फसल' : 'Primary Crop'}</Text>
                    </View>
                    <Text style={styles.profileDetailRowValue}>
                      {isHindi 
                        ? (CROPS.find(c => c.id === user.primary_crop)?.hi || user.primary_crop) 
                        : (CROPS.find(c => c.id === user.primary_crop)?.en || user.primary_crop)}
                    </Text>
                  </View>
                ) : null}

                {user?.soil_type ? (
                  <View style={styles.profileDetailRow}>
                    <View style={styles.profileDetailLabelCol}>
                      <Text style={styles.profileDetailRowIcon}>🏜️</Text>
                      <Text style={styles.profileDetailRowLabel}>{isHindi ? 'मिट्टी का प्रकार' : 'Soil Type'}</Text>
                    </View>
                    <Text style={styles.profileDetailRowValue}>
                      {isHindi 
                        ? (SOILS.find(s => s.id === user.soil_type)?.hi || user.soil_type) 
                        : (SOILS.find(s => s.id === user.soil_type)?.en || user.soil_type)}
                    </Text>
                  </View>
                ) : null}

                {user?.farming_experience ? (
                  <View style={styles.profileDetailRow}>
                    <View style={styles.profileDetailLabelCol}>
                      <Text style={styles.profileDetailRowIcon}>⏳</Text>
                      <Text style={styles.profileDetailRowLabel}>{isHindi ? 'खेती का अनुभव' : 'Farming Experience'}</Text>
                    </View>
                    <Text style={styles.profileDetailRowValue}>
                      {isHindi ? user.farming_experience.replace('Years', 'वर्ष') : user.farming_experience}
                    </Text>
                  </View>
                ) : null}

                {user?.water_source ? (
                  <View style={styles.profileDetailRow}>
                    <View style={styles.profileDetailLabelCol}>
                      <Text style={styles.profileDetailRowIcon}>🚰</Text>
                      <Text style={styles.profileDetailRowLabel}>{isHindi ? 'सिंचाई का साधन' : 'Irrigation Source'}</Text>
                    </View>
                    <Text style={styles.profileDetailRowValue}>
                      {user.water_source === 'Borewell' ? (isHindi ? 'बोरवेल 🚰' : 'Borewell 🚰') :
                       user.water_source === 'Canal' ? (isHindi ? 'नहर 🌊' : 'Canal 🌊') :
                       user.water_source === 'Rainfed' ? (isHindi ? 'वर्षा-आधारित 🌧️' : 'Rainfed 🌧️') : (isHindi ? 'ड्रिप सिंचाई 💧' : 'Drip 💧')}
                    </Text>
                  </View>
                ) : null}

                {user?.farming_type ? (
                  <View style={styles.profileDetailRow}>
                    <View style={styles.profileDetailLabelCol}>
                      <Text style={styles.profileDetailRowIcon}>🍀</Text>
                      <Text style={styles.profileDetailRowLabel}>{isHindi ? 'खेती की पद्धति' : 'Farming Method'}</Text>
                    </View>
                    <Text style={styles.profileDetailRowValue}>
                      {user.farming_type === 'Organic' ? (isHindi ? 'जैविक 🍀' : 'Organic 🍀') :
                       user.farming_type === 'Conventional' ? (isHindi ? 'रासायनिक 🧪' : 'Conventional 🧪') : (isHindi ? 'प्राकृतिक 🌸' : 'Natural 🌸')}
                    </Text>
                  </View>
                ) : null}

                <View style={[styles.profileDetailRow, { borderBottomWidth: 0 }]}>
                  <View style={styles.profileDetailLabelCol}>
                    <Text style={styles.profileDetailRowIcon}>📅</Text>
                    <Text style={styles.profileDetailRowLabel}>{isHindi ? 'अंतिम सक्रियता' : 'Last Active'}</Text>
                  </View>
                  <Text style={styles.profileDetailRowValue}>
                    {lastScan ? formatDate(lastScan.scanned_at) : (isHindi ? 'कोई स्कैन नहीं' : 'No scans yet')}
                  </Text>
                </View>
              </View>

              {/* INTEGRATED SOIL ALERTS SECTION */}
              <View style={styles.alertSectionHeader}>
                <Text style={styles.alertSectionTitle}>🔔 {isHindi ? 'मिट्टी स्वास्थ्य एवं बुवाई चेतावनी' : 'Soil Health & Sowing Alerts'}</Text>
                {notifBadge > 0 && (
                  <View style={styles.alertSectionCountPill}>
                    <Text style={styles.alertSectionCountText}>{notifBadge} alerts</Text>
                  </View>
                )}
              </View>

              <View style={styles.alertsListContainer}>
                {buildNotifications().length > 0 ? (
                  buildNotifications().map(n => {
                    const cardStyle = getNotifCardStyle(n.severity);
                    const titleColor = getSeverityTextColor(n.severity);
                    return (
                      <View key={n.id} style={[styles.notifCardItemCompact, cardStyle]}>
                        <Text style={styles.notifCardIconCompact}>{n.icon}</Text>
                        <View style={styles.notifCardBody}>
                          <Text style={[styles.notifCardTitleCompact, { color: titleColor }]}>{n.title}</Text>
                          <Text style={styles.notifCardTextCompact}>{n.body}</Text>
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <View style={styles.emptyAlertsCard}>
                    <Text style={styles.emptyAlertsIcon}>✅</Text>
                    <Text style={styles.emptyAlertsText}>
                      {isHindi ? 'सभी मिट्टी पैरामीटर सही सीमा में हैं।' : 'All soil nutrients are in perfect range!'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.profileSheetActions}>
                <TouchableOpacity
                  style={[styles.profileActionBtn, styles.profileEditBtn]}
                  onPress={() => {
                    setShowProfileModal(false);
                    navigation.navigate('Profile', { user, language: i18n.language });
                  }}
                >
                  <Text style={styles.profileEditBtnText}>✏️ {isHindi ? 'जानकारी बदलें' : 'Edit Profile'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.profileActionBtn, styles.profileLogoutBtn]}
                  onPress={() => {
                    setShowProfileModal(false);
                    handleLogout();
                  }}
                >
                  <Text style={styles.profileLogoutBtnText}>↩️ {isHindi ? 'लॉगआउट' : 'Logout'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── VOICE ASSISTANT MODAL (MOCK) ────────────────────────────── */}
      <Modal
        visible={playingVoice}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPlayingVoice(false)}
      >
        <View style={styles.voiceOverlay}>
          {/* Background overlay click-catcher to dismiss modal */}
          <TouchableWithoutFeedback onPress={() => setPlayingVoice(false)}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>

          <View style={[styles.voiceCard, shadows.lg]}>
            <Text style={styles.voiceCardTitle}>🎙️ MittiCard Voice Assistant</Text>
            <Text style={styles.voiceCardSubtitle}>Reading out your Soil Health Advisory...</Text>
            
            {/* Pulse wave bars */}
            <View style={styles.waveformContainer}>
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim1 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim2 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim3 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim4 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim5 }] }]} />
            </View>

            <Text style={styles.voicePlayingText}>
              "Your Soil Health Score is {score}/100. Nitrogen is low at {lastScan?.nitrogen} kg/ha. We recommend applying Urea..."
            </Text>

            <TouchableOpacity style={styles.voiceCloseBtn} onPress={() => setPlayingVoice(false)}>
              <Text style={styles.voiceCloseText}>Stop Listening</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F5', // Premium off-white/minty background
  },

  // Header (Slightly shorter & cleaner)
  header: {
    backgroundColor: '#1B4D3E', // Slate Forest Green
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  headerTop: {
    gap: spacing.md,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  greetingText: {
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: fontWeights.medium,
  },
  farmerName: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.extrabold,
    color: '#FFFFFF',
    marginTop: 1,
  },
  farmerPhone: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  miniWeatherBadge: {
    backgroundColor: 'transparent',
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniWeatherText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extrabold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(255, 255, 255, 0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnRelative: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnText: {
    fontSize: 22,
  },
  notifBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },

  // Score Card inside header
  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  scoreCardTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scoreCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },

  // Compact Score Ring
  scoreRingOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: fontWeights.extrabold,
    lineHeight: 28,
  },
  scoreOutOf: {
    fontSize: 9,
    fontWeight: fontWeights.semibold,
  },

  // Score right panel
  scoreCardRight: {
    flex: 1,
    gap: spacing.xs,
  },
  scoreLabelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: 100,
    marginBottom: spacing.xs,
  },
  scoreLabelText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  scanInfoText: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
  },
  scanInfoBold: {
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  noScanInfo: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
  },
  noScanEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  noScanText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#475569',
  },
  noScanSub: {
    fontSize: fontSizes.xs,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },

  // pH bar
  phRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  phHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  phLabel: {
    fontSize: 11,
    fontWeight: fontWeights.semibold,
    color: '#64748B',
  },
  phValue: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#1E293B',
  },
  phBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  phBarFill: {
    height: 6,
    borderRadius: 3,
  },
  phLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  phLegendText: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: fontWeights.medium,
  },
  phLegendActive: {
    color: '#1E293B',
    fontWeight: fontWeights.bold,
  },

  // Body
  body: {
    marginTop: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },



  // Compact Agricultural Sowing Advisory Card
  compactSowingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 5,
  },
  sowingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sowingTag: {
    fontSize: 10,
    fontWeight: fontWeights.extrabold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sowingLocText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#64748B',
  },
  sowingText: {
    fontSize: fontSizes.xs,
    color: '#334155',
    lineHeight: 18,
    fontWeight: fontWeights.medium,
  },

  // Summary Card
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#334155',
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },

  // Profile Sheet Styles
  profileSheetContent: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  profileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  profileAvatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1B4D3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  profileNameText: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extrabold,
    color: '#1E293B',
  },
  profileRoleText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    color: '#16A34A',
    marginTop: 2,
  },
  profileDetailsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  profileDetailLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileDetailRowIcon: {
    fontSize: 16,
  },
  profileDetailRowLabel: {
    fontSize: 13,
    fontWeight: fontWeights.semibold,
    color: '#64748B',
  },
  profileDetailRowValue: {
    fontSize: 13,
    fontWeight: fontWeights.bold,
    color: '#0F172A',
    textAlign: 'right',
  },
  profileSheetActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  profileActionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  profileEditBtn: {
    backgroundColor: '#1F6E43',
    borderColor: '#1F6E43',
    shadowColor: '#1F6E43',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  profileEditBtnText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  profileLogoutBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  profileLogoutBtnText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#EF4444',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 9,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#1E293B',
  },

  // Smart Alert Card
  smartAlertCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 14,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  smartAlertIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  smartAlertContent: {
    flex: 1,
  },
  smartAlertTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#991B1B',
    marginBottom: 2,
  },
  smartAlertText: {
    fontSize: fontSizes.xs,
    color: '#B91C1C',
    lineHeight: 16,
  },

  // Section
  section: {
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: fontWeights.bold,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  badgeScroll: {
    flexDirection: 'row',
  },

  // Nutrient Badge (Refined Size & Palette)
  nutrientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    marginRight: spacing.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  nutrientLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  nutrientValue: {
    fontSize: 10,
    fontWeight: fontWeights.regular,
  },
  nutrientTagBox: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  nutrientTag: {
    fontSize: 8,
    fontWeight: fontWeights.extrabold,
    letterSpacing: 0.5,
  },

  // Hierarchical CTA Buttons
  primaryActionsCol: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  primaryScanBtn: {
    backgroundColor: '#1F6E43', // MittiCard primary dark green
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    gap: spacing.md,
  },
  primaryScanBtnTextCol: {
    flex: 1,
  },
  primaryScanBtnTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#FFFFFF',
  },
  primaryScanBtnSub: {
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  softGoldBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  softGoldBadgeText: {
    fontSize: 8,
    fontWeight: fontWeights.extrabold,
    color: '#92400E',
    letterSpacing: 0.5,
  },
  secondaryScanBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  secondaryScanBtnTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#334155',
  },
  secondaryScanBtnSub: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    marginTop: 2,
  },
  scanBtnEmoji: {
    fontSize: 24,
  },

  // Actions Grid (Second level)
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  actionCardDisabled: {
    opacity: 0.5,
  },
  actionEmoji: {
    fontSize: 24,
  },
  actionTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#334155',
  },
  actionSub: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
  },

  // Voice Assistant Card
  voiceAssistantCard: {
    backgroundColor: '#F8FAF9',
    borderWidth: 1.5,
    borderColor: '#DCFCE7',
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  voiceAssistantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  voiceAssistantIcon: {
    fontSize: 24,
  },
  voiceAssistantTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#1B4D3E',
  },
  voiceAssistantSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  listenPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  listenPillText: {
    fontSize: 9,
    fontWeight: fontWeights.extrabold,
    color: '#15803D',
  },

  // Tip Card (Leaf Green Palette)
  tipCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
  },
  tipIcon: {
    fontSize: 20,
  },
  tipTextBlock: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: '#166534',
  },
  tipBody: {
    fontSize: fontSizes.xs,
    color: '#15803D',
    lineHeight: 18,
  },

  // Sticky FAB Button
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#1F6E43',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  fabIcon: {
    fontSize: 24,
    color: '#FFFFFF',
  },

  // Notification Modal (Centered Premium Card Dialog)
  notifOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  notifSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxHeight: '85%',
    paddingBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  notifSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  notifSheetTitle: {
    fontSize: 16,
    fontWeight: fontWeights.bold,
    color: '#0F172A',
  },
  closeBtnCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  notifCountPill: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  notifCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  notifScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  notifCardItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  notifCardIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  notifCardBody: {
    flex: 1,
  },
  notifCardTitle: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: '#334155',
    marginBottom: 2,
  },
  notifCardText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  notifListFooter: {
    height: 40,
  },

  // Voice Assistant simulation
  voiceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  voiceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  voiceCardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: '#1B4D3E',
    marginBottom: 4,
  },
  voiceCardSubtitle: {
    fontSize: fontSizes.xs,
    color: '#64748B',
    marginBottom: 20,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 60,
    marginBottom: 20,
  },
  waveBar: {
    width: 4,
    height: 12,
    backgroundColor: '#16A34A',
    borderRadius: 2,
  },
  voicePlayingText: {
    fontSize: fontSizes.xs,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 20,
    fontStyle: 'italic',
    marginBottom: 24,
    backgroundColor: '#F8FAF9',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  voiceCloseBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 100,
  },
  voiceCloseText: {
    color: '#FFFFFF',
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.xs,
  },

  // Error
  errorText: {
    textAlign: 'center',
    fontSize: fontSizes.xs,
    color: colors.statusPoor,
  },

  // Integrated compact alerts section styles
  alertSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1.5,
    borderTopColor: '#F1F5F9',
    marginBottom: spacing.xs,
  },
  alertSectionTitle: {
    fontSize: 10,
    fontWeight: fontWeights.extrabold,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  alertSectionCountPill: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  alertSectionCountText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
  },
  alertsListContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  notifCardItemCompact: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'flex-start',
    gap: 8,
  },
  notifCardIconCompact: {
    fontSize: 14,
    marginTop: 1,
  },
  notifCardTitleCompact: {
    fontSize: 10,
    fontWeight: fontWeights.extrabold,
    marginBottom: 2,
  },
  notifCardTextCompact: {
    fontSize: 9,
    color: '#64748B',
    lineHeight: 13,
  },
  emptyAlertsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  emptyAlertsIcon: {
    fontSize: 14,
  },
  emptyAlertsText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: fontWeights.bold,
  },
  weatherTempNumber: {
    fontSize: 20,
    fontWeight: fontWeights.extrabold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(255, 255, 255, 0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  weatherTempDegree: {
    fontSize: 16,
    fontWeight: fontWeights.bold,
    color: 'rgba(255, 255, 255, 0.75)',
    textShadowColor: 'rgba(255, 255, 255, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
});
