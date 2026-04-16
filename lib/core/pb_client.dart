/// Compair — PocketBase Client Singleton
library;

import 'package:pocketbase/pocketbase.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// PocketBase sunucu URL'si.
/// Production: sslip.io adresi (migration/.env'deki POCKETBASE_URL).
/// Geliştirme sırasında --dart-define=PB_URL=https://... ile override edilebilir.
const _defaultPbUrl = String.fromEnvironment(
  'PB_URL',
  defaultValue: 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io',
);

/// Raw PB base URL — used when services need to hit custom pb_hooks routes
/// (e.g. /api/ai/gemini) without going through the PocketBase SDK.
const String kPbBaseUrl = _defaultPbUrl;

/// Typesense public-search API key (read-only, arama endpointlerinde kullanılır)
const kTypesenseApiKey = String.fromEnvironment(
  'TS_API_KEY',
  defaultValue: '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT',
);

const kTypesenseUrl = String.fromEnvironment(
  'TS_URL',
  defaultValue: 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io',
);

const String _kPbAuthKey = 'pb_auth_store';

/// SharedPreferences tabanlı AsyncAuthStore oluştur ve PocketBase istemcisini döndür.
/// main() içinde runApp()'tan önce çağrılmalıdır.
Future<PocketBase> createPbClientWithPersistence() async {
  final prefs = await SharedPreferences.getInstance();
  final store = AsyncAuthStore(
    save: (String data) async => prefs.setString(_kPbAuthKey, data),
    initial: prefs.getString(_kPbAuthKey),
  );
  return PocketBase(_defaultPbUrl, authStore: store);
}

/// Global singleton — main() tarafından runApp()'tan önce set edilir.
/// Tüm veri katmanı bu instance'ı kullanır, böylece auth token uygulama
/// yeniden başlatmalarında kaybolmaz.
late PocketBase pb;

String? currentPbAuthToken() {
  try {
    final token = pb.authStore.token;
    return token.isEmpty ? null : token;
  } catch (_) {
    return null;
  }
}

Map<String, dynamic> withPbAuthHeaders([Map<String, dynamic>? headers]) {
  final merged = <String, dynamic>{...?headers};
  final token = currentPbAuthToken();
  if (token != null) {
    merged['Authorization'] = token;
  }
  return merged;
}
