import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import Tts from 'react-native-tts';
import i18n from '../i18n';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import { getAdvisory } from '../services/api';
import { getUser, getLastScanId, clearStorage } from '../services/storage';
import { setAuthToken } from '../services/api';
import { useTranslation } from 'react-i18next';

// ─── Score helpers ────────────────────────────────────────────────────────────
const getScoreColor = score => {
  if (score <= 0) return '#94A3B8'; // Neutral slate gray for empty state
  if (score >= 71) return colors.statusGood;
  if (score >= 41) return colors.statusFair;
  return colors.statusPoor;
};

const getScoreLabel = (score, t) => {
  if (score >= 71) return t('advisory.score_good');
  if (score >= 41) return t('advisory.score_fair');
  if (score >= 1) return t('advisory.score_poor');
  return '—';
};

const getScoreEmoji = score => {
  if (score >= 71) return '🟢';
  if (score >= 41) return '🟡';
  if (score >= 1) return '🔴';
  return '🌱';
};

const formatDate = dateStr => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ─── Animated Score Ring ──────────────────────────────────────────────────────
function ScoreRing({ score, color }) {
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
          {score > 0 ? score : '—'}
        </Text>
        {score > 0 && <Text style={[styles.scoreOutOf, { color }]}>/100</Text>}
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
  const [weatherLoad, setWeatherLoad] = useState(false);

  // ── Notification panel state ───────────────────────────────────────────────
  const [showNotif, setShowNotif] = useState(false);
  const [notifBadge, setNotifBadge] = useState(0);

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

  // ─── Load user + last scan on mount ────────────────────────────────────────
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // Get user from storage if not in route params
      if (!user) {
        const storedUser = await getUser();
        if (storedUser) setUser(storedUser);
      }

      // Get last scan ID → fetch advisory
      const scanId = await getLastScanId();
      if (scanId) {
        const response = await getAdvisory(scanId);
        if (response.data.success) {
          setLastScan(response.data.data);
        }
      }
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
  }, [user]);

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

  // ─── Fetch weather using IP-based location (no GPS permission needed) ────────
  useEffect(() => {
    const fetchWeather = async () => {
      setWeatherLoad(true);
      try {
        // Step 1: Get lat/lon from IP address (free, no key, no permission)
        const locRes = await fetch('https://ip-api.com/json/');
        const locData = await locRes.json();
        if (!locData.lat) throw new Error('Location unavailable');

        // Step 2: Fetch weather from Open-Meteo (free, no key)
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${locData.lat.toFixed(2)}&longitude=${locData.lon.toFixed(2)}&current_weather=true&timezone=Asia%2FKolkata`;
        const wRes = await fetch(url);
        const wData = await wRes.json();
        if (wData.current_weather) setWeather(wData.current_weather);
      } catch { /* fail silently — weather is optional */ }
      setWeatherLoad(false);
    };
    fetchWeather();
  }, []);

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

  // ─── WMO weather code → emoji + description ──────────────────────────────
  const wmoWeather = (code, temp) => {
    if (code === 0) return { emoji: '☀️', desc: 'Clear sky' };
    if (code <= 2) return { emoji: '⛅', desc: 'Partly cloudy' };
    if (code === 3) return { emoji: '☁️', desc: 'Overcast' };
    if (code <= 48) return { emoji: '🌫️', desc: 'Foggy' };
    if (code <= 67) return { emoji: '🌧️', desc: 'Rainy' };
    if (code <= 77) return { emoji: '❄️', desc: 'Snowy' };
    if (code <= 82) return { emoji: '🌦️', desc: 'Rain showers' };
    if (code <= 99) return { emoji: '⛈️', desc: 'Thunderstorm' };
    return { emoji: temp > 35 ? '🌡️' : '🌤️', desc: 'Variable' };
  };

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
    const isHindi = i18n.language === 'hi';
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
        title: isHindi ? 'यूरिया (नाइट्रोजन) की गंभीर कमी' : 'Critical Nitrogen Deficit', 
        body: isHindi 
          ? `आपका नाइट्रोजन स्तर ${ns.nitrogen} kg/ha है। आदर्श: ≥140. पत्तों के समुचित विकास के लिए तत्काल यूरिया या जैविक कम्पोस्ट डालें।` 
          : `Your Nitrogen is critically low at ${ns.nitrogen} kg/ha (Ideal: ≥140). Apply Urea or Neem Cake compost immediately.`
      });
    }
    
    // 🔴 Phosphorus
    if (ns.phosphorus !== null && ns.phosphorus < 11) {
      list.push({ 
        id: 3, 
        icon: '🔴', 
        severity: 'critical',
        title: isHindi ? 'फॉस्फोरस (DAP) की कमी' : 'Phosphorus is LOW', 
        body: isHindi 
          ? `फॉस्फोरस स्तर ${ns.phosphorus} kg/ha है (आदर्श: ≥11)। मजबूत जड़ों के विकास के लिए SSP या DAP का उपयोग करें।` 
          : `Your Phosphorus is ${ns.phosphorus} kg/ha. Apply Single Super Phosphate (SSP) or DAP to enhance root strength.`
      });
    }
    
    // 🟠 Potassium
    if (ns.potassium !== null && ns.potassium < 108) {
      list.push({ 
        id: 4, 
        icon: '🟠', 
        severity: 'warning',
        title: isHindi ? 'पोटैशियम (MOP) की कमी' : 'Potassium is LOW', 
        body: isHindi 
          ? `पोटैशियम स्तर ${ns.potassium} kg/ha है। फसलों को रोगों से बचाने और फल की गुणवत्ता के लिए MOP खाद डालें।` 
          : `Your Potassium is ${ns.potassium} kg/ha. Apply Muriate of Potash (MOP) to boost disease resistance.`
      });
    }
    
    // 🟠 Organic Carbon
    if (ns.organic_carbon !== null && ns.organic_carbon < 0.5) {
      list.push({ 
        id: 5, 
        icon: '🌱', 
        severity: 'warning',
        title: isHindi ? 'जैविक कार्बन स्तर कम है' : 'Organic Carbon LOW', 
        body: isHindi 
          ? `मृदा में जैविक कार्बन कम है। केंचुआ खाद या हरी खाद डालकर मिट्टी की उर्वरा शक्ति को बहाल करें।` 
          : `Soil carbon is low. Add Vermicompost or green manure to restore long-term microbial health.`
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
          ? `जिंक का स्तर कम है। फसल की वृद्धि और अनाज उत्पादन बढ़ाने के लिए जिंक सल्फेट @ 25 kg/ha डालें।` 
          : `Your Zinc level is deficient. Apply Zinc Sulphate @ 25 kg/ha to enhance grain yield.`
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
          ? `मिट्टी ${isAcid ? 'अत्यधिक अम्लीय (Acidic)' : 'अत्यधिक क्षारीय (Alkaline)'}` 
          : `pH is ${isAcid ? 'too Acidic' : 'too Alkaline'}`, 
        body: isHindi 
          ? (isAcid ? `pH ${ns.ph} है। अम्लता को उदासीन करने के लिए कृषि चूना (Agricultural Lime) डालें।` : `pH ${ns.ph} है। क्षारीयता को ठीक करने के लिए जिप्सम (Gypsum) डालें।`)
          : (isAcid ? `pH is ${ns.ph}. Apply Agricultural Lime to neutralize acidity.` : `pH is ${ns.ph}. Apply Gypsum to correct alkalinity.`)
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
          title: isHindi ? 'मौसम सलाह: यूरिया छिड़काव का सही समय' : 'Weather Alert: Broadcast Urea Now',
          body: isHindi
            ? 'अगले कुछ घंटों में बारिश की संभावना है। नाइट्रोजन के बेहतर अवशोषण के लिए यूरिया का छिड़काव अभी करें!'
            : 'Rain is forecast in your area. Broadcast Nitrogen/Urea now to maximize rain-driven root absorption!'
        });
      }
    }

    if (list.length === 0) {
      list.push({ 
        id: 8, 
        icon: '🎉', 
        severity: 'info',
        title: isHindi ? 'आपकी मिट्टी पूर्णतः स्वस्थ है!' : 'All Nutrients Healthy!', 
        body: isHindi 
          ? 'बधाई हो! आपकी मिट्टी उत्तम स्थिति में है। हर मौसम में इसी तरह जांच करते रहें।' 
          : 'Congratulations! Your soil is in excellent condition. Keep scanning every crop season.'
      });
    }
    
    // 💡 Best Practices Tip
    list.push({ 
      id: 9, 
      icon: '💡', 
      severity: 'info',
      title: isHindi ? 'उर्वरक उपयोग सलाह' : 'Fertilizer Application Tip', 
      body: isHindi 
        ? 'उर्वरकों का छिड़काव सुबह जल्दी या शाम को ढलने के बाद ही करें जब मिट्टी में नमी का स्तर सबसे अच्छा हो।' 
        : 'Broadcast fertilizers in early morning or late evening when soil moisture is high to prevent volatilization loss.'
    });

    return list;
  };

  // ─── Greeting based on time ─────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greetEmoji = hour < 12 ? '☀️' : hour < 17 ? '🌤️' : '🌙';
  const firstName = user?.name?.split(' ')[0] || t('home.greeting_default').replace('नमस्ते, ', '').replace('Hello, ', '');
  const greeting = t('home.greeting', { name: firstName });

  const score = lastScan?.soil_health_score || 0;
  const scoreColor = getScoreColor(score);

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
                <Text style={styles.greetingText}>{greetEmoji} {greeting}</Text>
                <Text style={styles.farmerName}>{firstName}</Text>
                {user?.phone && (
                  <Text style={styles.farmerPhone}>+91 {user.phone}</Text>
                )}
              </View>
              {/* Notification bell + logout */}
              <View style={styles.headerActions}>
                {/* Bell with badge */}
                <TouchableOpacity style={styles.iconBtnRelative} onPress={() => setShowNotif(true)}>
                  <Text style={styles.iconBtnText}>🔔</Text>
                  {notifBadge > 0 && (
                    <View style={styles.notifBadge}>
                      <Text style={styles.notifBadgeText}>{notifBadge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={handleLogout}>
                  <Text style={styles.iconBtnText}>↩️</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── SCORE CARD ───────────────────────────────────────────────── */}
            <View style={[styles.scoreCard, shadows.md]}>
              <Text style={styles.scoreCardTitle}>🌿 {t('advisory.score_label')}</Text>

              {loading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
              ) : (
                <View style={styles.scoreCardBody}>
                  {/* Compact score ring (90px) */}
                  <ScoreRing score={score} color={scoreColor} />

                  {/* Right side info */}
                  <View style={styles.scoreCardRight}>
                    {lastScan ? (
                      <>
                        <View style={[styles.scoreLabelBadge, { backgroundColor: scoreColor + '20' }]}>
                          <Text style={[styles.scoreLabelText, { color: scoreColor }]}>
                            {getScoreEmoji(score)} {getScoreLabel(score, t)}
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
          {/* ── STANDALONE WEATHER CARD ──────────────────────────────────── */}
          {(weather || weatherLoad) && (
            <View style={[styles.weatherCard, shadows.sm]}>
              {weatherLoad ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : weather ? (
                <View style={styles.weatherCardContent}>
                  <View style={styles.weatherLeft}>
                    <Text style={styles.weatherEmoji}>{wmoWeather(weather.weathercode, weather.temperature).emoji}</Text>
                    <View>
                      <Text style={styles.weatherTemp}>{Math.round(weather.temperature)}°C</Text>
                      <Text style={styles.weatherDesc}>{wmoWeather(weather.weathercode, weather.temperature).desc}</Text>
                    </View>
                  </View>
                  <View style={styles.weatherRight}>
                    <Text style={styles.weatherWind}>💨 {weather.windspeed} km/h</Text>
                    <Text style={styles.weatherTip}>
                      {weather.temperature > 35 ? '🌡️ Hot — irrigate crops' : weather.temperature < 15 ? '🥶 Cold — protect seedlings' : '✅ Good conditions'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          )}

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
                  ? navigation.navigate('AdvisoryResult', {
                    advisory: lastScan,
                    scan_id: lastScan.id,
                    crop: lastScan.crop,
                    farmSize: lastScan.farm_size_acres,
                  })
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

          {/* ── BRAND-CONSISTENT TIP CARD ──────────────────────────────────── */}
          <View style={styles.tipCard}>
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

      {/* ── NOTIFICATION MODAL ────────────────────────────────────────── */}
      <Modal
        visible={showNotif}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotif(false)}
      >
        <TouchableOpacity
          style={styles.notifOverlay}
          activeOpacity={1}
          onPress={() => setShowNotif(false)}
        >
          <View style={styles.notifSheet}>
            {/* Handle */}
            <View style={styles.notifHandleRow}>
              <View style={styles.notifHandle} />
            </View>

            {/* Header */}
            <View style={styles.notifSheetHeader}>
              <Text style={styles.notifSheetTitle}>🔔 Soil Alerts</Text>
              {notifBadge > 0 && (
                <View style={styles.notifCountPill}>
                  <Text style={styles.notifCountText}>{notifBadge} alerts</Text>
                </View>
              )}
            </View>

            {/* Notification list (Card styled) */}
            <ScrollView style={styles.notifScroll} showsVerticalScrollIndicator={false}>
              {buildNotifications().map(n => {
                const cardStyle = getNotifCardStyle(n.severity);
                const titleColor = getSeverityTextColor(n.severity);
                return (
                  <View key={n.id} style={[styles.notifCardItem, shadows.sm, cardStyle]}>
                    <Text style={styles.notifCardIcon}>{n.icon}</Text>
                    <View style={styles.notifCardBody}>
                      <Text style={[styles.notifCardTitle, { color: titleColor }]}>{n.title}</Text>
                      <Text style={styles.notifCardText}>{n.body}</Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.notifListFooter} />
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── VOICE ASSISTANT MODAL (MOCK) ────────────────────────────── */}
      <Modal
        visible={playingVoice}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPlayingVoice(false)}
      >
        <TouchableOpacity 
          style={styles.voiceOverlay} 
          activeOpacity={1}
          onPress={() => setPlayingVoice(false)}
        >
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
        </TouchableOpacity>
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
    gap: spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnRelative: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnText: {
    fontSize: 16,
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 7,
    minWidth: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
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

  // Weather Card (Standalone)
  weatherCard: {
    backgroundColor: '#F0FDF4', // Minty light green
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  weatherCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherEmoji: {
    fontSize: 26,
    marginRight: 8,
  },
  weatherTemp: {
    color: '#166534',
    fontSize: 18,
    fontWeight: fontWeights.bold,
  },
  weatherDesc: {
    color: '#15803D',
    fontSize: 10,
    marginTop: 1,
  },
  weatherRight: {
    alignItems: 'flex-end',
    flex: 1,
    marginLeft: 8,
  },
  weatherWind: {
    color: '#166534',
    fontSize: 11,
  },
  weatherTip: {
    color: '#15803D',
    fontSize: 9,
    marginTop: 2,
    textAlign: 'right',
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

  // Notification Modal (Bottom sheet card-styled)
  notifOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  notifSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F8FAF9',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '76%',
    paddingBottom: 24,
  },
  notifHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  notifHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
  },
  notifSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  notifSheetTitle: {
    fontSize: 16,
    fontWeight: fontWeights.bold,
    color: '#1E293B',
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
});
