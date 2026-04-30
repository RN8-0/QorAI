import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

/// Bir support_messages kaydını chat görünümünde gösterir.
class SupportChatScreen extends ConsumerStatefulWidget {
  final String supportMessageId;
  final String initialTitle;

  const SupportChatScreen({
    super.key,
    required this.supportMessageId,
    this.initialTitle = 'Destek',
  });

  @override
  ConsumerState<SupportChatScreen> createState() => _SupportChatScreenState();
}

class _SupportChatScreenState extends ConsumerState<SupportChatScreen> {
  late final TextEditingController _inputCtrl;
  final _scrollCtrl = ScrollController();
  final List<_ChatMessage> _pendingMessages = [];
  bool _sending = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _inputCtrl = TextEditingController();
    // Mark related notifications read
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _markRelatedNotificationsRead();
    });
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _markRelatedNotificationsRead() {
    final notifs = ref.read(notificationsProvider).valueOrNull ?? [];
    final ds = ref.read(pbDataSourceProvider);
    for (final n in notifs) {
      final refId = n['referenceId']?.toString() ?? '';
      final type = n['type']?.toString() ?? '';
      if (refId == widget.supportMessageId &&
          (type == 'admin_message' ||
              type == 'support_reply' ||
              type == 'system') &&
          n['read'] != true) {
        final id = n['id']?.toString() ?? '';
        if (id.isNotEmpty) ds.markNotificationRead(id);
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _inputCtrl.text.trim();
    if (text.isEmpty) return;

    final uid = ref.read(authStateProvider).valueOrNull;
    if (uid == null) return;

    setState(() {
      _sending = true;
      _errorText = null;
    });

    try {
      await ref
          .read(pbDataSourceProvider)
          .sendSupportChatReply(
            messageId: widget.supportMessageId,
            replyText: text,
            userId: uid,
          );
      final optimistic = _ChatMessage(
        role: 'user',
        text: text,
        ts: DateTime.now().toIso8601String(),
      );
      if (mounted) {
        setState(() {
          _pendingMessages.add(optimistic);
        });
      }
      _inputCtrl.clear();
      ref.invalidate(notificationsProvider);
      ref.invalidate(supportThreadProvider(widget.supportMessageId));
      _scrollToBottom();
    } catch (e) {
      setState(
        () => _errorText = e.toString().replaceFirst('ServerException: ', ''),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final threadAsync = ref.watch(
      supportThreadProvider(widget.supportMessageId),
    );

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_ios_new_rounded,
            color: context.textPrimary,
            size: 20,
          ),
          onPressed: () => context.pop(),
        ),
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.accentCyan.withValues(alpha: 0.24),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: const Icon(
                Icons.support_agent_rounded,
                color: Colors.white,
                size: 18,
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Qor AI Destek',
                  style: TextStyle(
                    color: context.textPrimary,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  'Hesabınıza bağlı destek sohbeti',
                  style: TextStyle(
                    color: context.textTertiaryColor,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ],
        ),
        centerTitle: false,
      ),
      body: threadAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stackTrace) => Center(
          child: Text(
            'Sohbet yüklenemedi.',
            style: TextStyle(color: context.textSecondary),
          ),
        ),
        data: (record) {
          if (record == null) {
            return Center(
              child: Text(
                'Sohbet bulunamadı.',
                style: TextStyle(color: context.textSecondary),
              ),
            );
          }

          final closed = record['banned'] as bool? ?? false;
          final messages = _mergeWithPending(_buildThread(record));
          _scrollToBottom();

          return Column(
            children: [
              if (closed)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  color: Colors.red.withValues(alpha: 0.1),
                  child: Row(
                    children: [
                      Icon(
                        Icons.block_rounded,
                        size: 16,
                        color: Colors.red[400],
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Bu sohbet kapatılmıştır.',
                        style: TextStyle(
                          color: Colors.red[400],
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        AppTheme.accentCyan.withValues(alpha: 0.04),
                        Colors.transparent,
                      ],
                    ),
                  ),
                  child: messages.isEmpty
                      ? Center(
                          child: Text(
                            'Henüz mesaj yok.',
                            style: TextStyle(color: context.textTertiaryColor),
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollCtrl,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 14,
                          ),
                          itemCount: messages.length,
                          itemBuilder: (ctx, i) {
                            final msg = messages[i];
                            return _ChatBubble(
                                  message: msg,
                                  isFirst: i == 0,
                                  isLast: i == messages.length - 1,
                                )
                                .animate()
                                .fadeIn(duration: 200.ms, delay: (i * 30).ms)
                                .slideY(begin: 0.05, end: 0);
                          },
                        ),
                ),
              ),
              _buildInputBar(closed: closed),
            ],
          );
        },
      ),
    );
  }

  List<_ChatMessage> _mergeWithPending(List<_ChatMessage> fetched) {
    if (_pendingMessages.isEmpty) return fetched;

    final merged = List<_ChatMessage>.from(fetched);
    for (final pending in _pendingMessages) {
      final exists = fetched.any(
        (message) =>
            message.role == pending.role &&
            message.text.trim() == pending.text.trim(),
      );
      if (!exists) {
        merged.add(pending);
      }
    }

    _pendingMessages.removeWhere(
      (pending) => fetched.any(
        (message) =>
            message.role == pending.role &&
            message.text.trim() == pending.text.trim(),
      ),
    );

    return merged;
  }

  Widget _buildInputBar({required bool closed}) {
    final canSend = !closed && !_sending;

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        border: Border(
          top: BorderSide(color: context.dividerColor.withValues(alpha: 0.5)),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.10),
            blurRadius: 18,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      padding: EdgeInsets.fromLTRB(
        16,
        10,
        16,
        MediaQuery.of(context).padding.bottom + 10,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (closed)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                'Bu sohbet admin tarafından kapatıldı.',
                style: TextStyle(
                  fontSize: 12,
                  color: context.textTertiaryColor,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          if (_errorText != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                _errorText!,
                style: TextStyle(fontSize: 12, color: Colors.red[400]),
              ),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _inputCtrl,
                  enabled: canSend,
                  maxLines: 4,
                  minLines: 1,
                  textInputAction: TextInputAction.newline,
                  style: TextStyle(
                    color: canSend
                        ? context.textPrimary
                        : context.textTertiaryColor,
                    fontSize: 14,
                  ),
                  decoration: InputDecoration(
                    hintText: canSend ? 'Yanıtınızı yazın...' : 'Sohbet kapalı',
                    hintStyle: TextStyle(
                      color: context.textTertiaryColor,
                      fontSize: 14,
                    ),
                    filled: true,
                    fillColor: context.backgroundColor,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: BorderSide(
                        color: context.dividerColor.withValues(alpha: 0.65),
                      ),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: BorderSide(
                        color: AppTheme.accentCyan,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              AnimatedOpacity(
                opacity: canSend ? 1.0 : 0.4,
                duration: const Duration(milliseconds: 200),
                child: GestureDetector(
                  onTap: canSend ? _send : null,
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: canSend ? AppTheme.primaryGradient : null,
                      color: canSend ? null : context.textTertiaryColor,
                      boxShadow: canSend
                          ? [
                              BoxShadow(
                                color: AppTheme.accentCyan.withValues(
                                  alpha: 0.22,
                                ),
                                blurRadius: 14,
                                offset: const Offset(0, 5),
                              ),
                            ]
                          : null,
                    ),
                    child: _sending
                        ? const Padding(
                            padding: EdgeInsets.all(12),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(
                            Icons.send_rounded,
                            color: Colors.white,
                            size: 20,
                          ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  List<_ChatMessage> _buildThread(Map<String, dynamic> record) {
    final rawChatMessages = record['chatMessages'];
    List<dynamic> raw = [];

    if (rawChatMessages is List) {
      raw = rawChatMessages;
    } else if (rawChatMessages is String && rawChatMessages.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawChatMessages);
        if (decoded is List) raw = decoded;
      } catch (_) {}
    }

    if (raw.isNotEmpty) {
      return raw
          .whereType<Map>()
          .map(
            (m) => _ChatMessage(
              role: _normalizeRole(m['role']),
              text: m['text']?.toString() ?? '',
              ts: m['ts']?.toString() ?? '',
            ),
          )
          .where((m) => m.text.isNotEmpty)
          .toList();
    }

    // Backwards compat: build from existing fields
    final messages = <_ChatMessage>[];
    final status = record['status']?.toString() ?? '';
    final message = record['message']?.toString().trim() ?? '';
    final adminReply = record['adminReply']?.toString().trim() ?? '';
    final created = record['created']?.toString() ?? '';
    final repliedAt = record['repliedAt']?.toString() ?? '';

    if (message.isNotEmpty) {
      messages.add(
        _ChatMessage(
          role: status == 'admin_message' ? 'admin' : 'user',
          text: message,
          ts: created,
        ),
      );
    }
    if (adminReply.isNotEmpty) {
      messages.add(
        _ChatMessage(
          role: 'admin',
          text: adminReply,
          ts: repliedAt.isNotEmpty ? repliedAt : created,
        ),
      );
    }
    return messages;
  }

  String _normalizeRole(dynamic rawRole) {
    final role = rawRole?.toString().trim().toLowerCase() ?? '';
    if (role == 'user') return 'user';
    return 'admin';
  }
}

class _ChatMessage {
  final String role;
  final String text;
  final String ts;

  const _ChatMessage({
    required this.role,
    required this.text,
    required this.ts,
  });

  bool get isUser => role == 'user';
}

class _ChatBubble extends StatelessWidget {
  final _ChatMessage message;
  final bool isFirst;
  final bool isLast;

  const _ChatBubble({
    required this.message,
    required this.isFirst,
    required this.isLast,
  });

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    DateTime? time;
    try {
      time = DateTime.parse(message.ts);
    } catch (_) {}

    final timeText = time != null ? _formatTime(time) : '';

    return Padding(
      padding: EdgeInsets.only(top: isFirst ? 0 : 8, bottom: isLast ? 0 : 0),
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          if (!isUser)
            Padding(
              padding: const EdgeInsets.only(bottom: 4, left: 4),
              child: Row(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: AppTheme.primaryBlue.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.support_agent_rounded,
                      size: 14,
                      color: AppTheme.primaryBlue,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Qor AI Destek',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.primaryBlue,
                    ),
                  ),
                ],
              ),
            ),
          Row(
            mainAxisAlignment: isUser
                ? MainAxisAlignment.end
                : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (isUser) const SizedBox(width: 48),
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    gradient: isUser ? AppTheme.primaryGradient : null,
                    color: isUser ? null : context.surfaceVariantColor,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(isUser ? 18 : 6),
                      bottomRight: Radius.circular(isUser ? 6 : 18),
                    ),
                    border: isUser
                        ? null
                        : Border.all(
                            color: context.dividerColor.withValues(alpha: 0.7),
                          ),
                  ),
                  child: Text(
                    message.text,
                    style: TextStyle(
                      color: isUser ? Colors.white : context.textPrimary,
                      fontSize: 14,
                      height: 1.4,
                    ),
                  ),
                ),
              ),
              if (!isUser) const SizedBox(width: 48),
            ],
          ),
          if (timeText.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3, left: 4, right: 4),
              child: Text(
                timeText,
                style: TextStyle(
                  fontSize: 10,
                  color: context.textTertiaryColor,
                ),
              ),
            ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) {
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    }
    if (diff.inDays < 7) {
      return '${diff.inDays}g önce';
    }
    return '${dt.day}.${dt.month}.${dt.year}';
  }
}
