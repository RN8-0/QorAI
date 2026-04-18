/// Compair - GoRouter Configuration
/// Blueprint Section 3.1 (routing/)
///
/// All page routes, auth guard, lazy loading
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:compair/presentation/screens/login/login_screen.dart';
import 'package:compair/presentation/screens/onboarding/onboarding_screen.dart';
import 'package:compair/presentation/screens/quiz/quiz_screen.dart';
import 'package:compair/presentation/screens/home/home_screen.dart';
import 'package:compair/presentation/screens/compare/compare_screen.dart';
import 'package:compair/presentation/screens/detail/product_detail_screen.dart';
import 'package:compair/presentation/screens/profile/profile_screen.dart';
import 'package:compair/presentation/screens/settings/settings_screen.dart';
import 'package:compair/presentation/screens/settings/edit_profile_screen.dart';
import 'package:compair/presentation/screens/link_paste/link_paste_screen.dart';
import 'package:compair/presentation/screens/search/search_screen.dart';
import 'package:compair/presentation/screens/ai_chat/ai_chat_screen.dart';
import 'package:compair/presentation/screens/main_shell.dart' as shell;
import 'package:compair/presentation/screens/subscriptions/subscriptions_screen.dart';
import 'package:compair/presentation/screens/comparisons/comparisons_screen.dart';
import 'package:compair/presentation/screens/collection/collection_screen.dart';
import 'package:compair/presentation/screens/legal/legal_screen.dart';
import 'package:compair/presentation/screens/browse/category_browse_screen.dart';
import 'package:compair/presentation/screens/profile/behavior_report_screen.dart';
import 'package:compair/presentation/screens/profile/recently_viewed_screen.dart';
import 'package:compair/presentation/screens/notifications/notifications_screen.dart';
import 'package:compair/presentation/screens/pc_builder/pc_builder_screen.dart';
import 'package:compair/presentation/screens/pc_builder/pc_builder_landing_screen.dart';
import 'package:compair/presentation/screens/visual_scanner/visual_scanner_screen.dart';
import 'package:compair/presentation/widgets/paywall_sheet.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/pb_client.dart';

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
  // PC Builder
  static const String pcBuilder = '/pc-builder';
  // PC Builder — aktif build ekranı (shell dışı, bottom bar yok)
  static const String pcBuilderStart = '/pc-builder-start';
  // Behavior Report
  static const String behaviorReport = '/behavior-report';
  // Premium Paywall
  static const String premium = '/premium';
  // Visual Scanner
  static const String visualScanner = '/visual-scanner';
  // Recently Viewed
  static const String recentlyViewed = '/recently-viewed';
  // Notifications
  static const String notifications = '/notifications';
}

/// Root navigator key — used to ensure routes outside ShellRoute use root nav
final _rootNavigatorKey = GlobalKey<NavigatorState>();

/// Router Provider - Section 3.3
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.home,
    debugLogDiagnostics: false,

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

      // Main application shell (5 tabs: Home, Browse, AI Chat, Compare, Subscriptions)
      ShellRoute(
        builder: (context, state, child) => shell.MainShell(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.home,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: HomeScreen()),
          ),
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
              return NoTransitionPage(child: AIChatScreen(initialQuery: query));
            },
          ),
          GoRoute(
            path: AppRoutes.compare,
            pageBuilder: (context, state) {
              final modeParam = state.uri.queryParameters['mode'];
              // -1 = general (show toggle), 0 = products only, 1 = subscriptions only
              final mode = modeParam != null
                  ? (int.tryParse(modeParam) ?? -1)
                  : -1;
              return NoTransitionPage(child: CompareScreen(initialMode: mode));
            },
          ),
          GoRoute(
            path: AppRoutes.pcBuilder,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: PcBuilderLandingScreen()),
          ),
          GoRoute(
            path: AppRoutes.linkPaste,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: LinkPasteScreen()),
          ),
          GoRoute(
            path: AppRoutes.subscriptions,
            pageBuilder: (context, state) =>
                const NoTransitionPage(child: SubscriptionsScreen()),
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
      // PC Builder aktif ekranı — shell dışında (bottom bar görünmüyor)
      GoRoute(
        path: AppRoutes.pcBuilderStart,
        parentNavigatorKey: _rootNavigatorKey,
        pageBuilder: (context, state) => CustomTransitionPage(
          child: const PcBuilderScreen(),
          transitionsBuilder: _slideUpTransition,
          transitionDuration: AppConstants.pageTransitionDuration,
        ),
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

      // Public routes (no auth required)
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
        AppRoutes.pcBuilder,
        AppRoutes.pcBuilderStart,
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

      // Force onboarding quiz for real (non-anonymous) users who haven't completed it.
      // Anonymous guests use guest_*@compair.local emails and are exempt.
      if (isLoggedIn && record != null) {
        final email = record.data['email']?.toString() ?? '';
        final isAnonymous = email.endsWith('@compair.local');
        if (!isAnonymous) {
          final quizCompleted = record.data['quizCompleted'] == true;
          if (!quizCompleted && location != AppRoutes.quiz) {
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
