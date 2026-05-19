// advisor.js — the MAIN rule engine
// Takes soil data → compares with ICAR crop standards → returns full advisory

const rules = require('./rules.json');
const { calculateSoilScore } = require('./scoreCalculator');
const { calculateCost, getTotalCost } = require('./costCalculator');

// ─── Bilingual crop calendar detail paragraphs ────────────────────────────────
// Keyed by event stage — injected into every crop_calendar event by getStageKey()
const CALENDAR_DETAILS = {
  sowing: {
    weather_sensitive: true,
    details_en: {
      what: 'Prepare the soil. Plant seeds at the correct depth and spacing. Add starting fertilizer.',
      why:  'Good soil preparation helps seeds grow well and makes early roots strong.',
      tip:  'Plant seeds early in the morning. Do not plant when the soil is too wet.',
    },
    details_hi: {
      what: '2–3 बार जुताई करके बीज की क्यारी तैयार करें। अनुशंसित गहराई और दूरी पर बीज बोएं। बुवाई से पहले या बुवाई के समय आधार उर्वरक डालें।',
      why:  'सही क्यारी तैयारी से अच्छा अंकुरण, एकसमान पौध और जड़ों का शुरुआती विकास सुनिश्चित होता है।',
      tip:  'सुबह जल्दी बोएं। भारी बारिश या जलभराव की स्थिति में बुवाई से बचें।',
    },
  },
  germination: {
    weather_sensitive: false,
    details_en: {
      what: 'Check soil wetness daily. Give light water if the soil is dry. Pull out any weeds.',
      why:  'Seeds need steady moisture to grow. Drying up now can ruin your crops.',
      tip:  'Do not give too much water. Soggy soil rots the seeds.',
    },
    details_hi: {
      what: 'रोज़ क्यारी की नमी जांचें। मिट्टी सूखी दिखे तो हल्की सिंचाई करें। अंकुरों के साथ प्रतिस्पर्धा करने वाले खरपतवार हटाएं।',
      why:  'अंकुरण के लिए निरंतर नमी जरूरी है। इस अवस्था में मुरझाने से फसल की स्थायी क्षति हो सकती है।',
      tip:  'अधिक सिंचाई न करें — गीली मिट्टी से फफूंद सड़न होती है। पंक्तियाँ साफ रखें।',
    },
  },
  top_dressing: {
    weather_sensitive: true,
    details_en: {
      what: 'Add urea or recommended fertilizer between plant rows. Water lightly after to help it reach the roots.',
      why:  'This gives extra nitrogen to the plants for fast, healthy leaf growth.',
      tip:  'Add fertilizer when the soil is damp, not muddy. Do not add before heavy rain.',
    },
    details_hi: {
      what: 'पंक्तियों के बीच यूरिया या अनुशंसित टॉप-ड्रेसिंग उर्वरक डालें। उर्वरक को जड़ क्षेत्र में सक्रिय करने के लिए हल्की सिंचाई करें।',
      why:  'टॉप-ड्रेसिंग निक्षालन से खोई नाइट्रोजन की भरपाई करती है और इस महत्वपूर्ण अवस्था में सक्रिय वानस्पतिक विकास में मदद करती है।',
      tip:  'जब मिट्टी नम हो लेकिन जलभराव न हो तो डालें। निक्षालन रोकने के लिए भारी बारिश से पहले न डालें।',
    },
  },
  irrigation: {
    weather_sensitive: true,
    details_en: {
      what: 'Water your crops properly. Most crops need 5 to 7 cm of water. Check soil moisture first.',
      why:  'Missing water when plants are flowering or making grains can drop your yield by 30-40%.',
      tip:  'Water early in the morning or in the evening. Skip water if rain is coming.',
    },
    details_hi: {
      what: 'फसलों के लिए आवश्यकतानुसार पानी डालें। अधिकांश फसलों के लिए प्रति सिंचाई 5–7 सेमी पानी डालें। सिंचाई से पहले 10 सेमी गहराई पर मिट्टी की नमी जांचें।',
      why:  'महत्वपूर्ण वृद्धि अवस्थाओं (फूल आना, दानों का भरना) में पानी की कमी से उपज 30–40% तक कम हो सकती है।',
      tip:  'वाष्पीकरण कम करने के लिए सुबह जल्दी या शाम को सिंचाई करें। 24 घंटे में बारिश की उम्मीद हो तो छोड़ दें।',
    },
  },
  weeding: {
    weather_sensitive: false,
    details_en: {
      what: 'Remove weeds by hand or with simple tools between rows. Use weed killer only if needed.',
      why:  'Weeds steal food, water, and sunlight from your plants. Pull them early.',
      tip:  'Weed after watering when the soil is soft. Do not dig too close to crop roots.',
    },
    details_hi: {
      what: 'हाथ से निराई करके या मशीन से पंक्तियों के बीच खरपतवार हटाएं। खरपतवार का दबाव अधिक हो तभी पहले से अनुमोदित शाकनाशी का उपयोग करें।',
      why:  'खरपतवार पोषक तत्वों, पानी और धूप के लिए प्रतिस्पर्धा करते हैं। निराई पहले 30–45 दिन में करना उपज बचाने के लिए सबसे महत्वपूर्ण है।',
      tip:  'सिंचाई के बाद जब मिट्टी नरम हो तब निराई करें। पौधों की जड़ों के पास गहरी खुदाई से बचें।',
    },
  },
  pest_monitoring: {
    weather_sensitive: false,
    details_en: {
      what: 'Look at your fields for bugs and crop diseases. Check under leaves, on stems, and on the soil.',
      why:  'Finding bugs early prevents crop loss. Most bugs are easy to clear in the first 3 days.',
      tip:  'Keep a simple note of what bugs you saw and when. Ask a farm expert before spraying.',
    },
    details_hi: {
      what: 'कीट और बीमारियों के लिए खेतों का निरीक्षण करें। पत्तियों के नीचे, तने की गांठें और मिट्टी की सतह जांचें। किसी भी पीलेपन, धब्बे या असामान्य मुरझाने पर ध्यान दें।',
      why:  'कीटों की शुरुआती पहचान से फसल नुकसान को रोका जा सकता है। अधिकांश कीट पहले 72 घंटों में पहचाने जाने पर उपचार योग्य होते हैं।',
      tip:  'एक सरल रिकॉर्ड रखें (तारीख + दिखा कीट)। शुरुआती चेतावनी के लिए चिपचिपे जाल का उपयोग करें। कीटनाशक लगाने से पहले विशेषज्ञ से परामर्श करें।',
    },
  },
  flowering: {
    weather_sensitive: true,
    details_en: {
      what: 'Keep the soil moist as this is the most critical time for water. Do not apply nitrogen now.',
      why:  'Flowering decides how many seeds you get. Drought now causes flowers to fall.',
      tip:  'Do not spray bug killers when flowers are open to protect honeybees.',
    },
    details_hi: {
      what: 'पर्याप्त नमी सुनिश्चित करें — यह पानी के प्रति सबसे संवेदनशील अवस्था है। कोई नाइट्रोजन न डालें। फूल आने में देरी हो तो सूक्ष्म पोषक तत्वों की कमी जांचें।',
      why:  'फूल आना उपज क्षमता निर्धारित करता है। इस अवस्था में पानी की कमी से फूल झड़ते हैं और दाना बनना खराब होता है।',
      tip:  'परागणकों की रक्षा के लिए सक्रिय फूल आते समय कीटनाशक न छिड़कें। परागण 20–30°C पर सबसे अच्छा होता है।',
    },
  },
  harvesting: {
    weather_sensitive: true,
    details_en: {
      what: 'Harvest your crops when the grains are dry (14-18% moisture). Use clean tools. Cut and thresh in 2-3 days.',
      why:  'Waiting too long lets grains fall on the ground or get eaten by bugs. Timely harvest saves your crop.',
      tip:  'Harvest on sunny, dry days. Do not cut wet crops because they will rot.',
    },
    details_hi: {
      what: 'जब दाने की नमी 14–18% हो (भंडारण के लिए) या जब फसल पूरी तरह पक जाए तब कटाई करें। तेज, साफ औजारों का उपयोग करें। 2–3 दिनों के भीतर बांधें और गहाई करें।',
      why:  'देरी से कटाई में दाना झड़ने के नुकसान, कीट संक्रमण और गुणवत्ता में गिरावट होती है। समय पर कटाई से पूरी उपज की रक्षा होती है।',
      tip:  'शुष्क, धूप वाले दिनों में कटाई करें। बारिश के बाद कटाई न करें — गीले दाने भंडारण में सड़ जाते हैं।',
    },
  },
};

// Maps a calendar event label to a stage key
const getStageKey = (label) => {
  const l = (label || '').toLowerCase();
  if (l.includes('sow') || l.includes('plant'))                       return 'sowing';
  if (l.includes('germin'))                                            return 'germination';
  if (l.includes('top') || l.includes('dressing'))                    return 'top_dressing';
  if (l.includes('irrig') || l.includes('water'))                     return 'irrigation';
  if (l.includes('weed'))                                              return 'weeding';
  if (l.includes('pest') || l.includes('spray') || l.includes('monitor')) return 'pest_monitoring';
  if (l.includes('flower') || l.includes('bloom'))                    return 'flowering';
  if (l.includes('harvest') || l.includes('reap'))                    return 'harvesting';
  return null;
};

const generateAdvisory = (soilData) => {
  const { ph, nitrogen, phosphorus, potassium, organic_carbon, zinc, crop, farm_size_acres } = soilData;

  // Get the rules for the selected crop
  const cropName  = crop.toLowerCase();
  const cropRules = rules.crops[cropName];

  if (!cropRules) {
    return { error: `No rules found for crop: ${crop}` };
  }

  const recommendations = [];
  const nutrientStatus  = {};

  // ─── pH Check ────────────────────────────────────────────────────────────────
  if (ph < cropRules.ph.min) {
    nutrientStatus.ph = { status: 'LOW',  value: ph, ideal: `${cropRules.ph.min}–${cropRules.ph.max}`, advice: 'Apply lime to raise pH' };
  } else if (ph > cropRules.ph.max) {
    nutrientStatus.ph = { status: 'HIGH', value: ph, ideal: `${cropRules.ph.min}–${cropRules.ph.max}`, advice: 'Apply gypsum or sulfur to lower pH' };
  } else {
    nutrientStatus.ph = { status: 'OK',   value: ph, ideal: `${cropRules.ph.min}–${cropRules.ph.max}` };
  }

  // ─── Nitrogen ─────────────────────────────────────────────────────────────────
  if (nitrogen < cropRules.nitrogen.low) {
    nutrientStatus.nitrogen = { status: 'LOW',    value: nitrogen };
    const fert = cropRules.fertilizers['nitrogen_low'];
    if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Nitrogen very low' });
  } else if (nitrogen < cropRules.nitrogen.medium) {
    nutrientStatus.nitrogen = { status: 'MEDIUM', value: nitrogen };
    const fert = cropRules.fertilizers['nitrogen_medium'];
    if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Nitrogen moderate' });
  } else {
    nutrientStatus.nitrogen = { status: 'OK',     value: nitrogen };
  }

  // ─── Phosphorus ───────────────────────────────────────────────────────────────
  if (phosphorus < cropRules.phosphorus.low) {
    nutrientStatus.phosphorus = { status: 'LOW',    value: phosphorus };
    const fert = cropRules.fertilizers['phosphorus_low'];
    if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Phosphorus very low' });
  } else if (phosphorus < cropRules.phosphorus.medium) {
    nutrientStatus.phosphorus = { status: 'MEDIUM', value: phosphorus };
    const fert = cropRules.fertilizers['phosphorus_medium'];
    if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Phosphorus moderate' });
  } else {
    nutrientStatus.phosphorus = { status: 'OK',     value: phosphorus };
  }

  // ─── Potassium ────────────────────────────────────────────────────────────────
  if (potassium < cropRules.potassium.low) {
    nutrientStatus.potassium = { status: 'LOW',    value: potassium };
    const fert = cropRules.fertilizers['potassium_low'];
    if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Potassium very low' });
  } else if (potassium < cropRules.potassium.medium) {
    nutrientStatus.potassium = { status: 'MEDIUM', value: potassium };
    const fert = cropRules.fertilizers['potassium_medium'];
    if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Potassium moderate' });
  } else {
    nutrientStatus.potassium = { status: 'OK',     value: potassium };
  }

  // ─── Organic Carbon ───────────────────────────────────────────────────────────
  if (organic_carbon !== undefined && organic_carbon !== null) {
    if (organic_carbon < cropRules.organic_carbon.low) {
      nutrientStatus.organic_carbon = { status: 'LOW',    value: organic_carbon, advice: 'Apply farmyard manure or compost' };
    } else if (organic_carbon < cropRules.organic_carbon.medium) {
      nutrientStatus.organic_carbon = { status: 'MEDIUM', value: organic_carbon };
    } else {
      nutrientStatus.organic_carbon = { status: 'OK',     value: organic_carbon };
    }
  }

  // ─── Zinc ─────────────────────────────────────────────────────────────────────
  if (zinc !== undefined && zinc !== null) {
    if (zinc < cropRules.zinc.deficient) {
      nutrientStatus.zinc = { status: 'DEFICIENT', value: zinc };
      const fert = cropRules.fertilizers['zinc_deficient'];
      if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Zinc deficient' });
    } else {
      nutrientStatus.zinc = { status: 'OK', value: zinc };
    }
  }

  // ─── Sulfur ───────────────────────────────────────────────────────────────────
  if (soilData.sulfur !== undefined && soilData.sulfur !== null) {
    if (soilData.sulfur < cropRules.sulfur.deficient) {
      nutrientStatus.sulfur = { status: 'DEFICIENT', value: soilData.sulfur };
      const fert = cropRules.fertilizers['sulfur_deficient'];
      if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Sulfur deficient' });
    } else {
      nutrientStatus.sulfur = { status: 'OK', value: soilData.sulfur };
    }
  }

  // ─── Iron ─────────────────────────────────────────────────────────────────────
  if (soilData.iron !== undefined && soilData.iron !== null) {
    if (soilData.iron < cropRules.iron.deficient) {
      nutrientStatus.iron = { status: 'DEFICIENT', value: soilData.iron };
      const fert = cropRules.fertilizers['iron_deficient'];
      if (fert) recommendations.push({ ...fert, qty_kg_per_acre: fert.qty_kg_per_acre, reason: 'Iron deficient' });
    } else {
      nutrientStatus.iron = { status: 'OK', value: soilData.iron };
    }
  }

  // ─── Sort by priority ─────────────────────────────────────────────────────────
  recommendations.sort((a, b) => (a.priority || 99) - (b.priority || 99));

  // ─── Cost calculation ─────────────────────────────────────────────────────────
  const costBreakdown = calculateCost(recommendations, farm_size_acres || 0);
  const totalCost     = getTotalCost(costBreakdown);

  // ─── Budget tip ───────────────────────────────────────────────────────────────
  const budgetTip = costBreakdown.length > 0
    ? `If budget is limited, buy in this order: ${costBreakdown.map((r, i) => `${i + 1}. ${r.fertilizer}`).join(', ')}. Priority 1 is most critical for yield.`
    : 'Your soil is in good condition. No fertilizers needed this season.';

  // ─── Soil health score ────────────────────────────────────────────────────────
  const { score, label, deductions } = calculateSoilScore(soilData, cropRules);

  // ─── Enrich crop calendar with bilingual sub-paragraph details ────────────────
  const rawCalendar      = cropRules.calendar || [];
  const enrichedCalendar = rawCalendar.map(event => {
    const stageKey = getStageKey(event.label || '');
    const details  = stageKey ? CALENDAR_DETAILS[stageKey] : null;
    return {
      ...event,
      stage:             stageKey || 'general',
      weather_sensitive: details?.weather_sensitive ?? false,
      details_en: details?.details_en || {
        what: event.label,
        why:  'Follow recommended agronomic practices for your crop.',
        tip:  'Consult your local KVK for region-specific advice.',
      },
      details_hi: details?.details_hi || {
        what: event.label,
        why:  'अपनी फसल के लिए अनुशंसित कृषि विज्ञान पद्धतियों का पालन करें।',
        tip:  'क्षेत्र-विशिष्ट सलाह के लिए अपने स्थानीय KVK से परामर्श करें।',
      },
    };
  });

  // ─── Final advisory object ────────────────────────────────────────────────────
  return {
    crop,
    farm_size_acres:   farm_size_acres || 0,
    soil_health_score: score,
    score_label:       label,
    nutrient_status:   nutrientStatus,
    recommendations:   costBreakdown,
    total_cost_inr:    totalCost,
    budget_tip:        budgetTip,
    score_deductions:  deductions,
    crop_calendar:     enrichedCalendar,
  };
};

module.exports = { generateAdvisory };
