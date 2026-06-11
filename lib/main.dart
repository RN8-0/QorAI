/// Qor AI - Main Entry Point
library;

import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kIsWeb, compute;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:app_tracking_transparency/app_tracking_transparency.dart';
import 'package:qor_ai/app.dart';
import 'package:qor_ai/services/cache_service.dart';
import 'package:qor_ai/services/remote_config_service.dart';
import 'package:qor_ai/services/spec_translation_service.dart';
import 'package:qor_ai/services/notification_service.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/core/pb_client.dart' as pb_client;
import 'package:qor_ai/data/datasources/hive_ds.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

// ── Startup Orchestrator timeline ────────────────────────────────────────────
// Tüm app-level startup init'leri sıralı bir kuyruktan geçer. Paralel
// çalıştırma UI thread'ini kümülatif olarak bloke ediyordu (her init kendi
// async chunk'ında setState/Hive write/plugin call zinciri tetikliyor).
// Sıralı queue + aralarındaki nefes payı (gap) sayesinde her init kendi
// başına çalışır, UI thread arasında frame paint penceresi açılır.
//
// First seconds belong to the UI only. The live spec dictionary is large
// enough to cause skipped frames on mid-range Android when it starts during
// the home feed reveal, so it is pushed deeper into the startup tail.
const _kStartupInitialIdle = Duration(seconds: 6);
const _kSpecDictionaryIdle = Duration(seconds: 10);
const _kStartupGap = Duration(seconds: 1);
const _kLegacyCacheCleanupDelay = Duration(seconds: 20);

Future<void> _clearLegacyFeedCache(CacheService cacheService) async {
  await Future.wait([
    cacheService.delete('home_feed_products'),
    cacheService.delete('home_feed_v2_techscore'),
    cacheService.delete('home_feed_v3_youtube'),
    cacheService.delete('home_feed_v5_percat'),
    cacheService.delete('home_feed_v11_discover'),
    cacheService.delete('home_feed_v12_relaxed'),
    cacheService.delete('home_feed_v13_nofilter'),
    cacheService.delete('home_feed_v14_quality'),
  ]);
}

/// İlk compute() çağrısının ~50-100ms isolate spawn maliyetini arka planda
/// öder. homeFeedProvider'ın Hive cache decode'u için isolate hazır olur.
/// Trivial bir iş gönderiyoruz — amaç pool'u sıcak tutmak.
Future<void> _warmupComputeIsolate() async {
  try {
    await compute<int, int>(_warmupTask, 0);
  } catch (_) {}
}

int _warmupTask(int x) => x;

/// Product feeds contain many horizontally-scrollable cards. Keep the decoded
/// image cache bounded so detail-gallery images do not push mid-range Android
/// devices into GC churn after a few navigations.
void _configureImageCache() {
  final cache = PaintingBinding.instance.imageCache;
  cache.maximumSize = 650;
  cache.maximumSizeBytes = 56 * 1024 * 1024;
}

/// Pre-warm the most-used Google Fonts before the first frame is painted.
/// This triggers font file lookup from the device cache (or network on first
/// install), giving Flutter time to load them before widgets need them.
void _preloadGoogleFonts() {
  const weights = [
    FontWeight.w400,
    FontWeight.w600,
    FontWeight.w700,
    FontWeight.w800,
  ];
  for (final w in weights) {
    GoogleFonts.plusJakartaSans(fontWeight: w);
    GoogleFonts.inter(fontWeight: w);
  }
}

/// Startup Orchestrator — sıralı init queue.
///
/// Init'ler paralel çalıştırıldığında her biri kendi async chunk'ında UI
/// thread'i kısa kısa bloke ediyor → kümülatif jank (~100+ frame skip).
/// Sıralı çalıştırma + her adım arasında 600ms gap → her init temiz başlar,
/// UI thread paint penceresi açılır.
///
/// Sıralama:
///   t=6s  -> Notifications init
///   t=17s -> Spec translations dictionary
///   t=18s -> ATT request (iOS only)
Future<void> _scheduleDeferredStartupTasks(CacheService cacheService) async {
  await Future<void>.delayed(_kStartupInitialIdle);
  if (!kIsWeb) {
    await _initializeNotifications();
  }

  await Future<void>.delayed(_kSpecDictionaryIdle);
  await _initializeSpecTranslations();

  if (!kIsWeb && Platform.isIOS) {
    await Future<void>.delayed(_kStartupGap);
    await _requestTrackingTransparency();
  }

  await Future<void>.delayed(_kLegacyCacheCleanupDelay);
  unawaited(_clearLegacyFeedCache(cacheService));
}

Future<void> _initializeSpecTranslations() async {
  try {
    await SpecTranslationService.instance.init();
    debugPrint('=== QOR AI: Spec translations initialized ===');
  } catch (e) {
    debugPrint('=== QOR AI: Spec translations failed: $e ===');
  }
}

Future<void> _initializeNotifications() async {
  try {
    await NotificationService.instance.initialize();
    debugPrint('=== QOR AI: Notifications initialized ===');
  } catch (e) {
    debugPrint('=== QOR AI: Notification init failed: $e ===');
  }
}

Future<void> _requestTrackingTransparency() async {
  try {
    final status = await AppTrackingTransparency.trackingAuthorizationStatus;
    if (status == TrackingStatus.notDetermined) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      await AppTrackingTransparency.requestTrackingAuthorization();
    }
    debugPrint('=== QOR AI: ATT status: $status ===');
  } catch (e) {
    debugPrint('=== QOR AI: ATT failed: $e ===');
  }
}

void main() {
  runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      // System UI settings (mobile only)
      if (!kIsWeb) {
        SystemChrome.setSystemUIOverlayStyle(
          const SystemUiOverlayStyle(statusBarColor: Colors.transparent),
        );

        // Disable landscape modes (portrait only)
        await SystemChrome.setPreferredOrientations([
          DeviceOrientation.portraitUp,
          DeviceOrientation.portraitDown,
        ]);
      }

      // Initialize Cache & Hive - Section 7.4
      final cacheService = CacheService();
      final hiveDS = HiveDataSource();
      try {
        await Future.wait([cacheService.initialize(), hiveDS.initialize()]);
        debugPrint('=== QOR AI: CacheService + HiveDS initialized ===');
      } catch (e) {
        debugPrint('=== QOR AI: CacheService FAILED: $e ===');
      }

      // Initialize PocketBase with persistent auth store (SharedPreferences).
      // This must happen before any provider reads `pb` global singleton.
      try {
        pb_client.pb = await pb_client.createPbClientWithPersistence();
        debugPrint(
          '=== QOR AI: PocketBase client initialized with persistent auth ===',
        );
      } catch (e) {
        // Fallback: in-memory auth (no persistence but app still works)
        debugPrint(
          '=== QOR AI: PocketBase persistence init failed, using in-memory: $e ===',
        );
        pb_client.pb = PocketBase(pb_client.kPbBaseUrl);
      }

      // Initialize Remote Config via PocketBase
      final remoteConfigService = RemoteConfigService.fromPb(
        PbDataSource(),
        deferredLoad: const Duration(seconds: 12),
      );

      // Pre-warm Google Fonts before first frame so text renders without flash.
      _preloadGoogleFonts();
      // ImageCache limitini explicit ayarla — 333 ürün × scroll senaryosu.
      _configureImageCache();

      debugPrint('=== QOR AI: Calling runApp ===');

      runApp(
        ProviderScope(
          overrides: [
            cacheServiceProvider.overrideWithValue(cacheService),
            hiveDataSourceProvider.overrideWithValue(hiveDS),
            remoteConfigServiceProvider.overrideWithValue(remoteConfigService),
          ],
          child: const QorAiApp(),
        ),
      );
      // Orchestrator runApp'tan SONRA başlar; ilk frame paint olana kadar
      // (Stage 0 statik UI) hiçbir ağır init çalışmaz.
      unawaited(_scheduleDeferredStartupTasks(cacheService));
      // Compute isolate pool'unu arka planda ısıt. homeFeedProvider'ın
      // Hive cache decode'u tetiklendiğinde isolate hazır olur → ~50-100ms
      // spawn maliyetini app start süresinde gizliyoruz.
      unawaited(_warmupComputeIsolate());
    },
    (error, stack) {
      debugPrint('=== QOR AI: ZONE ERROR: $error ===');
      debugPrint('$stack');
    },
  );
}
