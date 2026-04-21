import 'package:flutter_test/flutter_test.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/services/profile_algorithm_service.dart';

void main() {
  final service = ProfileAlgorithmService();

  UserEntity buildUser() {
    final now = DateTime(2025, 1, 1);
    return UserEntity(
      uid: 'u1',
      email: 'test@example.com',
      displayName: 'Tester',
      createdAt: now,
      updatedAt: now,
      country: 'US',
      ecosystem: 'mixed',
      budgetRange: 'high',
      priorities: const ['gaming', 'performance'],
      interestCategories: const ['smartphones', 'laptops', 'monitors'],
      usageIntent: 'gaming_setup',
      profession: 'gamer',
    );
  }

  ProductEntity buildProduct({
    required String id,
    required String name,
    required double techScore,
    required List<String> pros,
    required Map<String, dynamic> specs,
  }) {
    return ProductEntity(
      id: id,
      name: name,
      brand: 'acer',
      category: 'monitors',
      subcategory: 'gaming-monitors',
      techScore: techScore,
      prices: const {'US': 799},
      pros: pros,
      specs: specs,
      lastUpdated: DateTime(2025, 1, 1),
    );
  }

  test('gaming intent raises gaming categories above generic interests', () {
    final priority = service.getCategoryPriority(buildUser());

    expect(priority.indexOf('gpus'), isNonNegative);
    expect(priority.indexOf('consoles'), isNonNegative);
    expect(priority.indexOf('smartphones'), isNonNegative);
    expect(priority.indexOf('gpus'), lessThan(priority.indexOf('smartphones')));
    expect(priority.take(8), contains('consoles'));
  });

  test('gaming users get a higher match score for gaming-focused products', () {
    final user = buildUser();
    final gamingMonitor = buildProduct(
      id: 'gaming-monitor',
      name: 'Predator X27 Gaming Monitor',
      techScore: 91,
      pros: const ['Gaming performance', '165Hz refresh rate', 'Fast response'],
      specs: const {
        'refresh rate': '165Hz',
        'panel': 'IPS',
        'resolution': 'QHD',
      },
    );
    final officeMonitor = buildProduct(
      id: 'office-monitor',
      name: 'WorkView 27 Monitor',
      techScore: 74,
      pros: const ['Office productivity', 'Comfortable panel'],
      specs: const {
        'refresh rate': '60Hz',
        'panel': 'IPS',
        'resolution': 'FHD',
      },
    );

    final gamingScore = service.calculateTotalFitScore(
      user: user,
      product: gamingMonitor,
    );
    final officeScore = service.calculateTotalFitScore(
      user: user,
      product: officeMonitor,
    );

    expect(gamingScore, greaterThan(officeScore));
  });
}
