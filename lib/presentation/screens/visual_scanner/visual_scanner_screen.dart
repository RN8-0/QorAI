/// Visual Scanner — Camera-based product identification & Q&A
/// Uses Gemini multimodal (vision) for image analysis
library;

import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/providers/providers.dart';
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

    HapticFeedback.heavyImpact();
    setState(() {
      _isScanning = true;
      _hasResult = false;
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
        prompt:
            'Identify this product precisely. Tell me:\n'
            '1. Product name and brand\n'
            '2. Key specifications\n'
            '3. Approximate price range\n'
            '4. Quick verdict (is it worth buying?)\n\n'
            'Be concise but informative. Use bullet points.',
      );

      setState(() {
        _hasResult = true;
        _chatMessages.add(_ScannerChat(role: _ChatRole.ai, text: response));
      });
    } catch (e) {
      setState(() {
        _hasResult = true;
        _chatMessages.add(_ScannerChat(
            role: _ChatRole.ai,
            text: 'Could not analyze the image. Please try again.'));
      });
    } finally {
      _scanAnimCtrl.stop();
      setState(() => _isScanning = false);
    }
  }

  Future<void> _askFollowUp(String question) async {
    if (question.trim().isEmpty || _capturedImagePath == null) return;

    HapticFeedback.lightImpact();
    _questionCtrl.clear();

    setState(() {
      _chatMessages.add(_ScannerChat(role: _ChatRole.user, text: question));
      _isScanning = true;
    });
    _scrollToBottom();

    try {
      final bytes = await File(_capturedImagePath!).readAsBytes();
      final base64Image = base64Encode(bytes);

      final gemini = ref.read(geminiServiceProvider);
      final chatContext = _chatMessages
          .map((m) =>
              '${m.role == _ChatRole.user ? "User" : "AI"}: ${m.text}')
          .join('\n');

      final response = await gemini.analyzeImage(
        base64Image: base64Image,
        mimeType: 'image/jpeg',
        prompt:
            'Previous conversation about this product:\n$chatContext\n\n'
            'User\'s follow-up question: $question\n\n'
            'Answer concisely based on the product in the image.',
      );

      setState(() {
        _chatMessages.add(_ScannerChat(role: _ChatRole.ai, text: response));
      });
    } catch (e) {
      setState(() {
        _chatMessages.add(_ScannerChat(
            role: _ChatRole.ai,
            text: 'Sorry, I couldn\'t process that. Try again.'));
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
      _chatMessages.clear();
    });
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
              child:
                  Center(child: CircularProgressIndicator(color: AppTheme.neonCyan)),
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
                  child: const Icon(Icons.arrow_back_rounded,
                      color: Colors.white, size: 22),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Visual Scanner',
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
                    child: const Icon(Icons.refresh_rounded,
                        color: Colors.white, size: 22),
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
                  'Point camera at a product to scan',
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
                            colors: [AppTheme.brandBlue, AppTheme.neonCyan]),
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
                      : const Icon(Icons.document_scanner_rounded,
                          color: Colors.white, size: 32),
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
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
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
                    child: const Icon(Icons.auto_awesome,
                        color: Colors.white, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Scan Result',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            // Chat messages
            Flexible(
              child: ListView.builder(
                controller: _scrollCtrl,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
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

  Widget _buildChatBubble(_ScannerChat msg) {
    final isUser = msg.role == _ChatRole.user;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.8,
        ),
        decoration: BoxDecoration(
          color: isUser
              ? AppTheme.brandBlue.withValues(alpha: 0.15)
              : context.surfaceVariantColor,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
          border: isUser
              ? Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.3))
              : null,
        ),
        child: SelectableText(
          msg.text,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13,
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
              'Analyzing...',
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
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
                color: context.dividerColor.withValues(alpha: 0.5)),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Container(
                constraints:
                    const BoxConstraints(minHeight: 40, maxHeight: 100),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                      color: context.dividerColor.withValues(alpha: 0.5)),
                ),
                child: TextField(
                  controller: _questionCtrl,
                  maxLines: null,
                  onSubmitted: (v) => _askFollowUp(v),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    color: context.textPrimary,
                  ),
                  decoration: InputDecoration(
                    hintText: 'Ask about this product...',
                    hintStyle: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      color: context.textTertiaryColor,
                    ),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => _askFollowUp(_questionCtrl.text),
              child: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppTheme.primaryGradient,
                ),
                child: const Icon(Icons.arrow_upward_rounded,
                    color: Colors.white, size: 20),
              ),
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
    final y = size.height * progress;

    // Scan line
    final linePaint = Paint()
      ..shader = LinearGradient(
        colors: [
          color.withValues(alpha: 0.0),
          color.withValues(alpha: 0.8),
          color.withValues(alpha: 0.0),
        ],
      ).createShader(Rect.fromLTWH(0, y - 1, size.width, 2));
    canvas.drawRect(Rect.fromLTWH(0, y - 1, size.width, 2), linePaint);

    // Glow area above scan line
    final glowPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          color.withValues(alpha: 0.0),
          color.withValues(alpha: 0.08),
        ],
      ).createShader(Rect.fromLTWH(0, y - 60, size.width, 60));
    canvas.drawRect(Rect.fromLTWH(0, y - 60, size.width, 60), glowPaint);

    // Corner brackets
    final cornerPaint = Paint()
      ..color = color
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    const m = 40.0;
    const l = 30.0;

    // Top-left
    canvas.drawLine(Offset(m, m), Offset(m + l, m), cornerPaint);
    canvas.drawLine(Offset(m, m), Offset(m, m + l), cornerPaint);
    // Top-right
    canvas.drawLine(
        Offset(size.width - m, m), Offset(size.width - m - l, m), cornerPaint);
    canvas.drawLine(Offset(size.width - m, m),
        Offset(size.width - m, m + l), cornerPaint);
    // Bottom-left
    canvas.drawLine(Offset(m, size.height - m),
        Offset(m + l, size.height - m), cornerPaint);
    canvas.drawLine(Offset(m, size.height - m),
        Offset(m, size.height - m - l), cornerPaint);
    // Bottom-right
    canvas.drawLine(Offset(size.width - m, size.height - m),
        Offset(size.width - m - l, size.height - m), cornerPaint);
    canvas.drawLine(Offset(size.width - m, size.height - m),
        Offset(size.width - m, size.height - m - l), cornerPaint);
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
  const _ScannerChat({required this.role, required this.text});
}
