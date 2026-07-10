/// Qor AI - GoRouter Configuration
/// Blueprint Section 3.1 (routing/)
///
/// All page routes, auth guard, lazy loading
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/screens/login/login_screen.dart';
import 'package:qor_ai/presentation/screens/onboarding/onboarding_screen.dart';
import 'package:qor_ai/presentation/screens/quiz/quiz_screen.dart';
import 'package:qor_ai/presentation/screens/home/home_screen.dart';
import 'package:qor_ai/presentation/screens/compare/compare_screen.dart';
import 'package:qor_ai/presentation/screens/detail/product_detail_screen.dart';
import 'package:qor_ai/presentation/screens/profile/profile_screen.dart';
import 'package:qor_ai/presentation/screens/settings/settings_screen.dart';
import 'package:qor_ai/presentation/screens/settings/edit_profile_screen.dart';
import 'package:qor_ai/presentation/screens/link_paste/link_paste_screen.dart';
import 'package:qor_ai/presentation/screens/search/search_screen.dart';
import 'package:qor_ai/presentation/screens/ai_chat/ai_chat_screen.dart';
import 'package:qor_ai/presentation/screens/main_shell.dart' as shell;
import 'package:qor_ai/presentation/screens/subscriptions/subscriptions_screen.dart';
import 'package:qor_ai/presentation/screens/comparisons/comparisons_screen.dart';
import 'package:qor_ai/presentation/screens/collection/collection_screen.dart';
import 'package:qor_ai/presentation/screens/legal/legal_screen.dart';
import 'package:qor_ai/presentation/screens/browse/category_browse_screen.dart';
import 'package:qor_ai/presentation/screens/profile/behavior_report_screen.dart';
import 'package:qor_ai/presentation/screens/profile/recently_viewed_screen.dart';
import 'package:qor_ai/presentation/screens/notifications/notifications_screen.dart';
import 'package:qor_ai/presentation/screens/visual_scanner/visual_scanner_screen.dart';
import 'package:qor_ai/presentation/screens/settings/contact_us_screen.dart';
import 'package:qor_ai/presentation/screens/settings/email_verify_screen.dart';
import 'package:qor_ai/presentation/widgets/paywall_sheet.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/pb_client.dart';

// Route names
class AppRoutes {
  static const String login = '/';
  static const String onboarding = '/onboarding';
  static const String quiz = '/quiz';
  static const String home = '/home';
  static const String compare = '/compare';
  static const String productDetail = '/product/:id';
  static const String profile = '/profile';
  static const String settings = '/settings';
  static const String editProfile = '/settings/edit-profile';
  static const String linkPaste = '/link-paste';
  static const String subscriptions = '/subscriptions';
  static const String search = '/search';
  static const String aiChat = '/ai-chat';
  static const String comparisonResult = '/comparison-result';
  // User screens
  static const String comparisons = '/comparisons';
  static const String collection = '/collection';
  // Legal
  static const String privacyPolicy = '/privacy-policy';
  static const String termsOfService = '/terms-of-service';
  static const String faq = '/faq';
  // Browse
  static const String browse = '/browse';
  // Behavior Report
  static const String behaviorReport = '/behavior-report';
  // Premium Paywall
  static const String premium = '/premium';
  // Visual Scanner
  static const String visualScanner = '/visual-scanner';
  // Recently Viewed
  static const String recentlyViewed = '/recently-viewed';
  static const String contactUs = '/contact-us';
  static const String emailVerify = '/email-verify';
  static const String notifications = '/notifications';
}

/// Root navigator key — used to ensure routes outside ShellRoute use root nav
final _rootNavigatorKey = GlobalKey<NavigatorState>();

/// Bridges PocketBase's authStore.onChange stream to a Listenable so GoRouter
/// can re-evaluate `redirect` whenever the user logs in / out / is deleted.
class _AuthStoreNotifier extends ChangeNotifier {
  _AuthStoreNotifier() {
    _sub = pb.authStore.onChange.listen((_) => notifyListeners());
  }

  late final StreamSubscription<dynamic> _sub;

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

/// Router Provider - Section 3.3
final routerProvider = Provider<GoRouter>((ref) {
  final authNotifier = _AuthStoreNotifier();
  ref.onDispose(authNotifier.dispose);
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.login,
    debugLogDiagnostics: false,
    refreshListenable: authNotifier,

    // Page transition animation - Section 14.4 (300ms, Curves.easeInOut)
    routes: [
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const OnboardingScreen(),
          transitionsBuilder: _fadeTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.quiz,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const QuizScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),

      // Main application shell (4 persistent tabs):
      // Home, Compare, Link Analysis, Subscription Analysis.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            shell.MainShell(navigationShell: navigationShell),
        branches: [
          // Branch 0: Home (+ Browse as sub-route so bottom bar stays)
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.home,
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: HomeScreen()),
                routes: [
                  GoRoute(
                    path: 'browse',
                    pageBuilder: (context, state) {
                      final categoryId =
                          state.uri.queryParameters['id'] ?? 'smartphones';
                      final categoryName =
                          state.uri.queryParameters['name'] ?? 'Smartphones';
                      final extra = state.extra;
                      List<Map<String, dynamic>>? groupItems;
                      if (extra is List) {
                        groupItems = extra.cast<Map<String, dynamic>>();
                      }
                      return NoTransitionPage(
                        child: CategoryBrowseScreen(
                          categoryId: categoryId,
                          categoryName: categoryName,
                          groupItems: groupItems,
                        ),
                      );
                    },
                  ),
                  GoRoute(
                    path: 'ai-chat',
                    pageBuilder: (context, state) {
                      final query = state.uri.queryParameters['q'];
                      return NoTransitionPage(
                        child: AIChatScreen(initialQuery: query),
                      );
                    },
                  ),
                ],
              ),
              // Keep legacy top-level /browse and /ai-chat working by
              // defining them in the same branch as home.
              GoRoute(
                path: AppRoutes.browse,
                pageBuilder: (context, state) {
                  final categoryId =
                      state.uri.queryParameters['id'] ?? 'smartphones';
                  final categoryName =
                      state.uri.queryParameters['name'] ?? 'Smartphones';
                  final extra = state.extra;
                  List<Map<String, dynamic>>? groupItems;
                  if (extra is List) {
                    groupItems = extra.cast<Map<String, dynamic>>();
                  }
                  return NoTransitionPage(
                    child: CategoryBrowseScreen(
                      categoryId: categoryId,
                      categoryName: categoryName,
                      groupItems: groupItems,
                    ),
                  );
                },
              ),
              GoRoute(
                path: AppRoutes.aiChat,
                pageBuilder: (context, state) {
                  final query = state.uri.queryParameters['q'];
                  return NoTransitionPage(
                    child: AIChatScreen(initialQuery: query),
                  );
                },
              ),
            ],
          ),
          // Branch 1: Compare
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.compare,
                pageBuilder: (context, state) {
                  final modeParam = state.uri.queryParameters['mode'];
                  final mode = modeParam != null
                      ? (int.tryParse(modeParam) ?? -1)
                      : -1;
                  return NoTransitionPage(
                    child: CompareScreen(initialMode: mode),
                  );
                },
              ),
            ],
          ),
          // Branch 2: Link Analysis
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.linkPaste,
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: LinkPasteScreen()),
              ),
            ],
          ),
          // Branch 3: Subscription Analysis
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.subscriptions,
                pageBuilder: (context, state) =>
                    const NoTransitionPage(child: SubscriptionsScreen()),
              ),
            ],
          ),
        ],
      ),

      // Standalone pages (accessed from drawer / navigation)

      // Profile is now outside the shell (accessed via top-right avatar)
      GoRoute(
        path: AppRoutes.profile,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const ProfileScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),

      GoRoute(
        path: AppRoutes.productDetail,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) {
          final productId = state.pathParameters['id']!;
          return CustomTransitionPage(
            child: ProductDetailScreen(productId: productId),
            transitionsBuilder: _slideUpTransition,
            transitionDuration: AppConstants.pageTransitionDuration,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.settings,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const SettingsScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.editProfile,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const EditProfileScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.privacyPolicy,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const LegalScreen(docType: LegalDocType.privacyPolicy),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.termsOfService,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const LegalScreen(docType: LegalDocType.termsOfService),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.faq,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const LegalScreen(docType: LegalDocType.faq),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.search,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const SearchScreen(),
          transitionsBuilder: _fadeTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),

      GoRoute(
        path: AppRoutes.comparisons,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const ComparisonsScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.collection,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const CollectionScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.comparisonResult,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) {
          return CustomTransitionPage(
            child: CompareScreen(initialComparison: state.extra),
            transitionsBuilder: _slideUpTransition,
            transitionDuration: AppConstants.pageTransitionDuration,
          );
        },
      ),
      GoRoute(
        path: AppRoutes.behaviorReport,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const BehaviorReportScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.recentlyViewed,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const RecentlyViewedScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.notifications,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const NotificationsScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.premium,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const PaywallScreen(),
          transitionsBuilder: _slideUpTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),

      GoRoute(
        path: AppRoutes.contactUs,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const ContactUsScreen(),
          transitionsBuilder: _slideTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
      GoRoute(
        path: AppRoutes.emailVerify,
        pageBuilder: (context, state) {
          final token = state.uri.queryParameters['token'] ?? '';
          return CustomTransitionPage(
            child: EmailVerifyScreen(token: token),
            transitionsBuilder: _fadeTransition,
            transitionDuration: AppConstants.pageTransitionDuration,
          );
        },
      ),
      // Visual Scanner (standalone, no bottom nav)
      GoRoute(
        path: AppRoutes.visualScanner,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const VisualScannerScreen(),
          transitionsBuilder: _slideUpTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
      ),
    ],

    // Auth redirect guard - Blueprint Section 5.1
    redirect: (context, state) {
      final location = state.matchedLocation;

      // Check auth state (PocketBase)
      final isLoggedIn = pb.authStore.isValid;
      final record = pb.authStore.record;

      // Public routes (no auth required).
      // Misafir kullanıcı alt bardaki TÜM sekmelerde gezebilir (Karşılaştır /
      // Link Analizi / Abonelik dahil) — giriş yalnız AI AKSİYONU tetiklenince
      // ilgili ekrandaki requireAuth() ile istenir, rota seviyesinde değil.
      const publicRoutes = [
        AppRoutes.login,
        AppRoutes.onboarding,
        AppRoutes.quiz,
        AppRoutes.home,
        AppRoutes.search,
        AppRoutes.productDetail,
        AppRoutes.comparisons,
        AppRoutes.collection,
        AppRoutes.browse,
        AppRoutes.privacyPolicy,
        AppRoutes.termsOfService,
        AppRoutes.faq,
        AppRoutes.premium,
        AppRoutes.compare,
        AppRoutes.linkPaste,
        AppRoutes.subscriptions,
      ];
      final isPublicRoute =
          publicRoutes.contains(location) || location.startsWith('/product/');

      // Not logged in user trying to access a protected route
      if (!isLoggedIn && !isPublicRoute) {
        return AppRoutes.login;
      }

      // Logged in user should not re-enter login or onboarding
      if (isLoggedIn &&
          (location == AppRoutes.login || location == AppRoutes.onboarding)) {
        return AppRoutes.home;
      }

      // Kayıt sonrası quiz'i GÖSTER ama ZORUNLU değil: kullanıcı sağ üstten
      // atlarsa (quizSkipped=true) ana sayfaya gidebilir. AI özellikleri yine
      // quizCompleted ister (atlamak AI'ı açmaz; gating shared_premium'da).
      // Anonim misafirler (guest_*@qorai.local) muaf.
      if (isLoggedIn && record != null) {
        final email = record.data['email']?.toString() ?? '';
        final isAnonymous = email.endsWith('@qorai.local');
        if (!isAnonymous) {
          final quizCompleted = record.data['quizCompleted'] == true;
          final quizSkipped = ref.read(cacheServiceProvider).getQuizSkipped();
          if (!quizCompleted && !quizSkipped && location != AppRoutes.quiz) {
            return AppRoutes.quiz;
          }
        }
      }

      return null;
    },
  );
});

// ─── Page Transition Animations (iOS-style) ─── Section 14.4

Widget _fadeTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  return FadeTransition(
    opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
    child: child,
  );
}

Widget _slideTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  // iOS-style: new page slides in from right, old page shifts left slightly
  final slideIn = Tween<Offset>(begin: const Offset(1.0, 0.0), end: Offset.zero)
      .animate(
        CurvedAnimation(
          parent: animation,
          curve: const Cubic(0.25, 0.1, 0.25, 1.0), // iOS spring-like
        ),
      );
  final fadeIn = Tween<double>(
    begin: 0.85,
    end: 1.0,
  ).animate(CurvedAnimation(parent: animation, curve: Curves.easeOut));

  return SlideTransition(
    position: slideIn,
    child: FadeTransition(opacity: fadeIn, child: child),
  );
}

Widget _slideUpTransition(
  BuildContext context,
  Animation<double> animation,
  Animation<double> secondaryAnimation,
  Widget child,
) {
  // iOS modal-style: slide up with deceleration
  final slideUp = Tween<Offset>(begin: const Offset(0.0, 0.4), end: Offset.zero)
      .animate(
        CurvedAnimation(
          parent: animation,
          curve: const Cubic(0.2, 0.8, 0.2, 1.0), // iOS spring
        ),
      );
  final fadeIn = Tween<double>(begin: 0.0, end: 1.0).animate(
    CurvedAnimation(parent: animation, curve: const Interval(0.0, 0.5)),
  );

  return SlideTransition(
    position: slideUp,
    child: FadeTransition(opacity: fadeIn, child: child),
  );
}
