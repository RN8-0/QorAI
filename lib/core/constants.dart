/// Compair - Application Constants
/// Blueprint Section 3.1, 7.1, 11.1
library;

class AppConstants {
  AppConstants._();

  // Application Info
  static const String appName = 'Compair';
  static const String appTagline = 'Compare + AI + Pair';
  static const String appDescription = 'Personal Decision Engine';
  static const String domain = 'compair.digital';
  static const String appVersion = '1.0.0';

  // DeepSeek API (admin panel text tasks only)
  static const String deepSeekBaseUrl = 'https://api.deepseek.com/v1';
  static const String deepSeekModel = 'deepseek-chat';
  static const int deepSeekMaxTokens = 4096;
  static const int deepSeekTimeoutSeconds = 15;
  static const int deepSeekMaxRetries = 3;
  static const int deepSeekRateLimitRPM = 60;

  // Gemini Flash 2.5 API — routed through PocketBase proxy (pb_hooks/gemini.pb.js)
  // Actual endpoint lives in lib/core/pb_client.dart: `$kPbBaseUrl/api/ai/gemini`
  static const String geminiModel = 'gemini-2.5-flash';
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

  // Free Tier Limits - Section 12.2
  static const int freeComparisonLimit = 5; // per day
  static const int freeAiQuestionLimit = 15; // per day
  static const int freeLinkPasteLimit = 3; // per week
  static const int freeSubscriptionAnalysisLimit = 2; // per month
  static const int freePcBuilderSlots = 5; // max components in free tier
  static const int freeCollectionLimit = 10; // max saved products
  static const int freePriceHistoryDays = 7;
  static const int proPriceHistoryDays = 90;

  // Premium Pricing (3-day free trial on both plans)
  static const double monthlyProPrice = 3.99;
  static const double yearlyProPrice = 19.99;
  static const int trialDays = 3;

  // Play Console Subscription Product IDs
  static const String monthlySubscriptionId = 'aylik_abonelik';
  static const String yearlySubscriptionId = 'yillik_abonelik';

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

  static const Map<String, List<String>> subcategories = {
    tech: [
      'smartphones',
      'tablets',
      'laptops',
      'desktops',
      'cpus',
      'gpus',
      'ram',
      'ssd',
      'motherboards',
      'psu',
      'cases',
      'coolers',
      'tvs',
      'monitors',
      'projectors',
      'headphones',
      'speakers',
      'soundbars',
      'smartwatches',
      'cameras',
      'action-cameras',
      'security-cameras',
      'consoles',
      'gamepads',
      'keyboards',
      'mice',
      'printers',
      'webcams',
      'routers',
      'robot-vacuums',
      'powerbanks',
      'e-readers',
      'drones',
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
