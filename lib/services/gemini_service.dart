// Qor AI - Gemini Flash 2.5 AI Service (Core Intelligence)
//
// Unified AI backbone for the entire application.
// Model : gemini-2.5-flash (multimodal: text + image + vision)
// Endpoint: PocketBase proxy — $kPbBaseUrl/api/ai/gemini
//           (pb_hooks/gemini.pb.js forwards to Google AI Studio,
//            key never leaves the server).

import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/services/ai_service.dart';
import 'package:qor_ai/services/cache_service.dart';

/// Central Gemini Flash 2.5 service — the brain of Qor AI.
class GeminiService implements AIService {
  final Dio _dio;
  final CacheService _cacheService;

  // All Gemini calls now go through the PocketBase proxy hook
  // (pb_hooks/gemini.pb.js). The API key lives only on the server —
  // clients never see it.
  static const _proxyUrl = '$kPbBaseUrl/api/ai/gemini';

  // Heavy tier: flash primary → lite fallback
  // Lite tier: lite primary → flash fallback
  static const _heavyModel = AppConstants.geminiModel;
  static const _liteModel = AppConstants.geminiLiteModel;

  GeminiService({
    required Dio dio,
    required CacheService cacheService,
    @Deprecated('No longer used — key is server-side via PB proxy')
    String? apiKey,
  }) : _dio = dio,
       _cacheService = cacheService;

  // ─────────────────────────────────────────────────────────────────────────
  //  PUBLIC API — implements [AIService]
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Future<ComparisonResult> compare(CompareRequest req) async {
    final cacheKey = 'cmp_${req.productIds.join('_')}_${req.country}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) return _parseComparisonResult(cached);

    final lang = req.userProfile['language'] as String? ?? 'en';
    final response = await _jsonRequest(
      system: _comparisonSystemPrompt(lang),
      user: jsonEncode({
        'products': req.productIds,
        'userProfile': req.userProfile,
        'country': req.country,
        'category': req.category,
      }),
      tier: AiTier.heavy,
    );

    await _cacheService.set(
      cacheKey,
      response,
      duration: AppConstants.productCacheDuration,
    );
    return _parseComparisonResult(response);
  }

  @override
  Future<RecommendationResult> recommend(RecommendRequest req) async {
    final cacheKey = 'rec_${req.category}_${req.country}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) return _parseRecommendationResult(cached);

    final lang = req.userProfile['language'] as String? ?? 'en';
    final langName = _languageName(lang);
    final response = await _jsonRequest(
      system:
          'You are Qor AI recommendation engine. '
          'Suggest the best products based on the user profile. '
          'Write the "reason" field in $langName. '
          'Return JSON: {"recommendations":[{"productId":"…","score":0-100,"reason":"…"}]}',
      user: jsonEncode({
        'userProfile': req.userProfile,
        'category': req.category,
        'country': req.country,
        'limit': req.limit,
      }),
      tier: AiTier.lite,
    );

    await _cacheService.set(
      cacheKey,
      response,
      duration: AppConstants.trendCacheDuration,
    );
    return _parseRecommendationResult(response);
  }

  @override
  Future<LinkAnalysisResult> analyzeLink(
    String url,
    UserEntity profile, {
    OgMetadata? metadata,
  }) async {
    debugPrint('[Gemini] analyzeLink called for: $url');

    // Extract product name from URL slug (free, no API cost)
    final slugTitle = extractProductNameFromUrl(url);
    final amazonProductId = extractAmazonProductId(url);
    final amazonProductIdType = extractAmazonProductIdType(url);
    final storeDomain = _extractStoreDomain(url);
    debugPrint('[Gemini] URL slug title: $slugTitle');

    // Build metadata context — prefer scraped metadata, fall back to slug extraction
    // Filter out domain-only titles (e.g. "trendyol.com", "amazon.com")
    final metaContext = <String, String?>{};
    String? scrapedTitle = metadata?.title;
    if (scrapedTitle != null && isDomainOnlyTitle(scrapedTitle)) {
      scrapedTitle = null;
    }
    final resolvedTitle = (scrapedTitle?.isNotEmpty ?? false)
        ? scrapedTitle
        : slugTitle;
    if (resolvedTitle?.isNotEmpty ?? false) {
      metaContext['title'] = resolvedTitle;
    }
    if (metadata?.description?.isNotEmpty ?? false) {
      metaContext['description'] = metadata!.description;
    }
    if (metadata?.price?.isNotEmpty ?? false) {
      metaContext['price'] = metadata!.price;
    }
    if (metadata?.siteName?.isNotEmpty ?? false) {
      metaContext['siteName'] = metadata!.siteName;
    }
    if (storeDomain != null) {
      metaContext['storeDomain'] = storeDomain;
    }

    // Add deterministic product ID type hint
    if (amazonProductId != null) {
      metaContext['productId'] = amazonProductId;
    }
    if (amazonProductIdType != null) {
      metaContext['productIdType'] = amazonProductIdType;
      if (amazonProductIdType == 'isbn10') {
        metaContext['categoryHint'] = 'books';
      }
    }

    // ── Step 1: Google Search research — identify product from URL ──
    // When metadata scraping fails (Amazon bot detection etc.), Gemini uses
    // its built-in Google Search to look up the actual product page.
    String webResearch = '';
    String? researchedTitle;
    bool researchConfirmed = false;
    final needsResearch =
        resolvedTitle == null ||
        resolvedTitle.startsWith('Amazon ASIN') ||
        resolvedTitle.startsWith('Amazon ISBN') ||
        (scrapedTitle == null && slugTitle == null);
    if (needsResearch || amazonProductId != null) {
      try {
        debugPrint('[Gemini] URL research phase — looking up: $url');
        webResearch = await _rawRequest(
          {
            'contents': [
              {
                'parts': [
                  {
                    'text': _buildLinkResearchPrompt(
                      url: url,
                      resolvedTitle: resolvedTitle,
                      productId: amazonProductId,
                      productIdType: amazonProductIdType,
                      storeDomain: storeDomain,
                      metadata: metadata,
                    ),
                  },
                ],
              },
            ],
            'tools': [
              {'googleSearch': {}},
            ],
            'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 512},
          },
          receiveTimeout: const Duration(seconds: 30),
          tier: AiTier.heavy,
        );
        debugPrint(
          '[Gemini] URL research result: ${webResearch.length > 200 ? webResearch.substring(0, 200) : webResearch}',
        );
        final evidence = parseLinkResearchEvidence(webResearch);
        researchConfirmed =
            evidence.identifierConfirmed &&
            (amazonProductId == null ||
                ((evidence.matchedUrl?.contains(amazonProductId) ?? false) ||
                    webResearch.toUpperCase().contains(
                      amazonProductId.toUpperCase(),
                    )));
        researchedTitle = evidence.productName;
        if (researchConfirmed) {
          metaContext['researchConfidence'] = 'verified_identifier_match';
          if (researchedTitle?.isNotEmpty ?? false) {
            metaContext['title'] = researchedTitle;
          }
          if ((metaContext['price']?.isEmpty ?? true) &&
              (evidence.price?.isNotEmpty ?? false)) {
            metaContext['price'] = evidence.price;
          }
        }
      } catch (e) {
        debugPrint('[Gemini] URL research failed (continuing without): $e');
      }
    }

    // ── Step 2: Structured JSON analysis ──
    final userInput = <String, dynamic>{
      'url': url,
      'userProfile': {
        'ecosystem': profile.ecosystem,
        'budgetRange': profile.budgetRange,
        'priorities': profile.priorities,
        'country': profile.country,
      },
    };
    if (metaContext.isNotEmpty) userInput['productContext'] = metaContext;
    if (webResearch.isNotEmpty) userInput['webResearch'] = webResearch;

    final response = await _jsonRequest(
      system: _linkAnalysisSystemPrompt(profile.language),
      user: jsonEncode(userInput),
      thinkingBudget: 512,
      timeout: const Duration(seconds: 60),
      tier: AiTier.heavy,
    );

    debugPrint('[Gemini] analyzeLink response keys: ${response.keys}');

    // Use slug title as fallback if AI returned an error/empty title
    final aiTitle = response['title'] as String?;
    final fallbackTitle = researchedTitle ?? resolvedTitle;
    final finalTitle =
        (aiTitle == null ||
            aiTitle.isEmpty ||
            aiTitle.toLowerCase().contains('erişim') ||
            aiTitle.toLowerCase().contains('hata') ||
            aiTitle.toLowerCase().contains('error') ||
            aiTitle.toLowerCase().contains('unknown') ||
            aiTitle.toLowerCase().contains('bilinmeyen'))
        ? (fallbackTitle ?? aiTitle)
        : aiTitle;

    // If title is still just an ASIN/ISBN code, prefer the AI title even if empty
    final effectiveTitle =
        (finalTitle != null &&
            (finalTitle.startsWith('Amazon ASIN') ||
                finalTitle.startsWith('Amazon ISBN')))
        ? (aiTitle?.isNotEmpty == true &&
                  !aiTitle!.startsWith('Amazon ASIN') &&
                  !aiTitle.startsWith('Amazon ISBN')
              ? aiTitle
              : finalTitle)
        : finalTitle;

    final resolvedProductTitle =
        researchConfirmed && (researchedTitle?.isNotEmpty ?? false)
        ? researchedTitle
        : effectiveTitle;

    // For known e-commerce domains, default is_product to true
    final isEcommerce = _isEcommerceDomain(url);
    final hasUnresolvedAmazonIdentity =
        amazonProductId != null &&
        _isAmazonPlaceholderTitle(resolvedProductTitle) &&
        !researchConfirmed;
    final isProduct = hasUnresolvedAmazonIdentity
        ? false
        : (response['is_product'] as bool? ?? isEcommerce);

    return LinkAnalysisResult(
      url: url,
      metadata: OgMetadata(
        title: resolvedProductTitle,
        image: response['image_url'] as String?,
        price: response['price'] as String? ?? metaContext['price'],
        siteName:
            response['site_name'] as String? ??
            metadata?.siteName ??
            storeDomain,
      ),
      aiScore: (response['score'] as num?)?.toDouble() ?? 0.0,
      aiAnalysis: response['analysis'] as String? ?? '',
      category: response['category'] as String?,
      analyzedAt: DateTime.now(),
      isProduct: isProduct,
    );
  }

  /// Returns true if the title is just a domain name (not real product info)
  static bool isDomainOnlyTitle(String title) {
    final t = title.trim().toLowerCase();
    if (t.length < 30 && RegExp(r'^[a-z0-9.-]+\.[a-z]{2,}$').hasMatch(t)) {
      return true;
    }
    // Common generic page titles
    const generics = [
      'trendyol',
      'amazon',
      'hepsiburada',
      'n11',
      'gittigidiyor',
      'ana sayfa',
      'home',
      'anasayfa',
      'hoş geldiniz',
      'welcome',
    ];
    return generics.any((g) => t == g);
  }

  /// Returns true if the URL belongs to a known e-commerce domain
  static bool _isEcommerceDomain(String url) {
    try {
      final host = Uri.parse(url).host.toLowerCase();
      const ecommerceDomains = [
        'amazon',
        'trendyol',
        'hepsiburada',
        'n11',
        'gittigidiyor',
        'mediamarkt',
        'teknosa',
        'vatan',
        'ciceksepeti',
        'dr.com',
        'kitapyurdu',
        'idefix',
        'bkmkitap',
        'epey.com',
        'akakce',
        'ebay',
        'aliexpress',
        'banggood',
        'bestbuy',
        'walmart',
        'newegg',
        'apple.com/shop',
        'samsung.com',
        'mi.com',
      ];
      return ecommerceDomains.any((d) => host.contains(d));
    } catch (_) {
      return false;
    }
  }

  static bool _isAmazonPlaceholderTitle(String? title) {
    return title != null &&
        (title.startsWith('Amazon ASIN') || title.startsWith('Amazon ISBN'));
  }

  /// Extract a human-readable product name from the URL path structure.
  /// Handles Trendyol, Amazon, Hepsiburada, N11, and generic slugs.
  /// No API cost — pure string parsing.
  static String? extractProductNameFromUrl(String url) {
    try {
      final uri = Uri.parse(url);
      final host = uri.host.toLowerCase();
      final path = uri.path;
      final segments = path.split('/').where((s) => s.isNotEmpty).toList();

      // Amazon: /ProductName/dp/ASIN  or  /dp/ASIN
      if (host.contains('amazon')) {
        final dpIndex = segments.indexOf('dp');
        if (dpIndex > 0) {
          return segments[dpIndex - 1].replaceAll('-', ' ').trim();
        }
        // Extract the 10-char product ID after /dp/
        final idMatch = RegExp(r'/dp/([A-Za-z0-9]{10})').firstMatch(path);
        if (idMatch != null) {
          final productId = idMatch.group(1)!;
          // ISBN-10: 9 digits + check digit (digit or X)
          if (RegExp(
            r'^\d{9}[\dX]$',
            caseSensitive: false,
          ).hasMatch(productId)) {
            return 'Amazon ISBN $productId';
          }
          // Alphanumeric (usually starts with B) = ASIN
          return 'Amazon ASIN $productId';
        }
      }

      // Trendyol: /{brand}/{product-slug}-p-{id}
      if (host.contains('trendyol')) {
        if (segments.length >= 2) {
          final brand = segments[0];
          final slug = segments[1].replaceAll(RegExp(r'-p-\d+.*$'), '');
          return '$brand $slug'.replaceAll('-', ' ').trim();
        }
      }

      // Hepsiburada: /urun/{slug}-pm-{hexid}
      if (host.contains('hepsiburada')) {
        for (final seg in segments) {
          final slug = seg.replaceAll(RegExp(r'-pm-[a-zA-Z0-9]+$'), '');
          if (slug != seg && slug.length > 5) {
            return slug.replaceAll('-', ' ').trim();
          }
        }
      }

      // N11: /.../{slug}.html
      if (host.contains('n11')) {
        for (final seg in segments.reversed) {
          if (seg.endsWith('.html')) {
            return seg.replaceAll('.html', '').replaceAll('-', ' ').trim();
          }
        }
      }

      // Generic: longest segment that looks like a product slug
      if (segments.isNotEmpty) {
        final best = segments.reduce((a, b) => a.length > b.length ? a : b);
        if (best.length > 8 && best.contains('-')) {
          return best.replaceAll(RegExp(r'[-_]'), ' ').trim();
        }
      }
    } catch (_) {}
    return null;
  }

  static String? extractAmazonProductId(String url) {
    try {
      final uri = Uri.parse(url);
      if (!uri.host.toLowerCase().contains('amazon')) return null;
      final path = uri.path;
      final patterns = [
        RegExp(r'/dp/([A-Za-z0-9]{10})(?:[/?]|$)', caseSensitive: false),
        RegExp(
          r'/gp/product/([A-Za-z0-9]{10})(?:[/?]|$)',
          caseSensitive: false,
        ),
      ];
      for (final pattern in patterns) {
        final match = pattern.firstMatch(path);
        if (match != null) return match.group(1)?.toUpperCase();
      }
    } catch (_) {}
    return null;
  }

  static String? extractAmazonProductIdType(String url) {
    final productId = extractAmazonProductId(url);
    if (productId == null) return null;
    if (RegExp(r'^\d{9}[\dX]$', caseSensitive: false).hasMatch(productId)) {
      return 'isbn10';
    }
    return 'asin';
  }

  @visibleForTesting
  static ({
    bool identifierConfirmed,
    String? matchedUrl,
    String? productName,
    String? brand,
    String? category,
    String? price,
  })
  parseLinkResearchEvidence(String text) {
    String? readField(String name) {
      final match = RegExp(
        '^$name\\s*:\\s*(.+)\$',
        caseSensitive: false,
        multiLine: true,
      ).firstMatch(text);
      final value = match?.group(1)?.trim();
      if (value == null || value.isEmpty || value.toLowerCase() == 'null') {
        return null;
      }
      return value;
    }

    final confirmation = readField('IDENTIFIER_CONFIRMED')?.toLowerCase();
    return (
      identifierConfirmed:
          confirmation == 'yes' ||
          confirmation == 'true' ||
          confirmation == 'confirmed',
      matchedUrl: readField('MATCHED_URL'),
      productName: readField('PRODUCT_NAME'),
      brand: readField('BRAND'),
      category: readField('CATEGORY'),
      price: readField('PRICE'),
    );
  }

  static String? _extractStoreDomain(String url) {
    try {
      return Uri.parse(url).host.toLowerCase();
    } catch (_) {
      return null;
    }
  }

  static String _buildLinkResearchPrompt({
    required String url,
    required String? resolvedTitle,
    required String? productId,
    required String? productIdType,
    required String? storeDomain,
    required OgMetadata? metadata,
  }) {
    final buffer = StringBuffer()
      ..writeln('Identify the EXACT product sold at this URL.')
      ..writeln('Target URL: $url');

    if (storeDomain != null) {
      buffer.writeln('Target store domain: $storeDomain');
    }
    if (productId != null && productIdType != null) {
      buffer
        ..writeln('Target product identifier type: $productIdType')
        ..writeln('Target product identifier: $productId')
        ..writeln(
          'CRITICAL: Only accept search evidence that explicitly matches this same identifier. Ignore similar, sponsored, or alternative products.',
        );
    }
    if (resolvedTitle?.isNotEmpty ?? false) {
      buffer.writeln('Current title hint: $resolvedTitle');
    }
    if (metadata?.description?.isNotEmpty ?? false) {
      buffer.writeln('Metadata description hint: ${metadata!.description}');
    }
    if (metadata?.price?.isNotEmpty ?? false) {
      buffer.writeln('Metadata price hint: ${metadata!.price}');
    }
    buffer
      ..writeln('Use Google Search now.')
      ..writeln('Return EXACTLY these lines and nothing else:')
      ..writeln('IDENTIFIER_CONFIRMED: yes|no')
      ..writeln('MATCHED_URL: exact best matching product URL or null')
      ..writeln('PRODUCT_NAME: exact product name or null')
      ..writeln('BRAND: brand or null')
      ..writeln('CATEGORY: category or null')
      ..writeln('PRICE: price with currency or null')
      ..writeln('DESCRIPTION: one short sentence or null');
    return buffer.toString();
  }

  @override
  Future<double> calculateScore(ScoreRequest req) async {
    final response = await _jsonRequest(
      system:
          'Calculate a product compatibility score (0-100) for the given '
          'user profile. Return JSON: {"score": <number>}',
      user: jsonEncode({
        'product': req.productData,
        'userProfile': req.userProfile,
        'country': req.country,
      }),
      tier: AiTier.lite,
    );
    return (response['score'] as num?)?.toDouble() ?? 0.0;
  }

  @override
  Future<String> askQuestion(String question, UserEntity profile) async {
    final currentYear = DateTime.now().year;
    final response = await _jsonRequest(
      system: _chatSystemPrompt(profile, currentYear),
      user: question,
      tier: AiTier.lite,
    );
    return jsonEncode(response);
  }

  /// Multi-turn conversational chat with proper Gemini API content array.
  /// [messages] is a list of {"role": "user"|"model", "text": "..."}
  Future<String> chatConversation(
    List<Map<String, String>> messages,
    UserEntity profile,
  ) async {
    final currentYear = DateTime.now().year;

    final contents = messages
        .map(
          (m) => {
            'role': m['role'] == 'user' ? 'user' : 'model',
            'parts': [
              {'text': m['text'] ?? ''},
            ],
          },
        )
        .toList();

    final body = {
      'contents': contents,
      'systemInstruction': {
        'parts': [
          {'text': _chatSystemPrompt(profile, currentYear)},
        ],
      },
      'tools': [
        {'googleSearch': {}},
      ],
      'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 1024},
    };

    final text = await _rawRequest(body, tier: AiTier.lite);
    return text;
  }

  /// Streaming multi-turn chat — yields text chunks as they arrive.
  Stream<String> chatConversationStream(
    List<Map<String, String>> messages,
    UserEntity profile,
  ) async* {
    final currentYear = DateTime.now().year;

    final contents = messages
        .map(
          (m) => {
            'role': m['role'] == 'user' ? 'user' : 'model',
            'parts': [
              {'text': m['text'] ?? ''},
            ],
          },
        )
        .toList();

    final body = {
      'contents': contents,
      'systemInstruction': {
        'parts': [
          {'text': _chatSystemPrompt(profile, currentYear)},
        ],
      },
      'tools': [
        {'googleSearch': {}},
      ],
      'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 1024},
    };

    try {
      // Streaming is not supported through the PB proxy (JS hooks can't
      // easily passthrough SSE). Fall back to single-shot.
      final text = await _rawRequest(
        body,
        receiveTimeout: const Duration(seconds: 60),
        tier: AiTier.lite,
      );
      if (text.isNotEmpty) yield text;
    } catch (e) {
      throw AIServiceException(message: 'Chat failed: $e');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  MULTIMODAL — image + text (used by AI Chat for vision queries)
  // ─────────────────────────────────────────────────────────────────────────

  /// Send a vision request with a base64-encoded image.
  Future<String> analyzeImage({
    required String base64Image,
    required String mimeType,
    String? prompt,
    UserEntity? profile,
  }) async {
    final lang = profile?.language ?? 'en';
    final langName = _languageName(lang);
    final langSuffix = lang != 'en' ? ' Respond in $langName.' : '';
    final textPrompt =
        prompt ??
        'Identify this product and provide detailed specifications, '
            'pros/cons, and suggest suitable alternatives.$langSuffix';

    final parts = <Map<String, dynamic>>[
      {'text': textPrompt},
      {
        'inline_data': {'mime_type': mimeType, 'data': base64Image},
      },
    ];

    final body = {
      'contents': [
        {'parts': parts},
      ],
      if (lang != 'en')
        'systemInstruction': {
          'parts': [
            {'text': 'IMPORTANT: Respond entirely in $langName.'},
          ],
        },
      'generationConfig': {'temperature': 0.4, 'maxOutputTokens': 2048},
    };

    final text = await _rawRequest(body, tier: AiTier.heavy);
    return text;
  }

  /// Simple text-in / text-out query with optional language preference.
  Future<String> freeTextQuery(
    String prompt, {
    String? language,
    AiTier tier = AiTier.lite,
  }) async {
    final langCode = language ?? 'en';
    final langName = _languageName(langCode);
    final body = {
      'contents': [
        {
          'parts': [
            {'text': prompt},
          ],
        },
      ],
      if (langCode != 'en')
        'systemInstruction': {
          'parts': [
            {
              'text':
                  'IMPORTANT: You MUST respond entirely in $langName. All text, analysis, recommendations, and explanations must be in $langName.',
            },
          ],
        },
      'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 2048},
    };
    return _rawRequest(body, tier: tier);
  }

  /// JSON-enforced free text query — returns a clean JSON string (no markdown wrapping).
  /// Use this when the prompt requests a JSON response structure.
  Future<String> jsonFreeTextQuery(
    String prompt, {
    String? language,
    int maxTokens = 2048,
    AiTier tier = AiTier.lite,
  }) async {
    final langCode = language ?? 'en';
    final langName = _languageName(langCode);
    final systemText = langCode != 'en'
        ? 'IMPORTANT: You MUST respond entirely in $langName. Return only valid JSON.'
        : 'Return only valid JSON with no markdown, no extra text.';
    final body = {
      'contents': [
        {
          'parts': [
            {'text': prompt},
          ],
        },
      ],
      'systemInstruction': {
        'parts': [
          {'text': systemText},
        ],
      },
      'generationConfig': {
        'temperature': 0.3,
        'maxOutputTokens': maxTokens,
        'responseMimeType': 'application/json',
      },
    };
    return _rawRequest(body, tier: tier);
  }

  /// Query Gemini with Google Search grounding for real-time factual data.
  Future<String> groundedQuery(String prompt, {int maxTokens = 2048}) async {
    final body = {
      'contents': [
        {
          'parts': [
            {'text': prompt},
          ],
        },
      ],
      'tools': [
        {'googleSearch': {}},
      ],
      'generationConfig': {'temperature': 0.1, 'maxOutputTokens': maxTokens},
    };
    // Grounded queries with web search need more time — use 90s timeout
    return _rawRequest(
      body,
      receiveTimeout: const Duration(seconds: 90),
      tier: AiTier.heavy,
    );
  }

  // ── Subscription Intelligence ────────────────────────────────────────────────

  /// Generate a personalized quiz for subscription analysis.
  Future<ProductQuiz> generateSubscriptionQuiz({
    required List<String> subscriptionNames,
    String language = 'en',
  }) async {
    final langName = _languageName(language);
    final normalizedNames = subscriptionNames
        .map((name) => prettySubscriptionName(name))
        .toList();
    final names = normalizedNames.join(', ');
    final isCompare = normalizedNames.length > 1;

    // Build service-specific context for better question generation
    // For unknown services, instruct AI to use its knowledge
    final knownDetails = <String>[];
    final unknownNames = <String>[];
    for (final name in normalizedNames) {
      final key = resolveSubscriptionCatalogKey(name);
      final context = key != null ? _subscriptionCatalog[key]?.context : null;
      if (context != null) {
        knownDetails.add('- $name: $context');
      } else {
        unknownNames.add(name);
      }
    }

    final serviceDetails = knownDetails.join('\n');
    final unknownSection = unknownNames.isNotEmpty
        ? '\n\nUNKNOWN SERVICES (use your knowledge to identify them):\n'
              '${unknownNames.map((n) => '- $n').join('\n')}\n'
              'For each unknown service: determine what type of service it is '
              'and generate scenario questions appropriate for that type.'
        : '';

    // Unique seed per analysis session — prevents Gemini from repeating the
    // same question patterns it generated in a previous invocation.
    final sessionSeed = DateTime.now().millisecondsSinceEpoch % 9999;

    final response = await _jsonRequest(
      system:
          '''
You are Qor AI's Subscription Intelligence quiz engine.
SESSION SEED: $sessionSeed  ← use this to vary phrasing and angles every time.

TASK: Generate a DEEPLY PERSONALIZED, SCENARIO-DRIVEN quiz (5 questions) for: $names
MODE: ${isCompare ? 'COMPARISON (user is deciding between these services)' : 'SINGLE ANALYSIS (user wants deep compatibility score)'}
LANGUAGE: ALL text in $langName.

${serviceDetails.isNotEmpty ? 'SERVICE CONTEXT (use for question precision):\n$serviceDetails' : ''}
$unknownSection

═══ WHAT MAKES A GREAT QUESTION ═══
Each question must be a REAL SCENARIO from the user's daily life — not a generic preference poll.
Think: "What would a journalist writing a profile of this user ACTUALLY want to know about how they use $names?"

Bad (generic, boring, repetitive):
  ❌ "How often do you watch TV?"
  ❌ "What type of content do you prefer?"
  ❌ "Do you use it on mobile?"

Good (scenario-based, specific, revealing):
  ✅ "It's Friday night and you have 2 hours free. What are you most likely opening on ${normalizedNames.first}? 🎬"
  ✅ "Your friend asks which show/song/game to try first on ${isCompare ? names : normalizedNames.first}. What do you recommend? 🎯"
  ✅ "You're traveling abroad for 3 weeks with no home WiFi. How important is offline mode on this service? ✈️"

═══ PER-CATEGORY SCENARIO IDEAS ═══
For VIDEO STREAMING (Netflix, Disney+, Amazon Prime, HBO Max, Apple TV+ etc.):
  - Friday night scenario: what do they actually open first?
  - Binge vs casual watching habits
  - Solo vs shared family account scenarios
  - Original content vs licensed library importance
  - Specific genre scenarios (late-night thrillers, weekend family movies, etc.)

For MUSIC (Spotify, Apple Music, YouTube Music, Tidal etc.):
  - Workout / commute / work focus scenarios
  - Artist discovery vs comfort playlist habits
  - Party hosting / social sharing scenarios
  - Audiophile quality vs convenience trade-offs
  - Podcast integration scenarios

For AI TOOLS (ChatGPT, Claude, Gemini, Copilot etc.):
  - Specific task scenarios: "You need to write a difficult email at 11pm — do you use AI?" 
  - Code debugging vs creative writing vs research
  - How they handle AI mistakes / trust levels
  - Integration in daily work flow scenarios

For GAMING (Xbox Game Pass, PS Plus, EA Play, Nintendo Online etc.):
  - Play session length (30 min casual vs 4-hour sessions)
  - Genre commitment (one game for months vs variety)
  - Multiplayer with friends scenarios
  - New release vs backlog habits

For CLOUD STORAGE (iCloud, Google One, Dropbox, OneDrive etc.):
  - "Your phone dies and you lost all photos" scenario
  - Collaboration / file sharing scenarios
  - Multi-device ecosystem scenarios
  - Storage anxiety vs organized management

For PRODUCTIVITY (Microsoft 365, Google Workspace, Notion etc.):
  - Real work scenario: how they actually use it in a typical day
  - Collaboration vs personal use ratio
  - Mobile vs desktop usage split

═══ ANTI-REPETITION RULES ═══
- NEVER generate two questions with the same underlying theme
- NEVER start two questions with the same word
- NEVER use options like "Rarely / Sometimes / Often / Always" — these are boring and useless
- Each of the 4 options must represent a genuinely DIFFERENT user archetype or behavior pattern
- Options must be concrete and specific, not vague gradients
- At least 2 questions should directly reference ${isCompare ? 'the specific services being compared by name' : 'the service by name'}
- One question should be a fun hypothetical scenario ("If you could only keep one subscription this year..." etc.)

═══ FORMAT ═══
Return ONLY valid JSON. No markdown, no explanation:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    {"question": "...", "options": ["...", "...", "...", "..."]},
    {"question": "...", "options": ["...", "...", "...", "..."]},
    {"question": "...", "options": ["...", "...", "...", "..."]},
    {"question": "...", "options": ["...", "...", "...", "..."]}
  ]
}
''',
      user: jsonEncode({
        'subscriptions': normalizedNames,
        'mode': isCompare ? 'compare' : 'single',
        'seed': sessionSeed,
      }),
      tier: AiTier.heavy,
    );

    final questions = (response['questions'] as List<dynamic>? ?? [])
        .asMap()
        .entries
        .map(
          (e) => QuizQuestion(
            id: 'sq${e.key}',
            text: e.value['question'] as String? ?? '',
            options: List<String>.from(e.value['options'] ?? []),
          ),
        )
        .where((q) => q.text.isNotEmpty && q.options.length >= 2)
        .toList();

    return ProductQuiz(
      id: 'sub_${DateTime.now().millisecondsSinceEpoch}',
      category: 'subscription',
      productTitle: names,
      questions: questions,
      createdAt: DateTime.now(),
    );
  }

  Future<SubscriptionResolutionResult> resolveSubscriptionSelection({
    required List<String> rawNames,
    required String language,
  }) async {
    final cleanedNames = rawNames
        .map((name) => name.trim())
        .where((name) => name.isNotEmpty)
        .toList();
    if (cleanedNames.isEmpty) {
      return const SubscriptionResolutionResult();
    }

    final resolved = <ResolvedSubscriptionCandidate>[];
    final unknownNames = <String>[];

    for (final name in cleanedNames) {
      final displayName = normalizeSubscriptionDisplayName(name);
      final categoryKey = subscriptionCategoryKey(name);
      if (displayName != null && categoryKey != null) {
        resolved.add(
          ResolvedSubscriptionCandidate(
            rawName: name,
            displayName: displayName,
            categoryKey: categoryKey,
            isSubscription: true,
          ),
        );
      } else {
        unknownNames.add(name);
      }
    }

    if (unknownNames.isNotEmpty) {
      final langName = _languageName(language);
      final responseText = await _rawRequest(
        {
          'contents': [
            {
              'parts': [
                {
                  'text':
                      '''
You are Qor AI's subscription validation engine.
Classify whether each input below is a real subscription service.

Rules:
- Accept only real subscription-based services, memberships, or paid digital platforms.
- Reject links, profanity, random words, products, and unrelated text.
- If an input is a typo but clearly maps to a known subscription, normalize it.
- Use one category only: video-streaming, music-streaming, gaming, ai-tools, cloud-storage, productivity, bundles, news, fitness, education, other.
- "display_name" must be the clean branded service name.
- "reason" must be short and in $langName.

Return ONLY valid JSON:
{
  "results": [
    {
      "raw_name": "string",
      "display_name": "string or null",
      "category": "string or null",
      "is_subscription": true,
      "reason": "string"
    }
  ]
}
''',
                },
                {
                  'text': jsonEncode({'inputs': unknownNames}),
                },
              ],
            },
          ],
          'tools': [
            {'googleSearch': {}},
          ],
          // NOTE: responseMimeType is intentionally omitted here — Gemini does
          // not allow JSON-mode alongside googleSearch grounding tools.
          // _decodeJsonObject() extracts JSON from the free-text response.
          'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 1024},
        },
        receiveTimeout: const Duration(seconds: 60),
        tier: AiTier.heavy,
      );

      final parsed = _decodeJsonObject(responseText);
      final results = (parsed?['results'] as List?) ?? const [];
      for (final item in results) {
        if (item is! Map) continue;
        final rawName = item['raw_name']?.toString().trim() ?? '';
        if (rawName.isEmpty) continue;
        final displayName =
            normalizeSubscriptionDisplayName(
              item['display_name']?.toString() ?? rawName,
            ) ??
            prettySubscriptionName(item['display_name']?.toString() ?? rawName);
        resolved.add(
          ResolvedSubscriptionCandidate(
            rawName: rawName,
            displayName: displayName,
            categoryKey: item['category']?.toString().trim(),
            isSubscription: item['is_subscription'] == true,
            reason: item['reason']?.toString().trim(),
          ),
        );
      }
    }

    final byRawName = <String, ResolvedSubscriptionCandidate>{
      for (final item in resolved) item.rawName.toLowerCase(): item,
    };
    final ordered = <ResolvedSubscriptionCandidate>[];
    final invalidNames = <String>[];
    final normalizedNames = <String>[];
    final seen = <String>{};
    String? sharedCategoryKey;
    var mixedCategories = false;

    for (final rawName in cleanedNames) {
      final candidate = byRawName[rawName.toLowerCase()];
      if (candidate == null ||
          !candidate.isSubscription ||
          candidate.displayName.trim().isEmpty ||
          (candidate.categoryKey?.trim().isEmpty ?? true)) {
        invalidNames.add(rawName);
        continue;
      }

      ordered.add(candidate);
      sharedCategoryKey ??= candidate.categoryKey;
      if (sharedCategoryKey != candidate.categoryKey) {
        mixedCategories = true;
      }
      if (seen.add(candidate.displayName.toLowerCase())) {
        normalizedNames.add(candidate.displayName);
      }
    }

    return SubscriptionResolutionResult(
      resolved: ordered,
      invalidNames: invalidNames,
      normalizedNames: normalizedNames,
      sharedCategoryKey: sharedCategoryKey,
      mixedCategories: mixedCategories,
    );
  }

  /// Enhanced subscription analysis combining grounded web data, quiz answers,
  /// and user profile into a structured compatibility report.
  Future<Map<String, dynamic>> enhancedSubscriptionAnalysis({
    required List<String> subscriptionNames,
    required List<QuizQuestion> answeredQuestions,
    required UserEntity profile,
  }) async {
    final langName = _languageName(profile.language);
    final normalizedNames = subscriptionNames
        .map((name) => prettySubscriptionName(name))
        .toList();
    final names = normalizedNames.join(', ');
    final isCompare = normalizedNames.length > 1;
    final qaPairs = answeredQuestions
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();

    // Step 1: Research phase — use googleSearch to gather real-time data
    // Scale research token budget: 2048 base + 1024 per service beyond the first
    final researchTokens = (2048 + (normalizedNames.length - 1) * 1024).clamp(
      2048,
      6144,
    );
    final researchPrompt =
        '''
Research EACH of the following subscription services individually: ${normalizedNames.map((n) => '"$n"').join(', ')}

For EVERY service listed above, find:
1. What category it belongs to (video-streaming, music-streaming, gaming, ai-tools, cloud-storage, productivity, etc.)
2. Recent Reddit discussions and user opinions about it
3. Trustpilot / forum review summary
4. Key features, strengths, and limitations
5. Recent news, updates, or catalog changes

IMPORTANT: You MUST cover ALL ${normalizedNames.length} services. Do not skip any.
Do NOT include pricing, monthly fees, yearly fees, discounts, or any cost details.
Output a clear per-service research summary, labeled with each service name.
''';

    String researchData = '';
    try {
      researchData = await _rawRequest(
        {
          'contents': [
            {
              'parts': [
                {'text': researchPrompt},
              ],
            },
          ],
          'tools': [
            {'googleSearch': {}},
          ],
          'generationConfig': {
            'temperature': 0.2,
            'maxOutputTokens': researchTokens,
          },
        },
        receiveTimeout: const Duration(seconds: 90),
        tier: AiTier.heavy,
      );
    } catch (e) {
      debugPrint(
        '=== QOR AI: Research phase failed, continuing without: $e ===',
      );
    }

    // Step 2: Analysis phase — structured JSON output (NO googleSearch, forces JSON)
    final jsonSchema = isCompare
        ? '''{
  "subscriptions": {
    "<service_name>": {
      "category": "string - shared subscription category label",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score",
      "pros": ["string", "string", "string", "string", "string"],
      "cons": ["string", "string", "string"],
      "community_sentiment": "string - 2-3 sentence Reddit/forum summary",
      "best_for": "string - ideal user type",
      "factors": {
        "usage_fit": "integer 0-100",
        "value_match": "integer 0-100",
        "content_match": "integer 0-100",
        "ecosystem_fit": "integer 0-100",
        "lifestyle_match": "integer 0-100"
      }
    }
  },
  "winner": {
    "best_content": "string - service name",
    "overall": "string - service name",
    "recommendation": "string - 3-4 sentence personalized recommendation explaining WHY"
  },
  "detailed_comparison": {
    "service_fit_summary": "string - 2-3 sentences comparing overall fit",
    "feature_comparison": "string - 2-3 sentences about feature differences",
    "user_experience": "string - 2-3 sentences about UX differences"
  }
}'''
        : '''{
  "subscriptions": {
    "$names": {
      "category": "string - service category label",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score",
      "pros": ["string", "string", "string", "string", "string"],
      "cons": ["string", "string", "string"],
      "community_sentiment": "string - 2-3 sentence Reddit/forum summary",
      "best_for": "string - ideal user type",
      "factors": {
        "usage_fit": "integer 0-100",
        "value_match": "integer 0-100",
        "content_match": "integer 0-100",
        "ecosystem_fit": "integer 0-100",
        "lifestyle_match": "integer 0-100"
      }
    }
  },
  "recommendation": "string - 3-4 sentence personalized recommendation"
}''';

    // Identify unknown services for the analysis prompt
    final unknownForAnalysis = normalizedNames.where((name) {
      final key = resolveSubscriptionCatalogKey(name);
      return key == null || _subscriptionCatalog[key] == null;
    }).toList();

    String buildAnalysisPrompt({required bool includeResearchData}) =>
        '''
You are Qor AI's subscription intelligence analyst.
Analyze: $names

User Profile:
- Country: ${profile.country}, Language: ${profile.language}
- Age: ${profile.ageRange ?? 'unknown'}, Profession: ${profile.profession ?? 'unknown'}
- Budget: ${profile.budgetRange}, Priorities: ${profile.priorities.join(', ')}
- Ecosystem: ${profile.ecosystem}
- Current subscriptions: ${profile.subscriptions.isEmpty ? 'none' : profile.subscriptions.join(', ')}

Quiz Answers:
${qaPairs.map((q) => '- ${q['question']}: ${q['answer']}').join('\n')}

${includeResearchData && researchData.isNotEmpty ? 'Research Data:\n$researchData\n' : ''}
${unknownForAnalysis.isNotEmpty ? 'NOTE: The following service(s) may not be well-known: ${unknownForAnalysis.join(', ')}. '
                  'Use the research data above and your knowledge to identify what they are. '
                  'If you cannot identify a service, still analyze it based on available context '
                  'and clearly state in the compatibility_explanation that limited data was available.\n' : ''}

CRITICAL RULES:
- ALL text values MUST be in $langName language
- The "subscriptions" object MUST contain exactly ${normalizedNames.length} entries, one for EACH of: ${normalizedNames.map((n) => '"$n"').join(', ')}
- You MUST complete ALL ${normalizedNames.length} service entries. Do not stop early or truncate.
- compatibility_score must be an integer 0-100 based on how well it fits THIS specific user
- pros must have exactly 5 items, cons exactly 3 items — keep each item concise (max 12 words)
- factors are 0-100 integers
- Be specific and personalized, not generic
- NEVER mention price, cost, affordability, monthly fees, yearly fees, discounts, or billing
- community_sentiment should be max 2 sentences, compatibility_explanation max 2 sentences

Return ONLY valid JSON matching this exact schema:
$jsonSchema
''';

    Future<String> runStructuredAnalysis({
      required bool includeResearchData,
      required int maxTokens,
    }) {
      return _rawRequest(
        {
          'contents': [
            {
              'parts': [
                {
                  'text': buildAnalysisPrompt(
                    includeResearchData: includeResearchData,
                  ),
                },
              ],
            },
          ],
          'generationConfig': {
            'responseMimeType': 'application/json',
            'temperature': 0.3,
            'maxOutputTokens': maxTokens,
          },
        },
        receiveTimeout: const Duration(seconds: 120),
        tier: AiTier.heavy,
      );
    }

    // Scale analysis tokens: 4096 base + 1024 per service beyond the first, max 8192
    final analysisTokens = (4096 + (normalizedNames.length - 1) * 1024).clamp(
      4096,
      8192,
    );

    String text;
    try {
      text = await runStructuredAnalysis(
        includeResearchData: true,
        maxTokens: analysisTokens,
      );
    } on AIServiceException catch (e) {
      final shouldRetryCompact =
          researchData.isNotEmpty &&
          (e.isRateLimited ||
              e.message.toLowerCase().contains('busy') ||
              e.message.toLowerCase().contains('unavailable'));
      if (!shouldRetryCompact) rethrow;
      debugPrint(
        '=== QOR AI: Retrying subscription analysis with compact prompt ===',
      );
      text = await runStructuredAnalysis(
        includeResearchData: false,
        maxTokens: (analysisTokens * 0.75).round(),
      );
    }

    // Parse JSON response — responseMimeType should guarantee valid JSON
    Map<String, dynamic>? parsed;
    try {
      var clean = text.trim();
      // Strip markdown code fences if present
      if (clean.startsWith('```')) {
        clean = clean
            .replaceFirst(RegExp(r'^```\w*\n?'), '')
            .replaceFirst(RegExp(r'\n?```$'), '');
      }
      // Try parsing entire response as JSON
      parsed = _normalizeSubscriptionAnalysisPayload(
        jsonDecode(clean) as Map<String, dynamic>?,
      );
      debugPrint('=== QOR AI: Sub analysis JSON parsed successfully ===');
    } catch (e) {
      debugPrint('=== QOR AI: Sub analysis JSON parse failed: $e ===');
      // Try to extract JSON from mixed text response
      try {
        final jsonMatch = RegExp(r'\{[\s\S]*\}').firstMatch(text);
        if (jsonMatch != null) {
          parsed = _normalizeSubscriptionAnalysisPayload(
            jsonDecode(jsonMatch.group(0)!) as Map<String, dynamic>?,
          );
          debugPrint('=== QOR AI: Sub analysis JSON extracted from text ===');
        }
      } catch (_) {
        debugPrint('=== QOR AI: JSON extraction also failed ===');
      }
    }

    // Extract scores from structured JSON or fallback to regex
    final scores = <String, double>{};
    if (parsed != null && parsed.containsKey('subscriptions')) {
      final subs = parsed['subscriptions'] as Map<String, dynamic>;
      for (final entry in subs.entries) {
        final data = entry.value as Map<String, dynamic>? ?? {};
        final score = (data['compatibility_score'] as num?)?.toDouble();
        if (score != null) scores[entry.key] = score.clamp(0, 100);
      }
    }

    // Regex fallback if JSON parse failed
    if (scores.isEmpty) {
      for (final name in normalizedNames) {
        final pattern = RegExp(
          RegExp.escape(name) + r'[^\n]*?(\d{1,3})\s*%',
          caseSensitive: false,
        );
        final m = pattern.firstMatch(text);
        if (m != null) {
          final v = double.tryParse(m.group(1) ?? '');
          if (v != null && v >= 0 && v <= 100) scores[name] = v;
        }
      }
    }

    // Generate readable analysis text from structured data (NEVER show raw JSON)
    String analysisText = '';
    if (parsed != null && parsed.containsKey('subscriptions')) {
      final buf = StringBuffer();
      final subs = parsed['subscriptions'] as Map<String, dynamic>? ?? {};
      for (final entry in subs.entries) {
        final d = entry.value as Map<String, dynamic>? ?? {};
        buf.writeln('${entry.key} (${d['compatibility_score'] ?? '?'}%)');
        buf.writeln(d['compatibility_explanation'] ?? '');
        final pros = (d['pros'] as List?)?.cast<String>() ?? [];
        if (pros.isNotEmpty) {
          buf.writeln('\n✅ ${pros.join('\n✅ ')}');
        }
        final cons = (d['cons'] as List?)?.cast<String>() ?? [];
        if (cons.isNotEmpty) {
          buf.writeln('\n❌ ${cons.join('\n❌ ')}');
        }
        buf.writeln();
      }
      final winner = parsed['winner'] as Map<String, dynamic>?;
      if (winner != null && winner['recommendation'] != null) {
        buf.writeln(winner['recommendation']);
      }
      final rec = parsed['recommendation'] as String?;
      if (rec != null) buf.writeln(rec);
      analysisText = buf.toString().trim();
    }
    // If parsing failed or produced empty text, never show raw JSON
    if (analysisText.isEmpty) {
      analysisText = parsed != null
          ? 'Analysis complete. See the detailed results above.'
          : 'Analysis could not be fully parsed. Please try again.';
    }

    return {'analysis': analysisText, 'scores': scores, 'structured': parsed};
  }

  /// Generate a short personalized quiz for a product category.
  /// Returns 4-6 questions tailored to the product type.
  /// When [allProducts] is provided (compare mode), generates comparison-aware questions.
  Future<ProductQuiz> generateQuiz({
    required String category,
    required String productTitle,
    required String url,
    String language = 'en',
    List<Map<String, String>>? allProducts,
  }) async {
    debugPrint('[Gemini] generateQuiz for: $productTitle ($category)');
    final isCompare = allProducts != null && allProducts.length >= 2;
    final response = await _jsonRequest(
      system: isCompare
          ? _compareQuizGenerationPrompt(language)
          : _quizGenerationPrompt(language),
      user: jsonEncode(
        isCompare
            ? {
                'category': category,
                'products': allProducts,
                'productCount': allProducts.length,
              }
            : {'category': category, 'productTitle': productTitle, 'url': url},
      ),
      thinkingBudget: 512,
      timeout: const Duration(seconds: 45),
      tier: AiTier.heavy,
    );

    final questions = (response['questions'] as List<dynamic>? ?? [])
        .asMap()
        .entries
        .map(
          (e) => QuizQuestion(
            id: 'q${e.key}',
            text: e.value['question'] as String? ?? '',
            options: List<String>.from(e.value['options'] ?? []),
          ),
        )
        .where((q) => q.text.isNotEmpty && q.options.length >= 2)
        .toList();

    debugPrint('[Gemini] generateQuiz got ${questions.length} questions');
    return ProductQuiz(
      id: '${category}_${DateTime.now().millisecondsSinceEpoch}',
      category: category,
      productTitle: productTitle,
      questions: questions,
      createdAt: DateTime.now(),
    );
  }

  /// Produce an enhanced compatibility analysis combining the base analysis,
  /// quiz answers, full user profile, and real-time web research.
  Future<EnhancedAnalysisResult> enhancedAnalysis({
    required LinkAnalysisResult baseResult,
    required List<QuizQuestion> answeredQuestions,
    required UserEntity profile,
  }) async {
    debugPrint('[Gemini] enhancedAnalysis for: ${baseResult.metadata.title}');
    final qaPairs = answeredQuestions
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();

    // Step 1: Google Search research — gather community reviews & real-time data
    String researchData = '';
    try {
      final productName = baseResult.metadata.title ?? 'unknown';
      researchData = await _rawRequest(
        {
          'contents': [
            {
              'parts': [
                {
                  'text':
                      'Research "$productName" (${baseResult.category ?? "product"}).\n'
                      'Find: user reviews, Reddit/forum opinions, expert reviews, '
                      'common pros/cons, known issues, and current price in ${profile.country}.\n'
                      'Be concise — max 300 words.',
                },
              ],
            },
          ],
          'tools': [
            {'googleSearch': {}},
          ],
          'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 1024},
        },
        receiveTimeout: const Duration(seconds: 30),
        tier: AiTier.heavy,
      );
      debugPrint(
        '[Gemini] enhancedAnalysis research: ${researchData.length} chars',
      );
    } catch (e) {
      debugPrint('[Gemini] enhancedAnalysis research failed (continuing): $e');
    }

    // Step 2: Structured JSON analysis
    final response = await _jsonRequest(
      system: _enhancedAnalysisPrompt(profile.language),
      user: jsonEncode({
        'product': {
          'url': baseResult.url,
          'title': baseResult.metadata.title,
          'description': baseResult.metadata.description,
          'category': baseResult.category,
          'initialScore': baseResult.aiScore,
          'initialAnalysis': baseResult.aiAnalysis,
        },
        'quizAnswers': qaPairs,
        'userProfile': {
          'ecosystem': profile.ecosystem,
          'budgetRange': profile.budgetRange,
          'priorities': profile.priorities,
          'country': profile.country,
          'ageRange': profile.effectiveAgeRange,
          'interestCategories': profile.interestCategories,
          'currentDevices': profile.currentDevices,
        },
        if (researchData.isNotEmpty) 'webResearch': researchData,
      }),
      thinkingBudget: 512,
      timeout: const Duration(seconds: 90),
      tier: AiTier.heavy,
    );

    // Parse factors — handle both num and string scores from Gemini
    double parseScore(dynamic v) {
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v) ?? 0.0;
      return 0.0;
    }

    final rawFactors = response['factors'];
    debugPrint(
      '[Gemini] raw factors type: ${rawFactors.runtimeType}, value: $rawFactors',
    );
    final factors = (rawFactors is List ? rawFactors : <dynamic>[])
        .map((f) {
          if (f is! Map) return null;
          final label = (f['label'] ?? f['name'] ?? '') as String;
          final score = parseScore(f['score'] ?? f['value']);
          final emoji = (f['emoji'] ?? f['icon'] ?? '📊') as String;
          debugPrint('[Gemini]   factor: $label = $score ($emoji)');
          return CompatibilityFactor(label: label, score: score, emoji: emoji);
        })
        .whereType<CompatibilityFactor>()
        .where((f) => f.label.isNotEmpty)
        .toList();

    final enhancedScore = parseScore(
      response['enhancedScore'] ??
          response['enhanced_score'] ??
          response['score'],
    );
    debugPrint(
      '[Gemini] enhancedAnalysis for "${baseResult.metadata.title}": score=$enhancedScore, factors=${factors.length}, '
      'factorScores=[${factors.map((f) => '${f.label}:${f.score}').join(', ')}]',
    );

    return EnhancedAnalysisResult(
      baseResult: baseResult,
      enhancedScore: enhancedScore > 0 ? enhancedScore : baseResult.aiScore,
      factors: factors,
      detailedVerdict:
          (response['verdict'] ??
                  response['detailed_verdict'] ??
                  response['analysis'] ??
                  baseResult.aiAnalysis)
              as String,
      prosForUser: List<String>.from(
        response['prosForUser'] ??
            response['pros_for_user'] ??
            response['pros'] ??
            [],
      ),
      consForUser: List<String>.from(
        response['consForUser'] ??
            response['cons_for_user'] ??
            response['cons'] ??
            [],
      ),
      alternatives: List<String>.from(response['alternatives'] ?? []),
      communityScore:
          response['communityScore'] != null ||
              response['community_score'] != null
          ? parseScore(
              response['communityScore'] ?? response['community_score'],
            )
          : null,
      communityAnalysis:
          (response['communityAnalysis'] ?? response['community_analysis'])
              as String?,
      personaScore:
          response['personaScore'] != null || response['persona_score'] != null
          ? parseScore(response['personaScore'] ?? response['persona_score'])
          : null,
      personaAnalysis:
          (response['personaAnalysis'] ?? response['persona_analysis'])
              as String?,
      overallVerdict:
          (response['overallVerdict'] ?? response['overall_verdict'])
              as String?,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  INTERNAL — HTTP helpers
  // ─────────────────────────────────────────────────────────────────────────

  /// Make a request that expects a JSON object back.
  Future<Map<String, dynamic>> _jsonRequest({
    required String system,
    required String user,
    int? thinkingBudget,
    Duration? timeout,
    AiTier tier = AiTier.lite,
  }) async {
    final body = <String, dynamic>{
      'contents': [
        {
          'parts': [
            {'text': user},
          ],
        },
      ],
      'systemInstruction': {
        'parts': [
          {'text': system},
        ],
      },
      'generationConfig': {
        'temperature': 0.7,
        'maxOutputTokens': 8192,
        'responseMimeType': 'application/json',
      },
    };

    // Always set thinking budget to control costs.
    // Thinking tokens are billed at output price ($2.50/1M for flash).
    final effectiveThinking =
        thinkingBudget ?? (tier == AiTier.heavy ? 512 : 0);
    body['generationConfig'] = {
      ...(body['generationConfig'] as Map<String, dynamic>),
      'thinkingConfig': {'thinkingBudget': effectiveThinking},
    };

    final text = await _rawRequest(
      body,
      receiveTimeout: timeout ?? const Duration(seconds: 60),
      tier: tier,
    );

    try {
      return jsonDecode(text) as Map<String, dynamic>;
    } catch (e) {
      debugPrint(
        '[Gemini] JSON parse error: $e — raw text: ${text.length > 500 ? text.substring(0, 500) : text}',
      );
      // Try to extract JSON from the response
      final match = RegExp(r'\{.*\}', dotAll: true).firstMatch(text);
      if (match != null) {
        try {
          return jsonDecode(match.group(0)!) as Map<String, dynamic>;
        } catch (_) {}
      }
      return {'message': text, 'options': <String>[]};
    }
  }

  /// Low-level POST against the PocketBase Gemini proxy with retry.
  Future<String> _rawRequest(
    Map<String, dynamic> body, {
    Duration receiveTimeout = const Duration(seconds: 60),
    AiTier tier = AiTier.lite,
  }) async {
    // Inject thinking budget if not already set to control costs.
    // Thinking tokens are billed at output price ($2.50/1M for flash).
    final genConfig = body['generationConfig'] as Map<String, dynamic>? ?? {};
    if (!genConfig.containsKey('thinkingConfig')) {
      final budget = tier == AiTier.heavy ? 1024 : 0;
      body = {
        ...body,
        'generationConfig': {
          ...genConfig,
          'thinkingConfig': {'thinkingBudget': budget},
        },
      };
    }

    int retryCount = 0;

    while (retryCount < AppConstants.deepSeekMaxRetries) {
      final models = _candidateModels(tier);

      for (var i = 0; i < models.length; i++) {
        final model = models[i];
        final isLastModel = i == models.length - 1;
        final proxyBody = {'model': model, ...body};

        try {
          final response = await _dio.post(
            _proxyUrl,
            data: proxyBody,
            options: Options(
              receiveTimeout: receiveTimeout,
              sendTimeout: const Duration(seconds: 15),
              headers: {'Content-Type': 'application/json'},
            ),
          );

          // Check for prompt feedback / safety blocks first
          final promptFeedback =
              response.data['promptFeedback'] as Map<String, dynamic>?;
          if (promptFeedback != null) {
            final blockReason = promptFeedback['blockReason'] as String?;
            if (blockReason != null) {
              debugPrint('[Gemini] Request blocked: $blockReason');
              throw AIServiceException(
                message: 'Content was blocked by safety filter ($blockReason).',
              );
            }
          }

          final candidates = response.data['candidates'] as List?;
          if (candidates == null || candidates.isEmpty) {
            debugPrint(
              '[Gemini] Empty candidates from $model. Full response: ${response.data}',
            );
            throw const AIServiceException(
              message: 'AI returned an empty response.',
            );
          }

          final finishReason = candidates[0]['finishReason'] as String?;
          debugPrint('[Gemini] model=$model finishReason: $finishReason');
          if (finishReason == 'SAFETY') {
            debugPrint('[Gemini] Response blocked by safety filter');
            throw const AIServiceException(
              message: 'Response was blocked by safety filter.',
            );
          }
          if (finishReason == 'MAX_TOKENS') {
            debugPrint(
              '[Gemini] ⚠️ Response TRUNCATED — finishReason=MAX_TOKENS',
            );
          }

          final content = candidates[0]['content'];
          if (content == null) {
            debugPrint(
              '[Gemini] No content in candidate. Finish reason: $finishReason',
            );
            throw const AIServiceException(message: 'AI returned no content.');
          }
          final parts = content['parts'] as List?;
          if (parts == null || parts.isEmpty) {
            debugPrint(
              '[Gemini] No parts in content. Candidate: ${candidates[0]}',
            );
            throw const AIServiceException(message: 'AI returned no content.');
          }

          debugPrint('[Gemini] ✅ model=$model tier=$tier succeeded.');

          final buffer = StringBuffer();
          for (final part in parts) {
            final text = part['text'] as String?;
            if (text != null) {
              buffer.write(text);
            }
          }
          return buffer.toString();
        } on DioException catch (e) {
          final statusCode = e.response?.statusCode;
          final responseBody = e.response?.data;
          debugPrint(
            '[Gemini] DioException model=$model (attempt ${retryCount + 1}/${AppConstants.deepSeekMaxRetries}): '
            'status=$statusCode, type=${e.type}, '
            'message=${e.message}, '
            'body=${responseBody is String ? (responseBody.length > 300 ? responseBody.substring(0, 300) : responseBody) : responseBody}',
          );

          final shouldTryFallback =
              !isLastModel && _shouldFallbackModel(statusCode, responseBody);
          if (shouldTryFallback) {
            debugPrint(
              '[Gemini] Retrying with fallback model after $model failed.',
            );
            continue;
          }

          if (statusCode == 429) {
            throw const AIServiceException(
              message: 'AI is busy right now. Please try again shortly.',
              isRateLimited: true,
            );
          }

          if (statusCode == 400 || statusCode == 403 || statusCode == 404) {
            String detail = 'AI request failed (HTTP $statusCode).';
            if (responseBody is Map) {
              final errorMsg = responseBody['error']?['message'] as String?;
              if (errorMsg != null) {
                detail = errorMsg;
              }
            }
            debugPrint('[Gemini] Non-retryable error: $detail');
            throw AIServiceException(message: detail);
          }
        } on AIServiceException {
          rethrow;
        } catch (e) {
          debugPrint(
            '[Gemini] Unexpected error on $model (attempt ${retryCount + 1}/${AppConstants.deepSeekMaxRetries}): $e',
          );
          if (!isLastModel) {
            continue;
          }
        }
      }

      retryCount++;
      if (retryCount < AppConstants.deepSeekMaxRetries) {
        await Future.delayed(AppConstants.retryDelays[retryCount - 1]);
      }
    }

    throw const AIServiceException(
      message: 'AI service is temporarily unavailable.',
    );
  }

  List<String> _candidateModels(AiTier tier) {
    // Heavy tier: flash first (powerful), lite fallback (cheaper)
    // Lite tier:  lite first (cheap), flash fallback (powerful)
    if (tier == AiTier.heavy) {
      return [_heavyModel, _liteModel];
    }
    return [_liteModel, _heavyModel];
  }

  bool _shouldFallbackModel(int? statusCode, dynamic responseBody) {
    if (statusCode == 404 ||
        statusCode == 429 ||
        statusCode == 500 ||
        statusCode == 502 ||
        statusCode == 503 ||
        statusCode == 504) {
      return true;
    }

    final text = responseBody?.toString().toLowerCase() ?? '';
    return text.contains('resource_exhausted') ||
        text.contains('quota exceeded') ||
        text.contains('temporarily unavailable') ||
        text.contains('high demand') ||
        text.contains('unavailable');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RESULT PARSERS
  // ─────────────────────────────────────────────────────────────────────────

  ComparisonResult _parseComparisonResult(Map<String, dynamic> data) {
    final scoresData = data['scores'] as Map<String, dynamic>? ?? {};
    final scores = scoresData.map((key, value) {
      final m = value as Map<String, dynamic>;
      return MapEntry(
        key,
        ProductScore(
          productId: key,
          totalScore: (m['totalScore'] as num?)?.toDouble() ?? 0.0,
          personalFit: (m['personalFit'] as num?)?.toDouble() ?? 0.0,
          community: (m['community'] as num?)?.toDouble() ?? 0.0,
          expert: (m['expert'] as num?)?.toDouble() ?? 0.0,
          valuePrice: (m['valuePrice'] as num?)?.toDouble() ?? 0.0,
          pros: List<String>.from(m['pros'] ?? []),
          cons: List<String>.from(m['cons'] ?? []),
        ),
      );
    });

    return ComparisonResult(
      scores: scores,
      analysis: data['analysis'] as String? ?? '',
      winnerId: data['winner'] as String?,
      generatedAt: DateTime.now(),
    );
  }

  RecommendationResult _parseRecommendationResult(Map<String, dynamic> data) {
    final items = (data['recommendations'] as List<dynamic>? ?? [])
        .map(
          (e) => RecommendedProduct(
            productId: e['productId'] ?? '',
            score: (e['score'] as num?)?.toDouble() ?? 0.0,
            reason: e['reason'] ?? '',
          ),
        )
        .toList();

    return RecommendationResult(
      recommendations: items,
      generatedAt: DateTime.now(),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SYSTEM PROMPTS (English)
  // ─────────────────────────────────────────────────────────────────────────

  static String _comparisonSystemPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are the Qor AI comparison engine. You receive a list of product IDs,
user profile data and their country. Your job is to produce a deep, fair,
spec-by-spec comparison and pick a winner based on the user's priorities.

LANGUAGE: You MUST write ALL text (analysis, pros, cons) in $langName.

Return valid JSON:
{
  "scores": {
    "<productId>": {
      "totalScore": 0-100,
      "personalFit": 0-100,
      "community": 0-100,
      "expert": 0-100,
      "valuePrice": 0-100,
      "pros": ["...", "..."],
      "cons": ["...", "..."]
    }
  },
  "analysis": "Detailed markdown comparison text in $langName",
  "winner": "<productId>"
}
''';
  }

  static String _linkAnalysisSystemPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Qor AI's link analysis engine. You receive a product URL, optional metadata, optional web research data, and a user profile. Your job is to identify the EXACT product and analyze it.

CRITICAL — PRODUCT IDENTIFICATION (PRIORITY ORDER):
1. "webResearch" — If provided, this contains VERIFIED data from Google Search about the URL. This is your MOST RELIABLE source for product identification. USE IT.
2. "productContext.title" — Scraped metadata title. If it contains a clear product name, use it.
3. "productContext.productId" and "productContext.productIdType" are HARD CONSTRAINTS. If present, the final product MUST match that same identifier.
4. URL path segments (slugs, IDs, brand names) are your TERTIARY source.
5. ABSOLUTELY NEVER substitute, replace, or hallucinate a different product. If the data says "Zeiron APX80 Ryzen 5", you MUST analyze that — NOT a different product.
6. For Amazon ASINs/ISBNs: if webResearch is available, use its product name. If not, and you are NOT 100% certain about the ASIN, set is_product to false.
7. If productContext.title is a domain name (e.g. "trendyol.com"), treat as NO useful title — rely on webResearch or URL.
8. If you genuinely cannot determine the product, set is_product to false. NEVER fabricate.

PRODUCT VALIDATION:
- TRUE if URL is from e-commerce site with product path pattern
- FALSE if non-product page or can't determine product
- When FALSE: score=0, category=null, short explanation in $langName

CATEGORY DETECTION:
- Detect REAL category: books, smartphones, laptops, tablets, headphones, monitors, keyboards, clothing, home-appliances, gaming, toys, beauty, sports, furniture, kitchen, pet-supplies, computers, etc.
- Do NOT assume "smartphones". Read the actual URL and metadata.
- Products can be ANY category — not just technology.

CATEGORY-AWARE ANALYSIS:
- For TECH: discuss specs, ecosystem, performance
- For BOOKS: discuss content, author, genre. Do NOT mention "ecosystem" or "tech specs"
- For CLOTHING: discuss material, style, brand. Do NOT force tech terminology
- For HOME/KITCHEN: discuss functionality, design, durability
- Adapt analysis naturally to the product category

LANGUAGE: ALL text fields MUST be in $langName.

SCORING: Reflects user-product fit (20-95). Consider budget, priorities, practical value.

ANALYSIS: 6-10 sentences, category-appropriate, specific. Do NOT repeat user's profile.

Return ONLY valid JSON:
{
  "is_product": true,
  "score": 20-95,
  "analysis": "6-10 sentence category-appropriate analysis in $langName",
  "category": "product category in English lowercase",
  "title": "EXACT product name from metadata/URL — NEVER substituted or invented",
  "image_url": null,
  "price": "Price with currency if found, else null",
  "site_name": "Store name from URL domain"
}
''';
  }

  static String _chatSystemPrompt(UserEntity profile, int currentYear) =>
      '''
You are Qor AI — a knowledgeable, friendly shopping and product advisor for ALL categories.

## YOUR PERSONALITY
- Warm, conversational, occasionally humorous — a smart friend who knows products
- Use emoji naturally (not excessively)
- Be honest about product weaknesses — users trust candor
- Keep responses concise (max 3-4 short paragraphs)

## EXPERTISE
- You advise on ALL product categories, not just tech:
  • Technology: phones, laptops, headphones, monitors, cameras
  • Books: genres, authors, recommendations
  • Fashion: brands, styles, materials, sizing
  • Home & kitchen: appliances, furniture, decor
  • Sports & fitness: equipment, gear
  • Beauty & personal care
  • Any consumer product
- Adapt your advice style naturally to the category

## USER PROFILE
- Ecosystem: ${profile.ecosystem}
- Budget: ${profile.budgetRange}
- Priorities: ${profile.priorities.join(', ')}
- Country: ${profile.country}
- Profession: ${profile.profession}

## IMPORTANT RULES
- Share what you know confidently. Note when information might be outdated for rapidly changing products.
- NEVER say "I can't search the internet" — share your knowledge and qualify recency if needed.
- For current prices, suggest the user verify online.

## PAGE AWARENESS
When context mentions a specific product or page, USE that information proactively.

## CONVERSATION FLOW
For general questions, ask clarifying questions ONE AT A TIME before recommending. Use profile to skip obvious questions.

## LANGUAGE
- User's preferred language: ${profile.language}
- Country: ${profile.country}
- ALWAYS respond in the SAME language the user writes in
- Default: ${_languageName(profile.language)}
- Current year: $currentYear
''';

  static String _quizGenerationPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Qor AI's product quiz engine. Generate a SHORT personalized quiz
(4-6 questions) to understand the user's needs for the SPECIFIC product being analyzed.

LANGUAGE: Generate ALL questions and options in $langName.

The goal: understand how the user plans to use THIS specific product, their priorities,
living situation, habits, and expectations — so we can compute an accurate
compatibility score.

CRITICAL RULES:
- Questions MUST be relevant to the specific product and its category
- Reference the product name/type in at least 2 questions
- For BOOKS: ask about reading preferences, genre interests, reading habits
- For TECH: ask about usage scenarios, environment, feature priorities  
- For CLOTHING: ask about style, occasions, comfort preferences
- For HOME: ask about living space, household size, usage frequency
- Each question has exactly 4 options
- Options should cover the full spectrum of use-cases
- Keep questions conversational with emoji
- NEVER ask about budget (we already know that)
- NEVER ask about brand preference
- Questions should feel fun, not like a survey
- ALL text must be in $langName

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}
''';
  }

  static String _compareQuizGenerationPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Qor AI's product COMPARISON quiz engine. The user is comparing multiple products.
Generate a SHORT personalized quiz (4-6 questions) to understand the user's needs
so we can determine which product is the BEST FIT for them.

LANGUAGE: Generate ALL questions and options in $langName.

The goal: understand the user's priorities, use cases, and preferences to help
determine which of the products being compared is the best match.

CRITICAL RULES:
- You are given MULTIPLE products that are being compared
- Questions should help differentiate between the products
- Ask about the user's specific needs that would make one product better than another
- Reference the actual product names in questions where relevant
- For BOOKS: ask about reading goals, preferred topics, reading level, format preferences
- For TECH: ask about primary use cases, feature priorities, environment
- For CLOTHING: ask about occasions, style preferences, comfort vs looks
- For HOME: ask about space, frequency of use, household needs
- Each question has exactly 4 options
- Options should represent different priorities that favor different products
- Keep questions conversational with emoji
- NEVER ask about budget (we already know that)
- NEVER ask about brand preference
- Questions should feel fun, not like a survey
- ALL text must be in $langName

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}
''';
  }

  static String _enhancedAnalysisPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Qor AI's senior product analyst. Given a product, quiz answers, user profile, and optional web research data, produce a comprehensive, professional, and highly detailed personalized match report.

LANGUAGE: Write ALL text fields in $langName. Be thorough and professional — this is a premium AI analysis.

CRITICAL — USE WEB RESEARCH DATA:
- If "webResearch" is provided, it contains REAL data from Google Search: user reviews, Reddit opinions, expert reviews, prices.
- Use this data to populate communityScore and communityAnalysis with REAL community feedback.
- Reference specific community observations (e.g., "Reddit users in r/hardware consistently report…"). 
- If webResearch is absent, draw on your comprehensive product knowledge.

CRITICAL — CATEGORY-AWARE ANALYSIS:
- The product can be ANY category: tech, books, clothing, home, sports, beauty, etc.
- For TECH products: analyze specs deeply — cite benchmarks, real-world performance numbers, thermal behavior, software longevity.
- For BOOKS: discuss writing quality, pacing, reader reception, author credentials, genre positioning.
- For CLOTHING/HOME: discuss material science, build quality, brand heritage, durability data.
- NEVER force tech terminology onto non-tech products. Adapt all factor labels to the category.

SCORING RULES:
- Score MUST reflect how well THIS SPECIFIC product matches THIS SPECIFIC user's exact quiz answers and profile.
- Scores must be realistic, differentiated, and defensible.
- Poor match: 20-45. Average match: 46-65. Good match: 66-80. Excellent match: 81-95.
- NEVER give identical scores to two different products.

WRITING QUALITY REQUIREMENTS:
- Use professional, tech-journalist level language. Be specific, not generic.
- Cite actual specs, real benchmarks, community observations, or market context.
- verdict and personaAnalysis should be richly detailed (4-6 paragraphs each).
- communityAnalysis should reflect a broad community synthesis (3-5 paragraphs).
- prosForUser and consForUser must be specific, detailed bullet points — not one-word answers.

Return valid JSON (all text in $langName):
{
  "enhancedScore": <0-100 integer>,
  "factors": [
    {"label": "<category-appropriate label in $langName>", "score": <0-100>, "emoji": "🎯"},
    {"label": "<category-appropriate label in $langName>", "score": <0-100>, "emoji": "💰"},
    {"label": "<category-appropriate label in $langName>", "score": <0-100>, "emoji": "⭐"},
    {"label": "<category-appropriate label in $langName>", "score": <0-100>, "emoji": "🚀"},
    {"label": "<category-appropriate label in $langName>", "score": <0-100>, "emoji": "🏠"}
  ],
  "personaScore": <0-100>,
  "personaAnalysis": "4-6 paragraph deep personal fit analysis. Cover: (1) how the product's strengths align with this user's specific use cases from quiz answers, (2) performance in scenarios the user cares about, (3) potential daily-use friction points, (4) value proposition relative to their budget range, (5) long-term ownership experience forecast. Be concrete and reference actual product characteristics. In $langName.",
  "communityScore": <0-100>,
  "communityAnalysis": "3-5 paragraph synthesis of community sentiment. Cover: (1) overall reception across tech communities, (2) what power users praise specifically, (3) recurring criticisms and how serious they are, (4) long-term ownership reports (1-2 years), (5) how the product compares to its direct competitors in community opinion. Reference real sources (Reddit, YouTube, review sites) where known. In $langName.",
  "verdict": "4-6 paragraph comprehensive product verdict. Cover: (1) technical overview and market positioning, (2) performance analysis with specific metrics, (3) build quality and reliability, (4) software/ecosystem (if relevant), (5) value assessment, (6) who this product is best suited for. Professional tone, specific details. In $langName.",
  "overallVerdict": "3-4 paragraph definitive recommendation. Give a clear buy/consider/skip verdict with detailed reasoning. Reference the user's specific needs and how this product does or doesn't address them. Include a concrete alternative suggestion if recommending skip. In $langName.",
  "prosForUser": ["Detailed pro 1 with specifics", "Detailed pro 2 with performance context", "Detailed pro 3 citing real characteristic", "Detailed pro 4", "Detailed pro 5"],
  "consForUser": ["Specific con 1 with real-world impact", "Specific con 2 with severity assessment", "Specific con 3", "Specific con 4"],
  "alternatives": ["Specific real product model 1", "Specific real product model 2", "Specific real product model 3"]
}

Rules:
- Factor labels MUST be in $langName and adapted to the product category.
- All text fields (personaAnalysis, communityAnalysis, verdict, overallVerdict) must be in $langName.
- Pros/cons must be personalized, detailed, and product-specific — no generic one-liners.
- Alternatives must be real, currently available products with full model names.
''';
  }

  static String _languageName(String code) {
    const map = {
      'en': 'English',
      'tr': 'Turkish',
      'de': 'German',
      'fr': 'French',
      'es': 'Spanish',
      'pt': 'Portuguese',
      'it': 'Italian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'ru': 'Russian',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'pl': 'Polish',
      'sv': 'Swedish',
    };
    return map[code] ?? 'English';
  }

  /// Known subscription service context for better quiz generation
  static const _subscriptionContext = <String, String>{
    'netflix':
        'Video streaming: movies, series, documentaries, anime. Originals like Stranger Things, Squid Game. Multiple profiles, offline download, 4K/HDR support.',
    'spotify':
        'Music & podcast streaming. 100M+ tracks, AI playlists (Discover Weekly, Daily Mix), offline mode, lyrics, social sharing, Spotify Wrapped.',
    'apple music':
        'Music streaming with lossless/spatial audio, 100M+ songs, Apple ecosystem integration, radio stations, music videos, karaoke mode.',
    'youtube premium':
        'Ad-free YouTube, background play, YouTube Music included, offline downloads, YouTube Originals.',
    'youtube music':
        'Music streaming from YouTube catalog, smart recommendations, music videos, live performances, covers.',
    'disney plus':
        'Video streaming: Disney, Marvel, Star Wars, Pixar, National Geographic. Family content, IMAX Enhanced, GroupWatch.',
    'amazon prime':
        'Video streaming + fast delivery + Prime Gaming + Prime Reading. Thursday Night Football, Originals like The Boys, Rings of Power.',
    'hbo':
        'Premium video streaming: HBO originals (Game of Thrones, The Last of Us), Warner Bros movies, DC content.',
    'apple tv plus':
        'Apple original content: Ted Lasso, Severance, Foundation. Small but high-quality library, Apple ecosystem perks.',
    'chatgpt plus':
        'OpenAI GPT-4 access, faster responses, priority access, DALL-E image generation, Advanced Data Analysis, plugins, GPTs.',
    'claude pro':
        'Anthropic Claude AI: longer conversations, priority access, larger context window, better for coding and analysis.',
    'gemini advanced':
        'Google Gemini Ultra: deep reasoning, multimodal (text+image+code), Google Workspace integration.',
    'xbox game pass':
        'Gaming subscription: 100+ games on Xbox/PC/cloud, day-one releases, EA Play included in Ultimate, online multiplayer.',
    'ps plus':
        'PlayStation subscription: online multiplayer, monthly free games, game catalog (Extra/Premium tiers), cloud streaming.',
    'ea play':
        'EA games subscription: FIFA, Battlefield, Madden, early access to new releases, 10-hour trials.',
    'apple one':
        'Apple bundle: Apple Music + TV+ + Arcade + iCloud+ (+ Fitness/News in Premium). Ecosystem savings.',
    'icloud plus':
        'Apple cloud storage: device backup, photos sync, Private Relay VPN, Hide My Email, custom email domain.',
    'google one':
        'Google cloud storage: Drive/Gmail/Photos storage, VPN, enhanced Google support, family sharing.',
    'dropbox':
        'Cloud storage & file sync, team collaboration, Smart Sync, document scanning, eSign.',
    'adobe cc':
        'Creative Cloud: Photoshop, Illustrator, Premiere Pro, After Effects, Lightroom. Industry-standard creative tools.',
    'notion':
        'All-in-one workspace: notes, docs, databases, project management, wikis, AI assistant.',
    'figma':
        'Collaborative design tool: UI/UX design, prototyping, design systems, FigJam whiteboard, Dev Mode.',
    'crunchyroll':
        'Anime streaming: largest anime library, simulcasts from Japan, manga, offline viewing.',
    'paramount plus':
        'Video streaming: CBS content, Paramount movies, NFL, Champions League, Originals like Yellowstone.',
    'peacock':
        'NBCUniversal streaming: The Office, live sports, news, Bravo reality TV, Peacock Originals.',
    'deezer':
        'Music streaming: Flow AI recommendations, lyrics, podcasts, HiFi lossless audio, SongCatcher.',
    'tidal':
        'Music streaming: HiFi/Master quality, artist-owned, exclusive content, Dolby Atmos, Sony 360 Reality Audio.',
  };

  static final _subscriptionCatalog = <String, _SubscriptionCatalogEntry>{
    'netflix': _SubscriptionCatalogEntry(
      displayName: 'Netflix',
      category: 'video-streaming',
      context: _subscriptionContext['netflix']!,
    ),
    'spotify': _SubscriptionCatalogEntry(
      displayName: 'Spotify',
      category: 'music-streaming',
      context: _subscriptionContext['spotify']!,
    ),
    'apple music': _SubscriptionCatalogEntry(
      displayName: 'Apple Music',
      category: 'music-streaming',
      context: _subscriptionContext['apple music']!,
    ),
    'youtube premium': _SubscriptionCatalogEntry(
      displayName: 'YouTube Premium',
      category: 'video-streaming',
      context: _subscriptionContext['youtube premium']!,
    ),
    'youtube music': _SubscriptionCatalogEntry(
      displayName: 'YouTube Music',
      category: 'music-streaming',
      context: _subscriptionContext['youtube music']!,
    ),
    'disney plus': _SubscriptionCatalogEntry(
      displayName: 'Disney+',
      category: 'video-streaming',
      context: _subscriptionContext['disney plus']!,
    ),
    'amazon prime': _SubscriptionCatalogEntry(
      displayName: 'Amazon Prime',
      category: 'video-streaming',
      context: _subscriptionContext['amazon prime']!,
    ),
    'hbo': _SubscriptionCatalogEntry(
      displayName: 'HBO',
      category: 'video-streaming',
      context: _subscriptionContext['hbo']!,
    ),
    'exxen': const _SubscriptionCatalogEntry(
      displayName: 'Exxen',
      category: 'video-streaming',
      context:
          'Turkish video streaming platform with local series, reality shows, sports add-ons, and exclusive originals.',
    ),
    'puhu tv': const _SubscriptionCatalogEntry(
      displayName: 'Puhu TV',
      category: 'video-streaming',
      context:
          'Turkish streaming platform focused on local series, movies, and original productions.',
    ),
    'apple tv plus': _SubscriptionCatalogEntry(
      displayName: 'Apple TV+',
      category: 'video-streaming',
      context: _subscriptionContext['apple tv plus']!,
    ),
    'chatgpt plus': _SubscriptionCatalogEntry(
      displayName: 'ChatGPT Plus',
      category: 'ai-tools',
      context: _subscriptionContext['chatgpt plus']!,
    ),
    'claude pro': _SubscriptionCatalogEntry(
      displayName: 'Claude Pro',
      category: 'ai-tools',
      context: _subscriptionContext['claude pro']!,
    ),
    'gemini advanced': _SubscriptionCatalogEntry(
      displayName: 'Gemini Advanced',
      category: 'ai-tools',
      context: _subscriptionContext['gemini advanced']!,
    ),
    'xbox game pass': _SubscriptionCatalogEntry(
      displayName: 'Xbox Game Pass',
      category: 'gaming',
      context: _subscriptionContext['xbox game pass']!,
    ),
    'ps plus': _SubscriptionCatalogEntry(
      displayName: 'PS Plus',
      category: 'gaming',
      context: _subscriptionContext['ps plus']!,
    ),
    'ea play': _SubscriptionCatalogEntry(
      displayName: 'EA Play',
      category: 'gaming',
      context: _subscriptionContext['ea play']!,
    ),
    'apple one': _SubscriptionCatalogEntry(
      displayName: 'Apple One',
      category: 'bundles',
      context: _subscriptionContext['apple one']!,
    ),
    'icloud plus': _SubscriptionCatalogEntry(
      displayName: 'iCloud+',
      category: 'cloud-storage',
      context: _subscriptionContext['icloud plus']!,
    ),
    'google one': _SubscriptionCatalogEntry(
      displayName: 'Google One',
      category: 'cloud-storage',
      context: _subscriptionContext['google one']!,
    ),
    'dropbox': _SubscriptionCatalogEntry(
      displayName: 'Dropbox',
      category: 'cloud-storage',
      context: _subscriptionContext['dropbox']!,
    ),
    'adobe cc': _SubscriptionCatalogEntry(
      displayName: 'Adobe CC',
      category: 'productivity',
      context: _subscriptionContext['adobe cc']!,
    ),
    'notion': _SubscriptionCatalogEntry(
      displayName: 'Notion',
      category: 'productivity',
      context: _subscriptionContext['notion']!,
    ),
    'figma': _SubscriptionCatalogEntry(
      displayName: 'Figma',
      category: 'productivity',
      context: _subscriptionContext['figma']!,
    ),
    'crunchyroll': _SubscriptionCatalogEntry(
      displayName: 'Crunchyroll',
      category: 'video-streaming',
      context: _subscriptionContext['crunchyroll']!,
    ),
    'paramount plus': _SubscriptionCatalogEntry(
      displayName: 'Paramount+',
      category: 'video-streaming',
      context: _subscriptionContext['paramount plus']!,
    ),
    'peacock': _SubscriptionCatalogEntry(
      displayName: 'Peacock',
      category: 'video-streaming',
      context: _subscriptionContext['peacock']!,
    ),
    'deezer': _SubscriptionCatalogEntry(
      displayName: 'Deezer',
      category: 'music-streaming',
      context: _subscriptionContext['deezer']!,
    ),
    'tidal': _SubscriptionCatalogEntry(
      displayName: 'Tidal',
      category: 'music-streaming',
      context: _subscriptionContext['tidal']!,
    ),
  };

  static const _subscriptionAliases = <String, String>{
    'disney+': 'disney plus',
    'disney plus': 'disney plus',
    'youtube premium': 'youtube premium',
    'youtube music': 'youtube music',
    'yt premium': 'youtube premium',
    'yt music': 'youtube music',
    'amazon prime video': 'amazon prime',
    'prime video': 'amazon prime',
    'hbo max': 'hbo',
    'max': 'hbo',
    'hbo': 'hbo',
    'exxen': 'exxen',
    'exen': 'exxen',
    'puhu tv': 'puhu tv',
    'puhutv': 'puhu tv',
    'apple tv+': 'apple tv plus',
    'apple tv plus': 'apple tv plus',
    'chatgpt': 'chatgpt plus',
    'chatgpt plus': 'chatgpt plus',
    'claude': 'claude pro',
    'claude pro': 'claude pro',
    'gemini': 'gemini advanced',
    'gemini advanced': 'gemini advanced',
    'icloud+': 'icloud plus',
    'icloud plus': 'icloud plus',
    'paramount+': 'paramount plus',
    'paramount plus': 'paramount plus',
    'ps+': 'ps plus',
    'ps plus': 'ps plus',
  };

  static String normalizeSubscriptionLookupKey(String value) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll('&', ' and ')
        .replaceAll('+', ' plus ')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  static String? resolveSubscriptionCatalogKey(String value) {
    final lookup = normalizeSubscriptionLookupKey(value);
    if (lookup.isEmpty) return null;
    return _subscriptionAliases[lookup] ??
        (_subscriptionCatalog.containsKey(lookup) ? lookup : null);
  }

  static bool isKnownSubscription(String value) =>
      resolveSubscriptionCatalogKey(value) != null;

  static String? subscriptionCategoryKey(String value) {
    final key = resolveSubscriptionCatalogKey(value);
    return key == null ? null : _subscriptionCatalog[key]?.category;
  }

  static String? normalizeSubscriptionDisplayName(String value) {
    final key = resolveSubscriptionCatalogKey(value);
    return key == null ? null : _subscriptionCatalog[key]?.displayName;
  }

  static String prettySubscriptionName(String value) {
    return normalizeSubscriptionDisplayName(value) ??
        _smartSubscriptionTitle(value);
  }

  static Map<String, dynamic>? _decodeJsonObject(String text) {
    try {
      var clean = text.trim();
      if (clean.startsWith('```')) {
        clean = clean
            .replaceFirst(RegExp(r'^```\w*\n?'), '')
            .replaceFirst(RegExp(r'\n?```$'), '');
      }
      return jsonDecode(clean) as Map<String, dynamic>?;
    } catch (_) {
      try {
        final match = RegExp(r'\{[\s\S]*\}').firstMatch(text);
        if (match == null) return null;
        return jsonDecode(match.group(0)!) as Map<String, dynamic>?;
      } catch (_) {
        return null;
      }
    }
  }

  static String _smartSubscriptionTitle(String value) {
    const special = <String, String>{
      'hbo': 'HBO',
      'ai': 'AI',
      'tv': 'TV',
      'cc': 'CC',
      'ea': 'EA',
      'ps': 'PS',
      'gpt': 'GPT',
    };
    return value
        .trim()
        .split(RegExp(r'\s+'))
        .map((part) {
          final lower = part.toLowerCase();
          if (special.containsKey(lower)) return special[lower]!;
          if (lower.isEmpty) return lower;
          return '${lower[0].toUpperCase()}${lower.substring(1)}';
        })
        .join(' ');
  }

  static Map<String, dynamic>? _normalizeSubscriptionAnalysisPayload(
    Map<String, dynamic>? parsed,
  ) {
    if (parsed == null) return null;
    final normalized = Map<String, dynamic>.from(parsed);

    final rawSubscriptions = parsed['subscriptions'];
    if (rawSubscriptions is Map) {
      final mapped = <String, dynamic>{};
      for (final entry in rawSubscriptions.entries) {
        final displayName = prettySubscriptionName(entry.key.toString());
        final data = entry.value is Map
            ? Map<String, dynamic>.from(entry.value as Map)
            : entry.value;
        if (data is Map<String, dynamic>) {
          final category = data['category']?.toString().trim();
          if (category == null || category.isEmpty) {
            final categoryKey = subscriptionCategoryKey(entry.key.toString());
            if (categoryKey != null) {
              data['category'] = categoryKey;
            }
          }
        }
        mapped[displayName] = data;
      }
      normalized['subscriptions'] = mapped;
    }

    final rawWinner = parsed['winner'];
    if (rawWinner is Map) {
      final mapped = Map<String, dynamic>.from(rawWinner);
      for (final field in const ['best_content', 'overall']) {
        final value = mapped[field];
        if (value is String && value.trim().isNotEmpty) {
          mapped[field] = prettySubscriptionName(value);
        }
      }
      normalized['winner'] = mapped;
    }

    return normalized;
  }
}

class _SubscriptionCatalogEntry {
  final String displayName;
  final String category;
  final String context;

  const _SubscriptionCatalogEntry({
    required this.displayName,
    required this.category,
    required this.context,
  });
}

class ResolvedSubscriptionCandidate {
  final String rawName;
  final String displayName;
  final String? categoryKey;
  final bool isSubscription;
  final String? reason;

  const ResolvedSubscriptionCandidate({
    required this.rawName,
    required this.displayName,
    required this.isSubscription,
    this.categoryKey,
    this.reason,
  });
}

class SubscriptionResolutionResult {
  final List<ResolvedSubscriptionCandidate> resolved;
  final List<String> invalidNames;
  final List<String> normalizedNames;
  final String? sharedCategoryKey;
  final bool mixedCategories;

  const SubscriptionResolutionResult({
    this.resolved = const [],
    this.invalidNames = const [],
    this.normalizedNames = const [],
    this.sharedCategoryKey,
    this.mixedCategories = false,
  });
}
