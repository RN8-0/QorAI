/// Visual Scanner — Camera-based product identification & Q&A
/// Uses Gemini multimodal (vision) for image analysis
library;

import 'dart:convert';
import 'dart:io';

import 'package:qor_ai/core/errors.dart';
import 'package:camera/camera.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/data/models/chat_conversation.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/limit_reached_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

class VisualScannerScreen extends ConsumerStatefulWidget {
  const VisualScannerScreen({super.key});

  @override
  ConsumerState<VisualScannerScreen> createState() =>
      _VisualScannerScreenState();
}

class _VisualScannerScreenState extends ConsumerState<VisualScannerScreen>
    with TickerProviderStateMixin {
  CameraController? _camCtrl;
  bool _isCameraReady = false;
  bool _isScanning = false;
  bool _hasResult = false;
  String? _capturedImagePath;
  final _questionCtrl = TextEditingController();
  final _chatMessages = <_ScannerChat>[];
  final _scrollCtrl = ScrollController();
  late AnimationController _scanAnimCtrl;
  _ScannerInsight? _scanInsight;
  String? _linkedConversationId;

  bool get _isTurkish =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  String _uiText({required String tr, required String en}) {
    return _isTurkish ? tr : en;
  }

  String get _responseLanguageName {
    const names = <String, String>{
      'tr': 'Turkish',
      'en': 'English',
      'de': 'German',
      'fr': 'French',
      'es': 'Spanish',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ar': 'Arabic',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
    };
    final code = Localizations.localeOf(context).languageCode.toLowerCase();
    return names[code] ?? 'English';
  }

  @override
  void initState() {
    super.initState();
    _scanAnimCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    );
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) return;
      _camCtrl = CameraController(
        cameras.first,
        ResolutionPreset.high,
        enableAudio: false,
      );
      await _camCtrl!.initialize();
      if (mounted) setState(() => _isCameraReady = true);
    } catch (e) {
      debugPrint('Camera init error: $e');
    }
  }

  @override
  void dispose() {
    _camCtrl?.dispose();
    _scanAnimCtrl.dispose();
    _questionCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _captureAndScan() async {
    if (_camCtrl == null || _isScanning) return;

    final sub = ref.read(subscriptionServiceProvider);
    final quota = sub.recordProductScan();
    if (quota.isFailure) {
      showLimitReachedDialog(context, featureName: 'product-scan');
      return;
    }

    HapticFeedback.heavyImpact();
    setState(() {
      _isScanning = true;
      _hasResult = false;
      _scanInsight = null;
      _linkedConversationId = null;
      _chatMessages.clear();
    });
    _scanAnimCtrl.repeat();

    try {
      final file = await _camCtrl!.takePicture();
      _capturedImagePath = file.path;

      final bytes = await File(file.path).readAsBytes();
      final base64Image = base64Encode(bytes);

      final gemini = ref.read(geminiServiceProvider);
      final response = await gemini.analyzeImage(
        base64Image: base64Image,
        mimeType: 'image/jpeg',
        prompt: _buildScanPrompt(),
      );
      final insight = _parseScannerInsight(response);
      final initialMessage = _buildInitialMessage(insight);

      setState(() {
        _hasResult = true;
        _scanInsight = insight;
        _chatMessages.add(_ScannerChat(role: _ChatRole.ai, text: initialMessage));
      });
      await _persistScannerConversation();
    } catch (e) {
      setState(() {
        _hasResult = true;
        _scanInsight = null;
        _chatMessages.add(
          _ScannerChat(
            role: _ChatRole.ai,
            text: _uiText(
              tr: 'Görsel analiz edilemedi. Lütfen tekrar deneyin.',
              en: 'Could not analyze the image. Please try again.',
            ),
          ),
        );
      });
    } finally {
      _scanAnimCtrl.stop();
      setState(() => _isScanning = false);
    }
  }

  Future<void> _askFollowUp(String question) async {
    if (question.trim().isEmpty || _capturedImagePath == null) return;
    if (!(_scanInsight?.isConfirmedProduct ?? false)) {
      setState(() {
        _chatMessages.add(
          _ScannerChat(
            role: _ChatRole.ai,
            text: _uiText(
              tr: 'Önce net bir ürün taraması yapmam gerekiyor. Ürün olmayan veya çok karanlık karelerde sohbet açmıyorum.',
              en: 'I need a clear product scan first. I do not open product chat for non-product or very dark frames.',
            ),
          ),
        );
      });
      _scrollToBottom();
      return;
    }

    final sub = ref.read(subscriptionServiceProvider);
    final quota = sub.recordAIQuestion();
    if (quota.isFailure) {
      showLimitReachedDialog(context, featureName: 'ai-chat');
      return;
    }

    HapticFeedback.lightImpact();
    _questionCtrl.clear();

    setState(() {
      _chatMessages.add(_ScannerChat(role: _ChatRole.user, text: question));
      _isScanning = true;
    });
    _scrollToBottom();
    ref.read(behaviorTrackingProvider).trackAIChatQuery(question);

    try {
      final bytes = await File(_capturedImagePath!).readAsBytes();
      final base64Image = base64Encode(bytes);

      final gemini = ref.read(geminiServiceProvider);
      final chatContext = _chatMessages
          .map((m) => '${m.role == _ChatRole.user ? "User" : "AI"}: ${m.text}')
          .join('\n');

      final response = await gemini.analyzeImage(
        base64Image: base64Image,
        mimeType: 'image/jpeg',
        prompt: _buildFollowUpPrompt(chatContext, question),
      );
      final cleaned = _cleanScannerAnswer(response);

      setState(() {
        _chatMessages.add(_ScannerChat(role: _ChatRole.ai, text: cleaned));
      });
      await _persistScannerConversation();
    } catch (e) {
      setState(() {
        _chatMessages.add(
          _ScannerChat(
            role: _ChatRole.ai,
            text: _uiText(
              tr: 'Üzgünüm, bu isteği işleyemedim. Tekrar deneyin.',
              en: 'Sorry, I couldn\'t process that. Try again.',
            ),
          ),
        );
      });
    } finally {
      setState(() => _isScanning = false);
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: 300.ms,
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _resetScanner() {
    HapticFeedback.mediumImpact();
    setState(() {
      _hasResult = false;
      _capturedImagePath = null;
      _scanInsight = null;
      _linkedConversationId = null;
      _chatMessages.clear();
    });
  }

  String _buildScanPrompt() {
    return '''
You are Qor AI visual shopping assistant.

Task:
- Decide whether the main subject is a real consumer product that can be identified for shopping.
- If the image is mostly a wall, floor, person, pet, furniture, random object, abstract scene, screenshot, or too dark/blurry to verify, mark it as not a product.
- If lighting is too low or the product is not visible enough, say so clearly.

Return ONLY valid JSON with this exact shape:
{
  "isProduct": true,
  "lowLight": false,
  "confidence": 0,
  "title": "",
  "brand": "",
  "category": "",
  "summary": "",
  "highlights": ["", "", ""],
  "priceBand": "",
  "verdict": "",
  "reason": ""
}

Rules:
- Use plain natural $_responseLanguageName text values inside JSON.
- No markdown, no code fences, no bullet symbols inside fields.
- Use proper Turkish characters when the response language is Turkish.
- If not a product, set isProduct=false and explain briefly in "reason".
- If low light or unclear, set lowLight=true.
- Keep summary and verdict concise and high quality.
''';
  }

  String _buildFollowUpPrompt(String chatContext, String question) {
    final insight = _scanInsight;
    return '''
You are Qor AI, a premium product advisor inside the Visual Scanner flow.

Confirmed product context:
- Title: ${insight?.title ?? '-'}
- Brand: ${insight?.brand ?? '-'}
- Category: ${insight?.category ?? '-'}
- Summary: ${insight?.summary ?? '-'}
- Verdict: ${insight?.verdict ?? '-'}

User profile context:
${_buildUserProfileContext()}

Conversation so far:
$chatContext

User question:
$question

Instructions:
- Answer only about the product visible in the image.
- Be direct, premium-quality, useful, and natural.
- No JSON, no markdown tables, no code fences.
- Prefer clear advice over generic filler.
- If something is uncertain, say that briefly instead of inventing.
- Respond in $_responseLanguageName using proper Turkish characters when Turkish is selected.
''';
  }

  String _buildUserProfileContext() {
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null) return '-';

    final lines = <String>[];
    if (user.ecosystem.trim().isNotEmpty) {
      lines.add('Ecosystem: ${user.ecosystem}');
    }
    if (user.budgetRange.trim().isNotEmpty) {
      lines.add('Budget: ${user.budgetRange}');
    }
    if ((user.usageIntent ?? '').trim().isNotEmpty) {
      lines.add('Usage intent: ${user.usageIntent}');
    }
    if (user.priorities.isNotEmpty) {
      lines.add('Priorities: ${user.priorities.join(', ')}');
    }
    if (user.currentDevices.isNotEmpty) {
      lines.add('Current devices: ${user.currentDevices.join(', ')}');
    }
    if (user.interestCategories.isNotEmpty) {
      lines.add('Interest categories: ${user.interestCategories.join(', ')}');
    }
    return lines.isEmpty ? '-' : lines.join('\n');
  }

  _ScannerInsight _parseScannerInsight(String raw) {
    final jsonMap = _tryExtractJson(raw);
    if (jsonMap == null) {
      return _fallbackScannerInsight(raw);
    }
    final highlights = ((jsonMap['highlights'] as List?) ?? const [])
        .map((item) => _cleanScannerAnswer(item.toString()))
        .where((item) => item.trim().isNotEmpty)
        .take(4)
        .toList();
    return _ScannerInsight(
      isProduct: jsonMap['isProduct'] == true,
      lowLight: jsonMap['lowLight'] == true,
      confidence: (jsonMap['confidence'] as num?)?.toInt() ?? 0,
      title: _cleanScannerAnswer((jsonMap['title'] ?? '').toString()),
      brand: _cleanScannerAnswer((jsonMap['brand'] ?? '').toString()),
      category: _cleanScannerAnswer((jsonMap['category'] ?? '').toString()),
      summary: _cleanScannerAnswer((jsonMap['summary'] ?? '').toString()),
      highlights: highlights,
      priceBand: _cleanScannerAnswer((jsonMap['priceBand'] ?? '').toString()),
      verdict: _cleanScannerAnswer((jsonMap['verdict'] ?? '').toString()),
      reason: _cleanScannerAnswer((jsonMap['reason'] ?? '').toString()),
    );
  }

  _ScannerInsight _fallbackScannerInsight(String raw) {
    final cleaned = _cleanScannerAnswer(raw);
    final normalized = cleaned.toLowerCase();
    final lowLight = [
      'low light',
      'too dark',
      'dark frame',
      'karanlık',
      'çok karanlık',
      'net değil',
      'bulanık',
      'unclear',
      'blurry',
    ].any(normalized.contains);

    final reason = cleaned.isNotEmpty
        ? cleaned
        : _uiText(
            tr: 'Ürün doğrulanamadı. Lütfen ışığı artırıp ürünü kadrajın merkezine alarak tekrar tara.',
            en: 'The product could not be verified. Increase the light, center the item, and scan again.',
          );

    return _ScannerInsight(
      isProduct: false,
      lowLight: lowLight,
      confidence: 0,
      title: '',
      brand: '',
      category: '',
      summary: '',
      highlights: const [],
      priceBand: '',
      verdict: '',
      reason: reason,
    );
  }

  Map<String, dynamic>? _tryExtractJson(String raw) {
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {}
    final start = raw.indexOf('{');
    final end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      final candidate = raw.substring(start, end + 1);
      try {
        return Map<String, dynamic>.from(jsonDecode(candidate) as Map);
      } catch (_) {}
    }
    return null;
  }

  String _cleanScannerAnswer(String text) {
    var cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replaceAll(RegExp(r'^```[a-zA-Z]*\s*'), '');
      cleaned = cleaned.replaceAll(RegExp(r'```$'), '');
    }
    cleaned = cleaned.replaceAll(RegExp(r'^\s*[*#\-]+\s*', multiLine: true), '');
    cleaned = cleaned.replaceAllMapped(
      RegExp(r'^\s*\d+[\.)]\s*', multiLine: true),
      (_) => '',
    );
    cleaned = cleaned.replaceAll('**', '');
    return cleaned.trim();
  }

  String _buildInitialMessage(_ScannerInsight insight) {
    if (!insight.isProduct) {
      return insight.lowLight
          ? _uiText(
              tr: 'Bu kare çok karanlık veya net değil. Ürünü doğrulayamıyorum. Işığı artırıp ürünü kadrajın merkezine alarak tekrar tara.',
              en: 'This frame is too dark or unclear. I cannot verify the product. Increase the light and place the item in the center, then scan again.',
            )
          : (insight.reason.isNotEmpty
                ? insight.reason
                : _uiText(
                    tr: 'Bu görüntüde tanımlanabilir bir ürün göremedim. Duvar, masa, oda gibi ürün olmayan karelerde analiz yapmıyorum.',
                    en: 'I could not find an identifiable product in this image. I do not run product analysis on non-product scenes like walls, desks, or rooms.',
                  ));
    }

    final lines = <String>[];
    final titleLine = [
      if (insight.title.isNotEmpty) insight.title,
      if (insight.brand.isNotEmpty && !insight.title.toLowerCase().contains(insight.brand.toLowerCase())) insight.brand,
    ].join(' · ');
    if (titleLine.isNotEmpty) lines.add(titleLine);
    if (insight.summary.isNotEmpty) lines.add(insight.summary);
    if (insight.highlights.isNotEmpty) {
      lines.add(insight.highlights.map((item) => '• $item').join('\n'));
    }
    final footer = <String>[];
    if (insight.priceBand.isNotEmpty) {
      footer.add('${_uiText(tr: 'Fiyat', en: 'Price')}: ${insight.priceBand}');
    }
    if (insight.verdict.isNotEmpty) {
      footer.add(
        '${_uiText(tr: 'Qor AI yorumu', en: 'Qor AI take')}: ${insight.verdict}',
      );
    }
    if (footer.isNotEmpty) lines.add(footer.join('\n'));
    return lines.join('\n\n').trim();
  }

  Future<void> _persistScannerConversation() async {
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null || _chatMessages.isEmpty) return;
    final ds = ref.read(pbDataSourceProvider);
    final messages = _chatMessages
        .map(
          (msg) => PersistedChatMsg(
            id: '${msg.timestamp.millisecondsSinceEpoch}_${msg.role.name}',
            role: msg.role == _ChatRole.user
                ? PersistedMsgRole.user
                : PersistedMsgRole.ai,
            text: msg.text,
            timestamp: msg.timestamp,
          ),
        )
        .toList();
    final title = _scanInsight?.title.isNotEmpty == true
        ? _uiText(tr: 'Görsel Tarayıcı · ', en: 'Visual Scanner · ') +
            _scanInsight!.title
        : _uiText(tr: 'Görsel Tarayıcı', en: 'Visual Scanner');
    if (_linkedConversationId == null) {
      final conv = ChatConversation(
        id: '',
        userId: user.uid,
        title: title,
        messages: messages,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      _linkedConversationId = await ds.createChatConversation(conv);
      return;
    }
    await ds.updateChatConversation(user.uid, _linkedConversationId!, messages, title);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Camera preview or captured image
          if (_hasResult && _capturedImagePath != null)
            Positioned.fill(
              child: Image.file(File(_capturedImagePath!), fit: BoxFit.cover),
            )
          else if (_isCameraReady && _camCtrl != null)
            Positioned.fill(child: CameraPreview(_camCtrl!))
          else
            const Positioned.fill(
              child: Center(
                child: CircularProgressIndicator(color: AppTheme.neonCyan),
              ),
            ),

          // Dark overlay when result shown
          if (_hasResult)
            Positioned.fill(
              child: Container(color: Colors.black.withValues(alpha: 0.7)),
            ),

          // Scan animation overlay
          if (_isScanning && !_hasResult) _buildScanOverlay(),

          // Top bar
          _buildTopBar(),

          // Bottom: scan button or results
          if (!_hasResult) _buildScanButton() else _buildResultSheet(),
        ],
      ),
    );
  }

  Widget _buildTopBar() {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.arrow_back_rounded,
                    color: Colors.white,
                    size: 22,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  _uiText(tr: 'Görsel Tarayıcı', en: 'Visual Scanner'),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              if (_hasResult)
                GestureDetector(
                  onTap: _resetScanner,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.refresh_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildScanOverlay() {
    return Positioned.fill(
      child: AnimatedBuilder(
        animation: _scanAnimCtrl,
        builder: (context, child) {
          return CustomPaint(
            painter: _ScanLinePainter(
              progress: _scanAnimCtrl.value,
              color: AppTheme.neonCyan,
            ),
          );
        },
      ),
    );
  }

  Widget _buildScanButton() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!_isScanning)
                Text(
                  _uiText(
                    tr: 'Taramak için kamerası ürüne doğrultun',
                    en: 'Point camera at a product to scan',
                  ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    color: Colors.white.withValues(alpha: 0.8),
                    fontWeight: FontWeight.w500,
                  ),
                ).animate().fadeIn(duration: 500.ms),
              const SizedBox(height: 20),
              GestureDetector(
                onTap: _isScanning ? null : _captureAndScan,
                child: AnimatedContainer(
                  duration: 300.ms,
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: _isScanning
                        ? null
                        : const LinearGradient(
                            colors: [AppTheme.brandBlue, AppTheme.neonCyan],
                          ),
                    color: _isScanning
                        ? Colors.white.withValues(alpha: 0.2)
                        : null,
                    boxShadow: _isScanning
                        ? []
                        : [
                            BoxShadow(
                              color: AppTheme.neonCyan.withValues(alpha: 0.4),
                              blurRadius: 20,
                              spreadRadius: 2,
                            ),
                          ],
                  ),
                  child: _isScanning
                      ? const Padding(
                          padding: EdgeInsets.all(20),
                          child: CircularProgressIndicator(
                            color: AppTheme.neonCyan,
                            strokeWidth: 3,
                          ),
                        )
                      : const Icon(
                          Icons.document_scanner_rounded,
                          color: Colors.white,
                          size: 32,
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildResultSheet() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.65,
        ),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 20,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              margin: const EdgeInsets.only(top: 12),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.dividerColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // Title
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.auto_awesome,
                      color: Colors.white,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _uiText(tr: 'Tarama Sonucu', en: 'Scan Result'),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                        ),
                        if (_scanInsight?.isConfirmedProduct ?? false)
                          Text(
                            _scanInsight?.title.isNotEmpty == true
                                ? _scanInsight!.title
                                : _uiText(tr: 'Ürün doğrulandı', en: 'Product verified'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.neonCyan,
                            ),
                          )
                        else
                          Text(
                            _uiText(
                              tr: 'Net ürün algısı yok',
                              en: 'No clear product detected',
                            ),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: context.textSecondary,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            if (_scanInsight != null) _buildInsightCard(),
            // Chat messages
            Flexible(
              child: ListView.builder(
                controller: _scrollCtrl,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                itemCount: _chatMessages.length + (_isScanning ? 1 : 0),
                itemBuilder: (context, i) {
                  if (i == _chatMessages.length && _isScanning) {
                    return _buildThinkingBubble();
                  }
                  return _buildChatBubble(_chatMessages[i]);
                },
              ),
            ),
            // Follow-up input
            _buildFollowUpInput(),
          ],
        ),
      ).animate().slideY(begin: 0.3, duration: 400.ms, curve: Curves.easeOut),
    );
  }

  Widget _buildInsightCard() {
    final insight = _scanInsight!;
    final chips = <String>[
      if (insight.category.isNotEmpty) insight.category,
      if (insight.priceBand.isNotEmpty) insight.priceBand,
      if (insight.confidence > 0)
        '${_uiText(tr: 'Güven', en: 'Confidence')} ${insight.confidence}%',
    ];
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 14, 16, 2),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.brandBlue.withValues(alpha: 0.10),
            AppTheme.neonCyan.withValues(alpha: 0.08),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: (_scanInsight?.isConfirmedProduct ?? false)
              ? AppTheme.neonCyan.withValues(alpha: 0.20)
              : context.dividerColor.withValues(alpha: 0.6),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.75),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  insight.isConfirmedProduct
                      ? Icons.shopping_bag_rounded
                      : Icons.visibility_off_rounded,
                  color: insight.isConfirmedProduct
                      ? AppTheme.brandBlue
                      : context.textSecondary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  insight.isConfirmedProduct
                      ? (insight.title.isNotEmpty
                            ? insight.title
                            : _uiText(tr: 'Ürün bulundu', en: 'Product found'))
                      : _uiText(
                          tr: 'Ürün doğrulanamadı',
                          en: 'Product could not be verified',
                        ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          if (chips.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: chips
                  .map(
                    (chip) => Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.72),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        chip,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildChatBubble(_ScannerChat msg) {
    final isUser = msg.role == _ChatRole.user;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.8,
        ),
        decoration: BoxDecoration(
          gradient: isUser
              ? LinearGradient(
                  colors: [
                    AppTheme.brandBlue.withValues(alpha: 0.18),
                    AppTheme.neonCyan.withValues(alpha: 0.12),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : LinearGradient(
                  colors: [
                    context.surfaceVariantColor,
                    context.surfaceVariantColor.withValues(alpha: 0.92),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
          border: Border.all(
            color: isUser
                ? AppTheme.brandBlue.withValues(alpha: 0.24)
                : context.dividerColor.withValues(alpha: 0.45),
          ),
        ),
        child: SelectableText(
          msg.text,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13.5,
            height: 1.5,
            color: context.textPrimary,
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildThinkingBubble() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.neonCyan.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              _uiText(tr: 'Analiz ediliyor...', en: 'Analyzing...'),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                color: context.textSecondary,
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 200.ms);
  }

  Widget _buildFollowUpInput() {
    final canChat = _scanInsight?.isConfirmedProduct ?? false;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(color: context.dividerColor.withValues(alpha: 0.5)),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!canChat)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: context.dividerColor.withValues(alpha: 0.55)),
                ),
                child: Text(
                  _uiText(
                    tr: 'Bu alanda yalnızca doğrulanmış ürünlerle sohbet açılır. Ürünü daha net ışıkta tekrar tarayın.',
                    en: 'Chat opens here only for verified products. Re-scan the item with clearer light.',
                  ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    height: 1.45,
                    color: context.textSecondary,
                  ),
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: Container(
                    constraints: const BoxConstraints(
                      minHeight: 40,
                      maxHeight: 100,
                    ),
                    decoration: BoxDecoration(
                      color: context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: context.dividerColor.withValues(alpha: 0.5),
                      ),
                    ),
                    child: TextField(
                      controller: _questionCtrl,
                      enabled: canChat,
                      maxLines: null,
                      onSubmitted: (v) => _askFollowUp(v),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        color: context.textPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText: _uiText(
                          tr: canChat
                              ? 'Bu ürün hakkında soru sorun...'
                              : 'Önce ürün tarayın...'
                              ,
                          en: 'Ask about this product...',
                        ),
                        hintStyle: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          color: context.textTertiaryColor,
                        ),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: canChat ? () => _askFollowUp(_questionCtrl.text) : null,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: canChat
                          ? AppTheme.primaryGradient
                          : LinearGradient(
                              colors: [
                                context.dividerColor,
                                context.dividerColor,
                              ],
                            ),
                    ),
                    child: const Icon(
                      Icons.arrow_upward_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

}

// ─── Scan line painter ──────────────────────────────────────────────────────

class _ScanLinePainter extends CustomPainter {
  final double progress;
  final Color color;

  _ScanLinePainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final horizontalInset = size.width * 0.14;
    final topInset = size.height * 0.14;
    final bottomY = size.height * 0.76;
    const cornerLength = 32.0;
    final frameHeight = bottomY - topInset;
    final y = topInset + frameHeight * progress;

    // Scan line (constrained to bracket area)
    final linePaint = Paint()
      ..shader =
          LinearGradient(
            colors: [
              color.withValues(alpha: 0.0),
              color.withValues(alpha: 0.8),
              color.withValues(alpha: 0.0),
            ],
          ).createShader(
            Rect.fromLTWH(
              horizontalInset,
              y - 1,
              size.width - 2 * horizontalInset,
              2,
            ),
          );
    canvas.drawRect(
      Rect.fromLTWH(
        horizontalInset,
        y - 1,
        size.width - 2 * horizontalInset,
        2,
      ),
      linePaint,
    );

    // Corner brackets
    final cornerPaint = Paint()
      ..color = color
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    // Top-left
    canvas.drawLine(
      Offset(horizontalInset, topInset),
      Offset(horizontalInset + cornerLength, topInset),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(horizontalInset, topInset),
      Offset(horizontalInset, topInset + cornerLength),
      cornerPaint,
    );
    // Top-right
    canvas.drawLine(
      Offset(size.width - horizontalInset, topInset),
      Offset(size.width - horizontalInset - cornerLength, topInset),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(size.width - horizontalInset, topInset),
      Offset(size.width - horizontalInset, topInset + cornerLength),
      cornerPaint,
    );
    // Bottom-left
    canvas.drawLine(
      Offset(horizontalInset, bottomY),
      Offset(horizontalInset + cornerLength, bottomY),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(horizontalInset, bottomY),
      Offset(horizontalInset, bottomY - cornerLength),
      cornerPaint,
    );
    // Bottom-right
    canvas.drawLine(
      Offset(size.width - horizontalInset, bottomY),
      Offset(size.width - horizontalInset - cornerLength, bottomY),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(size.width - horizontalInset, bottomY),
      Offset(size.width - horizontalInset, bottomY - cornerLength),
      cornerPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _ScanLinePainter oldDelegate) =>
      oldDelegate.progress != progress;
}

// ─── Data models ────────────────────────────────────────────────────────────

enum _ChatRole { user, ai }

class _ScannerChat {
  final _ChatRole role;
  final String text;
  final DateTime timestamp;
  _ScannerChat({
    required this.role,
    required this.text,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();
}

class _ScannerInsight {
  final bool isProduct;
  final bool lowLight;
  final int confidence;
  final String title;
  final String brand;
  final String category;
  final String summary;
  final List<String> highlights;
  final String priceBand;
  final String verdict;
  final String reason;

  const _ScannerInsight({
    required this.isProduct,
    required this.lowLight,
    required this.confidence,
    required this.title,
    required this.brand,
    required this.category,
    required this.summary,
    required this.highlights,
    required this.priceBand,
    required this.verdict,
    required this.reason,
  });

  bool get isConfirmedProduct => isProduct && !lowLight && confidence >= 55;
}
