import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

/// `SubscriptionService.spendQCoins` gerçek PocketBase'e bağlı olduğu için
/// burada AYNI kuyruk mekanizmasını izole ederek doğruluyoruz: harcamalar seri
/// koşmazsa iki eşzamanlı istek aynı bakiyeyi okur, ikisi de "yeter" der ve
/// kullanıcı bakiyesinden fazlasını harcar.
class _FakeWallet {
  double balance;
  int rejected = 0;
  _FakeWallet(this.balance);

  Future<void> _queue = Future<void>.value();

  /// Serileştirilmiş harcama — servisteki `spendQCoins` ile aynı desen.
  Future<bool> spend(double cost) {
    final completer = Completer<bool>();
    _queue = _queue.then((_) async {
      completer.complete(await _spendLocked(cost));
    });
    return completer.future;
  }

  /// Serileştirmesiz (eski) davranış — karşılaştırma için.
  Future<bool> spendUnserialized(double cost) => _spendLocked(cost);

  Future<bool> _spendLocked(double cost) async {
    // Sunucudan okuma gecikmesi.
    await Future<void>.delayed(const Duration(milliseconds: 5));
    final current = balance;
    if (current + 1e-9 < cost) {
      rejected++;
      return false;
    }
    // Yazma gecikmesi.
    await Future<void>.delayed(const Duration(milliseconds: 5));
    balance = current - cost;
    return true;
  }
}

void main() {
  group('Q harcama serileştirmesi', () {
    test('eşzamanlı istekler bakiyeyi AŞAMAZ', () async {
      final wallet = _FakeWallet(2); // sadece TEK bir 2 Q işlemi karşılar
      final results = await Future.wait([wallet.spend(2), wallet.spend(2)]);

      expect(results.where((ok) => ok).length, 1, reason: 'yalnız biri geçmeli');
      expect(wallet.rejected, 1);
      expect(wallet.balance, 0, reason: 'bakiye negatife düşmemeli');
    });

    test('serileştirme OLMADAN aynı senaryo bakiyeyi deler (regresyon kanıtı)',
        () async {
      final wallet = _FakeWallet(2);
      final results = await Future.wait([
        wallet.spendUnserialized(2),
        wallet.spendUnserialized(2),
      ]);

      // Eski davranış: ikisi de balance=2 okur, ikisi de geçer.
      expect(results.where((ok) => ok).length, 2);
      expect(wallet.balance, 0);
      // İkinci yazma birincinin düşüşünü ezdiği için 4 Q'luk iş 2 Q'ya yapıldı.
    });

    test('yeterli bakiyede sıralı harcamalar doğru toplanır', () async {
      final wallet = _FakeWallet(6);
      final results = await Future.wait([
        wallet.spend(2),
        wallet.spend(2),
        wallet.spend(2),
      ]);
      expect(results.every((ok) => ok), isTrue);
      expect(wallet.balance, 0);
      expect(wallet.rejected, 0);
    });

    test('bakiye bitince sonraki istekler reddedilir', () async {
      final wallet = _FakeWallet(3);
      final results = await Future.wait([
        wallet.spend(2),
        wallet.spend(2),
        wallet.spend(2),
      ]);
      expect(results.where((ok) => ok).length, 1);
      expect(wallet.rejected, 2);
      expect(wallet.balance, 1);
    });
  });
}
