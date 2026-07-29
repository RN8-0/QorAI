import 'package:flutter_test/flutter_test.dart';

/// `main_shell`'deki hesap-değişimi tetikleyicisinin KARAR MANTIĞI.
/// Yanlış tetiklenirse koşan bir analizi siler; hiç tetiklenmezse bir önceki
/// hesabın AI verisi yeni hesapta görünür (premium sızıntısıyla aynı sınıf).
bool shouldResetUserScope(String? prevUid, String? nextUid) {
  if (prevUid == nextUid) return false;
  if (prevUid == null) return false; // giriş / token yenileme → sıfırlama
  return true; // A→B (hesap değişimi) veya A→null (çıkış)
}

void main() {
  group('Hesap kapsamı sıfırlama tetikleyicisi', () {
    test('farklı hesaba geçişte sıfırlar', () {
      expect(shouldResetUserScope('userA', 'userB'), isTrue);
    });

    test('çıkışta sıfırlar', () {
      expect(shouldResetUserScope('userA', null), isTrue);
    });

    test('girişte sıfırlamaz (koşan analizi silmesin)', () {
      expect(shouldResetUserScope(null, 'userA'), isFalse);
    });

    test('token yenileme / aynı kullanıcı sıfırlamaz', () {
      expect(shouldResetUserScope('userA', 'userA'), isFalse);
      expect(shouldResetUserScope(null, null), isFalse);
    });
  });
}
