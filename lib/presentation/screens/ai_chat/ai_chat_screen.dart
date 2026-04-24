import 'dart:io';

import 'package:qor_ai/core/app_keys.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/data/models/chat_conversation.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/screens/ai_chat/chat_history_screen.dart';
import 'package:qor_ai/presentation/widgets/qor_badges.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

// ─── Main Screen ─────────────────────────────────────────────────────────────

class AIChatScreen extends ConsumerStatefulWidget {
  final String? initialQuery;
  final bool isOverlay;
  final VoidCallback? onClose;
  final Map<String, dynamic>? pageContext;
  const AIChatScreen({
    super.key,
    this.initialQuery,
    this.isOverlay = false,
    this.onClose,
    this.pageContext,
  });
  @override
  ConsumerState<AIChatScreen> createState() => _AIChatScreenState();
}

class _AIChatScreenState extends ConsumerState<AIChatScreen>
    with TickerProviderStateMixin {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final _focusNode = FocusNode();
  late AnimationController _pulseCtrl;

  // Voice chat
  final stt.SpeechToText _speech = stt.SpeechToText();
  bool _isListening = false;
  bool _speechAvailable = false;


  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1500))
      ..repeat(reverse: true);
    _initSpeech();
    // Auto-send initial query if provided
    if (widget.initialQuery != null && widget.initialQuery!.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _send(widget.initialQuery!);
      });
    }
  }

  Future<void> _initSpeech() async {
    _speechAvailable = await _speech.initialize(
      onError: (_) => setState(() => _isListening = false),
      onStatus: (status) {
        if (status == 'done' || status == 'notListening') {
          setState(() => _isListening = false);
        }
      },
    );
  }

  void _toggleListening() async {
    HapticFeedback.mediumImpact();
    if (_isListening) {
      await _speech.stop();
      setState(() => _isListening = false);
      if (_ctrl.text.trim().isNotEmpty) {
        _send(_ctrl.text);
      }
    } else if (_speechAvailable) {
      setState(() => _isListening = true);
      await _speech.listen(
        onResult: (result) {
          setState(() {
            _ctrl.text = result.recognizedWords;
          });
          if (result.finalResult && result.recognizedWords.isNotEmpty) {
            _send(result.recognizedWords);
            setState(() => _isListening = false);
          }
        },
        listenFor: const Duration(seconds: 30),
        pauseFor: const Duration(seconds: 3),
        localeId: _getUserLocale(),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(context.l10n?.speechNotAvailable ?? 'Speech recognition not available on this device'),
        behavior: SnackBarBehavior.floating));
    }
  }

  @override
  void dispose() {
    _speech.stop();
    _ctrl.dispose();
    _scroll.dispose();
    _focusNode.dispose();
    _pulseCtrl.dispose();
    super.dispose();
  }

  String _getUserLocale() {
    // Prefer app UI locale (localeProvider) over user profile language
    final appLocale = ref.read(localeProvider);
    const localeMap = {
      'tr': 'tr-TR', 'de': 'de-DE', 'fr': 'fr-FR', 'es': 'es-ES',
      'pt': 'pt-BR', 'it': 'it-IT', 'ja': 'ja-JP', 'ko': 'ko-KR',
      'zh': 'zh-CN', 'ar': 'ar-SA', 'ru': 'ru-RU', 'hi': 'hi-IN',
      'nl': 'nl-NL', 'pl': 'pl-PL', 'sv': 'sv-SE', 'en': 'en-US',
    };
    if (appLocale != null) {
      return localeMap[appLocale.languageCode] ?? 'en-US';
    }
    // Fallback to user profile language
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null) return 'en-US';
    return localeMap[user.language] ?? 'en-US';
  }

  // ─── Send message ─────────────────────────────────────────────────────────

  Future<void> _send(String text) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    HapticFeedback.lightImpact();
    ref.read(behaviorTrackingProvider).trackAIChatQuery(trimmed);

    _ctrl.clear();

    await ref.read(chatSessionProvider.notifier).send(
      trimmed,
      pageContext: widget.pageContext,
    );

    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(0, duration: 300.ms, curve: Curves.easeOut);
      }
    });
  }

  // ─── BUILD ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatSessionProvider);
    final bottom = widget.isOverlay ? 0.0 : MediaQuery.of(context).padding.bottom;

    if (widget.isOverlay) {
      return SizedBox.expand(
        child: Column(children: [
          _buildHeader(context),
          Expanded(child: _buildMessageList(chatState)),
          _buildInputArea(bottom),
        ]),
      );
    }

    return Scaffold(
      backgroundColor: context.surfaceVariantColor,
      body: Column(children: [
        _buildHeader(context),
        Expanded(child: _buildMessageList(chatState)),
        _buildInputArea(bottom),
      ]),
    );
  }

  // ─── Header ───────────────────────────────────────────────────────────────

  Widget _buildHeader(BuildContext context) {
    final top = widget.isOverlay ? 0.0 : MediaQuery.of(context).padding.top;
    final sub = ref.watch(subscriptionServiceProvider);
    final aiChatCost = sub.creditCostForFeature('ai_chat');
    return Container(
      padding: EdgeInsets.only(top: top + 10, bottom: 10, left: 16, right: 12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        border: Border(bottom: BorderSide(color: context.dividerColor.withValues(alpha: 0.3))),
      ),
      child: Row(children: [
        // Left button: hamburger (full screen only)
        if (!widget.isOverlay) ...[
          GestureDetector(
            onTap: () => mainShellScaffoldKey.currentState?.openDrawer(),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.dividerColor.withValues(alpha: 0.5))),
              child: Icon(Icons.menu_rounded, size: 18, color: context.textSecondary),
            ),
          ),
          const SizedBox(width: 10),
        ],
        // "Qor AI" title — no logo, no subtitle
        Expanded(
          child: Text.rich(
            TextSpan(
              style: GoogleFonts.plusJakartaSans(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: context.textPrimary,
              ),
              children: const [
                TextSpan(text: 'Qor '),
                TextSpan(text: 'AI'),
              ],
            ),
          ),
        ),
        if (!sub.isPremium) ...[
          QorBalanceBadge(
            remaining: sub.remainingDailyCredits,
            total: AppConstants.freeDailyAiCreditLimit,
            unlimited: false,
            color: AppTheme.accentCyan,
            fontSize: 9,
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
          ),
          const SizedBox(width: 6),
          QorAmountBadge(
            amount: aiChatCost,
            unlimited: false,
            color: AppTheme.accentCyan,
            fontSize: 10,
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          ),
          const SizedBox(width: 8),
        ],
        // Right: home (full screen only)
        if (!widget.isOverlay) ...[
          GestureDetector(
            onTap: () => context.go(AppRoutes.home),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.dividerColor.withValues(alpha: 0.5))),
              child: Icon(Icons.home_rounded, size: 18, color: context.textSecondary),
            ),
          ),
          const SizedBox(width: 8),
        ],
        // History button
        GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => const ChatHistoryScreen(),
              ),
            );
          },
          child: Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: context.dividerColor.withValues(alpha: 0.5))),
            child: Icon(Icons.history_rounded,
                size: 18, color: context.textSecondary),
          ),
        ),
        const SizedBox(width: 8),
        // New / clear chat
        GestureDetector(
          onTap: () {
            HapticFeedback.mediumImpact();
            ref.read(chatSessionProvider.notifier).newConversation();
          },
          child: Icon(Icons.refresh_rounded,
              size: 20, color: context.textTertiaryColor),
        ),
        if (widget.isOverlay && widget.onClose != null) ...[
          const SizedBox(width: 14),
          GestureDetector(
            onTap: widget.onClose,
            child: Icon(Icons.close_rounded, size: 20, color: context.textTertiaryColor),
          ),
        ],
        const SizedBox(width: 4),
      ]),
    );
  }

  // ─── Message List ─────────────────────────────────────────────────────────

  Widget _buildMessageList(ChatSessionState chatState) {
    final msgs = chatState.messages;
    final isLoading = chatState.isLoading;
    return ListView.builder(
      controller: _scroll,
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      itemCount: msgs.length + (isLoading ? 1 : 0),
      itemBuilder: (context, i) {
        if (isLoading && i == 0) return _buildTypingIndicator();
        final msg = msgs[isLoading ? i - 1 : i];
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _BubbleWidget(
            msg: msg,
            onCopy: () {
              Clipboard.setData(ClipboardData(text: msg.text));
              HapticFeedback.lightImpact();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    context.l10n?.copiedToClipboard ?? 'Copied to clipboard',
                    style: GoogleFonts.plusJakartaSans(fontSize: 13),
                  ),
                  behavior: SnackBarBehavior.floating,
                  duration: const Duration(seconds: 1),
                ),
              );
            },
          ),
        ).animate().fadeIn(duration: 300.ms).slideY(
            begin: msg.role == PersistedMsgRole.user ? 0.1 : -0.05);
      },
    );
  }

  // ─── Typing Indicator ─────────────────────────────────────────────────────

  Widget _buildTypingIndicator() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8, right: 80),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.04),
              blurRadius: 6)]),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          _AnimatedDot(delay: 0, controller: _pulseCtrl),
          const SizedBox(width: 4),
          _AnimatedDot(delay: 200, controller: _pulseCtrl),
          const SizedBox(width: 4),
          _AnimatedDot(delay: 400, controller: _pulseCtrl),
          const SizedBox(width: 8),
          Text(context.l10n?.thinking ?? 'Thinking...', style: GoogleFonts.plusJakartaSans(
              fontSize: 12, color: context.textSecondary)),
        ]),
      ),
    ).animate().fadeIn(duration: 200.ms);
  }

  // ─── Input Area ───────────────────────────────────────────────────────────

  Widget _buildInputArea(double bottomPadding) {
    final hasText = _ctrl.text.trim().isNotEmpty;
    // When keyboard is open, don't add navBar clearance (avoids overflow)
    final keyboardOpen = MediaQuery.of(context).viewInsets.bottom > 0;
    final extraBottom = (widget.isOverlay || keyboardOpen) ? 0.0 : AppTheme.navBarHeight;
    return Container(
      padding: EdgeInsets.only(
          left: 12, right: 12, top: 8,
          bottom: widget.isOverlay ? 10 : (bottomPadding + extraBottom + 12)),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        boxShadow: [
          BoxShadow(color: AppTheme.brandBlue.withValues(alpha: 0.06),
              blurRadius: 16, offset: const Offset(0, -4)),
          BoxShadow(color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 8, offset: const Offset(0, -2)),
        ]),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          // Pill-shaped text field
          Expanded(child: Container(
            constraints: const BoxConstraints(minHeight: 40, maxHeight: 120),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _focusNode.hasFocus
                    ? AppTheme.accentCyan.withValues(alpha: 0.45)
                    : context.dividerColor.withValues(alpha: 0.5),
                width: _focusNode.hasFocus ? 1.5 : 1),
              boxShadow: _focusNode.hasFocus
                  ? [BoxShadow(
                      color: AppTheme.accentCyan.withValues(alpha: 0.07),
                      blurRadius: 8)]
                  : []),
            child: TextField(
              controller: _ctrl,
              focusNode: _focusNode,
              maxLines: null,
              onChanged: (_) => setState(() {}),
              onSubmitted: (_) { if (hasText) _send(_ctrl.text); },
              style: GoogleFonts.plusJakartaSans(fontSize: 14,
                  color: context.textPrimary),
              decoration: InputDecoration(
                hintText: context.l10n?.askMeAnything ?? 'Ask me anything...',
                hintStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 14, color: context.textTertiaryColor),
                border: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 10)),
            ),
          )),
          const SizedBox(width: 8),

          // Voice / Send button
          hasText
            ? GestureDetector(
              onTap: () => _send(_ctrl.text),
              child: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppTheme.primaryGradient,
                  boxShadow: [BoxShadow(
                    color: AppTheme.brandBlue.withValues(alpha: 0.35),
                    blurRadius: 10, offset: const Offset(0, 3))]),
                child: Icon(Icons.arrow_upward_rounded,
                    size: 22, color: Colors.white),
              ),
            )
            : GestureDetector(
              onTap: _toggleListening,
              child: AnimatedContainer(
                duration: 200.ms,
                width: 40, height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _isListening
                      ? AppTheme.rose500
                      : context.surfaceColor,
                  border: _isListening ? null : Border.all(
                    color: context.dividerColor.withValues(alpha: 0.5))),
                child: Icon(
                  _isListening ? Icons.stop_rounded : Icons.mic_rounded,
                  size: 20,
                  color: _isListening
                      ? Colors.white
                      : AppTheme.neonCyan),
              ),
            ),
        ]),

        // Listening indicator
        if (_isListening)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Container(width: 8, height: 8,
                decoration: const BoxDecoration(
                  color: AppTheme.rose500, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(context.l10n?.listening ?? 'Listening...', style: GoogleFonts.plusJakartaSans(
                fontSize: 12, color: AppTheme.rose500,
                fontWeight: FontWeight.w600)),
            ]).animate(onPlay: (c) => c.repeat(reverse: true))
              .fadeIn(duration: 600.ms).fadeOut(duration: 600.ms),
          ),
      ]),
    );
  }

}

// ─── Message Bubble ─────────────────────────────────────────────────────────

class _BubbleWidget extends StatelessWidget {
  final PersistedChatMsg msg;
  final VoidCallback onCopy;

  const _BubbleWidget({required this.msg, required this.onCopy});

  @override
  Widget build(BuildContext context) {
    final isUser = msg.role == PersistedMsgRole.user;
    final isError = msg.status == PersistedMsgStatus.error;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.78),
        child: GestureDetector(
          onLongPress: onCopy,
          child: Column(
            crossAxisAlignment: isUser
                ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              // AI avatar + bubble
              if (!isUser) Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 28, height: 28,
                    margin: const EdgeInsets.only(right: 8, top: 2),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(10),
                      color: Theme.of(context).brightness == Brightness.dark
                          ? Colors.black
                          : Colors.white,
                      border: Border.all(
                        color: context.dividerColor.withValues(alpha: 0.5),
                        width: 0.5,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.asset('assets/logo/qor_ai_logo.png',
                          width: 16, height: 16, fit: BoxFit.contain),
                    )),
                  Expanded(child: _buildBubbleContent(context, isUser, isError)),
                ],
              )
              else _buildBubbleContent(context, isUser, isError),

              // Timestamp
              Padding(
                padding: EdgeInsets.only(
                    top: 4, left: isUser ? 0 : 36, right: isUser ? 0 : 0),
                child: Text(
                  '${msg.timestamp.hour.toString().padLeft(2, '0')}:'
                  '${msg.timestamp.minute.toString().padLeft(2, '0')}',
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 10, color: context.textTertiaryColor),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBubbleContent(BuildContext context, bool isUser, bool isError) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        gradient: isUser
            ? AppTheme.userBubbleGradient
            : (!isError
                ? LinearGradient(
                    colors: [
                      AppTheme.brandBlue.withValues(alpha: 0.08),
                      AppTheme.brandCyan.withValues(alpha: 0.04),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  )
                : null),
        color: isUser ? null : (isError ? AppTheme.error.withValues(alpha: 0.1) : null),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if ((msg.imagePath ?? '').isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.file(
                File(msg.imagePath!),
                width: 220,
                height: 220,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  width: 220,
                  height: 220,
                  color: context.surfaceVariantColor,
                  alignment: Alignment.center,
                  child: Icon(
                    Icons.image_not_supported_rounded,
                    color: context.textTertiaryColor,
                  ),
                ),
              ),
            ),
            if (msg.text.trim().isNotEmpty) const SizedBox(height: 10),
          ],
          if (msg.text.trim().isNotEmpty)
            SelectableText(
              msg.text,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 15,
                fontWeight: FontWeight.w400,
                height: 1.45,
                color: isUser ? context.textPrimary
                    : isError ? AppTheme.error
                        : context.textPrimary,
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Animated Dot ───────────────────────────────────────────────────────────

class _AnimatedDot extends StatelessWidget {
  final int delay;
  final AnimationController controller;
  const _AnimatedDot({required this.delay, required this.controller});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (_, __) {
        final phase = ((controller.value * 1500 + delay) % 1500) / 1500;
        final scale = 0.5 + 0.5 * (1 - (2 * phase - 1).abs());
        return Transform.scale(
          scale: scale,
          child: Container(width: 8, height: 8,
            decoration: BoxDecoration(
                color: context.textTertiaryColor, shape: BoxShape.circle)),
        );
      },
    );
  }
}
