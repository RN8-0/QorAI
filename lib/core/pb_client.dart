/// Compair — PocketBase Client Singleton
library;

import 'package:pocketbase/pocketbase.dart';

/// PocketBase sunucu URL'si.
/// Production: sslip.io adresi (migration/.env'deki POCKETBASE_URL).
/// Geliştirme sırasında --dart-define=PB_URL=https://... ile override edilebilir.
const _defaultPbUrl =
    String.fromEnvironment('PB_URL', defaultValue: 'http://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io');

/// Typesense public-search API key (read-only, arama endpointlerinde kullanılır)
const kTypesenseApiKey =
    String.fromEnvironment('TS_API_KEY', defaultValue: '9l6gsRj1V9NuXAagocxHJbhmaMgQex9GP7NRFqtT');

const kTypesenseUrl =
    String.fromEnvironment('TS_URL', defaultValue: 'http://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io');

PocketBase createPbClient() => PocketBase(_defaultPbUrl);

/// Global singleton — herkes bunu kullanır.
final PocketBase pb = createPbClient();
