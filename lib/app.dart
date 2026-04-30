/// Qor AI - App Widget
/// Blueprint Section 2, 14
///
/// MaterialApp.router (GoRouter)
/// Tema (Light + Dark, Material 3)
/// Riverpod integration
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/l10n/app_localizations.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/floating_ai_assistant_overlay.dart';
import 'package:qor_ai/services/notification_service.dart';

class QorAiApp extends ConsumerWidget {
  const QorAiApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(selectedCountryProvider);
    ref.watch(countryInitProvider);
    final themeMode = ref.watch(themeModeProvider);
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);

    return MaterialApp.router(
      title: 'Qor AI',
      debugShowCheckedModeBanner: false,

      // Lokalizasyon - Blueprint Section 11.3
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      locale: locale,

      // Tema — System-aware Light + Dark
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,

      // GoRouter - Section 14.4
      routerConfig: router,

      builder: (context, child) {
        final textScale = ref.watch(textScaleProvider);
        // Clamp system + user text scaling to a safe range to prevent layout
        // overflow on nav bar, chips, and cards. 0.9x..1.25x covers a11y needs.
        final clamped = textScale.clamp(0.9, 1.25);
        return MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(clamped)),
          child: Stack(
            children: [
              _NotificationOverlay(child: child ?? const SizedBox.shrink()),
              Positioned.fill(
                child: Overlay(
                  initialEntries: [
                    OverlayEntry(
                      builder: (_) => const Material(
                        type: MaterialType.transparency,
                        child: FloatingAiAssistantOverlay(),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Overlay that shows a Material banner when a foreground FCM notification arrives.
class _NotificationOverlay extends StatefulWidget {
  final Widget child;
  const _NotificationOverlay({required this.child});

  @override
  State<_NotificationOverlay> createState() => _NotificationOverlayState();
}

class _NotificationOverlayState extends State<_NotificationOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim;
  late final Animation<Offset> _slide;
  String? _title;
  String? _body;
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );
    _slide = Tween<Offset>(
      begin: const Offset(0, -1),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic));

    NotificationService.instance.latestMessage.addListener(_onMessage);
  }

  void _onMessage() {
    final msg = NotificationService.instance.latestMessage.value;
    if (msg == null) return;

    setState(() {
      _title = msg.notification?.title ?? 'Notification';
      _body = msg.notification?.body;
      _visible = true;
    });
    _anim.forward();

    // Auto dismiss after 4 seconds
    Future.delayed(const Duration(seconds: 4), () {
      if (mounted && _visible) _dismiss();
    });
  }

  void _dismiss() {
    _anim.reverse().then((_) {
      if (mounted) setState(() => _visible = false);
    });
  }

  @override
  void dispose() {
    NotificationService.instance.latestMessage.removeListener(_onMessage);
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_visible)
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            left: 12,
            right: 12,
            child: SlideTransition(
              position: _slide,
              child: GestureDetector(
                onTap: _dismiss,
                onVerticalDragEnd: (_) => _dismiss(),
                child: Material(
                  elevation: 8,
                  borderRadius: BorderRadius.circular(16),
                  color: Colors.transparent,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          AppTheme.primaryBlue.withValues(alpha: 0.95),
                          AppTheme.brandCyan.withValues(alpha: 0.90),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                          blurRadius: 20,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.notifications_active_rounded,
                            color: Colors.white,
                            size: 22,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _title ?? '',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (_body != null && _body!.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  _body!,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.white.withValues(alpha: 0.85),
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ],
                          ),
                        ),
                        Icon(
                          Icons.close_rounded,
                          color: Colors.white.withValues(alpha: 0.7),
                          size: 18,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
