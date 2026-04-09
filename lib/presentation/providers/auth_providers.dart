part of 'providers.dart';

// ════════════════════════════════════════════════════
// ─── AUTH PROVIDERS ─── (StreamProvider)
// ════════════════════════════════════════════════════

/// Firebase Auth state stream - Section 3.3 StreamProvider
final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// User profile stream (Firestore realtime) - userProfileStreamProvider
final userProfileStreamProvider = StreamProvider<UserEntity?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) {
      if (user == null) return Stream.value(null);
      return ref.read(firebaseDataSourceProvider).watchUser(user.uid);
    },
    loading: () => Stream.value(null),
    error: (_, __) => Stream.value(null),
  );
});

/// Updates user profile country + currency + language in Firestore from auto-detection
final countryInitProvider = FutureProvider<void>((ref) async {
  final authState = await ref.watch(authStateProvider.future);
  if (authState == null) return;
  final location = await ref.watch(detectedLocationProvider.future);
  if (location.countryCode.isEmpty) return;

  try {
    final user = await ref.read(userProfileProvider.future);
    if (user != null && (user.country == 'US' || user.country.isEmpty)) {
      final locale = ref.read(localeProvider);
      final updates = <String, dynamic>{
        'country': location.countryCode,
        'currency': location.currency,
      };
      // Also save auto-detected language if user hasn't set one
      if (user.language == 'en' && locale != null && locale.languageCode != 'en') {
        updates['language'] = locale.languageCode;
      }
      await ref.read(firebaseDataSourceProvider).updateUser(authState.uid, updates);
    }
  } catch (_) {}
});
