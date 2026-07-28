/// Qor AI — Profil Çözümleyici (gate'ler için tek doğru kaynak)
///
/// NEDEN VAR: `userProfileProvider` bir StreamProvider ve auth state HENÜZ
/// yüklenmemişken `Stream.value(null)` yayınlıyor. Yani "profil daha gelmedi"
/// durumu, tüketiciye `AsyncData(null)` — yani "kullanıcı YOK" — olarak
/// görünüyor. `.future` beklemek de kurtarmıyor, çünkü o da null ile tamamlanıyor.
///
/// Sonuç: giriş yapmış, bakiyesi olan bir kullanıcı AI butonuna bu aralıkta
/// bastığında e-posta kapısı sessizce reddediyor, chat "giriş yapın" diyor ve
/// ürün detayı kullanıcıyı quiz ekranına atıyordu. Bu dosya, oturum GERÇEKTEN
/// geçerliyken profili PocketBase'ten bir kez çekerek bu yanlış negatifi kapatır.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/data/models/user_model.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

/// Profili çözer. `null` SADECE gerçekten oturum yoksa (ya da kayıt hiç
/// okunamıyorsa) döner — "henüz yüklenmedi" asla null'a düşmez.
Future<UserEntity?> resolveUserProfile(
  WidgetRef ref, {
  Duration timeout = const Duration(seconds: 6),
}) {
  return _resolve(
    cached: ref.read(userProfileProvider).valueOrNull,
    read: ref.read,
    invalidate: () => ref.invalidate(userProfileProvider),
    timeout: timeout,
  );
}

/// Provider/notifier içinden (WidgetRef yokken) aynı çözümleme.
Future<UserEntity?> resolveUserProfileRef(
  Ref ref, {
  Duration timeout = const Duration(seconds: 6),
}) {
  return _resolve(
    cached: ref.read(userProfileProvider).valueOrNull,
    read: ref.read,
    invalidate: () => ref.invalidate(userProfileProvider),
    timeout: timeout,
  );
}

Future<UserEntity?> _resolve({
  required UserEntity? cached,
  required T Function<T>(ProviderListenable<T>) read,
  required void Function() invalidate,
  required Duration timeout,
}) async {
  if (cached != null) return cached;

  // Oturum yoksa null DOĞRU cevaptır.
  final uid = pb.authStore.isValid ? pb.authStore.record?.id : null;
  if (uid == null || uid.isEmpty) return null;

  // Oturum var ama stream henüz kullanıcı yaymadı → kaydı doğrudan çek.
  try {
    final fetched = await read(pbDataSourceProvider)
        .getUser(uid)
        .timeout(timeout);
    if (fetched != null) {
      // Stream'i de tazele ki sonraki okumalar cache'ten dönsün.
      invalidate();
      return fetched;
    }
  } catch (_) {
    // Ağ hatası — aşağıdaki son çare denenir.
  }

  // Son çare: authStore'daki kayıt anlık görüntüsü (offline da çalışır).
  final record = pb.authStore.record;
  if (record == null) return null;
  try {
    return UserModel.fromPb(record);
  } catch (_) {
    return null;
  }
}
