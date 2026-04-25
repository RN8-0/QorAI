/// Qor AI - Settings Screen (iOS-Style Redesign)
/// Full iOS Settings UI with CupertinoListSection, country flags, functional buttons
library;

import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/paywall_sheet.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:qor_ai/services/notification_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _pushNotifications = true;
  bool _emailDigest = false;
  String _appVersionLabel = AppConstants.appVersion;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
    _loadAppMetadata();
  }

  Future<void> _loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _pushNotifications = prefs.getBool('push_notifications') ?? true;
      _emailDigest = prefs.getBool('email_digest') ?? false;
    });
  }

  Future<void> _loadAppMetadata() async {
    final info = await PackageInfo.fromPlatform();
    if (!mounted) return;

    final buildNumber = info.buildNumber.trim();
    setState(() {
      _appVersionLabel = buildNumber.isEmpty
          ? info.version
          : '${info.version} ($buildNumber)';
    });
  }

  Future<void> _togglePushNotifications(bool value) async {
    setState(() => _pushNotifications = value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('push_notifications', value);
    await NotificationService.instance.setEnabled(value);
  }

  Future<void> _toggleEmailDigest(bool value) async {
    setState(() => _emailDigest = value);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('email_digest', value);
  }

  static const Map<String, String> _languageNames = {
    'en': 'English',
    'tr': 'Türkçe',
    'de': 'Deutsch',
    'fr': 'Français',
    'it': 'Italiano',
    'es': 'Español',
    'ja': '日本語',
    'nl': 'Nederlands',
    'sv': 'Svenska',
    'pl': 'Polski',
    'pt': 'Português',
    'ar': 'العربية',
  };

  // Country code -> flag emoji via regional indicator symbols
  static String _flag(String code) {
    return code
        .toUpperCase()
        .codeUnits
        .map((c) => String.fromCharCode(c - 0x41 + 0x1F1E6))
        .join();
  }

  @override
  Widget build(BuildContext context) {
    final selectedCountry = ref.watch(selectedCountryProvider);
    final userAsync = ref.watch(userProfileProvider);
    final user = userAsync.valueOrNull;
    final authRecord = pb.authStore.record;
    final fallbackName = _resolveAuthDisplayName(authRecord);
    final fallbackEmail = authRecord?.getStringValue('email').trim() ?? '';
    final fallbackPhotoUrl = _resolveAuthPhotoUrl(authRecord);
    final profileName = _pickNonEmpty(user?.displayName, fallbackName, 'User');
    final profileEmail = _pickNonEmpty(user?.email, fallbackEmail, '');
    final profilePhotoUrl = _pickNonEmpty(user?.photoURL, fallbackPhotoUrl, '');
    final countryInfo = SupportedCountries.countries[selectedCountry];
    final currentLocale = ref.watch(localeProvider);
    final currentLangCode = currentLocale?.languageCode ?? 'en';
    final currentLangName = _languageNames[currentLangCode] ?? 'English';
    final currentThemeMode = ref.watch(themeModeProvider);
    final textScale = ref.watch(textScaleProvider);
    final isPremium = ref.watch(premiumProvider);
    final themeLabel = currentThemeMode == ThemeMode.dark
        ? (context.l10n?.darkThemeLabel ?? 'Dark')
        : currentThemeMode == ThemeMode.light
        ? (context.l10n?.lightThemeLabel ?? 'Light')
        : (context.l10n?.systemThemeLabel ?? 'System');

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(
          parent: AlwaysScrollableScrollPhysics(),
        ),
        slivers: [
          CupertinoSliverNavigationBar(
            largeTitle: Text(
              context.l10n?.settings ?? 'Settings',
              style: TextStyle(color: context.textPrimary),
            ),
            backgroundColor: context.backgroundColor.withValues(alpha: 0.94),
            border: null,
            leading: CupertinoButton(
              padding: EdgeInsets.zero,
              child: const Icon(CupertinoIcons.back, color: AppTheme.neonCyan),
              onPressed: () => context.pop(),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (user != null || authRecord != null) ...[
                    _buildProfileCard(
                      name: profileName,
                      email: profileEmail,
                      photoUrl: profilePhotoUrl,
                      onTap: () => context.push(AppRoutes.editProfile),
                    ),
                    const SizedBox(height: 24),
                  ],
                  _iosSection(
                    header: (context.l10n?.appearance ?? 'Appearance')
                        .toUpperCase(),
                    children: [
                      _iosRow(
                        icon: CupertinoIcons.sun_max_fill,
                        iconBg: const Color(0xFFF59E0B),
                        title: context.l10n?.theme ?? 'Theme',
                        trailing: Text(themeLabel, style: _trailingStyle),
                        onTap: () => _showThemePicker(context),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.textformat_size,
                        iconBg: const Color(0xFF8B5CF6),
                        title: context.l10n?.displaySettings ?? 'Display',
                        trailing: Text(
                          _displayScaleLabel(context, textScale),
                          style: _trailingStyle,
                        ),
                        onTap: () => _showDisplayPicker(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _iosSection(
                    header:
                        (context.l10n?.regionAndLanguage ?? 'Region & Language')
                            .toUpperCase(),
                    children: [
                      _iosRow(
                        icon: CupertinoIcons.globe,
                        iconBg: AppTheme.neonCyan,
                        title: context.l10n?.country ?? 'Country',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _flag(selectedCountry),
                              style: const TextStyle(fontSize: 18),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              countryInfo?.name ?? selectedCountry,
                              style: _trailingStyle,
                            ),
                          ],
                        ),
                        onTap: () => _showCountryPicker(context, ref),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.textformat,
                        iconBg: const Color(0xFF06B6D4),
                        title: context.l10n?.language ?? 'Language',
                        trailing: Text(currentLangName, style: _trailingStyle),
                        onTap: () =>
                            _showLanguagePicker(context, ref, currentLangCode),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _iosSection(
                    header:
                        (context.l10n?.notificationsSection ?? 'Notifications')
                            .toUpperCase(),
                    children: [
                      _iosSwitchRow(
                        icon: CupertinoIcons.bell_fill,
                        iconBg: const Color(0xFFEF4444),
                        title:
                            context.l10n?.pushNotifications ??
                            'Push Notifications',
                        value: _pushNotifications,
                        onChanged: _togglePushNotifications,
                      ),
                      _iosDivider(),
                      _iosSwitchRow(
                        icon: CupertinoIcons.mail_solid,
                        iconBg: AppTheme.neonCyan,
                        title: context.l10n?.emailUpdates ?? 'Email Updates',
                        value: _emailDigest,
                        onChanged: _toggleEmailDigest,
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _iosSection(
                    header: (context.l10n?.account ?? 'Account').toUpperCase(),
                    children: [
                      _iosRow(
                        icon: CupertinoIcons.person_fill,
                        iconBg: AppTheme.neonCyan,
                        title: context.l10n?.editProfile ?? 'Edit Profile',
                        onTap: () => context.push(AppRoutes.editProfile),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.star_fill,
                        iconBg: const Color(0xFFEAB308),
                        title: context.l10n?.subscription ?? 'Subscription',
                        trailing: _buildPlanBadge(isPremium),
                        onTap: () => showPaywallSheet(context),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.arrow_down_doc_fill,
                        iconBg: const Color(0xFF64748B),
                        title: context.l10n?.exportMyData ?? 'Export My Data',
                        onTap: () => _showExportDataDialog(context, ref, user),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.trash_fill,
                        iconBg: const Color(0xFF64748B),
                        title: context.l10n?.clearCache ?? 'Clear Cache',
                        onTap: () => _showClearCacheDialog(context),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _iosSection(
                    header: (context.l10n?.helpSupport ?? 'Help & Support')
                        .toUpperCase(),
                    children: [
                      _iosRow(
                        icon: CupertinoIcons.chat_bubble_text_fill,
                        iconBg: const Color(0xFF06B6D4),
                        title: context.l10n?.contactUs ?? 'Contact Us',
                        onTap: () => _showContactForm(context),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.question_circle_fill,
                        iconBg: const Color(0xFFF59E0B),
                        title: context.l10n?.faqHelp ?? 'FAQ & Help',
                        onTap: () async {
                          final helpCenterMessage =
                              context.l10n?.helpCenterComingSoon ??
                              'Help center coming soon';
                          final uri = Uri.parse('https://qorai.net/faq');
                          try {
                            await launchUrl(
                              uri,
                              mode: LaunchMode.externalApplication,
                            );
                          } catch (_) {
                            if (!mounted) return;
                            _showInfoSnackbar(helpCenterMessage);
                          }
                        },
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.star_circle_fill,
                        iconBg: const Color(0xFFF97316),
                        title: context.l10n?.rateApp ?? 'Rate App',
                        onTap: () async {
                          final storePageMessage =
                              context.l10n?.storePageComingSoon ??
                              'Store page will be available after launch';
                          final uri = Uri.parse(
                            'https://play.google.com/store/apps/details?id=${AppConstants.playStorePackageId}',
                          );
                          try {
                            await launchUrl(
                              uri,
                              mode: LaunchMode.externalApplication,
                            );
                          } catch (_) {
                            if (!mounted) return;
                            _showInfoSnackbar(storePageMessage);
                          }
                        },
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.share,
                        iconBg: AppTheme.neonCyan,
                        title: context.l10n?.share ?? 'Share',
                        onTap: () {
                          Share.share(
                            'Check out Qor AI - Smart Product Comparison!\nhttps://qorai.net',
                            subject: 'Qor AI App',
                          );
                        },
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _iosSection(
                    header: 'LEGAL',
                    children: [
                      _iosRow(
                        icon: CupertinoIcons.shield_fill,
                        iconBg: const Color(0xFF64748B),
                        title: context.l10n?.privacyPolicy ?? 'Privacy Policy',
                        onTap: () => _launchWebUrl('https://qorai.net/privacy'),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.doc_text_fill,
                        iconBg: const Color(0xFF64748B),
                        title:
                            context.l10n?.termsOfService ?? 'Terms of Service',
                        onTap: () => _launchWebUrl('https://qorai.net/terms'),
                      ),
                      _iosDivider(),
                      _iosRow(
                        icon: CupertinoIcons.book_fill,
                        iconBg: const Color(0xFF64748B),
                        title:
                            context.l10n?.openSourceLicenses ??
                            'Open Source Licenses',
                        onTap: () => showLicensePage(
                          context: context,
                          applicationName: 'Qor AI',
                          applicationVersion: _appVersionLabel,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _iosSection(
                    children: [
                      _iosRow(
                        icon: CupertinoIcons.info_circle_fill,
                        iconBg: const Color(0xFF94A3B8),
                        title: context.l10n?.appVersion ?? 'App Version',
                        trailing: Text(_appVersionLabel, style: _trailingStyle),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _buildSignOutButton(context, ref),
                  const SizedBox(height: 16),
                  Center(
                    child: CupertinoButton(
                      onPressed: () => _showDeleteAccountSheet(context, ref),
                      child: Text(
                        context.l10n?.deleteAccount ?? 'Delete Account',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: const Color(0xFFEF4444),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  TextStyle get _trailingStyle =>
      GoogleFonts.plusJakartaSans(fontSize: 14, color: context.textSecondary);

  Widget _iosSection({String? header, required List<Widget> children}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (header != null)
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 6),
            child: Text(
              header,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: context.textTertiaryColor,
                letterSpacing: 0.5,
              ),
            ),
          ),
        Container(
          decoration: BoxDecoration(
            color: isDark
                ? Colors.white.withValues(alpha: 0.06)
                : context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.08)
                  : Colors.black.withValues(alpha: 0.06),
              width: 0.5,
            ),
            boxShadow: isDark ? null : AppTheme.subtleShadow,
          ),
          clipBehavior: Clip.hardEdge,
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _iosDivider() =>
      Divider(height: 0.5, color: context.dividerColor, indent: 56);

  Widget _iosRow({
    required IconData icon,
    required Color iconBg,
    required String title,
    Widget? trailing,
    VoidCallback? onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap?.call();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Icon(icon, color: Colors.white, size: 17),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  title,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: context.textPrimary,
                  ),
                ),
              ),
              if (trailing != null) ...[trailing, const SizedBox(width: 4)],
              if (onTap != null)
                Icon(
                  CupertinoIcons.chevron_forward,
                  size: 15,
                  color: context.textTertiaryColor,
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _iosSwitchRow({
    required IconData icon,
    required Color iconBg,
    required String title,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: iconBg,
              borderRadius: BorderRadius.circular(7),
            ),
            child: Icon(icon, color: Colors.white, size: 17),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              title,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: context.textPrimary,
              ),
            ),
          ),
          CupertinoSwitch(
            value: value,
            activeTrackColor: AppTheme.neonCyan,
            onChanged: (v) {
              HapticFeedback.selectionClick();
              onChanged(v);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildProfileCard({
    required String name,
    required String email,
    required String photoUrl,
    required VoidCallback onTap,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isDark
                ? Colors.white.withValues(alpha: 0.06)
                : context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isDark
                  ? AppTheme.brandCyan.withValues(alpha: 0.15)
                  : AppTheme.brandCyan.withValues(alpha: 0.12),
              width: 0.8,
            ),
            boxShadow: AppTheme.cardShadow,
          ),
          child: Row(
            children: [
              _buildProfileAvatar(name: name, photoUrl: photoUrl),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                CupertinoIcons.chevron_forward,
                size: 15,
                color: context.textTertiaryColor,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProfileAvatar({required String name, required String photoUrl}) {
    if (photoUrl.trim().isNotEmpty && !_isGeneratedAvatarUrl(photoUrl)) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: CachedNetworkImage(
          imageUrl: photoUrl,
          width: 52,
          height: 52,
          fit: BoxFit.cover,
          errorWidget: (context, error, stackTrace) =>
              _buildInitialAvatar(name),
        ),
      );
    }

    return _buildInitialAvatar(name);
  }

  Widget _buildInitialAvatar(String name) {
    final palette = _avatarPalettes[_avatarSeed(name) % _avatarPalettes.length];
    final initials = _avatarInitials(name);
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: palette,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(
            color: palette.last.withValues(alpha: 0.22),
            blurRadius: 14,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Center(
        child: Text(
          initials,
          style: GoogleFonts.plusJakartaSans(
            color: Colors.white,
            fontSize: initials.length > 1 ? 20 : 24,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.6,
          ),
        ),
      ),
    );
  }

  static const List<List<Color>> _avatarPalettes = [
    [Color(0xFF0EA5E9), Color(0xFF2563EB)],
    [Color(0xFF06B6D4), Color(0xFF0F766E)],
    [Color(0xFF8B5CF6), Color(0xFF4F46E5)],
    [Color(0xFFF97316), Color(0xFFEA580C)],
    [Color(0xFF10B981), Color(0xFF059669)],
  ];

  int _avatarSeed(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return 0;
    return trimmed.codeUnits.fold<int>(0, (sum, unit) => sum + unit);
  }

  String _avatarInitials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    if (parts.isEmpty) return 'Q';
    if (parts.length == 1) {
      final part = parts.first;
      return part.substring(0, part.length >= 2 ? 2 : 1).toUpperCase();
    }
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }

  Widget _buildPlanBadge(bool isPremium) {
    final gradient = isPremium
        ? AppTheme.premiumGradient
        : AppTheme.primaryGradient;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        isPremium ? 'PREMIUM' : (context.l10n?.free ?? 'Free'),
        style: GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );
  }

  Widget _buildSignOutButton(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: () => _showSignOutDialog(context, ref),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: isDark
              ? Colors.white.withValues(alpha: 0.06)
              : context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.08)
                : Colors.black.withValues(alpha: 0.06),
            width: 0.5,
          ),
        ),
        child: Center(
          child: Text(
            context.l10n?.signOut ?? 'Sign Out',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: const Color(0xFFEF4444),
            ),
          ),
        ),
      ),
    );
  }

  void _showDisplayPicker(BuildContext context) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => CupertinoActionSheet(
        title: Text(context.l10n?.displaySettings ?? 'Display Settings'),
        message: Text(
          context.l10n?.textSizePreference ?? 'Choose text size preference',
        ),
        actions: [
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _applyTextScale(0.85, 'Small');
            },
            child: Text(
              context.l10n?.small ?? 'Small',
              style: const TextStyle(fontSize: 14),
            ),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _applyTextScale(1.0, 'Default');
            },
            isDefaultAction: true,
            child: const Text('Default'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              _applyTextScale(1.15, 'Large');
            },
            child: Text(
              context.l10n?.large ?? 'Large',
              style: const TextStyle(fontSize: 18),
            ),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(context),
          child: Text(context.l10n?.cancel ?? 'Cancel'),
        ),
      ),
    );
  }

  void _applyTextScale(double scale, String label) {
    ref.read(textScaleProvider.notifier).setTextScale(scale);
    _showInfoSnackbar('$label ✓');
  }

  void _showInfoSnackbar(String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        backgroundColor: const Color(0xFF1C1C1E),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _showThemePicker(BuildContext context) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => CupertinoActionSheet(
        title: Text(context.l10n?.selectTheme ?? 'Select Theme'),
        actions: [
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              ref
                  .read(themeModeProvider.notifier)
                  .setThemeMode(ThemeMode.light);
            },
            child: Text(context.l10n?.lightMode ?? 'Light Mode'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              ref.read(themeModeProvider.notifier).setThemeMode(ThemeMode.dark);
            },
            child: Text(context.l10n?.darkMode ?? 'Dark Mode'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(context);
              ref
                  .read(themeModeProvider.notifier)
                  .setThemeMode(ThemeMode.system);
            },
            child: Text(context.l10n?.systemDefault ?? 'System Default'),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(context),
          child: Text(context.l10n?.cancel ?? 'Cancel'),
        ),
      ),
    );
  }

  void _showCountryPicker(BuildContext context, WidgetRef ref) {
    final current = ref.read(selectedCountryProvider);
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 8),
              width: 36,
              height: 5,
              decoration: BoxDecoration(
                color: context.dividerColor,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: Text(
                context.l10n?.selectCountry ?? 'Select Country',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ),
            Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.dividerColor, width: 0.5),
                ),
                clipBehavior: Clip.hardEdge,
                child: ListView.separated(
                  itemCount: SupportedCountries.countries.length,
                  separatorBuilder: (context, index) => Divider(
                    height: 0.5,
                    color: context.dividerColor,
                    indent: 56,
                  ),
                  itemBuilder: (context, index) {
                    final entry = SupportedCountries.countries.entries
                        .elementAt(index);
                    final isSelected = current == entry.key;
                    return Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref
                              .read(selectedCountryProvider.notifier)
                              .setCountry(entry.key);
                          // Save to Firestore if logged in
                          _updateFirestoreCountry(
                            ref,
                            entry.key,
                            entry.value.currency,
                          );
                          Navigator.pop(context);
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                          child: Row(
                            children: [
                              Text(
                                _flag(entry.key),
                                style: const TextStyle(fontSize: 26),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      entry.value.name,
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w500,
                                        color: context.textPrimary,
                                      ),
                                    ),
                                    Text(
                                      '${entry.value.currency} · ${entry.value.language}',
                                      style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12,
                                        color: context.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              if (isSelected)
                                const Icon(
                                  CupertinoIcons.checkmark_circle_fill,
                                  color: AppTheme.neonCyan,
                                  size: 22,
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _showLanguagePicker(
    BuildContext context,
    WidgetRef ref,
    String currentCode,
  ) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 8),
              width: 36,
              height: 5,
              decoration: BoxDecoration(
                color: context.dividerColor,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: Text(
                context.l10n?.selectLanguage ?? 'Select Language',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ),
            Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: context.dividerColor, width: 0.5),
                ),
                clipBehavior: Clip.hardEdge,
                child: ListView.separated(
                  itemCount: _languageNames.length,
                  separatorBuilder: (context, index) => Divider(
                    height: 0.5,
                    color: context.dividerColor,
                    indent: 56,
                  ),
                  itemBuilder: (context, index) {
                    final entry = _languageNames.entries.elementAt(index);
                    final isSelected = currentCode == entry.key;
                    return Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref
                              .read(localeProvider.notifier)
                              .setLocale(entry.key);
                          // Save language to Firestore if logged in
                          _updateFirestoreLanguage(ref, entry.key);
                          Navigator.pop(context);
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  entry.value,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w500,
                                    color: context.textPrimary,
                                  ),
                                ),
                              ),
                              if (isSelected)
                                const Icon(
                                  CupertinoIcons.checkmark_circle_fill,
                                  color: AppTheme.neonCyan,
                                  size: 22,
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  void _updateFirestoreCountry(
    WidgetRef ref,
    String countryCode,
    String currency,
  ) {
    final authState = ref.read(authStateProvider).valueOrNull;
    if (authState != null) {
      ref.read(pbDataSourceProvider).updateUser(authState, {
        'country': countryCode,
        'currency': currency,
      });
    }
  }

  void _updateFirestoreLanguage(WidgetRef ref, String languageCode) {
    final authState = ref.read(authStateProvider).valueOrNull;
    if (authState != null) {
      ref.read(pbDataSourceProvider).updateUser(authState, {
        'language': languageCode,
      });
    }
  }

  void _showSignOutDialog(BuildContext context, WidgetRef ref) {
    showCupertinoDialog(
      context: context,
      builder: (_) => CupertinoAlertDialog(
        title: Text(context.l10n?.signOut ?? 'Sign Out'),
        content: Text(
          context.l10n?.signOutConfirm ?? 'Are you sure you want to sign out?',
        ),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            child: Text(context.l10n?.cancel ?? 'Cancel'),
            onPressed: () => Navigator.pop(context),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            child: Text(context.l10n?.signOut ?? 'Sign Out'),
            onPressed: () async {
              final navigator = GoRouter.of(context);
              Navigator.pop(context);
              await ref.read(authRepositoryProvider).signOut();
              if (!mounted) return;
              navigator.go(AppRoutes.login);
            },
          ),
        ],
      ),
    );
  }

  void _showDeleteAccountSheet(BuildContext context, WidgetRef ref) {
    final navigator = GoRouter.of(context);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.6),
      builder: (ctx) => _DeleteAccountSheet(
        widgetRef: ref,
        navigator: navigator,
        onSuccess: () {
          // Clear locally cached premium flags so they don't bleed into
          // the next account. Play Store will re-deliver via restorePurchases.
          ref.read(subscriptionServiceProvider).clearLocalPremium();
          ref.read(selectedCountryProvider.notifier).resetToAutoDetect();
          navigator.go(AppRoutes.login);
        },
        onError: (msg) => _showInfoSnackbar(msg),
      ),
    );
  }

  void _showClearCacheDialog(BuildContext context) {
    showCupertinoDialog(
      context: context,
      builder: (_) => CupertinoAlertDialog(
        title: Text(context.l10n?.clearCache ?? 'Clear Cache'),
        content: Text(
          context.l10n?.clearCacheWarning ??
              'This will clear cached images and data. The app may load slower temporarily.',
        ),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            child: Text(context.l10n?.cancel ?? 'Cancel'),
            onPressed: () => Navigator.pop(context),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            child: Text(context.l10n?.clear ?? 'Clear'),
            onPressed: () async {
              final cacheClearedMessage =
                  context.l10n?.cacheCleared ?? 'Cache cleared successfully';
              Navigator.pop(context);
              try {
                await ref.read(cacheServiceProvider).clearAll();
                PaintingBinding.instance.imageCache.clear();
                PaintingBinding.instance.imageCache.clearLiveImages();
                if (!mounted) return;
                _showInfoSnackbar(cacheClearedMessage);
              } catch (_) {
                if (mounted) _showInfoSnackbar('Error clearing cache');
              }
            },
          ),
        ],
      ),
    );
  }

  void _showExportDataDialog(
    BuildContext context,
    WidgetRef ref,
    dynamic user,
  ) {
    showCupertinoDialog(
      context: context,
      builder: (_) => CupertinoAlertDialog(
        title: Text(context.l10n?.exportMyData ?? 'Export My Data'),
        content: Text(
          context.l10n?.exportDataConfirm ??
              'Your data will be sent to your email address.',
        ),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            child: Text(context.l10n?.cancel ?? 'Cancel'),
            onPressed: () => Navigator.pop(context),
          ),
          CupertinoDialogAction(
            child: Text(context.l10n?.exportLabel ?? 'Export'),
            onPressed: () async {
              final exportMessage =
                  context.l10n?.dataExported ?? 'Data exported';
              Navigator.pop(context);
              final payload = JsonEncoder.withIndent('  ').convert({
                'exportedAt': DateTime.now().toIso8601String(),
                'user': user == null
                    ? null
                    : {
                        'uid': user.uid,
                        'email': user.email,
                        'displayName': user.displayName,
                        'photoURL': user.photoURL,
                        'country': user.country,
                        'language': user.language,
                        'currency': user.currency,
                        'ecosystem': user.ecosystem,
                        'budgetRange': user.budgetRange,
                        'priorities': user.priorities,
                        'currentDevices': user.currentDevices,
                        'subscriptions': user.subscriptions,
                        'ownedProducts': user.ownedProducts,
                        'favorites': user.favorites,
                        'quizCompleted': user.quizCompleted,
                        'isPremium': user.isPremium,
                        'affiliateClicks': user.affiliateClicks,
                        'comparisonsCount': user.comparisonsCount,
                        'primaryCategory': user.primaryCategory,
                        'usageIntent': user.usageIntent,
                        'birthDate': user.birthDate?.toIso8601String(),
                        'gender': user.gender,
                        'ageRange': user.ageRange,
                        'profession': user.profession,
                        'interestCategories': user.interestCategories,
                        'profileVector': user.profileVector,
                        'userSubscriptionDetails': user.userSubscriptionDetails,
                      },
                'settings': {
                  'themeMode': ref.read(themeModeProvider).name,
                  'textScale': ref.read(textScaleProvider),
                  'selectedCountry': ref.read(selectedCountryProvider),
                  'language': ref.read(localeProvider)?.languageCode ?? 'en',
                  'pushNotifications': _pushNotifications,
                  'emailDigest': _emailDigest,
                },
              });
              await Share.share(payload, subject: 'Qor AI Data Export');
              if (!mounted) return;
              _showInfoSnackbar(exportMessage);
            },
          ),
        ],
      ),
    );
  }

  Future<void> _launchWebUrl(String url) async {
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (!mounted) return;
      _showInfoSnackbar('Could not open $url');
    }
  }

  Future<void> _launchEmail() async {
    final emailErrorMessage =
        context.l10n?.couldNotOpenEmail ?? 'Could not open email app';
    final uri = Uri(
      scheme: 'mailto',
      path: 'support@qorai.app',
      queryParameters: {'subject': 'Qor AI Feedback'},
    );
    try {
      await launchUrl(uri);
    } catch (_) {
      if (!mounted) return;
      _showInfoSnackbar(emailErrorMessage);
    }
  }

  void _showContactForm(BuildContext context) {
    final userAsync = ref.read(userProfileProvider);
    final user = userAsync.valueOrNull;
    final nameCtrl = TextEditingController(text: user?.displayName ?? '');
    final emailCtrl = TextEditingController(text: user?.email ?? '');
    final msgCtrl = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool sending = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom,
          ),
          child: Container(
            decoration: BoxDecoration(
              color: Theme.of(ctx).colorScheme.surface,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey.withOpacity(0.3),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    context.l10n?.contactUs ?? 'Contact Us',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: nameCtrl,
                    decoration: InputDecoration(
                      labelText: context.l10n?.fullName ?? 'Full Name',
                      border: const OutlineInputBorder(),
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? (context.l10n?.required ?? 'Required')
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'E-posta',
                      border: OutlineInputBorder(),
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? (context.l10n?.required ?? 'Required')
                        : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: msgCtrl,
                    maxLines: 4,
                    maxLength: 2000,
                    decoration: InputDecoration(
                      labelText: context.l10n?.message ?? 'Message',
                      border: const OutlineInputBorder(),
                      alignLabelWithHint: true,
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? (context.l10n?.required ?? 'Required')
                        : null,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: sending
                        ? null
                        : () async {
                            if (!formKey.currentState!.validate()) return;
                            setState(() => sending = true);
                            try {
                              await ref
                                  .read(pbDataSourceProvider)
                                  .sendSupportMessage(
                                    userId: user?.id,
                                    displayName: nameCtrl.text.trim(),
                                    email: emailCtrl.text.trim(),
                                    message: msgCtrl.text.trim(),
                                  );
                              if (!ctx.mounted) return;
                              Navigator.pop(ctx);
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text(
                                    context.l10n?.messageSent ??
                                        'Message sent! We\'ll get back to you soon.',
                                  ),
                                ),
                              );
                            } catch (e) {
                              setState(() => sending = false);
                              if (!ctx.mounted) return;
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                SnackBar(content: Text('Error: $e')),
                              );
                            }
                          },
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: sending
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(context.l10n?.send ?? 'Send'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _displayScaleLabel(BuildContext context, double scale) {
    if (scale <= 0.9) return context.l10n?.small ?? 'Small';
    if (scale >= 1.1) return context.l10n?.large ?? 'Large';
    return context.l10n?.defaultString ?? 'Default';
  }

  String _pickNonEmpty(String? primary, String? secondary, String fallback) {
    final first = primary?.trim() ?? '';
    if (first.isNotEmpty) return first;

    final second = secondary?.trim() ?? '';
    if (second.isNotEmpty) return second;

    return fallback;
  }

  String _resolveAuthDisplayName(RecordModel? auth) {
    if (auth == null) return '';

    final displayName = auth.getStringValue('displayName').trim();
    if (displayName.isNotEmpty) return displayName;

    final name = auth.getStringValue('name').trim();
    if (name.isNotEmpty) return name;

    final email = auth.getStringValue('email').trim();
    if (email.isNotEmpty) return email.split('@').first;

    return '';
  }

  String _resolveAuthPhotoUrl(RecordModel? auth) {
    if (auth == null) return '';
    final photoUrl = auth.getStringValue('photoURL').trim();
    return _isGeneratedAvatarUrl(photoUrl) ? '' : photoUrl;
  }

  bool _isGeneratedAvatarUrl(String photoUrl) {
    return photoUrl.trim().toLowerCase().contains('ui-avatars.com');
  }
}

// ─── Delete Account Bottom Sheet ─────────────────────────────────────────────

class _DeleteAccountSheet extends StatefulWidget {
  const _DeleteAccountSheet({
    required this.widgetRef,
    required this.navigator,
    required this.onSuccess,
    required this.onError,
  });

  final WidgetRef widgetRef;
  final GoRouter navigator;
  final VoidCallback onSuccess;
  final void Function(String) onError;

  @override
  State<_DeleteAccountSheet> createState() => _DeleteAccountSheetState();
}

class _DeleteAccountSheetState extends State<_DeleteAccountSheet>
    with SingleTickerProviderStateMixin {
  int _step = 0; // 0 = warning, 1 = confirm
  final _controller = TextEditingController();
  bool _deleting = false;
  late final AnimationController _slideCtrl;
  late final Animation<Offset> _slideAnim;

  bool get _isTr =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  String get _confirmPhrase =>
      _isTr ? 'hesabımı silmek istiyorum' : 'I want to delete my account';

  bool get _confirmed =>
      _controller.text.trim().toLowerCase() == _confirmPhrase.toLowerCase();

  static const _red = Color(0xFFEF4444);

  @override
  void initState() {
    super.initState();
    _slideCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
    );
    _slideAnim = Tween<Offset>(
      begin: const Offset(1, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _slideCtrl, curve: Curves.easeOutCubic));
  }

  @override
  void dispose() {
    _controller.dispose();
    _slideCtrl.dispose();
    super.dispose();
  }

  void _goToStep2() {
    setState(() => _step = 1);
    _slideCtrl.forward(from: 0);
  }

  Future<void> _deleteAccount() async {
    setState(() => _deleting = true);
    final result = await widget.widgetRef
        .read(authRepositoryProvider)
        .deleteCurrentUser();
    if (!mounted) return;
    Navigator.of(context).pop();
    switch (result) {
      case Success():
        widget.onSuccess();
      case Failure(error: final error):
        widget.onError(error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).viewInsets.bottom;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 200),
      padding: EdgeInsets.only(bottom: bottomPadding),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Drag handle
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.dividerColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Red gradient header
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    _red.withValues(alpha: 0.18),
                    _red.withValues(alpha: 0.06),
                  ],
                ),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: _red.withValues(alpha: 0.25),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: _red.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      CupertinoIcons.exclamationmark_triangle_fill,
                      color: _red,
                      size: 24,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _isTr ? 'Hesabı Sil' : 'Delete Account',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: _red,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _isTr
                              ? 'Bu işlem geri alınamaz'
                              : 'This action cannot be undone',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: _red.withValues(alpha: 0.8),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            // Step indicator
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Row(
                children: [
                  _stepDot(0),
                  Expanded(
                    child: Container(
                      height: 2,
                      color: _step >= 1
                          ? _red
                          : context.dividerColor,
                    ),
                  ),
                  _stepDot(1),
                ],
              ),
            ),
            // Content
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
              child: _step == 0 ? _buildStep1() : _buildStep2(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stepDot(int stepIndex) {
    final active = _step >= stepIndex;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? _red : context.dividerColor,
      ),
      child: Center(
        child: Text(
          '${stepIndex + 1}',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: active ? Colors.white : context.textTertiaryColor,
          ),
        ),
      ),
    );
  }

  Widget _buildStep1() {
    final items = _isTr
        ? [
            (CupertinoIcons.person_fill, 'Profil ve hesap bilgileri'),
            (CupertinoIcons.chart_bar_fill, 'Karşılaştırma geçmişi'),
            (CupertinoIcons.heart_fill, 'Favoriler ve koleksiyonlar'),
            (CupertinoIcons.pencil, 'Yorumlar ve analizler'),
            (CupertinoIcons.clock_fill, 'Son görüntüleme geçmişi'),
          ]
        : [
            (CupertinoIcons.person_fill, 'Profile and account info'),
            (CupertinoIcons.chart_bar_fill, 'Comparison history'),
            (CupertinoIcons.heart_fill, 'Favorites and collections'),
            (CupertinoIcons.pencil, 'Reviews and analyses'),
            (CupertinoIcons.clock_fill, 'Recently viewed history'),
          ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _isTr
              ? 'Kalıcı olarak silinecek veriler:'
              : 'Data that will be permanently deleted:',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: context.textPrimary,
          ),
        ),
        const SizedBox(height: 12),
        ...items.map(
          (item) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: _red.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(item.$1, color: _red, size: 16),
                ),
                const SizedBox(width: 12),
                Text(
                  item.$2,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    color: context.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: CupertinoButton(
                padding: const EdgeInsets.symmetric(vertical: 14),
                color: context.dividerColor.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(12),
                onPressed: () => Navigator.of(context).pop(),
                child: Text(
                  _isTr ? 'Vazgeç' : 'Cancel',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: CupertinoButton(
                padding: const EdgeInsets.symmetric(vertical: 14),
                color: _red,
                borderRadius: BorderRadius.circular(12),
                onPressed: _goToStep2,
                child: Text(
                  _isTr ? 'Devam Et →' : 'Continue →',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStep2() {
    return SlideTransition(
      position: _slideAnim,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _isTr
                ? 'Onaylamak için aşağıya tam olarak şunu yazın:'
                : 'To confirm, type exactly the following:',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              color: context.textSecondary,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: _red.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: _red.withValues(alpha: 0.3)),
            ),
            child: Text(
              _confirmPhrase,
              style: GoogleFonts.robotoMono(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: _red,
              ),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            autofocus: true,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              color: context.textPrimary,
            ),
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: _confirmPhrase,
              hintStyle: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: context.textTertiaryColor,
              ),
              filled: true,
              fillColor: context.backgroundColor,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: context.dividerColor),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: context.dividerColor),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(
                  color: _confirmed ? _red : AppTheme.neonCyan,
                  width: 1.5,
                ),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
              prefixIcon: Icon(
                _confirmed
                    ? CupertinoIcons.checkmark_circle_fill
                    : CupertinoIcons.pencil,
                color: _confirmed ? _red : context.textTertiaryColor,
                size: 18,
              ),
            ),
          ),
          const SizedBox(height: 20),
          AnimatedOpacity(
            opacity: _confirmed ? 1.0 : 0.4,
            duration: const Duration(milliseconds: 200),
            child: SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                padding: const EdgeInsets.symmetric(vertical: 16),
                color: _confirmed ? _red : context.dividerColor,
                borderRadius: BorderRadius.circular(12),
                onPressed: (_confirmed && !_deleting) ? _deleteAccount : null,
                child: _deleting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : Text(
                        _isTr ? 'Hesabı Kalıcı Sil' : 'Permanently Delete',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _deleting ? null : () => Navigator.of(context).pop(),
              child: Text(
                _isTr ? 'İptal' : 'Cancel',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: context.textTertiaryColor,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
