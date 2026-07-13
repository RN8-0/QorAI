/// Qor AI - Main Shell (Modern Navigation)
/// Mobile: 4-tab floating pill nav + hamburger drawer
/// Desktop/Tablet: Side rail navigation
library;

import "dart:async";
import "package:flutter/foundation.dart" show kIsWeb;
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";
import "package:google_fonts/google_fonts.dart";
import "package:qor_ai/core/app_keys.dart";
import "package:qor_ai/core/constants.dart";
import "package:qor_ai/core/pb_client.dart";
import "package:qor_ai/presentation/providers/providers.dart";
import "package:qor_ai/services/connectivity_service.dart";
import "package:qor_ai/services/notification_service.dart";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:qor_ai/routing/router.dart";
import "package:qor_ai/core/theme.dart";
import "package:qor_ai/core/extensions.dart";
import "package:qor_ai/l10n/app_localizations.dart";
import "package:qor_ai/presentation/providers/product_analysis_provider.dart";
import "package:qor_ai/presentation/providers/analysis_hub_provider.dart";
import "package:qor_ai/services/ai_report_service.dart";
import "package:qor_ai/presentation/widgets/shared/ai_report_view.dart"
    show AiReportStageLite;
import "package:qor_ai/domain/entities/ai_entities.dart" show ProductQuiz;
import "package:qor_ai/domain/entities/product_entity.dart";

const _kNavBarHeight = AppTheme.navBarHeight;
const _kSidebarWidth = 240.0;
const _kRailWidth = 72.0;

class MainShell extends ConsumerStatefulWidget {
  final StatefulNavigationShell navigationShell;

  const MainShell({super.key, required this.navigationShell});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell>
    with WidgetsBindingObserver {
  StreamSubscription<String>? _fcmTokenRefreshSub;
  Future<void> Function()? _productsUnsubscribe;
  Timer? _productCacheInvalidationDebounce;

  // ── ANALİZ HUB besleyicileri ────────────────────────────────────────────
  // Her akışın faz geçişini `analysisHubProvider`'a çevirir: quiz/analiz
  // KOŞARKEN busy (Q butonu spinner), quiz/rapor HAZIR olunca chat bildirimi.

  void _feedHubProduct(
    AnalysisHubNotifier hub,
    ProductAnalysisState? prev,
    ProductAnalysisState next,
    bool isTr,
  ) {
    const flow = AnalysisFlowKind.product;
    final pid = next.productId;
    final id = pid != null ? 'product:$pid' : null;
    final label = next.productName ?? (isTr ? 'Ürün' : 'Product');
    switch (next.phase) {
      case ProductAnalysisPhase.startRequested:
      case ProductAnalysisPhase.quizLoading:
      case ProductAnalysisPhase.reportRequested:
      case ProductAnalysisPhase.running:
        // Quiz üretimi / analiz koşuyor → spinner, eski bildirimi temizle.
        hub.setBusy(flow, true);
        if (id != null) hub.clearNotice(flow, id: id);
      case ProductAnalysisPhase.quiz:
        hub.setBusy(flow, false);
        if (id != null && next.quizReadySeq > (prev?.quizReadySeq ?? 0)) {
          hub.pushNotice(
            AnalysisNotice(
              id: id,
              flow: flow,
              kind: AnalysisNoticeKind.quiz,
              label: label,
              productId: pid,
            ),
          );
        }
      case ProductAnalysisPhase.done:
        hub.setBusy(flow, false);
        if (id != null && next.reportReadySeq > (prev?.reportReadySeq ?? 0)) {
          hub.pushNotice(
            AnalysisNotice(
              id: id,
              flow: flow,
              kind: AnalysisNoticeKind.report,
              label: label,
              productId: pid,
            ),
          );
        }
      case ProductAnalysisPhase.error:
        hub.setBusy(flow, false);
        if (id != null) hub.clearNotice(flow, id: id);
      case ProductAnalysisPhase.idle:
        hub.setBusy(flow, false);
    }
  }

  void _feedHubLink(
    AnalysisHubNotifier hub,
    LinkQuizState? prev,
    LinkQuizState next,
    bool isTr,
  ) {
    const flow = AnalysisFlowKind.link;
    const id = 'link';
    final label = isTr ? 'Link analizi' : 'Link analysis';
    switch (next.phase) {
      case LinkFlowPhase.analyzing:
      case LinkFlowPhase.quizLoading:
        hub.setBusy(flow, true);
      case LinkFlowPhase.computing:
        hub.setBusy(flow, true);
        hub.clearNotice(flow, id: id);
      case LinkFlowPhase.quiz:
        hub.setBusy(flow, false);
        if (prev?.phase != LinkFlowPhase.quiz) {
          hub.pushNotice(
            AnalysisNotice(
              id: id,
              flow: flow,
              kind: AnalysisNoticeKind.quiz,
              label: label,
              tabIndex: 2,
            ),
          );
        }
      case LinkFlowPhase.result:
        hub.setBusy(flow, false);
        if (prev?.phase != LinkFlowPhase.result) {
          hub.pushNotice(
            AnalysisNotice(
              id: id,
              flow: flow,
              kind: AnalysisNoticeKind.report,
              label: label,
              tabIndex: 2,
            ),
          );
        }
      case LinkFlowPhase.idle:
        hub.setBusy(flow, false);
    }
  }

  void _feedHubSub(
    AnalysisHubNotifier hub,
    SubQuizState? prev,
    SubQuizState next,
    bool isTr,
  ) {
    const flow = AnalysisFlowKind.subscription;
    const id = 'subscription';
    final label = isTr ? 'Abonelik analizi' : 'Subscription analysis';
    switch (next.phase) {
      case SubFlowPhase.quizLoading:
        hub.setBusy(flow, true);
      case SubFlowPhase.analyzing:
        hub.setBusy(flow, true);
        hub.clearNotice(flow, id: id);
      case SubFlowPhase.quiz:
        hub.setBusy(flow, false);
        if (prev?.phase != SubFlowPhase.quiz) {
          hub.pushNotice(
            AnalysisNotice(
              id: id,
              flow: flow,
              kind: AnalysisNoticeKind.quiz,
              label: label,
              tabIndex: 3,
            ),
          );
        }
      case SubFlowPhase.result:
        hub.setBusy(flow, false);
        if (prev?.phase != SubFlowPhase.result) {
          hub.pushNotice(
            AnalysisNotice(
              id: id,
              flow: flow,
              kind: AnalysisNoticeKind.report,
              label: label,
              tabIndex: 3,
            ),
          );
        }
      case SubFlowPhase.idle:
        hub.setBusy(flow, false);
    }
  }

  @override
  void initState() {
    super.initState();
    // Telefon GERİ tuşunu framework seviyesinde yakalamak için observer.
    // (go_router StatefulShellRoute'ta branch kökünde PopScope consult
    // edilmiyor → didPopRoute tek güvenilir yol.)
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _subscribeProductCatalogChanges();
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (!mounted) return;
        _primeBackgroundState();
      });
      Future.delayed(const Duration(seconds: 3), () {
        if (!mounted) return;
        _registerFcmToken();
      });
    });
  }

  // ── Products-collection realtime: throttle, don't debounce ────────────────
  // The scraper writes thousands of products per hour. The original 700ms
  // debounce never fired during a burst, then nuked the persistent home_feed
  // cache the moment the burst paused — which immediately fanned into a full
  // multi-cat Typesense refetch (and, before commit 8b…, an extra 23 PB
  // requests via _filterLivePocketBaseProducts). End-user devices don't need
  // bleeding-edge product freshness; the home feed already revalidates on
  // its own cadence. We now only clear the in-memory feed, at most once per
  // 5 minutes, and never touch the persistent cache from this hook.
  static const Duration _productInvalidationCooldown = Duration(minutes: 5);
  DateTime? _lastProductInvalidationAt;

  void _subscribeProductCatalogChanges() {
    unawaited(() async {
      try {
        _productsUnsubscribe = await pb
            .collection(AppConstants.productsCollection)
            .subscribe('*', (event) {
              if (!mounted) return;
              final now = DateTime.now();
              final last = _lastProductInvalidationAt;
              if (last != null &&
                  now.difference(last) < _productInvalidationCooldown) {
                return;
              }
              _lastProductInvalidationAt = now;
              _productCacheInvalidationDebounce?.cancel();
              _productCacheInvalidationDebounce = Timer(
                const Duration(seconds: 2),
                () {
                  if (!mounted) return;
                  // disruptive:false → mevcut home görünümünü BOZMA (feed'i
                  // yeniden yükleyip section'ları flash'latma). Scraper ürün
                  // yazınca kullanıcı home'dayken ekranın ~1sn değişip eski
                  // haline dönmesinin nedeni buydu.
                  unawaited(
                    invalidateProductCatalogCaches(
                      ref,
                      clearPersistent: false,
                      disruptive: false,
                    ),
                  );
                },
              );
            });
        debugPrint('[Shell] products realtime subscribed');
      } catch (e) {
        debugPrint('[Shell] products realtime unavailable: $e');
      }
    }());
  }

  void _primeBackgroundState() {
    // HomeScreen Stage 2'de bu provider'lar ilk kez okunduğunda PocketBase
    // fetch tetiklenip UI thread'de Consumer rebuild yaratıyordu. 1.2s'de
    // önceden ısıtarak Stage 2 reveal'i anında cache hit ile karşılansın.
    try {
      ref.read(countryInitProvider);
      ref.read(userProfileProvider);
      ref.read(subscriptionServiceProvider);
    } catch (_) {}
  }

  /// After login, get FCM token and save to PocketBase user profile.
  /// Uses event-driven flow (no polling): if the token is already available
  /// register it immediately; otherwise rely on onTokenRefresh which fires
  /// once the platform produces a token. This avoids the 30× sleep loop
  /// the original implementation did on every cold start.
  Future<void> _registerFcmToken() async {
    if (kIsWeb) return;
    try {
      await NotificationService.instance.initialize();

      final authState = ref.read(authStateProvider);
      final uid = authState.valueOrNull;
      if (uid == null) return;

      final pbDs = ref.read(pbDataSourceProvider);
      final messaging = FirebaseMessaging.instance;

      // Listen for refreshes first so we never miss the initial token
      // if it arrives between the read and the listener registration.
      await _fcmTokenRefreshSub?.cancel();
      _fcmTokenRefreshSub = messaging.onTokenRefresh.listen((newToken) async {
        try {
          await pbDs.updateFcmToken(uid, newToken);
          debugPrint('[Shell] FCM token refreshed in PB for $uid');
        } catch (e) {
          debugPrint('[Shell] FCM token refresh PB write failed: $e');
        }
      });

      // Try the cached token from NotificationService (sync), then fall back
      // to FirebaseMessaging.getToken() which awaits the platform once.
      final cached = NotificationService.instance.token;
      String? token = cached;
      if (token == null) {
        try {
          token = await messaging.getToken();
        } catch (e) {
          debugPrint('[Shell] getToken() error: $e');
        }
      }

      if (token == null) {
        // onTokenRefresh will pick it up later — no polling needed.
        return;
      }

      await pbDs.updateFcmToken(uid, token);
      debugPrint('[Shell] FCM token registered to PB for $uid');
    } catch (e) {
      debugPrint('[Shell] FCM token register error: $e');
    }
  }

  // ── Ürün (tekli) AI analiz MOTORU ────────────────────────────────────────
  // Ürün detay ekranı push edilmiş bir rota — pop/sekme değişince dispose olur.
  // Analizi burada (her zaman canlı olan shell'de, WidgetRef ile) yürütürüz;
  // durum global [productAnalysisProvider]'da. Böylece kullanıcı üründen çıksa
  // bile analiz sürer ve bittiğinde ürün adıyla bildirim gösterebiliriz.
  AiReportStageLite _mapProductStage(AiReportStage s) => switch (s) {
    AiReportStage.prep => AiReportStageLite.prep,
    AiReportStage.research => AiReportStageLite.research,
    AiReportStage.report => AiReportStageLite.report,
  };

  Future<void> _runProductQuizPhase(ProductAnalysisState s) async {
    final product = s.product;
    if (product == null) return;
    final lang = s.lang;
    final notifier = ref.read(productAnalysisProvider.notifier);
    notifier.setQuizLoading();
    // HIZ: web araştırmasını quiz üretimiyle PARALEL başlat (görünüm gecikmesi
    // kazancı korunur; rapor submit'te biten araştırmayı bekler).
    notifier.researchFuture = AiReportService.prefetchProductResearch(
      ref,
      product,
      lang,
    );
    final aiProfile = ref.read(userProfileProvider).valueOrNull;
    final title = product.nameForLanguage(lang);
    ProductQuiz? quiz;
    try {
      quiz = await ref
          .read(geminiServiceProvider)
          .generateQuiz(
            category: product.category,
            productTitle: title,
            url: '',
            language: lang,
            profile: aiProfile,
          )
          .timeout(const Duration(seconds: 45));
    } catch (e) {
      try {
        quiz = await ref
            .read(deepSeekServiceProvider)
            .generateQuiz(
              category: product.category,
              productTitle: title,
              url: '',
              language: lang,
            )
            .timeout(const Duration(seconds: 45));
      } catch (_) {}
    }
    // Bu arada kullanıcı reset ettiyse / başka ürün başlattıysa iptal.
    final cur = ref.read(productAnalysisProvider);
    if (cur.productId != product.id ||
        cur.phase != ProductAnalysisPhase.quizLoading) {
      return;
    }
    if (quiz != null && quiz.questions.isNotEmpty) {
      notifier.setQuiz(quiz);
    } else {
      // Quiz üretilemedi → doğrudan rapora geç (listen bunu yakalar).
      notifier.requestReportSkippingQuiz();
    }
  }

  Future<void> _runProductReportPhase(ProductAnalysisState s) async {
    final product = s.product;
    if (product == null) return;
    final notifier = ref.read(productAnalysisProvider.notifier);
    notifier.setRunning();
    // Qor kataloğundan "benzer ürünler" → AI gerçek ürünleri alternatif olarak
    // kullanabilsin (web paritesi). Best-effort.
    List<ProductEntity> similar = const [];
    try {
      similar = await ref.read(similarProductsProvider(product).future);
    } catch (_) {}
    try {
      // GÜVENLİK: rapor motoru asla SONSUZA kadar takılmasın (aksi halde Q
      // butonundaki spinner hiç durmaz). 3 dk'da bitmezse hata say → spinner
      // durur, kullanıcı "Yeniden Analiz Et" ile tekrar dener.
      final report = await AiReportService.runProductReport(
        ref: ref,
        product: product,
        lang: s.lang,
        profile: s.profile,
        quizAnswers: s.answers,
        similarProducts: similar,
        researchFuture: notifier.researchFuture,
        onStage: (st) {
          final cur = ref.read(productAnalysisProvider);
          if (cur.productId == product.id) {
            notifier.setStage(_mapProductStage(st));
          }
        },
      ).timeout(const Duration(minutes: 3));
      final cur = ref.read(productAnalysisProvider);
      if (cur.productId != product.id) return; // başka ürünle değiştirilmiş
      if (report != null) {
        notifier.setReport(report);
        _saveProductAnalysisHistory(product, s, report);
      } else {
        notifier.setError();
      }
    } catch (_) {
      final cur = ref.read(productAnalysisProvider);
      if (cur.productId == product.id) notifier.setError();
    }
  }

  /// Ürün analizi bitince tam raporu + quiz cevaplarını geçmişe yazar (link/
  /// abonelik akışıyla AYNI desen). Böylece kullanıcı ürüne dönünce BİRE BİR
  /// aynı analizi görür ve "geçmiş analizler" listesinde çıkar.
  void _saveProductAnalysisHistory(
    ProductEntity product,
    ProductAnalysisState s,
    Map<String, dynamic> report,
  ) {
    final answered = s.answers
        .where((q) => q.selectedOption != null)
        .map(
          (q) => {
            'question': q.text,
            'answer': q.selectedOption,
            'options': q.options,
          },
        )
        .toList();
    final score =
        (report['matchScore'] as num?)?.toDouble() ??
        (report['overallScore'] as num?)?.toDouble() ??
        product.techScore;
    final entry = <String, dynamic>{
      'id': DateTime.now().microsecondsSinceEpoch.toString(),
      'type': 'product',
      'productId': product.id,
      'productName': product.nameForLanguage(s.lang),
      'category': product.category,
      if (product.brand != null) 'brand': product.brand,
      'imageUrl': product.imageUrl,
      'score': score,
      'report': report,
      'quizAnswers': answered,
      'timestamp': DateTime.now().toIso8601String(),
    };
    try {
      ref
          .read(pendingProductAnalysisHistoryProvider.notifier)
          .update(
            (list) => [
              entry,
              ...list.where((e) => e['productId'] != product.id),
            ],
          );
    } catch (_) {}
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        ref
            .read(pbDataSourceProvider)
            .saveProductAnalysisHistory(auth, entry)
            .then((_) => ref.invalidate(productAnalysisHistoryProvider))
            .catchError((_) {});
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_fcmTokenRefreshSub?.cancel());
    _productCacheInvalidationDebounce?.cancel();
    final unsubscribe = _productsUnsubscribe;
    if (unsubscribe != null) {
      unawaited(unsubscribe());
    }
    super.dispose();
  }

  /// Telefon GERİ tuşu. Bu observer, GoRouter'ın back-dispatcher'ından ÖNCE
  /// çalışır (daha geç register edildiği için observer listesinde önce gelir).
  ///
  /// - Root navigator'da shell'in ÜSTÜNDE bir sayfa varsa (ürün/arama/ayarlar)
  ///   → dokunma, normal pop olsun.
  /// - Shell en üstteyse ve Ana Sayfa DIŞI bir sekmedeysek → app'ten çıkmak
  ///   yerine Ana Sayfa'ya dön.
  /// - Ana Sayfa'daysak → Router'a bırak (iç-rota pop / uygulamadan çıkış).
  @override
  Future<bool> didPopRoute() async {
    final rootNav = Navigator.maybeOf(context, rootNavigator: true);
    if (rootNav != null && rootNav.canPop()) {
      return false;
    }
    if (widget.navigationShell.currentIndex != 0) {
      _onNavTap(0);
      return true;
    }
    return false;
  }

  int _indexFromLocation(String location) {
    // Branch indices match StatefulShellRoute definition:
    // 0=home(+browse+aiChat) 1=compare 2=linkPaste 3=subscriptions
    return widget.navigationShell.currentIndex.clamp(0, 3);
  }

  void _onNavTap(int index) {
    if (!kIsWeb) HapticFeedback.lightImpact();
    // Misafir kullanıcı tüm sekmelerde GEZEBİLİR (Karşılaştır / Link Analizi /
    // Abonelik). Giriş yalnız AI AKSİYONU tetiklenince istenir — bu kilit ilgili
    // ekranlardaki "başlat/analiz et" butonlarında requireAuth() ile uygulanır.
    // Close any open modals/bottom sheets before navigating
    Navigator.of(
      context,
      rootNavigator: true,
    ).popUntil((route) => route is! PopupRoute);
    ref.read(bottomNavIndexProvider.notifier).state = index;
    // initialLocation:true resets a branch to its root route when re-tapped,
    // so repeated taps on Home pop back to /home from /home/browse.
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  Widget _buildConnectivityBanner() {
    return Consumer(
      builder: (context, ref, _) {
        final connectivity = ref.watch(connectivityProvider);
        return connectivity.when(
          data: (status) {
            if (status == ConnectivityStatus.offline) {
              return SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.error,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.wifi_off_rounded,
                          color: Colors.white,
                          size: 16,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          AppLocalizations.of(context)?.noInternetConnection ??
                              "No internet connection",
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }
            return const SizedBox.shrink();
          },
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _indexFromLocation(location);
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final useDesktopLayout = context.isDesktop;

    // ── ANALİZ BİLDİRİM MERKEZİ (Qor AI chat) ──────────────────────────────
    // KULLANICI İSTEĞİ (2026-07-12): Ekran ortası popup KALDIRILDI. Tüm akışlar
    // (ürün / link / abonelik / karşılaştırma) `analysisHubProvider`'a besler:
    //  • quiz üretimi veya analiz KOŞARKEN → yüzen Q butonunda mini spinner.
    //  • quiz/rapor HAZIR olunca → Qor chat paneline "Quize git/Analize git/
    //    Sonra" butonlu bildirim satırı düşer.
    // Kullanıcı bu işlemleri artık YALNIZ Qor AI chat'ten kontrol eder.
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final hub = ref.read(analysisHubProvider.notifier);

    ref.listen<SubQuizState>(subQuizProvider, (prev, next) {
      if (!mounted) return;
      _feedHubSub(hub, prev, next, isTr);
    });
    ref.listen<LinkQuizState>(linkQuizProvider, (prev, next) {
      if (!mounted) return;
      _feedHubLink(hub, prev, next, isTr);
    });
    // Ürün akışı: MOTOR burada koşar (shell her zaman canlı) + hub'a besler.
    ref.listen<ProductAnalysisState>(productAnalysisProvider, (prev, next) {
      if (!mounted) return;
      if (next.phase == ProductAnalysisPhase.startRequested &&
          prev?.phase != ProductAnalysisPhase.startRequested) {
        Future.microtask(() => _runProductQuizPhase(next));
      } else if (next.phase == ProductAnalysisPhase.reportRequested &&
          prev?.phase != ProductAnalysisPhase.reportRequested) {
        Future.microtask(() => _runProductReportPhase(next));
      }
      _feedHubProduct(hub, prev, next, isTr);
    });

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        key: mainShellScaffoldKey,
        backgroundColor: context.backgroundColor,
        extendBody: !useDesktopLayout,
        body: useDesktopLayout
            ? _buildDesktopLayout(currentIndex)
            : _buildMobileLayout(currentIndex, bottomPadding),
      ),
    );
  }

  Widget _buildMobileLayout(int currentIndex, double bottomPadding) {
    final goState = GoRouterState.of(context);
    final path = goState.uri.path;
    final location = goState.matchedLocation;
    // Kategori tarama: hem /browse hem /home/browse (sorgu yolu uri.path'te yok)
    final isBrowseRoute =
        path == AppRoutes.browse ||
        path == '/home/browse' ||
        path.startsWith('/home/browse/');

    return Stack(
      children: [
        Positioned.fill(
          child: Column(
            children: [
              _buildConnectivityBanner(),
              Expanded(child: widget.navigationShell),
            ],
          ),
        ),
        // Positioned must be a direct Stack child — Consumer lives inside it.
        Positioned(
          left: AppTheme.navBarHMargin,
          right: AppTheme.navBarHMargin,
          bottom: bottomPadding + AppTheme.navBarBottomMargin,
          child: Consumer(
            builder: (context, ref, _) {
              final isLinkAiAnalyzing =
                  ref.watch(
                    compareAnalysisProvider.select((s) => s.isWorking),
                  ) ||
                  ref.watch(
                    linkQuizProvider.select(
                      (s) =>
                          s.phase == LinkFlowPhase.analyzing ||
                          s.phase == LinkFlowPhase.computing,
                    ),
                  );
              // Abonelik analizi arka planda sürerken (quiz üretimi/analiz)
              // alt sekmede (index 3) küçük dairesel yükleme göster.
              final isSubAiAnalyzing = ref.watch(
                subQuizProvider.select(
                  (s) =>
                      s.phase == SubFlowPhase.quizLoading ||
                      s.phase == SubFlowPhase.analyzing,
                ),
              );
              final hideNavBar = ref.watch(hideNavBarProvider);
              // Karşılaştırma sekmesinde (index 1) aktif bir karşılaştırma
              // (2+ ürün) görüntülenirken alt bar KESİN gizlenir — compare_screen'in
              // post-frame hideNavBar sinyaline bağlı kalmadan doğrudan burada
              // kontrol edilir (kullanıcı isteği: compare ekranında alt bar olmasın).
              final comparingActive =
                  currentIndex == 1 &&
                  ref.watch(
                    compareSessionProvider.select(
                      (s) => (s.comparedProducts?.length ?? 0) >= 2,
                    ),
                  );
              final effectiveHideNavBar =
                  isBrowseRoute || hideNavBar || comparingActive;
              if (!isBrowseRoute && location == AppRoutes.home && hideNavBar) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  ref.read(hideNavBarProvider.notifier).state = false;
                });
              }
              if (effectiveHideNavBar) return const SizedBox.shrink();
              return RepaintBoundary(
                child: _FloatingNavBar(
                  currentIndex: currentIndex,
                  onTap: _onNavTap,
                  isLinkAiAnalyzing: isLinkAiAnalyzing,
                  isSubAiAnalyzing: isSubAiAnalyzing,
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildDesktopLayout(int currentIndex) {
    final isWide = context.screenWidth >= Breakpoints.desktop;
    return Stack(
      children: [
        Row(
          children: [
            _DesktopSidebar(
              currentIndex: currentIndex,
              onTap: _onNavTap,
              isExpanded: isWide,
            ),
            Container(width: 1, color: context.dividerColor),
            Expanded(
              child: Column(
                children: [
                  _buildConnectivityBanner(),
                  Expanded(
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 1200),
                        child: widget.navigationShell,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── NAV ITEMS ───

class _NavItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  const _NavItem(this.icon, this.activeIcon, this.label);
}

List<_NavItem> _buildNavItems(BuildContext context) {
  final l10n = AppLocalizations.of(context);
  final isTr = Localizations.localeOf(context).languageCode == 'tr';
  return [
    _NavItem(Icons.home_outlined, Icons.home_rounded, l10n?.home ?? 'Home'),
    _NavItem(
      Icons.compare_arrows_outlined,
      Icons.compare_arrows_rounded,
      l10n?.compare ?? 'Compare',
    ),
    _NavItem(
      Icons.link_rounded,
      Icons.link_rounded,
      isTr ? 'Link Analizi' : 'Link Analysis',
    ),
    _NavItem(
      Icons.subscriptions_outlined,
      Icons.subscriptions_rounded,
      isTr ? 'Abonelik Karşılaştır' : 'Subscription Analysis',
    ),
  ];
}

// ─── FLOATING NAV BAR (4 items, ultra-slim) ───

class _FloatingNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool isLinkAiAnalyzing;
  final bool isSubAiAnalyzing;

  const _FloatingNavBar({
    required this.currentIndex,
    required this.onTap,
    this.isLinkAiAnalyzing = false,
    this.isSubAiAnalyzing = false,
  });

  static const _brandGradient = LinearGradient(
    colors: [AppTheme.brandDeepBlue, AppTheme.brandBlue, AppTheme.brandCyan],
  );

  @override
  Widget build(BuildContext context) {
    final items = _buildNavItems(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling),
      child: Container(
        height: _kNavBarHeight,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppTheme.radiusXXL),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.48),
              blurRadius: 28,
              offset: const Offset(0, 8),
            ),
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.07),
              blurRadius: 36,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusXXL),
          // Maks. akıcılık: BackdropFilter blur'u TAMAMEN kaldırıldı. Blur her
          // scroll frame'inde arkadaki içeriği yeniden örnekleyip kompozitliyordu
          // — giriş seviyesi GPU'larda (Redmi Note 11SE) sürekli jank kaynağı.
          // Nav arka planı zaten opak/yarı-opak; cam algısı korunur, GPU sıfır.
          child: _navBarInner(context, items, isDark),
        ),
      ),
    );
  }

  Widget _navBarInner(BuildContext context, List<_NavItem> items, bool isDark) {
    return Container(
      decoration: BoxDecoration(
        color: isDark
            ? AppTheme.brandDark.withValues(alpha: 0.88)
            : context.surfaceElevatedColor.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(AppTheme.radiusXXL),
        border: Border.symmetric(
          horizontal: BorderSide(
            color: isDark
                ? Colors.white.withValues(alpha: 0.09)
                : context.dividerColor,
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        children: List.generate(items.length, (index) {
          final item = items[index];
          final isSelected = index == currentIndex;

          // Regular items — animated pill background on active
          return Expanded(
            child: Semantics(
              button: true,
              selected: isSelected,
              label: item.label,
              child: GestureDetector(
                onTap: () {
                  if (!kIsWeb) HapticFeedback.selectionClick();
                  onTap(index);
                },
                behavior: HitTestBehavior.opaque,
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    padding: EdgeInsets.symmetric(
                      horizontal: isSelected ? 9 : 6,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppTheme.brandCyan.withValues(alpha: 0.12)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 200),
                              child: isSelected
                                  ? ShaderMask(
                                      key: ValueKey('active_$index'),
                                      shaderCallback: (bounds) =>
                                          _brandGradient.createShader(bounds),
                                      blendMode: BlendMode.srcIn,
                                      child: Icon(
                                        item.activeIcon,
                                        size: 19,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Icon(
                                      item.icon,
                                      key: ValueKey('inactive_$index'),
                                      size: 19,
                                      color: AppTheme.slate500,
                                    ),
                            ),
                            if ((index == 2 && isLinkAiAnalyzing) ||
                                (index == 3 && isSubAiAnalyzing))
                              Positioned(
                                right: -3,
                                top: -3,
                                child: SizedBox(
                                  width: 9,
                                  height: 9,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 1.5,
                                    valueColor: const AlwaysStoppedAnimation(
                                      AppTheme.brandCyan,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        AnimatedDefaultTextStyle(
                          duration: const Duration(milliseconds: 200),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: isSelected ? 8.4 : 8.0,
                            height: 1.05,
                            fontWeight: isSelected
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: isSelected
                                ? AppTheme.brandCyan
                                : AppTheme.slate500,
                          ),
                          child: Text(
                            item.label,
                            maxLines: 2,
                            textAlign: TextAlign.center,
                            overflow: TextOverflow.ellipsis,
                            softWrap: true,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ─── Desktop Sidebar ───

class _DesktopSidebar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool isExpanded;

  const _DesktopSidebar({
    required this.currentIndex,
    required this.onTap,
    required this.isExpanded,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: isExpanded ? _kSidebarWidth : _kRailWidth,
      color: context.surfaceColor,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.symmetric(
                horizontal: isExpanded ? 20 : 12,
                vertical: 20,
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xFF010617)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white.withValues(alpha: 0.08)
                            : AppTheme.brandBlue.withValues(alpha: 0.12),
                      ),
                    ),
                    child: Image.asset(
                      'assets/logo/qor_ai_logo_512.png',
                      width: 32,
                      height: 32,
                      fit: BoxFit.contain,
                    ),
                  ),
                  if (isExpanded) ...[
                    const SizedBox(width: 12),
                    Text(
                      "Qor AI",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Divider(height: 1, color: context.dividerColor),
            Expanded(
              child: Builder(
                builder: (context) {
                  final navItems = _buildNavItems(context);
                  return Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(navItems.length, (index) {
                      final item = navItems[index];
                      final isSelected = index == currentIndex;
                      return _SidebarItem(
                        icon: isSelected ? item.activeIcon : item.icon,
                        label: item.label,
                        isSelected: isSelected,
                        isExpanded: isExpanded,
                        onTap: () => onTap(index),
                      );
                    }),
                  );
                },
              ),
            ),
            if (isExpanded) ...[
              Divider(height: 1, color: context.dividerColor),
              _SidebarFooterLink(
                label: context.l10n?.privacyPolicy ?? 'Privacy Policy',
                onTap: () => context.go(AppRoutes.privacyPolicy),
              ),
              _SidebarFooterLink(
                label: context.l10n?.termsOfService ?? 'Terms of Service',
                onTap: () => context.go(AppRoutes.termsOfService),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  "© 2025 Qor AI",
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: AppTheme.slate400,
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ],
        ),
      ),
    );
  }
}

class _SidebarItem extends StatefulWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final bool isExpanded;
  final VoidCallback onTap;

  const _SidebarItem({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.isExpanded,
    required this.onTap,
  });

  @override
  State<_SidebarItem> createState() => _SidebarItemState();
}

class _SidebarItemState extends State<_SidebarItem> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.isSelected
        ? AppTheme.brandCyan
        : (_hovering ? context.textPrimary : context.textTertiaryColor);
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: EdgeInsets.symmetric(
            horizontal: widget.isExpanded ? 12 : 8,
            vertical: 2,
          ),
          padding: EdgeInsets.symmetric(
            horizontal: widget.isExpanded ? 14 : 0,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            color: widget.isSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.08)
                : (_hovering
                      ? Colors.white.withValues(alpha: 0.05)
                      : Colors.transparent),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: widget.isExpanded
                ? MainAxisAlignment.start
                : MainAxisAlignment.center,
            children: [
              widget.isSelected
                  ? ShaderMask(
                      shaderCallback: (bounds) =>
                          AppTheme.primaryGradient.createShader(bounds),
                      blendMode: BlendMode.srcIn,
                      child: Icon(widget.icon, size: 22, color: Colors.white),
                    )
                  : Icon(widget.icon, size: 22, color: color),
              if (widget.isExpanded) ...[
                const SizedBox(width: 14),
                Text(
                  widget.label,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: widget.isSelected
                        ? FontWeight.w700
                        : FontWeight.w500,
                    fontSize: 14,
                    color: widget.isSelected ? AppTheme.brandCyan : color,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SidebarFooterLink extends StatefulWidget {
  final String label;
  final VoidCallback onTap;
  const _SidebarFooterLink({required this.label, required this.onTap});

  @override
  State<_SidebarFooterLink> createState() => _SidebarFooterLinkState();
}

class _SidebarFooterLinkState extends State<_SidebarFooterLink> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          child: Text(
            widget.label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: _hovering ? AppTheme.brandCyan : AppTheme.slate500,
            ),
          ),
        ),
      ),
    );
  }
}
