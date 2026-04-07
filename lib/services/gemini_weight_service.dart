/// Compair - Gemini Weight Vector Service (Task 3)
/// Calls gemini-2.5-flash to generate personalized 12-dimension weight vectors
/// based on user quiz answers.
library;

import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:dio/dio.dart';
import 'package:compair/config/env_config.dart';

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

    await FirebaseFirestore.instance
        .collection('users')
        .doc(uid)
        .collection('profile')
        .doc('weightVector')
        .set({
          ...weights,
          'generated_at': FieldValue.serverTimestamp(),
          'generated_by': 'gemini-2.5-flash',
        });
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
    final apiKey = EnvConfig.geminiApiKey;
    if (apiKey.isEmpty) return Map<String, double>.from(_kFallbackWeights);

    final prompt = '''You are a product recommendation AI for a shopping assistant app.

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
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey',
      options: Options(
        headers: {'Content-Type': 'application/json'},
        sendTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
      ),
      data: {
        'contents': [
          {
            'parts': [
              {'text': prompt}
            ]
          }
        ],
        'generationConfig': {
          'temperature': 0.1,
          'maxOutputTokens': 512,
        },
      },
    );

    final text = response.data['candidates']?[0]?['content']?['parts']?[0]?['text'] as String?;
    if (text == null || text.isEmpty) return Map<String, double>.from(_kFallbackWeights);

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

  /// Convenience: read profile from Firestore then generate weights
  static Future<void> runForCurrentUser() async {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) return;

    try {
      final doc = await FirebaseFirestore.instance
          .collection('users')
          .doc(uid)
          .collection('profile')
          .doc('data')
          .get();

      final data = doc.data() ?? {};
      const service = GeminiWeightService();
      await service.generateWeightVector(
        uid: uid,
        ageGroup: data['age_group'] as String?,
        ecosystem: data['ecosystem'] as String?,
        budgetPreference: data['budget_preference'] as String?,
        priorities: List<String>.from(data['priorities'] ?? []),
        ownedDevices: List<String>.from(data['owned_devices'] ?? []),
        activeSubscriptions: List<String>.from(data['active_subscriptions'] ?? []),
        interestCategories: List<String>.from(data['interest_categories'] ?? []),
        usageIntent: data['usage_intent'] as String?,
        country: data['country'] as String?,
      );
    } catch (_) {
      // Silently ignore — weights will be generated on next app launch
    }
  }
}
