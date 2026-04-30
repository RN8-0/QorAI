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

    if (userId.isEmpty) {
      if (userAsync.isLoading) {
        final loading = const Center(child: CircularProgressIndicator());
        if (isOverlay) {
          return _OverlayHistoryScaffold(
            title: 'Chat History',
            onBack: onBack,
            onClose: onClose,
            child: loading,
          );
        }
        return Scaffold(body: loading);
      }
      if (isOverlay) {
        return _OverlayHistoryScaffold(
          title: 'Chat History',
          onBack: onBack,
          onClose: onClose,
          child: const Center(child: Text('Sign in to view chat history')),
        );
      }
      return Scaffold(
        appBar: AppBar(title: const Text('Chat History')),
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
          padding: const EdgeInsets.all(16),
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
                  color: Colors.red.shade700,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(Icons.delete, color: Colors.white),
              ),
              onDismissed: (_) {
                ref
                    .read(pbDataSourceProvider)
                    .deleteChatConversation(userId, conv.id);
                ref.invalidate(chatHistoryProvider(userId));
              },
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: Theme.of(
                      context,
                    ).dividerColor.withValues(alpha: 0.3),
                  ),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  title: Text(
                    conv.title,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    '${conv.messageCount} messages • '
                    '${DateFormat('MMM d, HH:mm').format(conv.updatedAt)}',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: Colors.grey,
                    ),
                  ),
                  trailing: const Icon(
                    Icons.arrow_forward_ios,
                    size: 14,
                    color: Colors.grey,
                  ),
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
        title: 'Chat History',
        onBack: onBack,
        onClose: onClose,
        trailing: TextButton.icon(
          onPressed: () {
            ref.read(chatSessionProvider.notifier).newConversation();
            onBack?.call();
          },
          icon: const Icon(Icons.add),
          label: const Text('New'),
        ),
        child: body,
      );
    }
    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(
          'Chat History',
          style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
        ),
        actions: [
          TextButton.icon(
            onPressed: () {
              ref.read(chatSessionProvider.notifier).newConversation();
              Navigator.of(context).pop();
            },
            icon: const Icon(Icons.add),
            label: const Text('New'),
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

String _historyCopy(BuildContext context, String key) {
  final lang = Localizations.localeOf(context).languageCode.toLowerCase();
  final tr = lang == 'tr';
  switch (key) {
    case 'emptyTitle':
      return tr ? 'Henüz sohbet geçmişi yok' : 'No chat history yet';
    case 'emptySubtitle':
      return tr
          ? 'Qor AI ile yaptığınız sohbetler burada güvenle listelenecek.'
          : 'Your Qor AI conversations will appear here as soon as you start chatting.';
    case 'newChat':
      return tr ? 'Yeni sohbet' : 'New chat';
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
  final VoidCallback? onClose;
  final Widget? trailing;

  const _OverlayHistoryScaffold({
    required this.title,
    required this.child,
    this.onBack,
    this.onClose,
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
              if (onClose != null)
                IconButton(
                  onPressed: onClose,
                  icon: const Icon(Icons.close_rounded, size: 18),
                ),
            ],
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}
