/// Qor AI - Application Constants
/// Blueprint Section 3.1, 7.1, 11.1
library;

import 'package:flutter/foundation.dart';

/// AI model tier: heavy tasks use the full Flash model,
/// light tasks use the cheaper Flash-Lite model.
enum AiTier { heavy, lite }

class AppConstants {
  AppConstants._();

  // Application Info
  static const String appName = 'Qor AI';
  static const String appTagline = 'Ask, Compare, Decide';
  static const String appDescription = 'Personal Decision Engine';
  static const String domain = 'qorai.net';
  static const String appVersion = '2.0.3';
  static const String playStorePackageId = 'com.compair.app';

  // DeepSeek API (admin panel text tasks only)
  static const String deepSeekBaseUrl = 'https://api.deepseek.com/v1';
  static const String deepSeekModel = 'deepseek-chat';
  static const int deepSeekMaxTokens = 4096;
  static const int deepSeekTimeoutSeconds = 15;
  static const int deepSeekMaxRetries = 3;
  static const int deepSeekRateLimitRPM = 60;

  // Gemini Flash 2.5 API — routed through PocketBase proxy (pb_hooks/gemini.pb.js)
  // Heavy tasks → gemini-2.5-flash  (detailed analysis, comparison, vision)
  // Light tasks → gemini-2.5-flash  (chat, simple scoring, Q&A)
  static const String geminiModel = 'gemini-2.5-flash';
  static const String geminiLiteModel = 'gemini-2.5-flash';
  static const int geminiMaxTokens = 4096;
  static const int geminiTimeoutSeconds = 30;

  // Cache Durations - Section 7.4
  static const Duration productCacheDuration = Duration(hours: 6);
  static const Duration trendCacheDuration = Duration(hours: 1);
  static const Duration aiResponseCacheDuration = Duration(hours: 24);

  // Pagination - Section 15.2
  static const int pageSize = 40;
  static const int searchPageSize = 60;
  static const int categoryBrowsePageSize = 80;
  static const int categoryBrowseMaxLoad = 2000;

  // Performance Targets - Section 15.3
  static const Duration appStartupTarget = Duration(seconds: 2);
  static const Duration homePageLoadTarget = Duration(milliseconds: 1500);
  static const Duration aiResponseTarget = Duration(seconds: 3);
  static const int targetFps = 60;
  static const int maxApkSizeMB = 30;
  static const int maxMemoryUsageMB = 150;

  // Animation Standards - Section 14.4
  static const Duration pageTransitionDuration = Duration(milliseconds: 300);
  static const Duration cardAnimationDuration = Duration(milliseconds: 200);
  static const Duration staggerDelay = Duration(milliseconds: 50);
  static const Duration skeletonCrossfadeDuration = Duration(milliseconds: 200);
  static const String qorCurrencyName = 'Q';

  // Free Tier Limits - Section 12.2
  static const int freeComparisonLimit = 5; // per day
  static const int freeDailyAiCreditLimit =
      10; // [LEGACY — daily reset disabled in lifetime model]
  // Lifetime credit model: one-time welcome bonus granted on signup.
  // No daily refresh. Configurable via remote config `signup_bonus_q_coins`.
  static const int signupBonusQCoins = 20;
  static const double aiChatCreditCost = 0.5;
  static const int compareAiCreditCost = 2;
  static const int detailAiCreditCost = 1;
  static const int detailMatchAiCreditCost = 1;
  static const int linkAnalysisCreditCost = 2;
  static const int linkCompareCreditCost = 3;
  static const int subscriptionAnalysisCreditCost = 2;
  static const int productScanCreditCost = 3;
  static const int freeAiQuestionLimit = 3; // per day (AI chat)
  static const int freeCompareAiLimit = 2; // per day (compare premium AI tabs)
  static const int freeDetailAiLimit =
      2; // per day per tab (product detail premium AI)
  static const int freeDetailMatchAiLimit =
      2; // per day (AI match score on product detail; ücretsiz 2× sonra algoritma)
  static const int freeDetailAiSharedLimit =
      2; // combined daily quota: detailAi + detailMatchAi shared pool
  static const int freeLinkPasteLimit = 3; // per day (link single analysis)
  static const int freeLinkCompareLimit = 2; // per day (link compare tab)
  static const int freeSubscriptionAnalysisLimit = 3; // per day
  static const int freeProductScanLimit = 2; // per day (product scan)
  static const int freeCollectionLimit = 10; // max saved products
  static const int freePriceHistoryDays = 7;
  static const int proPriceHistoryDays = 90;

  static num creditCostForFeature(String featureName) {
    return switch (featureName) {
      'ai_question' || 'ai_chat' => aiChatCreditCost,
      'compare_ai' => compareAiCreditCost,
      'detail_ai' => detailAiCreditCost,
      'detail_match_ai' || 'detail_match' => detailMatchAiCreditCost,
      'link_paste' || 'link_analysis' => linkAnalysisCreditCost,
      'link_compare' => linkCompareCreditCost,
      'subscription_analysis' => subscriptionAnalysisCreditCost,
      'product_scan' => productScanCreditCost,
      _ => 1,
    };
  }

  static String formatQorAmount(num amount, {String? languageCode}) {
    final value = amount.toDouble();
    final formatted = value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toStringAsFixed(1);
    if ((languageCode ?? '').toLowerCase() == 'tr') {
      return formatted.replaceAll('.', ',');
    }
    return formatted;
  }

  // Premium Pricing (3-day free trial on both plans)
  static const double monthlyProPrice = 3.99;
  static const double yearlyProPrice = 19.99;
  static const int trialDays = 3;

  // App Store (iOS) Subscription Product IDs — must match App Store Connect exactly
  static const String _iosMonthlySubscriptionId = 'com.qorai.app.monthly';
  static const String _iosYearlySubscriptionId = 'com.qorai.app.yearly';

  // Google Play Console Subscription Product IDs
  static const String _androidMonthlySubscriptionId = 'aylik_abonelik';
  static const String _androidYearlySubscriptionId = 'yillik_abonelik';

  // Platform-aware subscription product IDs
  static String get monthlySubscriptionId {
    if (defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS) {
      return _iosMonthlySubscriptionId;
    }
    return _androidMonthlySubscriptionId;
  }

  static String get yearlySubscriptionId {
    if (defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS) {
      return _iosYearlySubscriptionId;
    }
    return _androidYearlySubscriptionId;
  }

  // Collection names
  static const String usersCollection = 'users';
  static const String productsCollection = 'products';
  static const String comparisonsCollection = 'comparisons';
  static const String categoriesCollection = 'categories';
  static const String affiliateClicksCollection = 'affiliate_clicks';
  static const String userLinksCollection = 'user_links';
  static const String trendsCollection = 'trends';
  static const String reviewsCollection = 'reviews';

  // Retry Policy - Section 7.5
  static const List<Duration> retryDelays = [
    Duration(seconds: 1),
    Duration(seconds: 2),
    Duration(seconds: 4),
  ];
}

/// Supported Countries - Section 11.1
class SupportedCountries {
  SupportedCountries._();

  static const Map<String, CountryInfo> countries = {
    'US': CountryInfo(
      code: 'US',
      name: 'United States',
      currency: 'USD',
      language: 'en',
    ),
    'GB': CountryInfo(
      code: 'GB',
      name: 'United Kingdom',
      currency: 'GBP',
      language: 'en',
    ),
    'DE': CountryInfo(
      code: 'DE',
      name: 'Germany',
      currency: 'EUR',
      language: 'de',
    ),
    'FR': CountryInfo(
      code: 'FR',
      name: 'France',
      currency: 'EUR',
      language: 'fr',
    ),
    'IT': CountryInfo(
      code: 'IT',
      name: 'Italy',
      currency: 'EUR',
      language: 'it',
    ),
    'ES': CountryInfo(
      code: 'ES',
      name: 'Spain',
      currency: 'EUR',
      language: 'es',
    ),
    'CA': CountryInfo(
      code: 'CA',
      name: 'Canada',
      currency: 'CAD',
      language: 'en',
    ),
    'AU': CountryInfo(
      code: 'AU',
      name: 'Australia',
      currency: 'AUD',
      language: 'en',
    ),
    'JP': CountryInfo(
      code: 'JP',
      name: 'Japan',
      currency: 'JPY',
      language: 'ja',
    ),
    'IN': CountryInfo(
      code: 'IN',
      name: 'India',
      currency: 'INR',
      language: 'en',
    ),
    'TR': CountryInfo(
      code: 'TR',
      name: 'Türkiye',
      currency: 'TRY',
      language: 'tr',
    ),
    'NL': CountryInfo(
      code: 'NL',
      name: 'Netherlands',
      currency: 'EUR',
      language: 'nl',
    ),
    'SE': CountryInfo(
      code: 'SE',
      name: 'Sweden',
      currency: 'SEK',
      language: 'sv',
    ),
    'PL': CountryInfo(
      code: 'PL',
      name: 'Poland',
      currency: 'PLN',
      language: 'pl',
    ),
    'MX': CountryInfo(
      code: 'MX',
      name: 'Mexico',
      currency: 'MXN',
      language: 'es',
    ),
    'BR': CountryInfo(
      code: 'BR',
      name: 'Brazil',
      currency: 'BRL',
      language: 'pt',
    ),
    'SG': CountryInfo(
      code: 'SG',
      name: 'Singapore',
      currency: 'SGD',
      language: 'en',
    ),
    'AE': CountryInfo(code: 'AE', name: 'UAE', currency: 'AED', language: 'ar'),
    'SA': CountryInfo(
      code: 'SA',
      name: 'Saudi Arabia',
      currency: 'SAR',
      language: 'ar',
    ),
    // Additional countries
    'ZA': CountryInfo(
      code: 'ZA',
      name: 'South Africa',
      currency: 'ZAR',
      language: 'en',
    ),
    'NG': CountryInfo(
      code: 'NG',
      name: 'Nigeria',
      currency: 'NGN',
      language: 'en',
    ),
    'EG': CountryInfo(
      code: 'EG',
      name: 'Egypt',
      currency: 'EGP',
      language: 'ar',
    ),
    'KE': CountryInfo(
      code: 'KE',
      name: 'Kenya',
      currency: 'KES',
      language: 'en',
    ),
    'PK': CountryInfo(
      code: 'PK',
      name: 'Pakistan',
      currency: 'PKR',
      language: 'en',
    ),
    'BD': CountryInfo(
      code: 'BD',
      name: 'Bangladesh',
      currency: 'BDT',
      language: 'en',
    ),
    'ID': CountryInfo(
      code: 'ID',
      name: 'Indonesia',
      currency: 'IDR',
      language: 'en',
    ),
    'MY': CountryInfo(
      code: 'MY',
      name: 'Malaysia',
      currency: 'MYR',
      language: 'en',
    ),
    'TH': CountryInfo(
      code: 'TH',
      name: 'Thailand',
      currency: 'THB',
      language: 'en',
    ),
    'VN': CountryInfo(
      code: 'VN',
      name: 'Vietnam',
      currency: 'VND',
      language: 'en',
    ),
    'PH': CountryInfo(
      code: 'PH',
      name: 'Philippines',
      currency: 'PHP',
      language: 'en',
    ),
    'KR': CountryInfo(
      code: 'KR',
      name: 'South Korea',
      currency: 'KRW',
      language: 'en',
    ),
    'TW': CountryInfo(
      code: 'TW',
      name: 'Taiwan',
      currency: 'TWD',
      language: 'en',
    ),
    'HK': CountryInfo(
      code: 'HK',
      name: 'Hong Kong',
      currency: 'HKD',
      language: 'en',
    ),
    'NZ': CountryInfo(
      code: 'NZ',
      name: 'New Zealand',
      currency: 'NZD',
      language: 'en',
    ),
    'CH': CountryInfo(
      code: 'CH',
      name: 'Switzerland',
      currency: 'CHF',
      language: 'de',
    ),
    'AT': CountryInfo(
      code: 'AT',
      name: 'Austria',
      currency: 'EUR',
      language: 'de',
    ),
    'BE': CountryInfo(
      code: 'BE',
      name: 'Belgium',
      currency: 'EUR',
      language: 'fr',
    ),
    'DK': CountryInfo(
      code: 'DK',
      name: 'Denmark',
      currency: 'DKK',
      language: 'en',
    ),
    'NO': CountryInfo(
      code: 'NO',
      name: 'Norway',
      currency: 'NOK',
      language: 'en',
    ),
    'FI': CountryInfo(
      code: 'FI',
      name: 'Finland',
      currency: 'EUR',
      language: 'en',
    ),
    'PT': CountryInfo(
      code: 'PT',
      name: 'Portugal',
      currency: 'EUR',
      language: 'pt',
    ),
    'GR': CountryInfo(
      code: 'GR',
      name: 'Greece',
      currency: 'EUR',
      language: 'en',
    ),
    'CZ': CountryInfo(
      code: 'CZ',
      name: 'Czech Republic',
      currency: 'CZK',
      language: 'en',
    ),
    'HU': CountryInfo(
      code: 'HU',
      name: 'Hungary',
      currency: 'HUF',
      language: 'en',
    ),
    'RO': CountryInfo(
      code: 'RO',
      name: 'Romania',
      currency: 'RON',
      language: 'en',
    ),
    'UA': CountryInfo(
      code: 'UA',
      name: 'Ukraine',
      currency: 'UAH',
      language: 'en',
    ),
    'RU': CountryInfo(
      code: 'RU',
      name: 'Russia',
      currency: 'RUB',
      language: 'ru',
    ),
    'IL': CountryInfo(
      code: 'IL',
      name: 'Israel',
      currency: 'ILS',
      language: 'en',
    ),
    'QA': CountryInfo(
      code: 'QA',
      name: 'Qatar',
      currency: 'QAR',
      language: 'ar',
    ),
    'KW': CountryInfo(
      code: 'KW',
      name: 'Kuwait',
      currency: 'KWD',
      language: 'ar',
    ),
    'AR': CountryInfo(
      code: 'AR',
      name: 'Argentina',
      currency: 'ARS',
      language: 'es',
    ),
    'CL': CountryInfo(
      code: 'CL',
      name: 'Chile',
      currency: 'CLP',
      language: 'es',
    ),
    'CO': CountryInfo(
      code: 'CO',
      name: 'Colombia',
      currency: 'COP',
      language: 'es',
    ),
    'PE': CountryInfo(
      code: 'PE',
      name: 'Peru',
      currency: 'PEN',
      language: 'es',
    ),
  };
}

class CountryInfo {
  final String code;
  final String name;
  final String currency;
  final String language;

  const CountryInfo({
    required this.code,
    required this.name,
    required this.currency,
    required this.language,
  });
}

/// MVP Categories - Section 18
class AppCategories {
  AppCategories._();

  static const String tech = 'tech';
  static const String subscription = 'subscription';
  static const String gaming = 'gaming';
  static const String realEstate = 'realEstate';
  static const String vehicles = 'vehicles';

  // Canonical 49-category whitelist (EU pivot 2026-05-23).
  // Must stay in sync with admin/js/categories.js → CANONICAL_EPEY_CATEGORY_GROUPS.
  static const Map<String, List<String>> subcategories = {
    tech: [
      // Mobile
      'smartphones',
      'feature_phones',
      'smartwatches',
      'smart_rings',
      'headphones',
      'powerbanks',
      'chargers',
      // Computing
      'laptops',
      'desktops',
      'tablets',
      'e_readers',
      'vr_headsets',
      // Components
      'graphics_cards',
      'cpus',
      'motherboards',
      'ram',
      'ssd',
      'psu',
      'pc_cases',
      'ups',
      'flash_drives',
      // Cooling
      'cpu_coolers',
      'laptop_coolers',
      'case_fans',
      // Peripherals
      'keyboards',
      'mice',
      'gamepads',
      'gaming_consoles',
      'webcams',
      'microphones',
      'printers',
      '3d_printers',
      // Display & Audio
      'monitors',
      'tvs',
      'projectors',
      'speakers',
      'audio_systems',
      'av_receivers',
      'media_players',
      // Photo & Video
      'camera_lenses',
      'ip_cameras',
      'dashcams',
      'gimbals',
      'drones',
      // Network & Smart Home
      'routers',
      'modem_routers',
      'robot_vacuums',
      'hardware_wallets',
    ],
    subscription: ['streaming', 'music', 'vpn', 'ai_tools', 'cloud_storage'],
    gaming: [
      'what_to_play',
      'game_pass_vs_ps_plus',
      'pc_vs_console',
      'mobile_games',
    ],
    realEstate: ['houses', 'apartments', 'rentals'],
    vehicles: ['cars', 'motorcycles', 'used_cars'],
  };
}
