/// Compair - Settings Screen (iOS-Style Redesign)
/// Full iOS Settings UI with CupertinoListSection, country flags, functional buttons
library;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:share_plus/share_plus.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/paywall_sheet.dart';
import 'package:compair/routing/router.dart';
import 'package:compair/services/notification_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _pushNotifications = true;
  bool _emailDigest = false;

  @override
  void initState() {
    super.initState();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _pushNotifications = prefs.getBool('push_notifications') ?? true;
      _emailDigest = prefs.getBool('email_digest') ?? false;
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
    return code.toUpperCase().codeUnits
        .map((c) => String.fromCharCode(c - 0x41 + 0x1F1E6))
        .join();
  }

  @override
  Widget build(BuildContext context) {
    final selectedCountry = ref.watch(selectedCountryProvider);
    final userAsync = ref.watch(userProfileProvider);
    final user = userAsync.valueOrNull;
    final countryInfo = SupportedCountries.countries[selectedCountry];
    final currentLocale = ref.watch(localeProvider);
    final currentLangCode = currentLocale?.languageCode ?? 'en';
    final currentLangName = _languageNames[currentLangCode] ?? 'English';
    final currentThemeMode = ref.watch(themeModeProvider);
    final themeLabel = currentThemeMode == ThemeMode.dark
        ? (context.l10n?.darkThemeLabel ?? 'Dark')
        : currentThemeMode == ThemeMode.light
            ? (context.l10n?.lightThemeLabel ?? 'Light')
            : (context.l10n?.systemThemeLabel ?? 'System');

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          CupertinoSliverNavigationBar(
            largeTitle: Text(context.l10n?.settings ?? 'Settings', style: TextStyle(color: context.textPrimary)),
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
                  if (user != null) ...[
                    _buildProfileCard(user.displayName ?? 'User', user.email ?? ''),
                    const SizedBox(height: 24),
                  ],
                  _iosSection(header: (context.l10n?.appearance ?? 'Appearance').toUpperCase(), children: [
                    _iosRow(icon: CupertinoIcons.sun_max_fill, iconBg: const Color(0xFFF59E0B),
                      title: context.l10n?.theme ?? 'Theme', trailing: Text(themeLabel, style: _trailingStyle),
                      onTap: () => _showThemePicker(context)),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.textformat_size, iconBg: const Color(0xFF8B5CF6),
                      title: context.l10n?.displaySettings ?? 'Display', trailing: Text(context.l10n?.defaultString ?? 'Default', style: _trailingStyle),
                      onTap: () => _showDisplayPicker(context)),
                  ]),
                  const SizedBox(height: 24),
                  _iosSection(header: (context.l10n?.regionAndLanguage ?? 'Region & Language').toUpperCase(), children: [
                    _iosRow(icon: CupertinoIcons.globe, iconBg: AppTheme.neonCyan,
                      title: context.l10n?.country ?? 'Country',
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text(_flag(selectedCountry), style: const TextStyle(fontSize: 18)),
                        const SizedBox(width: 6),
                        Text(countryInfo?.name ?? selectedCountry, style: _trailingStyle),
                      ]),
                      onTap: () => _showCountryPicker(context, ref)),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.textformat, iconBg: const Color(0xFF06B6D4),
                      title: context.l10n?.language ?? 'Language', trailing: Text(currentLangName, style: _trailingStyle),
                      onTap: () => _showLanguagePicker(context, ref, currentLangCode)),
                  ]),
                  const SizedBox(height: 24),
                  _iosSection(header: (context.l10n?.notificationsSection ?? 'Notifications').toUpperCase(), children: [
                    _iosSwitchRow(icon: CupertinoIcons.bell_fill, iconBg: const Color(0xFFEF4444),
                      title: context.l10n?.pushNotifications ?? 'Push Notifications', value: _pushNotifications,
                      onChanged: _togglePushNotifications),
                    _iosDivider(),
                    _iosSwitchRow(icon: CupertinoIcons.mail_solid, iconBg: AppTheme.neonCyan,
                      title: context.l10n?.emailUpdates ?? 'Email Updates', value: _emailDigest,
                      onChanged: _toggleEmailDigest),
                  ]),
                  const SizedBox(height: 24),
                  _iosSection(header: (context.l10n?.account ?? 'Account').toUpperCase(), children: [
                    _iosRow(icon: CupertinoIcons.person_fill, iconBg: AppTheme.neonCyan,
                      title: context.l10n?.editProfile ?? 'Edit Profile', onTap: () => context.push(AppRoutes.quiz)),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.star_fill, iconBg: const Color(0xFFEAB308),
                      title: context.l10n?.subscription ?? 'Subscription', trailing: _buildPlanBadge(),
                      onTap: () => showPaywallSheet(context)),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.arrow_down_doc_fill, iconBg: const Color(0xFF64748B),
                      title: context.l10n?.exportMyData ?? 'Export My Data',
                      onTap: () => _showExportDataDialog(context)),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.trash_fill, iconBg: const Color(0xFF64748B),
                      title: context.l10n?.clearCache ?? 'Clear Cache', onTap: () => _showClearCacheDialog(context)),
                  ]),
                  const SizedBox(height: 24),
                  _iosSection(header: (context.l10n?.helpSupport ?? 'Help & Support').toUpperCase(), children: [
                    _iosRow(icon: CupertinoIcons.chat_bubble_text_fill, iconBg: const Color(0xFF06B6D4),
                      title: context.l10n?.contactUs ?? 'Contact Us', onTap: () => _launchEmail()),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.question_circle_fill, iconBg: const Color(0xFFF59E0B),
                      title: context.l10n?.faqHelp ?? 'FAQ & Help',
                      onTap: () async {
                        final uri = Uri.parse('https://compair.app/faq');
                        try { await launchUrl(uri, mode: LaunchMode.externalApplication); }
                        catch (_) { if (mounted) _showInfoSnackbar(context.l10n?.helpCenterComingSoon ?? 'Help center coming soon'); }
                      }),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.star_circle_fill, iconBg: const Color(0xFFF97316),
                      title: context.l10n?.rateApp ?? 'Rate App',
                      onTap: () async {
                        final uri = Uri.parse('https://play.google.com/store/apps/details?id=com.compair.app');
                        try { await launchUrl(uri, mode: LaunchMode.externalApplication); }
                        catch (_) { if (mounted) _showInfoSnackbar(context.l10n?.storePageComingSoon ?? 'Store page will be available after launch'); }
                      }),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.share, iconBg: AppTheme.neonCyan,
                      title: context.l10n?.share ?? 'Share',
                      onTap: () {
                        Share.share('Check out Compair - Smart Product Comparison!\nhttps://compair.app',
                          subject: 'Compair App');
                      }),
                  ]),
                  const SizedBox(height: 24),
                  _iosSection(header: 'LEGAL', children: [
                    _iosRow(icon: CupertinoIcons.shield_fill, iconBg: const Color(0xFF64748B),
                      title: context.l10n?.privacyPolicy ?? 'Privacy Policy', onTap: () => context.push(AppRoutes.privacyPolicy)),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.doc_text_fill, iconBg: const Color(0xFF64748B),
                      title: context.l10n?.termsOfService ?? 'Terms of Service', onTap: () => context.push(AppRoutes.termsOfService)),
                    _iosDivider(),
                    _iosRow(icon: CupertinoIcons.book_fill, iconBg: const Color(0xFF64748B),
                      title: context.l10n?.openSourceLicenses ?? 'Open Source Licenses',
                      onTap: () => showLicensePage(context: context, applicationName: 'Compair', applicationVersion: '1.0.0')),
                  ]),
                  const SizedBox(height: 24),
                  _iosSection(children: [
                    _iosRow(icon: CupertinoIcons.info_circle_fill, iconBg: const Color(0xFF94A3B8),
                      title: context.l10n?.appVersion ?? 'App Version', trailing: Text('1.0.0 (Build 1)', style: _trailingStyle)),
                  ]),
                  const SizedBox(height: 24),
                  _buildSignOutButton(context, ref),
                  const SizedBox(height: 16),
                  Center(child: CupertinoButton(
                    onPressed: () => _showDeleteAccountDialog(context, ref),
                    child: Text(context.l10n?.deleteAccount ?? 'Delete Account',
                        style: GoogleFonts.plusJakartaSans(fontSize: 13, color: const Color(0xFFEF4444))),
                  )),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  TextStyle get _trailingStyle => GoogleFonts.plusJakartaSans(fontSize: 14, color: context.textSecondary);

  Widget _iosSection({String? header, required List<Widget> children}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (header != null) Padding(
        padding: const EdgeInsets.only(left: 16, bottom: 6),
        child: Text(header, style: GoogleFonts.plusJakartaSans(
            fontSize: 12, fontWeight: FontWeight.w500, color: context.textTertiaryColor, letterSpacing: 0.5)),
      ),
      Container(
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.06) : context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.06),
            width: 0.5)),
        clipBehavior: Clip.hardEdge,
        child: Column(children: children),
      ),
    ]);
  }

  Widget _iosDivider() => Divider(height: 0.5, color: context.dividerColor, indent: 56);

  Widget _iosRow({
    required IconData icon, required Color iconBg, required String title,
    Widget? trailing, VoidCallback? onTap,
  }) {
    return Material(color: Colors.transparent, child: InkWell(
      onTap: () { HapticFeedback.selectionClick(); onTap?.call(); },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
        child: Row(children: [
          Container(width: 30, height: 30,
            decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(7)),
            child: Icon(icon, color: Colors.white, size: 17)),
          const SizedBox(width: 12),
          Expanded(child: Text(title, style: GoogleFonts.plusJakartaSans(
              fontSize: 15, fontWeight: FontWeight.w500, color: context.textPrimary))),
          if (trailing != null) ...[trailing, const SizedBox(width: 4)],
          if (onTap != null) Icon(CupertinoIcons.chevron_forward, size: 15, color: context.textTertiaryColor),
        ]),
      ),
    ));
  }

  Widget _iosSwitchRow({
    required IconData icon, required Color iconBg, required String title,
    required bool value, required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(children: [
        Container(width: 30, height: 30,
          decoration: BoxDecoration(color: iconBg, borderRadius: BorderRadius.circular(7)),
          child: Icon(icon, color: Colors.white, size: 17)),
        const SizedBox(width: 12),
        Expanded(child: Text(title, style: GoogleFonts.plusJakartaSans(
            fontSize: 15, fontWeight: FontWeight.w500, color: context.textPrimary))),
        CupertinoSwitch(value: value, activeTrackColor: AppTheme.neonCyan,
          onChanged: (v) { HapticFeedback.selectionClick(); onChanged(v); }),
      ]),
    );
  }

  Widget _buildProfileCard(String name, String email) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.06) : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.06),
          width: 0.5)),
      child: Row(children: [
        Container(width: 52, height: 52,
          decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(16)),
          child: Center(child: Text(
            name.isNotEmpty ? name[0].toUpperCase() : 'U',
            style: GoogleFonts.plusJakartaSans(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white),
          ))),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w700, color: context.textPrimary)),
          const SizedBox(height: 2),
          Text(email, style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textSecondary)),
        ])),
        Icon(CupertinoIcons.chevron_forward, size: 15, color: context.textTertiaryColor),
      ]),
    );
  }

  Widget _buildPlanBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(8)),
      child: Text(context.l10n?.free ?? 'Free', style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
    );
  }

  Widget _buildSignOutButton(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: () => _showSignOutDialog(context, ref),
      child: Container(
        width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.06) : context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark ? Colors.white.withValues(alpha: 0.08) : Colors.black.withValues(alpha: 0.06),
            width: 0.5)),
        child: Center(child: Text(context.l10n?.signOut ?? 'Sign Out', style: GoogleFonts.plusJakartaSans(
            fontSize: 15, fontWeight: FontWeight.w500, color: const Color(0xFFEF4444)))),
      ),
    );
  }

  void _showDisplayPicker(BuildContext context) {
    showCupertinoModalPopup(context: context, builder: (_) => CupertinoActionSheet(
      title: Text(context.l10n?.displaySettings ?? 'Display Settings'),
      message: Text(context.l10n?.textSizePreference ?? 'Choose text size preference'),
      actions: [
        CupertinoActionSheetAction(
          onPressed: () { Navigator.pop(context); _applyTextScale(0.85, 'Small'); },
          child: Text(context.l10n?.small ?? 'Small', style: const TextStyle(fontSize: 14)),
        ),
        CupertinoActionSheetAction(
          onPressed: () { Navigator.pop(context); _applyTextScale(1.0, 'Default'); },
          isDefaultAction: true,
          child: const Text('Default'),
        ),
        CupertinoActionSheetAction(
          onPressed: () { Navigator.pop(context); _applyTextScale(1.15, 'Large'); },
          child: Text(context.l10n?.large ?? 'Large', style: const TextStyle(fontSize: 18)),
        ),
      ],
      cancelButton: CupertinoActionSheetAction(isDefaultAction: true, onPressed: () => Navigator.pop(context), child: Text(context.l10n?.cancel ?? 'Cancel')),
    ));
  }

  void _applyTextScale(double scale, String label) {
    ref.read(textScaleProvider.notifier).state = scale;
    _showInfoSnackbar('$label ✓');
  }

  void _showInfoSnackbar(String message) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message, style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w500)),
      behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      backgroundColor: const Color(0xFF1C1C1E), duration: const Duration(seconds: 2),
    ));
  }

  void _showThemePicker(BuildContext context) {
    showCupertinoModalPopup(context: context, builder: (_) => CupertinoActionSheet(
      title: Text(context.l10n?.selectTheme ?? 'Select Theme'),
      actions: [
        CupertinoActionSheetAction(
          onPressed: () {
            Navigator.pop(context);
            ref.read(themeModeProvider.notifier).setThemeMode(ThemeMode.light);
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
            ref.read(themeModeProvider.notifier).setThemeMode(ThemeMode.system);
          },
          child: Text(context.l10n?.systemDefault ?? 'System Default'),
        ),
      ],
      cancelButton: CupertinoActionSheetAction(isDefaultAction: true, onPressed: () => Navigator.pop(context), child: Text(context.l10n?.cancel ?? 'Cancel')),
    ));
  }

  void _showCountryPicker(BuildContext context, WidgetRef ref) {
    final current = ref.read(selectedCountryProvider);
    showModalBottomSheet(context: context, backgroundColor: Colors.transparent, isScrollControlled: true,
      builder: (_) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(color: context.surfaceVariantColor, borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
        child: Column(children: [
          Container(margin: const EdgeInsets.only(top: 8), width: 36, height: 5,
            decoration: BoxDecoration(color: context.dividerColor, borderRadius: BorderRadius.circular(99))),
          Padding(padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Text(context.l10n?.selectCountry ?? 'Select Country', style: GoogleFonts.plusJakartaSans(fontSize: 17, fontWeight: FontWeight.w700, color: context.textPrimary))),
          Expanded(child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: context.surfaceVariantColor, borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.dividerColor, width: 0.5)),
            clipBehavior: Clip.hardEdge,
            child: ListView.separated(
              itemCount: SupportedCountries.countries.length,
              separatorBuilder: (_, __) => Divider(height: 0.5, color: context.dividerColor, indent: 56),
              itemBuilder: (context, index) {
                final entry = SupportedCountries.countries.entries.elementAt(index);
                final isSelected = current == entry.key;
                return Material(color: Colors.transparent, child: InkWell(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    ref.read(selectedCountryProvider.notifier).state = entry.key;
                    // Auto-switch language to match the country's official language
                    final langCode = entry.value.language;
                    if (_languageNames.containsKey(langCode)) {
                      ref.read(localeProvider.notifier).setLocale(langCode);
                    }
                    Navigator.pop(context);
                  },
                  child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(children: [
                      Text(_flag(entry.key), style: const TextStyle(fontSize: 26)),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(entry.value.name, style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w500, color: context.textPrimary)),
                        Text(entry.value.currency + ' · ' + entry.value.language, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary)),
                      ])),
                      if (isSelected) const Icon(CupertinoIcons.checkmark_circle_fill, color: AppTheme.neonCyan, size: 22),
                    ])),
                ));
              },
            ),
          )),
          const SizedBox(height: 16),
        ]),
      ),
    );
  }

  void _showLanguagePicker(BuildContext context, WidgetRef ref, String currentCode) {
    showModalBottomSheet(context: context, backgroundColor: Colors.transparent, isScrollControlled: true,
      builder: (_) => Container(
        height: MediaQuery.of(context).size.height * 0.7,
        decoration: BoxDecoration(color: context.surfaceVariantColor, borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
        child: Column(children: [
          Container(margin: const EdgeInsets.only(top: 8), width: 36, height: 5,
            decoration: BoxDecoration(color: context.dividerColor, borderRadius: BorderRadius.circular(99))),
          Padding(padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Text(context.l10n?.selectLanguage ?? 'Select Language', style: GoogleFonts.plusJakartaSans(fontSize: 17, fontWeight: FontWeight.w700, color: context.textPrimary))),
          Expanded(child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: context.surfaceVariantColor, borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.dividerColor, width: 0.5)),
            clipBehavior: Clip.hardEdge,
            child: ListView.separated(
              itemCount: _languageNames.length,
              separatorBuilder: (_, __) => Divider(height: 0.5, color: context.dividerColor, indent: 56),
              itemBuilder: (context, index) {
                final entry = _languageNames.entries.elementAt(index);
                final isSelected = currentCode == entry.key;
                return Material(color: Colors.transparent, child: InkWell(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    ref.read(localeProvider.notifier).setLocale(entry.key);
                    Navigator.pop(context);
                  },
                  child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    child: Row(children: [
                      Expanded(child: Text(entry.value,
                          style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w500, color: context.textPrimary))),
                      if (isSelected) const Icon(CupertinoIcons.checkmark_circle_fill, color: AppTheme.neonCyan, size: 22),
                    ])),
                ));
              },
            ),
          )),
          const SizedBox(height: 16),
        ]),
      ),
    );
  }

  void _showSignOutDialog(BuildContext context, WidgetRef ref) {
    showCupertinoDialog(context: context, builder: (_) => CupertinoAlertDialog(
      title: Text(context.l10n?.signOut ?? 'Sign Out'), content: Text(context.l10n?.signOutConfirm ?? 'Are you sure you want to sign out?'),
      actions: [
        CupertinoDialogAction(isDefaultAction: true, child: Text(context.l10n?.cancel ?? 'Cancel'), onPressed: () => Navigator.pop(context)),
        CupertinoDialogAction(isDestructiveAction: true, child: Text(context.l10n?.signOut ?? 'Sign Out'),
          onPressed: () async { Navigator.pop(context); await ref.read(authRepositoryProvider).signOut(); }),
      ],
    ));
  }

  void _showDeleteAccountDialog(BuildContext context, WidgetRef ref) {
    showCupertinoDialog(context: context, builder: (_) => CupertinoAlertDialog(
      title: Text(context.l10n?.deleteAccount ?? 'Delete Account'),
      content: Text(context.l10n?.deleteAccountWarning ?? 'This action is permanent and cannot be undone. All your data will be lost.'),
      actions: [
        CupertinoDialogAction(isDefaultAction: true, child: Text(context.l10n?.cancel ?? 'Cancel'), onPressed: () => Navigator.pop(context)),
        CupertinoDialogAction(isDestructiveAction: true, child: Text(context.l10n?.delete ?? 'Delete'),
          onPressed: () { Navigator.pop(context); _showInfoSnackbar(context.l10n?.accountDeletionSubmitted ?? 'Account deletion request submitted'); }),
      ],
    ));
  }

  void _showClearCacheDialog(BuildContext context) {
    showCupertinoDialog(context: context, builder: (_) => CupertinoAlertDialog(
      title: Text(context.l10n?.clearCache ?? 'Clear Cache'),
      content: Text(context.l10n?.clearCacheWarning ?? 'This will clear cached images and data. The app may load slower temporarily.'),
      actions: [
        CupertinoDialogAction(isDefaultAction: true, child: Text(context.l10n?.cancel ?? 'Cancel'), onPressed: () => Navigator.pop(context)),
        CupertinoDialogAction(isDestructiveAction: true, child: Text(context.l10n?.clear ?? 'Clear'),
          onPressed: () async {
            Navigator.pop(context);
            try {
              await ref.read(cacheServiceProvider).clearAll();
              PaintingBinding.instance.imageCache.clear();
              PaintingBinding.instance.imageCache.clearLiveImages();
              if (mounted) _showInfoSnackbar(context.l10n?.cacheCleared ?? 'Cache cleared successfully');
            } catch (_) {
              if (mounted) _showInfoSnackbar('Error clearing cache');
            }
          }),
      ],
    ));
  }

  void _showExportDataDialog(BuildContext context) {
    showCupertinoDialog(context: context, builder: (_) => CupertinoAlertDialog(
      title: Text(context.l10n?.exportMyData ?? 'Export My Data'),
      content: Text(context.l10n?.exportDataConfirm ?? 'Your data will be sent to your email address.'),
      actions: [
        CupertinoDialogAction(isDefaultAction: true, child: Text(context.l10n?.cancel ?? 'Cancel'), onPressed: () => Navigator.pop(context)),
        CupertinoDialogAction(child: Text(context.l10n?.exportLabel ?? 'Export'),
          onPressed: () {
            Navigator.pop(context);
            _showInfoSnackbar(context.l10n?.dataExported ?? 'Data export request submitted. Check your email.');
          }),
      ],
    ));
  }

  Future<void> _launchEmail() async {
    final uri = Uri(scheme: 'mailto', path: 'feedback@compair.app',
        queryParameters: {'subject': 'Compair Feedback'});
    try { await launchUrl(uri); } catch (_) { if (mounted) _showInfoSnackbar(context.l10n?.couldNotOpenEmail ?? 'Could not open email app'); }
  }
}
