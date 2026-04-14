/// Compair - Gemini Weight Vector Service (Task 3)
/// Calls gemini-2.5-flash-lite to generate personalized 12-dimension weight vectors
/// based on user quiz answers.
library;

import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/pb_client.dart';

/// Fallback weight vector used when Gemini returns invalid JSON
const Map<String, double> _kFallbackWeights = {
  'performance': 0.7,
  'battery': 0.6,
  'camera': 0.5,
  'display': 0.6,
  'portability': 0.5,
  'price_sensitivity': 0.5,
  'ecosystem_lock': 0.3,
  'gaming': 0.3,
  'content_consumption': 0.6,
  'productivity': 0.5,
  'build_quality': 0.6,
  'audio_quality': 0.4,
};

class GeminiWeightService {
  const GeminiWeightService();

  /// Generate weight vector via Gemini API, save to Firestore.
  /// Called immediately after quiz completion.
  Future<void> generateWeightVector({
    required String uid,
    String? ageGroup,
    String? ecosystem,
    String? budgetPreference,
    List<String> priorities = const [],
    List<String> ownedDevices = const [],
    List<String> activeSubscriptions = const [],
    List<String> interestCategories = const [],
    String? usageIntent,
    String? country,
  }) async {
    Map<String, double> weights;

    try {
      weights = await _callGemini(
        ageGroup: ageGroup,
        ecosystem: ecosystem,
        budgetPreference: budgetPreference,
        priorities: priorities,
        ownedDevices: ownedDevices,
        activeSubscriptions: activeSubscriptions,
        interestCategories: interestCategories,
        usageIntent: usageIntent,
        country: country,
      );
    } catch (_) {
      weights = Map<String, double>.from(_kFallbackWeights);
    }

    await pb
        .collection('users')
        .update(
          uid,
          body: {
            'weightVector': {
              ...weights,
              'generated_at': DateTime.now().toIso8601String(),
              'generated_by': AppConstants.geminiModel,
            },
          },
        );
  }

  Future<Map<String, double>> _callGemini({
    String? ageGroup,
    String? ecosystem,
    String? budgetPreference,
    List<String> priorities = const [],
    List<String> ownedDevices = const [],
    List<String> activeSubscriptions = const [],
    List<String> interestCategories = const [],
    String? usageIntent,
    String? country,
  }) async {
    // Gemini calls go through PocketBase proxy — no client-side key.

    final prompt =
        '''You are a product recommendation AI for a shopping assistant app.

User profile:
- Age group: ${ageGroup ?? 'unknown'}
- Primary ecosystem: ${ecosystem ?? 'mixed'}
- Owned devices: ${ownedDevices.isEmpty ? 'none specified' : ownedDevices.join(', ')}
- Budget preference: ${budgetPreference ?? 'any'}
- Shopping priorities: ${priorities.isEmpty ? 'none specified' : priorities.join(', ')}
- Active subscriptions: ${activeSubscriptions.isEmpty ? 'none' : activeSubscriptions.join(', ')}
- Interest categories: ${interestCategories.isEmpty ? 'general' : interestCategories.join(', ')}
- Usage intent: ${usageIntent ?? 'general'}
- Country: ${country ?? 'US'}

Generate a weight vector for product matching algorithms.
Return ONLY a raw JSON object. No markdown. No explanation. No code blocks. Just the JSON:

{
  "performance": <0.0-1.0>,
  "battery": <0.0-1.0>,
  "camera": <0.0-1.0>,
  "display": <0.0-1.0>,
  "portability": <0.0-1.0>,
  "price_sensitivity": <0.0-1.0>,
  "ecosystem_lock": <0.0-1.0>,
  "gaming": <0.0-1.0>,
  "content_consumption": <0.0-1.0>,
  "productivity": <0.0-1.0>,
  "build_quality": <0.0-1.0>,
  "audio_quality": <0.0-1.0>
}

Strict rules:
- ecosystem_lock must be 0.85+ if owned_devices has 3+ Apple items
- ecosystem_lock must be 0.80+ if owned_devices has 3+ Samsung items
- price_sensitivity must be 0.85+ if budget_preference is "budget"
- price_sensitivity must be 0.15 or less if budget_preference is "flagship"
- gaming must be 0.85+ if "gaming" or "Gaming" is in interest_categories
- All values must be between 0.0 and 1.0''';

    final dio = Dio();
    final response = await dio.post(
      '$kPbBaseUrl/api/ai/gemini',
      options: Options(
        headers: withPbAuthHeaders({'Content-Type': 'application/json'}),
        sendTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
      ),
      data: {
        'model': AppConstants.geminiLiteModel,
        'contents': [
          {
            'parts': [
              {'text': prompt},
            ],
          },
        ],
        'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 512},
      },
    );

    final text =
        response.data['candidates']?[0]?['content']?['parts']?[0]?['text']
            as String?;
    if (text == null || text.isEmpty)
      return Map<String, double>.from(_kFallbackWeights);

    return _parseWeights(text.trim());
  }

  Map<String, double> _parseWeights(String text) {
    try {
      // Strip markdown code blocks if present
      String clean = text;
      if (clean.contains('```')) {
        final jsonMatch = RegExp(r'\{[^{}]+\}', dotAll: true).firstMatch(clean);
        clean = jsonMatch?.group(0) ?? clean;
      }
      final json = jsonDecode(clean) as Map<String, dynamic>;
      final weights = <String, double>{};
      for (final key in _kFallbackWeights.keys) {
        final val = json[key];
        if (val is num) {
          weights[key] = val.toDouble().clamp(0.0, 1.0);
        } else {
          weights[key] = _kFallbackWeights[key]!;
        }
      }
      return weights;
    } catch (_) {
      return Map<String, double>.from(_kFallbackWeights);
    }
  }

  /// Convenience: read profile from PocketBase then generate weights
  static Future<void> runForCurrentUser() async {
    final uid = pb.authStore.isValid ? pb.authStore.record?.id : null;
    if (uid == null) return;

    try {
      final record = await pb.collection('users').getOne(uid);
      final data = record.data;

      const service = GeminiWeightService();
      await service.generateWeightVector(
        uid: uid,
        ageGroup: data['ageRange'] as String?,
        ecosystem: data['ecosystem'] as String?,
        budgetPreference: data['budgetRange'] as String?,
        priorities: List<String>.from(data['priorities'] ?? []),
        ownedDevices: List<String>.from(data['currentDevices'] ?? []),
        activeSubscriptions: List<String>.from(data['subscriptions'] ?? []),
        interestCategories: List<String>.from(data['interestCategories'] ?? []),
        usageIntent: data['usageIntent'] as String?,
        country: data['country'] as String?,
      );
    } catch (_) {
      // Silently ignore — weights will be generated on next app launch
    }
  }
}
