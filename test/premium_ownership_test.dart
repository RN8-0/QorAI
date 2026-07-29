import 'package:flutter_test/flutter_test.dart';

/// `SubscriptionService` Play Billing'e bağlı olduğu için sahiplik kapısının
/// KARAR MANTIĞINI burada birebir aynı kurallarla izole ediyoruz.
///
/// Gerçek hata: Play aboneliği CİHAZIN Google hesabına bağlıdır. Uygulama onu
/// hesap ayrımı yapmadan uyguluyordu → A hesabı yıllık abone, çıkış, B hesabı
/// giriş → B de "Yıllık abonesiniz" oluyordu.
class _OwnershipGate {
  String? ownerUid;

  /// [claimAllowed] yalnızca kullanıcının BİLEREK başlattığı akışlarda true
  /// olur (gerçek satın alma / "Satın alımları geri yükle").
  bool canClaim({required String? currentUid, required bool claimAllowed}) {
    if (currentUid == null || currentUid.isEmpty) return false;
    if (ownerUid == null) {
      if (!claimAllowed) return false;
      ownerUid = currentUid;
      return true;
    }
    if (ownerUid == currentUid) return true;
    if (claimAllowed) {
      ownerUid = currentUid;
      return true;
    }
    return false;
  }
}

void main() {
  group('Premium sahiplik kapısı', () {
    test('BAŞKA hesabın aboneliği otomatik restore ile premium YAPMAZ', () {
      final gate = _OwnershipGate()..ownerUid = 'userA';
      // B hesabı giriş yaptı, uygulama açılışta sessizce restore ediyor.
      expect(
        gate.canClaim(currentUid: 'userB', claimAllowed: false),
        isFalse,
        reason: 'yaşanan hata tam olarak buydu',
      );
      expect(gate.ownerUid, 'userA', reason: 'sahiplik değişmemeli');
    });

    test('sahibi kendi aboneliğini her zaman kullanabilir', () {
      final gate = _OwnershipGate()..ownerUid = 'userA';
      expect(gate.canClaim(currentUid: 'userA', claimAllowed: false), isTrue);
    });

    test('sahipsiz abonelik otomatik restore ile SAHİPLENİLEMEZ', () {
      final gate = _OwnershipGate();
      expect(gate.canClaim(currentUid: 'userB', claimAllowed: false), isFalse);
      expect(gate.ownerUid, isNull);
    });

    test('gerçek satın alma aboneliği o hesaba bağlar', () {
      final gate = _OwnershipGate();
      expect(gate.canClaim(currentUid: 'userA', claimAllowed: true), isTrue);
      expect(gate.ownerUid, 'userA');
    });

    test('kullanıcı "geri yükle" derse sahiplik BİLEREK devredilir', () {
      final gate = _OwnershipGate()..ownerUid = 'userA';
      expect(gate.canClaim(currentUid: 'userB', claimAllowed: true), isTrue);
      expect(gate.ownerUid, 'userB');
    });

    test('oturum yokken premium verilmez', () {
      final gate = _OwnershipGate();
      expect(gate.canClaim(currentUid: null, claimAllowed: true), isFalse);
      expect(gate.canClaim(currentUid: '', claimAllowed: true), isFalse);
      expect(gate.ownerUid, isNull);
    });

    test('çıkış sahipliği siler → sonraki hesap otomatik premium ALMAZ', () {
      final gate = _OwnershipGate()..ownerUid = 'userA';
      gate.ownerUid = null; // clearLocalPremium()
      expect(gate.canClaim(currentUid: 'userB', claimAllowed: false), isFalse);
    });
  });
}
