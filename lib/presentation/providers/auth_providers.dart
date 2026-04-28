part of 'providers.dart';

// ════════════════════════════════════════════════════
// ─── AUTH PROVIDERS ─── (StreamProvider)
// ════════════════════════════════════════════════════

/// PocketBase auth state stream — emits current user ID (null = logged out)
final authStateProvider = StreamProvider<String?>((ref) {
  return ref.read(authRepositoryProvider).authStateChanges;
});

/// User profile stream (PocketBase realtime) - userProfileStreamProvider
final userProfileStreamProvider = StreamProvider<UserEntity?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (uid) {
      if (uid == null) return Stream.value(null);
      return ref.read(pbDataSourceProvider).watchUser(uid);
    },
    loading: () => Stream.value(null),
    error: (_, _) => Stream.value(null),
  );
});

/// Updates user profile country + currency + language from auto-detection
/// Non-blocking — uses .listen() to avoid holding up the UI
final countryInitProvider = FutureProvider<void>((ref) async {
  final uid = await ref.watch(authStateProvider.future);
  if (uid == null) return;
  ref.listen(detectedLocationProvider, (_, next) {
    next.whenData((location) async {
      if (location.countryCode.isEmpty) return;
      try {
        final user = await ref.read(userProfileProvider.future);
        if (user != null && (user.country == 'US' || user.country.isEmpty)) {
          final locale = ref.read(localeProvider);
          final updates = <String, dynamic>{
            'country': location.countryCode,
            'currency': location.currency,
          };
          if (user.language == 'en' && locale != null && locale.languageCode != 'en') {
            updates['language'] = locale.languageCode;
          }
          await ref.read(pbDataSourceProvider).updateUser(uid, updates);
        }
      } catch (_) {}
    });
  });
});

// ════════════════════════════════════════════════════
// ─── NOTIFICATION PROVIDERS ─── (StreamProvider)
// ════════════════════════════════════════════════════

final notificationsProvider =
    StreamProvider<List<Map<String, dynamic>>>((ref) {
  ref.keepAlive(); // keep stream alive globally for realtime push notifications
  // Use select so provider only rebuilds when the UID itself changes (not on
  // every authStore.save() that preserves the same UID).
  final uid = ref.watch(authStateProvider.select((v) => v.valueOrNull));
  if (uid == null) return Stream.value([]);
  return ref.read(pbDataSourceProvider).watchNotifications(uid);
});

final unreadNotificationCountProvider = Provider<int>((ref) {
  final notifs = ref.watch(notificationsProvider).valueOrNull ?? [];
  return notifs.where((n) => n['read'] != true).length;
});

