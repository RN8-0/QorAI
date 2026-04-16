import 'package:compair/services/spec_direction_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SpecDirectionService', () {
    test('prefers higher video recording resolution', () {
      final service = SpecDirectionService();

      final winner = service.findBetterIndex('Video Recording', [
        'UHD (3840x2160)',
        '8K (7680x4320)',
      ]);

      expect(winner, 1);
    });

    test('normalizes storage units before comparing', () {
      final service = SpecDirectionService();

      final winner = service.findBetterIndex('Internal Storage', [
        '1 TB',
        '512 GB',
      ]);

      expect(winner, 0);
    });
  });
}
