// Compair — Dual Theme System (OLED Dark + Clean Light)
// Pure black OLED dark + Slate-50 light, both built on the same brand palette
// Brand Cyan    : #00E5FF (accent highlight — the logo's center dot)
// Brand Cyan    : #00E5FF (accent highlight — the logo's center dot)
// Brand Blue    : #2196F3 (primary — the logo's main body)
// Brand DeepBlue: #1565C0 (premium — the logo's darker wings)
// Brand SkyBlue : #4FC3F7 (secondary — the logo's lighter parts)
//
// Typography : Plus Jakarta Sans (Google Fonts)
// Material 3 · Clean premium aesthetic on pure OLED black.

import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/l10n/app_localizations.dart';

class AppTheme {
  AppTheme._();

  // ─────────────────────────────────────────────────────────────────────────
  // BRAND PALETTE (matching logo: Blue → Cyan)
  // ─────────────────────────────────────────────────────────────────────────

  static const Color brandCyan = Color(0xFF00E5FF); // Logo center dot
  static const Color brandBlue = Color(0xFF2196F3); // Logo main body
  static const Color brandDeepBlue = Color(0xFF1565C0); // Logo dark wings
  static const Color brandSkyBlue = Color(0xFF4FC3F7); // Logo light parts

  // Neon aliases → now map to brand blue/cyan (used across 12+ files)
  static const Color neonCyan = brandCyan;
  static const Color neonPurple = brandBlue; // was purple, now logo blue
  static const Color neonPink = brandSkyBlue; // was pink, now logo sky blue
  static const Color neonBlue = Color(0xFF42A5F5); // Blue-400

  static const Color primaryBlue = brandCyan;
  static const Color secondaryNavy = Color(0xFF0A1628);
  static const Color accentCyan = brandCyan;

  static const Color brandLight = brandCyan;
  static const Color brandDark = Color(0xFF0A1628);

  // Premium — violet tones
  static const Color premiumDeep = Color(0xFF5B21B6);     // Deep violet
  static const Color premiumBase = Color(0xFF7C3AED);     // Main violet
  static const Color premiumLight = Color(0xFFA78BFA);    // Light violet

  // Legacy premium aliases (backward compat)
  static const Color premiumBronze = premiumDeep;
  static const Color premiumGold = premiumBase;
  static const Color premiumChampagne = premiumLight;
  static const Color premiumPurple = premiumDeep;
  static const Color premiumPurpleLight = premiumBase;

  // ─────────────────────────────────────────────────────────────────────────
  // OLED DARK SURFACES — pure black foundation
  // ─────────────────────────────────────────────────────────────────────────

  static const Color backgroundDark = Color(0xFF000000); // Pure OLED black
  static const Color surfaceDark = Color(0xFF0A0A0A); // Barely visible
  static const Color surfaceVariantDark = Color(0xFF121212); // Cards, elevated
  static const Color surfaceElevatedDark = Color(0xFF1A1A1A); // Modals, sheets
  static const Color textPrimaryDark = Color(0xFFF1F5F9); // Bright white
  static const Color textSecondaryDark = Color(0xFF94A3B8); // Muted gray
  static const Color textTertiaryDark = Color(0xFF64748B); // Subtle hint
  static const Color dividerDark = Color(0xFF1E293B); // Subtle border

  // ─────────────────────────────────────────────────────────────────────────
  // LIGHT MODE SURFACES — clean white/slate foundation
  // ─────────────────────────────────────────────────────────────────────────

  static const Color backgroundLightMode = Color(0xFFF8FAFC); // Slate 50
  static const Color surfaceLightMode = Color(0xFFFFFFFF); // Pure White
  static const Color surfaceVariantLightMode = Color(0xFFF1F5F9); // Slate 100
  static const Color surfaceElevatedLightMode = Color(0xFFFFFFFF); // White
  static const Color textPrimaryLightMode = Color(0xFF0F172A); // Slate 900
  static const Color textSecondaryLightMode = Color(0xFF475569); // Slate 600
  static const Color textTertiaryLightMode = Color(0xFF94A3B8); // Slate 400
  static const Color dividerLightMode = Color(0xFFE2E8F0); // Slate 200

  // Legacy light aliases — kept for backward compat (point to light mode values)
  static const Color backgroundLight = backgroundLightMode;
  static const Color surfaceLight = surfaceLightMode;
  static const Color surfaceVariantLight = surfaceVariantLightMode;
  static const Color textPrimaryLight = textPrimaryLightMode;
  static const Color textSecondaryLight = textSecondaryLightMode;
  static const Color textTertiaryLight = textTertiaryLightMode;
  static const Color dividerLight = dividerLightMode;

  // ─────────────────────────────────────────────────────────────────────────
  // SEMANTIC COLORS — vivid neon on dark
  // ─────────────────────────────────────────────────────────────────────────

  static const Color scoreExcellent = Color(0xFF10B981); // Emerald
  static const Color scoreGood = Color(0xFF34D399); // Emerald light
  static const Color scoreAverage = Color(0xFFF59E0B); // Amber
  static const Color scorePoor = Color(0xFFEF4444); // Rose

  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color error = Color(0xFFEF4444);
  static const Color info = neonCyan;

  // Legacy alias
  static const Color textDark = textPrimaryDark;

  // ─────────────────────────────────────────────────────────────────────────
  // SLATE PALETTE (Tailwind-compatible)
  // ─────────────────────────────────────────────────────────────────────────

  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate800 = Color(0xFF1E293B);

  // Semantic palette
  static const Color rose500 = Color(0xFFFF3B30);
  static const Color amber500 = Color(0xFFFF9F0A);
  static const Color green500 = Color(0xFF34C759);
  static const Color emerald500 = Color(0xFF30D158);
  static const Color orange500 = Color(0xFFFF6B00);
  static const Color gold = Color(0xFFFFD700);
  static const Color goldOrange = Color(0xFFFFA500);
  static const Color youtube = Color(0xFFFF0000);

  // ─────────────────────────────────────────────────────────────────────────
  // CATEGORY COLORS — centralized palette for category icons/chips
  // ─────────────────────────────────────────────────────────────────────────

  static const Color catMobile = Color(0xFF3B82F6); // Blue-500
  static const Color catComputers = Color(0xFF6366F1); // Indigo-500
  static const Color catComponents = Color(0xFF06B6D4); // Cyan-500
  static const Color catDisplay = Color(0xFF10B981); // Emerald-500
  static const Color catAudio = Color(0xFFEC4899); // Pink-500
  static const Color catWearables = Color(0xFF14B8A6); // Teal-500
  static const Color catCameras = Color(0xFFF97316); // Orange-500
  static const Color catGaming = Color(0xFF8B5CF6); // Violet-500
  static const Color catPeripherals = Color(0xFF0EA5E9); // Sky-500
  static const Color catNetworking = Color(0xFF3B82F6); // Blue-500
  static const Color catSmartHome = Color(0xFFF59E0B); // Amber-500
  static const Color catAccessories = Color(0xFF22C55E); // Green-500
  static const Color catDrones = Color(0xFF06B6D4); // Cyan-500

  /// Get category group color by group key
  static Color categoryGroupColor(String groupKey) {
    const map = {
      'mobile': catMobile,
      'computers': catComputers,
      'pc components': catComponents,
      'display': catDisplay,
      'audio': catAudio,
      'wearables': catWearables,
      'cameras': catCameras,
      'gaming': catGaming,
      'peripherals': catPeripherals,
      'networking': catNetworking,
      'smart home': catSmartHome,
      'accessories': catAccessories,
      'drones': catDrones,
    };
    return map[groupKey.toLowerCase()] ?? brandBlue;
  }

  /// Get color for an individual category ID
  static Color categoryColor(String categoryId) {
    const map = {
      'smartphones': catMobile,
      'tablets': catMobile,
      'laptops': catComputers,
      'desktops': catComputers,
      'cpus': catComponents,
      'gpus': catGaming,
      'ram': catComponents,
      'ssd': catComponents,
      'motherboards': catComponents,
      'psu': catComponents,
      'cases': catComponents,
      'coolers': catComponents,
      'monitors': catDisplay,
      'keyboards': catPeripherals,
      'mice': catPeripherals,
      'webcams': catPeripherals,
      'tvs': catDisplay,
      'projectors': catDisplay,
      'media-players': catDisplay,
      'headphones': catAudio,
      'earphones': catAudio,
      'speakers': catAudio,
      'soundbars': catAudio,
      'microphones': catAudio,
      'smartwatches': catWearables,
      'smart-rings': catWearables,
      'cameras': catCameras,
      'action-cameras': catCameras,
      'security-cameras': catCameras,
      'ip-cameras': catCameras,
      'dashcams': catCameras,
      'gimbals': catCameras,
      'tripods': catCameras,
      'lenses': catCameras,
      'consoles': catGaming,
      'gamepads': catGaming,
      'vr-headsets': catGaming,
      'printers': catPeripherals,
      'routers': catNetworking,
      'robot-vacuums': catSmartHome,
      'powerbanks': catAccessories,
      'e-readers': catAccessories,
      'drones': catDrones,
    };
    return map[categoryId.toLowerCase()] ?? brandBlue;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACCENT COLORS — secondary palette for AI / premium elements
  // ─────────────────────────────────────────────────────────────────────────

  static const Color accentViolet = Color(
    0xFF7C3AED,
  ); // Violet-700 — AI premium
  static const Color accentIndigo = Color(
    0xFF4F46E5,
  ); // Indigo-600 — secondary accent

  // ─────────────────────────────────────────────────────────────────────────
  // LEGACY / COMPAT ALIASES
  // ─────────────────────────────────────────────────────────────────────────

  static const Color accentTeal = neonCyan;
  static const Color deepSpace = backgroundDark;
  static const Color glassCard = Color(0x1AFFFFFF);

  static const Color backgroundLight_old = backgroundDark;
  static const Color surfaceLight_old = surfaceDark;
  static const Color textPrimaryLight_old = textPrimaryDark;

  // ─────────────────────────────────────────────────────────────────────────
  // GRADIENTS — Blue → Cyan on OLED black (logo-matching)
  // ─────────────────────────────────────────────────────────────────────────

  /// Hero gradient — Deep Blue → Blue → Cyan (the logo's soul)
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [brandDeepBlue, brandBlue, brandCyan],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// Premium violet gradient
  static const LinearGradient premiumGradient = LinearGradient(
    colors: [premiumDeep, premiumBase, premiumLight],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// Violet gradient — AI premium features
  static const LinearGradient violetGradient = LinearGradient(
    colors: [Color(0xFF7C3AED), Color(0xFF4F46E5)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// Violet → Cyan gradient — AI chat / smart features
  static const LinearGradient aiVioletGradient = LinearGradient(
    colors: [Color(0xFF7C3AED), brandBlue, brandCyan],
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );

  /// AI gradient: Cyan → Blue
  static const LinearGradient aiGradient = LinearGradient(
    colors: [brandCyan, brandBlue],
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );

  /// Green score gradient
  static const LinearGradient scoreGradient = LinearGradient(
    colors: [scoreExcellent, scoreGood],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// Legacy alias
  static const LinearGradient tealGradient = aiGradient;

  /// Send button: Cyan → Blue
  static const LinearGradient sendButtonGradient = LinearGradient(
    colors: [brandCyan, brandBlue],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// User chat bubble: Deep Blue → darker
  static const LinearGradient userBubbleGradient = LinearGradient(
    colors: [brandDeepBlue, Color(0xFF0D47A1)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// OLED mesh background — subtle blue glow on black
  static LinearGradient get meshBackgroundGradient => LinearGradient(
    colors: [
      backgroundDark,
      brandBlue.withValues(alpha: 0.03),
      brandCyan.withValues(alpha: 0.02),
      backgroundDark,
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    stops: const [0.0, 0.3, 0.7, 1.0],
  );

  /// Glass overlay — dark frosted glass
  static LinearGradient get glassGradient => LinearGradient(
    colors: [
      Colors.white.withValues(alpha: 0.08),
      Colors.white.withValues(alpha: 0.04),
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient get fabAiGradient => const LinearGradient(
    colors: [brandCyan, brandBlue],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient get aiBannerGradient => const LinearGradient(
    colors: [brandDeepBlue, brandBlue, brandCyan],
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );

  static LinearGradient get subscriptionFabGradient => const LinearGradient(
    colors: [brandCyan, brandBlue],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient get aiChatBgGlow => LinearGradient(
    colors: [
      backgroundDark,
      brandCyan.withValues(alpha: 0.04),
      brandBlue.withValues(alpha: 0.03),
      backgroundDark,
    ],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static LinearGradient categoryGradient(Color color) => LinearGradient(
    colors: [color.withValues(alpha: 0.80), color],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static LinearGradient categoryGradientLight(Color color) => LinearGradient(
    colors: [color.withValues(alpha: 0.15), color.withValues(alpha: 0.08)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // GLASS HELPERS — dark glassmorphism with neon edges
  // ─────────────────────────────────────────────────────────────────────────

  static Color get glassBg => Colors.white.withValues(alpha: 0.06);
  static Color get glassBgLight => Colors.white.withValues(alpha: 0.10);
  static Color get glassBorder => Colors.white.withValues(alpha: 0.10);
  static Color get glassBorderLight => Colors.white.withValues(alpha: 0.15);
  static const double glassBlur = 24.0;

  /// Dark glassmorphism decoration
  static BoxDecoration glassDecoration({
    double borderRadius = 20,
    double opacity = 0.06,
    double borderOpacity = 0.10,
  }) => BoxDecoration(
    color: Colors.white.withValues(alpha: opacity),
    borderRadius: BorderRadius.circular(borderRadius),
    border: Border.all(
      color: Colors.white.withValues(alpha: borderOpacity),
      width: 0.5,
    ),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SHADOWS — neon glow system on OLED
  // ─────────────────────────────────────────────────────────────────────────

  /// Subtle: minimal edge glow
  static List<BoxShadow> get subtleShadow => [
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.05),
      blurRadius: 4,
      offset: const Offset(0, 1),
    ),
  ];

  /// Card: soft ambient glow
  static List<BoxShadow> get cardShadow => [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.40),
      blurRadius: 8,
      offset: const Offset(0, 2),
    ),
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.04),
      blurRadius: 20,
      offset: const Offset(0, 4),
    ),
  ];

  /// Elevated: stronger glow for modals
  static List<BoxShadow> get elevatedShadow => [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.50),
      blurRadius: 16,
      offset: const Offset(0, 4),
    ),
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.06),
      blurRadius: 32,
      offset: const Offset(0, 8),
    ),
  ];

  /// Neon cyan glow
  static List<BoxShadow> get primaryGlow => [
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.30),
      blurRadius: 20,
      offset: const Offset(0, 4),
    ),
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.15),
      blurRadius: 48,
      offset: const Offset(0, 8),
    ),
  ];

  /// Cyan glow for AI elements
  static List<BoxShadow> get cyanGlow => [
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.35),
      blurRadius: 20,
      offset: const Offset(0, 4),
    ),
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.15),
      blurRadius: 48,
      offset: const Offset(0, 8),
    ),
  ];

  static List<BoxShadow> get primaryGlowMedium => [
    BoxShadow(
      color: neonCyan.withValues(alpha: 0.35),
      blurRadius: 24,
      offset: const Offset(0, 6),
    ),
  ];

  /// Violet glow for premium elements
  static List<BoxShadow> get premiumGlow => [
    BoxShadow(
      color: premiumBase.withValues(alpha: 0.28),
      blurRadius: 20,
      offset: const Offset(0, 4),
    ),
  ];

  /// Sky blue glow for highlights
  static List<BoxShadow> get pinkGlow => [
    BoxShadow(
      color: brandSkyBlue.withValues(alpha: 0.30),
      blurRadius: 20,
      offset: const Offset(0, 4),
    ),
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // SPACING — generous breathing room
  // ─────────────────────────────────────────────────────────────────────────

  static const double spacingXXS = 2.0;
  static const double spacingXS = 4.0;
  static const double spacingSM = 8.0;
  static const double spacingMD = 16.0;
  static const double spacingLG = 24.0;
  static const double spacingXL = 32.0;
  static const double spacingXXL = 48.0;

  // ─────────────────────────────────────────────────────────────────────────
  // FLOATING NAV BAR
  // ─────────────────────────────────────────────────────────────────────────

  static const double navBarHeight = 64.0;
  static const double navBarBottomMargin =
      10.0; // floating gap above system nav
  static const double navBarHMargin = 16.0; // pill horizontal margin
  static const double navBarTotalClearance =
      navBarHeight + 26.0; // 64+26=90, accounts for float

  // Branded 3-layer card shadow (blue tinted) — used in compare & premium surfaces
  static const List<BoxShadow> cardShadowBrand = [
    BoxShadow(color: Color(0x12005DD9), blurRadius: 4, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x10005DD9), blurRadius: 12, offset: Offset(0, 4)),
    BoxShadow(color: Color(0x08005DD9), blurRadius: 24, offset: Offset(0, 8)),
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // BORDER RADIUS
  // ─────────────────────────────────────────────────────────────────────────

  static const double radiusXS = 6.0;
  static const double radiusSM = 10.0;
  static const double radiusMD = 14.0;
  static const double radiusLG = 16.0;
  static const double radiusXL = 20.0;
  static const double radiusXXL = 28.0;
  static const double radiusRound = 100.0;

  static const double borderRadiusSmall = radiusSM;
  static const double borderRadiusMedium = radiusLG;
  static const double borderRadiusLarge = radiusXL;
  static const double borderRadiusXLarge = radiusXXL;

  // ─────────────────────────────────────────────────────────────────────────
  // TYPOGRAPHY — tight letter-spacing, bright on dark
  // ─────────────────────────────────────────────────────────────────────────

  static TextTheme _buildTextTheme(Color primary, Color secondary) => TextTheme(
    displayLarge: GoogleFonts.plusJakartaSans(
      fontSize: 40,
      fontWeight: FontWeight.w800,
      letterSpacing: -2.0,
      color: primary,
      height: 1.05,
    ),
    displayMedium: GoogleFonts.plusJakartaSans(
      fontSize: 32,
      fontWeight: FontWeight.w700,
      letterSpacing: -1.0,
      color: primary,
      height: 1.10,
    ),
    displaySmall: GoogleFonts.plusJakartaSans(
      fontSize: 28,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.8,
      color: primary,
      height: 1.15,
    ),
    headlineLarge: GoogleFonts.plusJakartaSans(
      fontSize: 22,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      color: primary,
      height: 1.20,
    ),
    headlineMedium: GoogleFonts.plusJakartaSans(
      fontSize: 20,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.4,
      color: primary,
      height: 1.25,
    ),
    headlineSmall: GoogleFonts.plusJakartaSans(
      fontSize: 18,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.3,
      color: primary,
      height: 1.30,
    ),
    titleLarge: GoogleFonts.plusJakartaSans(
      fontSize: 17,
      fontWeight: FontWeight.w600,
      color: primary,
      height: 1.35,
    ),
    titleMedium: GoogleFonts.plusJakartaSans(
      fontSize: 15,
      fontWeight: FontWeight.w500,
      color: primary,
      height: 1.40,
    ),
    titleSmall: GoogleFonts.plusJakartaSans(
      fontSize: 13,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.3,
      color: primary,
      height: 1.40,
    ),
    bodyLarge: GoogleFonts.plusJakartaSans(
      fontSize: 16,
      fontWeight: FontWeight.w400,
      color: secondary,
      height: 1.50,
    ),
    bodyMedium: GoogleFonts.plusJakartaSans(
      fontSize: 15,
      fontWeight: FontWeight.w400,
      color: secondary,
      height: 1.50,
    ),
    bodySmall: GoogleFonts.plusJakartaSans(
      fontSize: 13,
      fontWeight: FontWeight.w400,
      color: secondary,
      height: 1.50,
    ),
    labelLarge: GoogleFonts.plusJakartaSans(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      color: primary,
      height: 1.40,
    ),
    labelMedium: GoogleFonts.plusJakartaSans(
      fontSize: 13,
      fontWeight: FontWeight.w500,
      color: primary,
      height: 1.40,
    ),
    labelSmall: GoogleFonts.plusJakartaSans(
      fontSize: 11,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.5,
      color: secondary,
      height: 1.40,
    ),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LIGHT THEME — Clean slate/white + brand blue accents
  // ─────────────────────────────────────────────────────────────────────────

  static ThemeData get lightTheme {
    const colorScheme = ColorScheme.light(
      primary: brandBlue,
      secondary: brandDeepBlue,
      tertiary: brandSkyBlue,
      surface: surfaceLightMode,
      error: error,
      onPrimary: Color(0xFFFFFFFF),
      onSurface: textPrimaryLightMode,
      outline: dividerLightMode,
      surfaceContainerHighest: surfaceVariantLightMode,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: backgroundLightMode,
      textTheme: _buildTextTheme(textPrimaryLightMode, textSecondaryLightMode),

      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: textPrimaryLightMode,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.4,
          color: textPrimaryLightMode,
        ),
        iconTheme: const IconThemeData(color: textPrimaryLightMode, size: 22),
      ),

      cardTheme: CardThemeData(
        color: surfaceVariantLightMode,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(radiusXL)),
          side: BorderSide.none,
        ),
        margin: EdgeInsets.zero,
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brandBlue,
          foregroundColor: Colors.white,
          disabledBackgroundColor: surfaceVariantLightMode,
          disabledForegroundColor: textTertiaryLightMode,
          minimumSize: const Size(double.infinity, 56),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusLG),
          ),
          elevation: 0,
          shadowColor: Colors.transparent,
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: brandBlue,
          minimumSize: const Size(double.infinity, 50),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMD),
          ),
          side: const BorderSide(color: brandBlue, width: 1.5),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 17,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: brandBlue,
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceVariantLightMode,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: BorderSide(color: dividerLightMode, width: 0.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: BorderSide(color: dividerLightMode, width: 0.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: const BorderSide(color: brandBlue, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: const BorderSide(color: error, width: 1),
        ),
        hintStyle: GoogleFonts.plusJakartaSans(
          color: textTertiaryLightMode,
          fontSize: 15,
        ),
      ),

      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surfaceLightMode,
        selectedItemColor: brandBlue,
        unselectedItemColor: textTertiaryLightMode,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
        selectedLabelStyle: GoogleFonts.plusJakartaSans(
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: GoogleFonts.plusJakartaSans(
          fontSize: 10,
          fontWeight: FontWeight.w400,
        ),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surfaceLightMode,
        surfaceTintColor: Colors.transparent,
        indicatorColor: brandBlue.withValues(alpha: 0.12),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return GoogleFonts.plusJakartaSans(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: brandBlue,
            );
          }
          return GoogleFonts.plusJakartaSans(
            fontSize: 10,
            fontWeight: FontWeight.w400,
            color: textTertiaryLightMode,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: brandBlue, size: 24);
          }
          return const IconThemeData(color: textTertiaryLightMode, size: 24);
        }),
      ),

      chipTheme: ChipThemeData(
        backgroundColor: surfaceVariantLightMode,
        selectedColor: brandBlue.withValues(alpha: 0.12),
        labelStyle: GoogleFonts.plusJakartaSans(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: textPrimaryLightMode,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSM),
        ),
        side: BorderSide.none,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      ),

      dividerTheme: const DividerThemeData(
        color: Color(0x0F000000), // Very subtle in light mode
        thickness: 0.5,
        space: 0,
      ),

      listTileTheme: const ListTileThemeData(
        tileColor: surfaceLightMode,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),

      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: brandBlue,
        linearTrackColor: dividerLightMode,
      ),

      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? Colors.white
              : textTertiaryLightMode,
        ),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return brandBlue;
          return dividerLightMode;
        }),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: surfaceLightMode,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: textPrimaryLightMode,
        ),
      ),

      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surfaceLightMode,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        dragHandleColor: dividerLightMode,
        dragHandleSize: const Size(40, 4),
      ),

      popupMenuTheme: PopupMenuThemeData(
        color: surfaceLightMode,
        surfaceTintColor: Colors.transparent,
        elevation: 4,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: dividerLightMode, width: 0.5),
        ),
        textStyle: GoogleFonts.plusJakartaSans(
          fontSize: 14,
          color: textPrimaryLightMode,
        ),
      ),

      dropdownMenuTheme: DropdownMenuThemeData(
        menuStyle: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(surfaceLightMode),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          elevation: const WidgetStatePropertyAll(4),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: dividerLightMode, width: 0.5),
            ),
          ),
        ),
      ),

      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceVariantLightMode,
        contentTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: textPrimaryLightMode,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DARK THEME — OLED Black + Neon accents
  // ─────────────────────────────────────────────────────────────────────────

  static ThemeData get darkTheme {
    const colorScheme = ColorScheme.dark(
      primary: neonCyan,
      secondary: neonPurple,
      tertiary: neonPink,
      surface: surfaceDark,
      error: error,
      onPrimary: Color(0xFF000000),
      onSurface: textPrimaryDark,
      outline: dividerDark,
      surfaceContainerHighest: surfaceVariantDark,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: backgroundDark,
      textTheme: _buildTextTheme(textPrimaryDark, textSecondaryDark),

      // AppBar — transparent on OLED black
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: textPrimaryDark,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.4,
          color: textPrimaryDark,
        ),
        iconTheme: const IconThemeData(color: textPrimaryDark, size: 22),
      ),

      // Card — dark surface, subtle border
      cardTheme: CardThemeData(
        color: surfaceVariantDark,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(radiusXL)),
          side: BorderSide(color: dividerDark, width: 0.5),
        ),
        margin: EdgeInsets.zero,
      ),

      // Elevated Button — neon gradient style
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: neonCyan,
          foregroundColor: Colors.black,
          disabledBackgroundColor: const Color(0xFF1A1A1A),
          disabledForegroundColor: textTertiaryDark,
          minimumSize: const Size(double.infinity, 56),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusLG),
          ),
          elevation: 0,
          shadowColor: Colors.transparent,
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // Outlined Button
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: neonCyan,
          minimumSize: const Size(double.infinity, 50),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(radiusMD),
          ),
          side: const BorderSide(color: neonCyan, width: 1.5),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 17,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // Text Button
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: neonCyan,
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),

      // Input Decoration — dark fields with neon focus
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surfaceVariantDark,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: BorderSide(color: dividerDark, width: 0.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: BorderSide(color: dividerDark, width: 0.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: const BorderSide(color: neonCyan, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusMD),
          borderSide: const BorderSide(color: error, width: 1),
        ),
        hintStyle: GoogleFonts.plusJakartaSans(
          color: textTertiaryDark,
          fontSize: 15,
        ),
      ),

      // Bottom Navigation Bar
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surfaceDark,
        selectedItemColor: neonCyan,
        unselectedItemColor: textTertiaryDark,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
        selectedLabelStyle: GoogleFonts.plusJakartaSans(
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: GoogleFonts.plusJakartaSans(
          fontSize: 10,
          fontWeight: FontWeight.w400,
        ),
      ),

      // Navigation Bar (Material 3)
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surfaceDark,
        surfaceTintColor: Colors.transparent,
        indicatorColor: neonCyan.withValues(alpha: 0.15),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return GoogleFonts.plusJakartaSans(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: neonCyan,
            );
          }
          return GoogleFonts.plusJakartaSans(
            fontSize: 10,
            fontWeight: FontWeight.w400,
            color: textTertiaryDark,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: neonCyan, size: 24);
          }
          return const IconThemeData(color: textTertiaryDark, size: 24);
        }),
      ),

      // Chip
      chipTheme: ChipThemeData(
        backgroundColor: surfaceVariantDark,
        selectedColor: neonCyan.withValues(alpha: 0.15),
        labelStyle: GoogleFonts.plusJakartaSans(
          fontSize: 13,
          fontWeight: FontWeight.w500,
          color: textPrimaryDark,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radiusSM),
        ),
        side: BorderSide.none,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      ),

      // Divider
      dividerTheme: const DividerThemeData(
        color: dividerDark,
        thickness: 0.5,
        space: 0,
      ),

      // List Tile
      listTileTheme: const ListTileThemeData(
        tileColor: surfaceDark,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),

      // Progress Indicator
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: neonCyan,
        linearTrackColor: dividerDark,
      ),

      // Switch
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? Colors.black
              : textTertiaryDark,
        ),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return neonCyan;
          return const Color(0xFF1E293B);
        }),
        trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
      ),

      // Dialog
      dialogTheme: DialogThemeData(
        backgroundColor: surfaceElevatedDark,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        titleTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: textPrimaryDark,
        ),
      ),

      // Bottom Sheet
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surfaceElevatedDark,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        dragHandleColor: const Color(0xFF334155),
        dragHandleSize: const Size(40, 4),
      ),

      // Popup Menu — dark surface
      popupMenuTheme: PopupMenuThemeData(
        color: surfaceElevatedDark,
        surfaceTintColor: Colors.transparent,
        elevation: 4,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: dividerDark, width: 0.5),
        ),
        textStyle: GoogleFonts.plusJakartaSans(
          fontSize: 14,
          color: textPrimaryDark,
        ),
      ),

      // Dropdown Menu — dark surface
      dropdownMenuTheme: DropdownMenuThemeData(
        menuStyle: MenuStyle(
          backgroundColor: WidgetStatePropertyAll(surfaceElevatedDark),
          surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
          elevation: const WidgetStatePropertyAll(4),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(color: dividerDark, width: 0.5),
            ),
          ),
        ),
      ),

      // Snack Bar
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceElevatedDark,
        contentTextStyle: GoogleFonts.plusJakartaSans(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: textPrimaryDark,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER METHODS
  // ─────────────────────────────────────────────────────────────────────────

  static Color getScoreColor(double score) {
    if (score >= 80) return scoreExcellent;
    if (score >= 60) return scoreGood;
    if (score >= 40) return scoreAverage;
    return scorePoor;
  }

  static LinearGradient getScoreGradient(double score) {
    final color = getScoreColor(score);
    return LinearGradient(
      colors: [color, color.withValues(alpha: 0.70)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }

  static Color adaptiveColor({
    required Brightness brightness,
    required Color light,
    required Color dark,
  }) => brightness == Brightness.light ? light : dark;
}

// ─────────────────────────────────────────────────────────────────────────────
// BuildContext EXTENSIONS
// ─────────────────────────────────────────────────────────────────────────────

extension ThemeExtension on BuildContext {
  ThemeData get theme => Theme.of(this);
  TextTheme get textTheme => Theme.of(this).textTheme;
  ColorScheme get colorScheme => Theme.of(this).colorScheme;

  bool get isDarkMode => Theme.of(this).brightness == Brightness.dark;

  /// Localization — access translated strings via context.l10n?.home etc.
  AppLocalizations? get l10n => AppLocalizations.of(this);

  // Semantic color shortcuts
  Color get primaryColor => isDarkMode ? AppTheme.neonCyan : AppTheme.brandBlue;
  Color get secondaryColor =>
      isDarkMode ? AppTheme.neonPurple : AppTheme.brandDeepBlue;
  Color get accentColor => isDarkMode ? AppTheme.neonCyan : AppTheme.brandBlue;

  // Surface / text / divider
  Color get backgroundColor =>
      isDarkMode ? AppTheme.backgroundDark : AppTheme.backgroundLightMode;
  Color get surfaceColor =>
      isDarkMode ? AppTheme.surfaceDark : AppTheme.surfaceLightMode;
  Color get surfaceVariantColor => isDarkMode
      ? AppTheme.surfaceVariantDark
      : AppTheme.surfaceVariantLightMode;
  Color get surfaceElevatedColor => isDarkMode
      ? AppTheme.surfaceElevatedDark
      : AppTheme.surfaceElevatedLightMode;
  Color get textPrimary =>
      isDarkMode ? AppTheme.textPrimaryDark : AppTheme.textPrimaryLightMode;
  Color get textSecondary =>
      isDarkMode ? AppTheme.textSecondaryDark : AppTheme.textSecondaryLightMode;
  Color get textTertiaryColor =>
      isDarkMode ? AppTheme.textTertiaryDark : AppTheme.textTertiaryLightMode;
  Color get dividerColor =>
      isDarkMode ? AppTheme.dividerDark : AppTheme.dividerLightMode;
}
