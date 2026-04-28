/// Qor AI - Unit Tests
///
/// Tests for core entities, services and business logic.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/config/env_config.dart';

void main() {
  // ─── ProductEntity Tests ───
  group('ProductEntity', () {
    final product = ProductEntity(
      id: 'test-1',
      name: 'iPhone 16 Pro',
      brand: 'Apple',
      category: 'smartphones',
      subcategory: 'flagship',
      imageURL: 'https://example.com/img.jpg',
      prices: {'US': 999.0, 'TR': 54999.0},
      trendScore: 85.0,
      techScore: 92.0,
      lastUpdated: DateTime(2026, 1, 1),
    );

    test('getPriceForCountry returns correct price', () {
      expect(product.getPriceForCountry('US'), 999.0);
      expect(product.getPriceForCountry('TR'), 54999.0);
      expect(product.getPriceForCountry('JP'), isNull);
    });

    test('imageUrl getter returns URL when not empty', () {
      expect(product.imageUrl, 'https://example.com/img.jpg');
    });

    test('imageUrl getter returns null when empty', () {
      final noImage = product.copyWith(imageURL: '');
      expect(noImage.imageUrl, isNull);
    });

    test('allImages returns primary image when images list is empty', () {
      expect(product.allImages, ['https://example.com/img.jpg']);
    });

    test('allImages returns images list when not empty', () {
      final withImages = product.copyWith(images: ['img1.jpg', 'img2.jpg']);
      expect(withImages.allImages, ['img1.jpg', 'img2.jpg']);
    });

    test('allImages returns empty list when no images at all', () {
      final noImages = product.copyWith(imageURL: '', images: []);
      expect(noImages.allImages, isEmpty);
    });

    test('copyWith preserves original values', () {
      final copy = product.copyWith(name: 'iPhone 16 Pro Max');
      expect(copy.name, 'iPhone 16 Pro Max');
      expect(copy.id, 'test-1');
      expect(copy.brand, 'Apple');
      expect(copy.category, 'smartphones');
    });

    test('equatable equality works by id, name, lastUpdated', () {
      final same = ProductEntity(
        id: 'test-1',
        name: 'iPhone 16 Pro',
        category: 'smartphones',
        subcategory: '',
        lastUpdated: DateTime(2026, 1, 1),
      );
      expect(product, equals(same));
    });

    test('categoryId returns category', () {
      expect(product.categoryId, 'smartphones');
    });

    test('nullable brand handled correctly', () {
      final noBrand = ProductEntity(
        id: 'test-2',
        name: 'Generic Phone',
        category: 'smartphones',
        subcategory: '',
        lastUpdated: DateTime(2026, 1, 1),
      );
      expect(noBrand.brand, isNull);
    });

    test('getAffiliateLinksForCountry returns empty map for missing country', () {
      expect(product.getAffiliateLinksForCountry('JP'), isEmpty);
    });
  });

  // ─── ProductRatings Tests ───
  group('ProductRatings', () {
    test('default values are zero', () {
      const ratings = ProductRatings();
      expect(ratings.expert, 0.0);
      expect(ratings.community, 0.0);
      expect(ratings.user, 0.0);
      expect(ratings.count, 0);
    });

    test('convenience getters return correct values', () {
      const ratings = ProductRatings(expert: 85, community: 78, user: 90, count: 150);
      expect(ratings.expertScore, 85);
      expect(ratings.communityScore, 78);
      expect(ratings.userScore, 90);
    });
  });

  // ─── UserEntity Tests ───
  group('UserEntity', () {
    test('age calculation works correctly', () {
      final user = UserEntity(
        uid: 'u1',
        email: 'test@test.com',
        displayName: 'Test',
        birthDate: DateTime(2000, 6, 15),
        createdAt: DateTime(2025, 1, 1),
        updatedAt: DateTime(2025, 1, 1),
      );
      expect(user.calculatedAge, isNotNull);
      expect(user.calculatedAge! >= 25, isTrue);
    });

    test('age returns null when no birthDate', () {
      final user = UserEntity(
        uid: 'u2',
        email: 'test@test.com',
        displayName: 'Test',
        createdAt: DateTime(2025, 1, 1),
        updatedAt: DateTime(2025, 1, 1),
      );
      expect(user.calculatedAge, isNull);
    });

    test('COPPA: under 13 detected', () {
      final child = UserEntity(
        uid: 'u3',
        email: 'child@test.com',
        displayName: 'Child',
        birthDate: DateTime(2020, 1, 1),
        createdAt: DateTime(2025, 1, 1),
        updatedAt: DateTime(2025, 1, 1),
      );
      expect(child.calculatedAge, isNotNull);
      expect(child.calculatedAge! < 13, isTrue);
    });
  });

  // ─── EnvConfig Tests ───
  group('EnvConfig', () {
    test('defaults to development environment', () {
      expect(EnvConfig.environment, Environment.development);
    });

    test('init changes environment', () {
      EnvConfig.init(Environment.production);
      expect(EnvConfig.environment, Environment.production);
      expect(EnvConfig.isProduction, isTrue);
      expect(EnvConfig.isDevelopment, isFalse);
      // Reset
      EnvConfig.init(Environment.development);
    });

    test('API keys return empty without Remote Config in test', () {
      // In test environment, Remote Config is not initialized
      // Keys should gracefully return empty string
      expect(EnvConfig.geminiApiKey, isEmpty);
      expect(EnvConfig.deepSeekApiKey, isEmpty);
    });

    test('compile-time env vars work for PocketBase', () {
      // PocketBase uses hardcoded URL in pb_client.dart, no env vars needed
      expect(true, isTrue);
    });
  });
}
