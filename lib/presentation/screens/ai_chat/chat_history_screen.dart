import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class ChatHistoryScreen extends ConsumerWidget {
  final bool isOverlay;
  final VoidCallback? onBack;
  final VoidCallback? onClose;

  const ChatHistoryScreen({
    super.key,
    this.isOverlay = false,
    this.onBack,
    this.onClose,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(userProfileProvider);
    final user = userAsync.valueOrNull;
    final userId = (user?.uid ?? pb.authStore.record?.id ?? '').trim();
    final title = _historyCopy(context, 'title');

    if (userId.isEmpty) {
      if (userAsync.isLoading) {
        final loading = const Center(child: CircularProgressIndicator());
        if (isOverlay) {
          return _OverlayHistoryScaffold(
            title: title,
            onBack: onBack,
            child: loading,
          );
        }
        return Scaffold(body: loading);
      }
      if (isOverlay) {
        return _OverlayHistoryScaffold(
          title: title,
          onBack: onBack,
          child: const Center(child: Text('Sign in to view chat history')),
        );
      }
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const Center(child: Text('Sign in to view chat history')),
      );
    }

    final historyAsync = ref.watch(chatHistoryProvider(userId));
    final body = historyAsync.when(
      data: (conversations) {
        if (conversations.isEmpty) {
          return Center(
            child: _HistoryEmptyState(
              onNewChat: () {
                ref.read(chatSessionProvider.notifier).newConversation();
                if (isOverlay) {
                  onBack?.call();
                } else {
                  Navigator.of(context).pop();
                }
              },
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          itemCount: conversations.length,
          itemBuilder: (context, i) {
            final conv = conversations[i];
            return Dismissible(
              key: Key(conv.id),
              direction: DismissDirection.endToStart,
              background: Container(
                alignment: Alignment.centerRight,
                padding: const EdgeInsets.only(right: 20),
                decoration: BoxDecoration(
                  color: AppTheme.error.withValues(alpha: 0.22),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(
                  Icons.delete_outline_rounded,
                  color: AppTheme.error,
                ),
              ),
              onDismissed: (_) {
                ref
                    .read(pbDataSourceProvider)
                    .deleteChatConversation(userId, conv.id);
                ref.invalidate(chatHistoryProvider(userId));
              },
              child: _HistoryConversationCard(
                title: conv.title,
                messageCount: conv.messageCount,
                updatedAt: conv.updatedAt,
                onTap: () {
                  ref
                      .read(chatSessionProvider.notifier)
                      .loadConversation(userId, conv.id);
                  if (isOverlay) {
                    onBack?.call();
                  } else {
                    Navigator.of(context).pop();
                  }
                },
              ),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => _HistoryErrorState(
        message: e.toString(),
        onRetry: () => ref.invalidate(chatHistoryProvider(userId)),
      ),
    );
    if (isOverlay) {
      return _OverlayHistoryScaffold(
        title: title,
        onBack: onBack,
        trailing: TextButton.icon(
          onPressed: () {
            ref.read(chatSessionProvider.notifier).newConversation();
            onBack?.call();
          },
          icon: const Icon(Icons.add),
          label: Text(_historyCopy(context, 'newChat')),
        ),
        child: body,
      );
    }
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          title,
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
        ),
        actions: [
          TextButton.icon(
            onPressed: () {
              ref.read(chatSessionProvider.notifier).newConversation();
              Navigator.of(context).pop();
            },
            icon: const Icon(Icons.add),
            label: Text(_historyCopy(context, 'newChat')),
          ),
        ],
      ),
      body: body,
    );
  }
}

class _HistoryEmptyState extends StatelessWidget {
  final VoidCallback onNewChat;

  const _HistoryEmptyState({required this.onNewChat});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.accentCyan.withValues(alpha: 0.10),
              border: Border.all(
                color: AppTheme.accentCyan.withValues(alpha: 0.22),
              ),
            ),
            child: const Icon(
              Icons.forum_outlined,
              color: AppTheme.accentCyan,
              size: 30,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            _historyCopy(context, 'emptyTitle'),
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _historyCopy(context, 'emptySubtitle'),
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              height: 1.5,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.58),
            ),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: onNewChat,
            icon: const Icon(Icons.add_rounded, size: 18),
            label: Text(_historyCopy(context, 'newChat')),
          ),
        ],
      ),
    );
  }
}

class _HistoryErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _HistoryErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.cloud_off_rounded,
              color: AppTheme.error,
              size: 34,
            ),
            const SizedBox(height: 12),
            Text(
              _historyCopy(context, 'loadError'),
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.plusJakartaSans(fontSize: 12),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: Text(context.l10n?.retry ?? 'Tekrar dene'),
            ),
          ],
        ),
      ),
    );
  }
}

class _HistoryConversationCard extends StatelessWidget {
  final String title;
  final int messageCount;
  final DateTime updatedAt;
  final VoidCallback onTap;

  const _HistoryConversationCard({
    required this.title,
    required this.messageCount,
    required this.updatedAt,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final messageLabel = _historyCopy(context, 'messages');
    final date = DateFormat('MMM d, HH:mm').format(updatedAt);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Ink(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.10),
                  AppTheme.brandCyan.withValues(alpha: 0.045),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: AppTheme.brandCyan.withValues(alpha: 0.16),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppTheme.accentCyan.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: AppTheme.accentCyan.withValues(alpha: 0.20),
                    ),
                  ),
                  child: const Icon(
                    Icons.auto_awesome_rounded,
                    size: 19,
                    color: AppTheme.accentCyan,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title.trim().isEmpty
                            ? _historyCopy(context, 'untitled')
                            : title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          height: 1.25,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '$messageCount $messageLabel • $date',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11.5,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 22,
                  color: context.textTertiaryColor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _historyCopy(BuildContext context, String key) {
  final lang = Localizations.localeOf(context).languageCode.toLowerCase();
  final tr = lang == 'tr';
  switch (key) {
    case 'title':
      return tr ? 'Sohbet Geçmişi' : 'Chat History';
    case 'emptyTitle':
      return tr ? 'Henüz sohbet geçmişi yok' : 'No chat history yet';
    case 'emptySubtitle':
      return tr
          ? 'Qor AI ile yaptığınız sohbetler burada güvenle listelenecek.'
          : 'Your Qor AI conversations will appear here as soon as you start chatting.';
    case 'newChat':
      return tr ? 'Yeni sohbet' : 'New chat';
    case 'messages':
      return tr ? 'mesaj' : 'messages';
    case 'untitled':
      return tr ? 'Başlıksız sohbet' : 'Untitled chat';
    case 'loadError':
      return tr ? 'Sohbet geçmişi yüklenemedi' : 'Could not load chat history';
    default:
      return '';
  }
}

class _OverlayHistoryScaffold extends StatelessWidget {
  final String title;
  final Widget child;
  final VoidCallback? onBack;
  final Widget? trailing;

  const _OverlayHistoryScaffold({
    required this.title,
    required this.child,
    this.onBack,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(8, 10, 12, 10),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: Theme.of(context).dividerColor.withValues(alpha: 0.3),
              ),
            ),
          ),
          child: Row(
            children: [
              IconButton(
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_rounded, size: 20),
              ),
              Expanded(
                child: Text(
                  title,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                  ),
                ),
              ),
              if (trailing != null) ...[trailing!],
            ],
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}
