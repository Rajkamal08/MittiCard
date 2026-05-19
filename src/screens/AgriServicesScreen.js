import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
  Share,
} from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radius, shadows } from '../theme';
import i18n from '../i18n';

export default function AgriServicesScreen({ navigation, route }) {
  const isHindi = i18n.language === 'hi';
  const initialTab = route?.params?.tab || 'helpline'; // 'helpline' | 'rates'
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleCall = (phone) => {
    Linking.openURL(`tel:${phone}`).catch((err) => {
      console.warn('Call dial failed:', err);
      alert(isHindi ? 'कॉल करने में असमर्थ' : 'Could not launch dialer');
    });
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      isHindi
        ? 'नमस्ते मिट्टीकार्ड विशेषज्ञ, मुझे अपनी मिट्टी की स्वास्थ्य रिपोर्ट के बारे में सलाह चाहिए।'
        : 'Hello MittiCard Expert, I need agricultural advice based on my soil health test report.'
    );
    // WhatsApp deep link support
    const url = `whatsapp://send?phone=+917632913157&text=${text}`;
    const webUrl = `https://wa.me/917632913157?text=${text}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          return Linking.openURL(webUrl);
        }
      })
      .catch((err) => {
        console.warn('WhatsApp launch failed:', err);
        Linking.openURL(webUrl);
      });
  };

  const handleShareRates = async () => {
    try {
      const shareMsg = isHindi
        ? `*शासकीय बीज एवं उर्वरक दरें (छत्तीसगढ़)*\n• यूरिया (45kg): ₹266\n• DAP (50kg): ₹1350\n• मॉप पोटाश (50kg): ₹1700\n• एसएसपी (50kg): ₹425\n\nमिट्टीकार्ड ऐप द्वारा साझा किया गया`
        : `*Official Seed & Fertilizer Rates (Chhattisgarh)*\n• Urea (45kg): ₹266\n• DAP (50kg): ₹1350\n• MOP Potash (50kg): ₹1700\n• SSP (50kg): ₹425\n\nShared via MittiCard App`;
      await Share.share({ message: shareMsg });
    } catch {}
  };

  const FERTILIZER_RATES = [
    { name: isHindi ? 'यूरिया (Urea)' : 'Urea (45kg bag)', rate: '₹266', type: 'govt' },
    { name: isHindi ? 'डी.ए.पी. (DAP)' : 'DAP (50kg bag)', rate: '₹1,350', type: 'govt' },
    { name: isHindi ? 'मॉप पोटाश (Potash)' : 'MOP Potash (50kg bag)', rate: '₹1,700', type: 'govt' },
    { name: isHindi ? 'सिंगल सुपर फास्फेट (SSP)' : 'SSP (50kg bag)', rate: '₹425', type: 'govt' },
  ];

  const SEED_RATES = [
    { name: isHindi ? 'प्रमाणित धान बीज (Paddy Seeds)' : 'Certified Paddy Seeds (10kg)', rate: '₹450 – ₹600', type: 'market' },
    { name: isHindi ? 'प्रमाणित गेहूं बीज (Wheat Seeds)' : 'Certified Wheat Seeds (10kg)', rate: '₹350 – ₹480', type: 'market' },
    { name: isHindi ? 'सोयाबीन बीज (Soybean Seeds)' : 'Soybean Seeds (10kg)', rate: '₹650 – ₹780', type: 'market' },
    { name: isHindi ? 'चना बीज (Gram Seeds)' : 'Gram Seeds (10kg)', rate: '₹800 – ₹950', type: 'market' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ {isHindi ? 'मुख्य स्क्रीन' : 'Home'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isHindi ? 'कृषि सेवाएं एवं सहायता' : 'Agri Services & Portal'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* ── SEGMENTED TABS ─────────────────────────────────────────── */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'helpline' && styles.tabButtonActive]}
          onPress={() => setActiveTab('helpline')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'helpline' && styles.tabButtonTextActive]}>
            📞 {isHindi ? 'कृषि विशेषज्ञ हेल्पलाइन' : 'Agri Helplines'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'rates' && styles.tabButtonActive]}
          onPress={() => setActiveTab('rates')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'rates' && styles.tabButtonTextActive]}>
            💰 {isHindi ? 'बीज एवं उर्वरक दरें' : 'Market Rates'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'helpline' ? (
          /* ── HELPLINE DIRECTORY TAB ────────────────────────────────────── */
          <View>
            <Text style={styles.sectionSubtitle}>
              {isHindi ? 'कृषि विशेषज्ञों से सीधा संपर्क करें:' : 'Directly contact agriculture experts:'}
            </Text>

            {/* Kisan Call Center (KCC) */}
            <View style={[styles.serviceCard, shadows.sm]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.serviceIcon}>🇮🇳</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{isHindi ? 'किसान कॉल सेंटर (भारत सरकार)' : 'Kisan Call Center (KCC)'}</Text>
                  <Text style={styles.servicePhone}>1800-180-1551</Text>
                </View>
              </View>
              <Text style={styles.serviceDesc}>
                {isHindi
                  ? 'नि:शुल्क सरकारी हेल्पलाइन। सुबह 6 से रात 10 बजे तक फसलों, रोगों और सरकारी योजनाओं की जानकारी के लिए उपलब्ध।'
                  : 'Free Government Helpline. Available daily 6 AM to 10 PM for crop disease advice and subsidy queries.'}
              </Text>
              <TouchableOpacity
                onPress={() => handleCall('18001801551')}
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.actionButtonText}>📞 {isHindi ? 'मुफ्त कॉल करें' : 'Call Free Helpline'}</Text>
              </TouchableOpacity>
            </View>

            {/* WhatsApp Agri Expert Desk */}
            <View style={[styles.serviceCard, shadows.sm]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.serviceIcon}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{isHindi ? 'मिट्टीकार्ड व्हाट्सएप विशेषज्ञ' : 'MittiCard WhatsApp Expert'}</Text>
                  <Text style={styles.servicePhone}>Raipur Regional Office</Text>
                </View>
              </View>
              <Text style={styles.serviceDesc}>
                {isHindi
                  ? 'अपनी मिट्टी की रिपोर्ट का फोटो भेजें और उर्वरकों के सही उपयोग के लिए कृषि वैज्ञानिकों से सीधी सलाह लें।'
                  : 'Send a photo of your soil card and get direct fertilizer application advice from agri scientists.'}
              </Text>
              <TouchableOpacity
                onPress={handleWhatsApp}
                style={[styles.actionButton, { backgroundColor: '#25D366' }]}
              >
                <Text style={styles.actionButtonText}>💬 {isHindi ? 'व्हाट्सएप पर पूछें' : 'Consult on WhatsApp'}</Text>
              </TouchableOpacity>
            </View>

            {/* District FPO Coordinator */}
            <View style={[styles.serviceCard, shadows.sm]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.serviceIcon}>🏢</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{isHindi ? 'जिला FPO समन्वयक' : 'Raipur District FPO Desk'}</Text>
                  <Text style={styles.servicePhone}>+91 76329-13157</Text>
                </View>
              </View>
              <Text style={styles.serviceDesc}>
                {isHindi
                  ? 'स्थानीय FPO सदस्यता, खाद की उपलब्धता और सामूहिक फसल बिक्री सहायता के लिए अपने जिला केंद्र से संपर्क करें।'
                  : 'Get local FPO membership support, fertilizer availability updates, and wholesale seed procurement assistance.'}
              </Text>
              <TouchableOpacity
                onPress={() => handleCall('+917632913157')}
                style={[styles.actionButton, { backgroundColor: colors.primaryDark }]}
              >
                <Text style={styles.actionButtonText}>📞 {isHindi ? 'FPO डेस्क कॉल करें' : 'Call FPO Coordinator'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ── SEED & FERTILIZER RATES TAB ────────────────────────────────── */
          <View>
            <View style={styles.ratesHeaderRow}>
              <Text style={styles.sectionSubtitle}>
                {isHindi ? 'शासकीय एवं बाजार दरें (छत्तीसगढ़)' : 'Subsidized & Market Rates (Chhattisgarh)'}
              </Text>
              <TouchableOpacity onPress={handleShareRates} style={styles.shareBtn}>
                <Text style={styles.shareBtnText}>🔗 {isHindi ? 'साझा करें' : 'Share'}</Text>
              </TouchableOpacity>
            </View>

            {/* Warning Card */}
            <View style={styles.warningCard}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.warningText}>
                {isHindi
                  ? 'यदि कोई डीलर निर्धारित सरकारी दरों से अधिक कीमत वसूलता है, तो तुरंत ऊपर दिए गए सरकारी हेल्पलाइन नंबर पर शिकायत दर्ज करें।'
                  : 'If a dealer charges higher than these official rates, immediately report it to the Kisan Helpline (1800-180-1551).'}
              </Text>
            </View>

            {/* Fertilizer Rates Table Card */}
            <View style={[styles.tableCard, shadows.sm]}>
              <Text style={styles.tableTitle}>🌱 {isHindi ? 'उर्वरक दरें (सरकारी सब्सिडी प्राप्त)' : 'Fertilizer Rates (Govt Subsidized)'}</Text>
              <View style={styles.tableDivider} />
              
              {FERTILIZER_RATES.map((item, index) => (
                <View key={item.name} style={styles.tableRow}>
                  <Text style={styles.tableColName}>{item.name}</Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.tableColPrice}>{item.rate}</Text>
                    <Text style={styles.subsidyBadgeText}>{isHindi ? 'निर्धारित दर' : 'Subsidy'}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Seeds Rates Table Card */}
            <View style={[styles.tableCard, shadows.sm]}>
              <Text style={styles.tableTitle}>🌾 {isHindi ? 'प्रमाणित उन्नत बीज दरें (अनुमानित)' : 'Certified Crop Seed Prices (Est.)'}</Text>
              <View style={styles.tableDivider} />
              
              {SEED_RATES.map((item, index) => (
                <View key={item.name} style={styles.tableRow}>
                  <Text style={styles.tableColName}>{item.name}</Text>
                  <Text style={[styles.tableColPrice, { color: colors.textPrimary }]}>{item.rate}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primaryDark,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.sm,
  },
  backBtnText: {
    color: '#FFF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  headerTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: '#FFF',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: colors.primary,
  },
  tabButtonText: {
    fontSize: fontSizes.xs + 1,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: fontWeights.bold,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionSubtitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  serviceCard: {
    backgroundColor: '#FFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  serviceIcon: {
    fontSize: 28,
    marginRight: spacing.sm,
  },
  serviceName: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  servicePhone: {
    fontSize: fontSizes.sm,
    color: colors.primary,
    fontWeight: fontWeights.bold,
    marginTop: 2,
  },
  serviceDesc: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: spacing.md,
  },
  actionButton: {
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  ratesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  shareBtn: {
    backgroundColor: colors.primary + '12',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  shareBtnText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  warningCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  warningIcon: {
    fontSize: 20,
    marginRight: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: fontSizes.xs,
    color: colors.statusPoor,
    lineHeight: 15,
    fontWeight: fontWeights.medium,
  },
  tableCard: {
    backgroundColor: '#FFF',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  tableTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  tableDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableColName: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    fontWeight: fontWeights.medium,
    flex: 1,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  tableColPrice: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    color: colors.primary,
  },
  subsidyBadgeText: {
    fontSize: 8,
    color: colors.statusGood,
    fontWeight: fontWeights.bold,
    marginTop: 2,
  },
});
