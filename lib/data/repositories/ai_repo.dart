/// Qor AI - AI Repository (including Link Analysis)
/// Blueprint Section 7, 9
library;

import 'package:flutter/foundation.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';
import 'package:qor_ai/data/models/other_models.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/services/ai_service.dart';
import 'package:qor_ai/services/gemini_service.dart';
import 'package:qor_ai/services/metadata_service.dart';
import 'package:qor_ai/services/webview_resolver.dart';

class AIRepository {
  final AIService _aiService;
  final PbDataSource _pbDS;
  final MetadataService? _metadataService;
  final WebViewResolver? _webViewResolver;

  AIRepository({
    required AIService aiService,
    required PbDataSource pbDS,
    MetadataService? metadataService,
    WebViewResolver? webViewResolver,
  }) : _aiService = aiService,
       _pbDS = pbDS,
       _metadataService = metadataService,
       _webViewResolver = webViewResolver;

  /// Get recommendations - Section 7.2
  Future<Result<RecommendationResult>> getRecommendations({
    required UserEntity user,
    required String category,
    int limit = 10,
  }) async {
    try {
      final request = RecommendRequest(
        userProfile: {
          'ecosystem': user.ecosystem,
          'budgetRange': user.budgetRange,
          'priorities': user.priorities,
          'country': user.country,
        },
        category: category,
        country: user.country,
        limit: limit,
      );

      final result = await _aiService.recommend(request);
      return Success(result);
    } on AIServiceException catch (e) {
      return Failure(e);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Analyze link - Section 9.1
  /// 1. Fetch OG tags via Metadata Service (image, title, description)
  /// 2. Send metadata + user profile to AI
  /// 3. Save result to Firestore
  Future<Result<LinkAnalysisResult>> analyzeLink({
    required String url,
    required UserEntity user,
  }) async {
    try {
      // Step 0: Resolve mobile-app / short share links (amzn.eu/d/…, ty.gl/…,
      // a.co/…) to their canonical product URL. These carry no product slug or
      // ASIN, so all downstream extraction fails and the AI rejects a real
      // product as "not found". Following the redirect recovers the full URL.
      var analysisUrl = url;
      if (_metadataService != null) {
        analysisUrl = await _metadataService.resolveShareUrl(url);
        if (analysisUrl != url) {
          debugPrint('[AIRepo] Resolved short link $url → $analysisUrl');
        }
      }

      // Step 1: Fetch metadata (including image)
      OgMetadata metadata = const OgMetadata();
      if (_metadataService != null) {
        try {
          metadata = await _metadataService.fetchMetadataForSite(analysisUrl);
          debugPrint(
            '[AIRepo] Metadata fetched for $analysisUrl: title=${metadata.title}',
          );
        } catch (e) {
          debugPrint(
            '[AIRepo] Metadata fetch failed for $analysisUrl: $e — continuing',
          );
        }
      }

      // Step 1b: HTTP ile kimlik çıkmadıysa GERÇEK TARAYICI ile çöz.
      // Sebep (ölçüldü): bot korumalı mağazalar istemciyi TLS parmak izinden
      // tanıyor — aynı IP/başlıkla curl 301 alırken Dart (Dio ve ham dart:io)
      // 403 alıyor. Başlıkla aşılamaz. Sistem WebView'ı gerçek Chrome motoru +
      // kullanıcının kendi IP'si → kapıları geçer, Cloudflare sınamasını kendi
      // çözer, JS ile render edilen mağazalarda da çalışır.
      // PAHALI değil: yalnız kimlik GERÇEKTEN yoksa çalışır (Amazon/Trendyol gibi
      // HTTP'den okunabilen linklerde hiç kurulmaz).
      if (_webViewResolver != null &&
          _identityIsMissing(analysisUrl, metadata)) {
        debugPrint('[AIRepo] No identity from HTTP → WebView resolve: $url');
        try {
          final wv = await _webViewResolver.resolve(url);
          if (wv != null) {
            if (wv.finalUrl.startsWith('http') && wv.finalUrl != analysisUrl) {
              debugPrint('[AIRepo] WebView resolved → ${wv.finalUrl}');
              analysisUrl = wv.finalUrl;
            }
            if (wv.hasIdentity) {
              debugPrint('[AIRepo] WebView identity: ${wv.title}');
              metadata = OgMetadata(
                title: wv.title,
                description: wv.description ?? metadata.description,
                image: wv.image ?? metadata.image,
                price: wv.price ?? metadata.price,
                siteName: wv.siteName ?? metadata.siteName,
              );
            }
          }
        } catch (e) {
          debugPrint('[AIRepo] WebView resolve failed (continuing): $e');
        }
      }

      // Step 2: AI analysis (enriched with metadata so the model knows
      //         what the product actually is without browsing the URL)
      debugPrint('[AIRepo] Starting AI analysis for: $analysisUrl');
      // DAYANIKLI: AI çağrısı patlarsa (ağ/kota/backend) linki REDDETME —
      // kullanıcı zaten ürün linki yapıştırdı. En iyi çabayla (metadata/slug)
      // bir sonuç üret ki "ürün tanınamadı" hatası AI arızasından kaynaklanmasın.
      LinkAnalysisResult result;
      try {
        result =
            await _aiService.analyzeLink(analysisUrl, user, metadata: metadata);
        debugPrint(
          '[AIRepo] AI analysis done: score=${result.aiScore}, category=${result.category}',
        );
      } catch (e) {
        debugPrint('[AIRepo] AI analyzeLink failed → fallback recognize: $e');
        result = _fallbackLinkResult(analysisUrl, metadata);
      }

      // Merge metadata with AI result (fill in info AI didn't return from metadata)
      final enrichedResult = LinkAnalysisResult(
        url: analysisUrl,
        metadata: OgMetadata(
          title: result.metadata.title ?? metadata.title,
          description: result.metadata.description ?? metadata.description,
          image: result.metadata.image ?? metadata.image,
          price: result.metadata.price ?? metadata.price,
          siteName: result.metadata.siteName ?? metadata.siteName,
        ),
        aiScore: result.aiScore,
        aiAnalysis: result.aiAnalysis,
        category: result.category,
        analyzedAt: result.analyzedAt,
        isProduct: result.isProduct,
      );

      // Step 3: Save result to user_links collection
      final link = UserLinkModel(
        id: '',
        userId: user.uid,
        url: analysisUrl,
        ogMetadata: OgMetadataModel(
          title: enrichedResult.metadata.title,
          description: enrichedResult.metadata.description,
          image: enrichedResult.metadata.image,
          price: enrichedResult.metadata.price,
        ),
        aiScore: enrichedResult.aiScore,
        aiAnalysis: enrichedResult.aiAnalysis,
        category: enrichedResult.category,
        createdAt: DateTime.now(),
      );

      if (user.uid.isEmpty || user.uid == 'anonymous') {
        debugPrint('[AIRepo] Skipping user_links save for anonymous session');
      } else {
        try {
          await _pbDS.saveUserLink(link);
        } catch (e) {
          debugPrint('[AIRepo] user_links save failed for $url: $e');
        }
      }

      return Success(enrichedResult);
    } on AIServiceException catch (e) {
      debugPrint('[AIRepo] analyzeLink AIServiceException: ${e.message}');
      return Failure(e);
    } catch (e) {
      debugPrint('[AIRepo] analyzeLink unexpected error: $e');
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Elimizde ürünün GERÇEK kimliği (adı) var mı? Yoksa pahalı ama kesin yola
  /// (gerçek tarayıcı) düşmeye değer. İki kaynak yeter:
  ///   • kazınan başlık — ara/engel sayfası ("Just a moment…") ve çıplak domain
  ///     SAYILMAZ, bunlar kimlik değil,
  ///   • URL slug'ı — çoğu mağaza ürün adını yola yazar (uydurma değil, gerçek).
  /// Amazon ASIN/ISBN placeholder'ı kimlik değildir (ASIN'den ad uydurulamaz).
  bool _identityIsMissing(String url, OgMetadata metadata) {
    if (isUsablePageTitle(metadata.title)) return false;
    final slug = GeminiService.extractProductNameFromUrl(url);
    if (slug == null || slug.trim().isEmpty) return true;
    if (slug.startsWith('Amazon ASIN') || slug.startsWith('Amazon ISBN')) {
      return true;
    }
    return !isUsablePageTitle(slug);
  }

  /// AI analizi başarısız olduğunda (ağ/kota/backend) en iyi çaba sonucu.
  /// UYDURMA YASAK: yalnız metadata'dan GERÇEK bir ürün adı çekebildiysek ürün
  /// kabul et (aksi halde AI olmadan spec uydurulur). Böylece backend arızası
  /// yanlış/uydurma analize DÖNÜŞMEZ — tanımlanabilen ürünse geçer, değilse
  /// dürüstçe reddedilir.
  LinkAnalysisResult _fallbackLinkResult(String url, OgMetadata metadata) {
    final title = metadata.title?.trim() ?? '';
    final looksDomainOnly =
        !title.contains(' ') &&
        RegExp(r'^[a-z0-9.-]+\.[a-z]{2,}$', caseSensitive: false).hasMatch(title);
    final hasRealIdentity =
        title.isNotEmpty &&
        !title.startsWith('Amazon ASIN') &&
        !title.startsWith('Amazon ISBN') &&
        !looksDomainOnly;
    return LinkAnalysisResult(
      url: url,
      metadata: metadata,
      aiScore: 0,
      aiAnalysis: '',
      category: null,
      analyzedAt: DateTime.now(),
      isProduct: hasRealIdentity,
    );
  }

  /// AI question-answer - Section 7.2
  Future<Result<String>> askQuestion({
    required String question,
    required UserEntity user,
  }) async {
    try {
      final answer = await _aiService.askQuestion(question, user);
      return Success(answer);
    } on AIServiceException catch (e) {
      return Failure(e);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// User links history
  Future<Result<List<UserLinkModel>>> getUserLinks(
    String userId, {
    int limit = 20,
  }) async {
    try {
      final links = await _pbDS.getUserLinks(userId, limit: limit);
      return Success(links);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }
}
