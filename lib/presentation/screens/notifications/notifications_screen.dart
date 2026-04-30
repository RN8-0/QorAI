import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/screens/notifications/support_chat_screen.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifsAsync = ref.watch(notificationsProvider);
    final notifs = notifsAsync.valueOrNull ?? const <Map<String, dynamic>>[];
    final isTr = Localizations.localeOf(context).languageCode == 'tr';

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
        title: Text(
          isTr ? 'Bildirimler' : 'Notifications',
          style: TextStyle(
            color: context.textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        centerTitle: true,
        actions: [
          if (notifs.any((n) => n['read'] != true))
            TextButton(
              onPressed: () {
                final uid = ref.read(authStateProvider).valueOrNull;
                if (uid != null) {
                  ref.read(pbDataSourceProvider).markAllNotificationsRead(uid);
                }
              },
              child: Text(
                isTr ? 'Okundu' : 'Mark read',
                style: TextStyle(
                  fontSize: 12,
                  color: AppTheme.primaryBlue,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
      body: notifsAsync.when(
        skipLoadingOnReload: true,
        loading: _EmptyState.new,
        error: (_, _) => _EmptyState(),
        data: (items) {
          if (items.isEmpty) {
            return _EmptyState();
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 6),
            itemBuilder: (context, index) {
              final notif = items[index];
              final id = notif['id']?.toString() ?? 'notification_$index';
              return Dismissible(
                    key: ValueKey('notification_$id'),
                    direction: DismissDirection.endToStart,
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 18),
                      decoration: BoxDecoration(
                        color: AppTheme.error.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Icon(
                        Icons.delete_outline_rounded,
                        color: AppTheme.error,
                      ),
                    ),
                    onDismissed: (_) {
                      if (id.isNotEmpty) {
                        ref.read(pbDataSourceProvider).deleteNotification(id);
                      }
                    },
                    child: _NotificationTile(notif: notif),
                  )
                  .animate()
                  .fadeIn(duration: 250.ms, delay: (index * 40).ms)
                  .slideX(begin: 0.03, end: 0);
            },
          );
        },
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.notifications_none_rounded,
            size: 64,
            color: context.textTertiaryColor,
          ),
          const SizedBox(height: 16),
          Text(
            Localizations.localeOf(context).languageCode == 'tr'
                ? 'Henüz bildirim yok'
                : 'No notifications yet',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: context.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            Localizations.localeOf(context).languageCode == 'tr'
                ? 'Destek yanıtları ve hesap bildirimleri burada görünür.'
                : 'Support replies and account notifications appear here.',
            style: TextStyle(fontSize: 13, color: context.textTertiaryColor),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _NotificationTile extends ConsumerStatefulWidget {
  final Map<String, dynamic> notif;
  const _NotificationTile({required this.notif});

  @override
  ConsumerState<_NotificationTile> createState() => _NotificationTileState();
}

class _NotificationTileState extends ConsumerState<_NotificationTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final notif = widget.notif;
    final isRead = notif['read'] == true;
    final title = notif['title'] as String? ?? '';
    final body = notif['body'] as String? ?? '';
    final senderName = notif['senderName'] as String? ?? '';
    final created = notif['created'] as String? ?? '';
    final id = notif['id'] as String? ?? '';
    final notifType = notif['type'] as String? ?? '';
    final referenceId = notif['referenceId']?.toString() ?? '';

    final canReply =
        referenceId.isNotEmpty &&
        (notifType == 'admin_message' || notifType == 'support_reply');
    final canOpenThread = canReply || notifType == 'support_sent';

    DateTime? createdAt;
    try {
      createdAt = DateTime.parse(created);
    } catch (_) {}

    final timeText = createdAt != null ? _formatTimeAgo(createdAt) : '';

    IconData iconData;
    Color iconColor;
    if (canReply || notifType == 'support_sent') {
      iconData = Icons.support_agent_rounded;
      iconColor = AppTheme.primaryBlue;
    } else if (notifType == 'compare_reply') {
      iconData = Icons.compare_arrows_rounded;
      iconColor = AppTheme.accentCyan;
    } else {
      iconData = Icons.notifications_rounded;
      iconColor = isRead ? context.textTertiaryColor : AppTheme.primaryBlue;
    }

    return Material(
      color: isRead
          ? context.surfaceVariantColor
          : AppTheme.primaryBlue.withValues(alpha: 0.06),
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: () {
          if (!isRead) {
            ref.read(pbDataSourceProvider).markNotificationRead(id);
          }
          if (canOpenThread && referenceId.isNotEmpty) {
            // Remove support_ prefix if present
            final cleanId = referenceId.startsWith('support_')
                ? referenceId.substring(8)
                : referenceId;
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => SupportChatScreen(
                  supportMessageId: cleanId,
                  initialTitle: title,
                ),
              ),
            );
          } else if (notifType == 'compare_reply') {
            context.go('/compare');
          } else {
            // Expand/collapse to show full body
            setState(() => _expanded = !_expanded);
          }
        },
        borderRadius: BorderRadius.circular(18),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isRead
                      ? context.textTertiaryColor.withValues(alpha: 0.1)
                      : AppTheme.accentCyan.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(iconData, size: 20, color: iconColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: _expanded ? null : 1,
                            overflow: _expanded
                                ? TextOverflow.visible
                                : TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: isRead
                                  ? FontWeight.w500
                                  : FontWeight.w700,
                              color: context.textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        if (!isRead)
                          Container(
                            width: 8,
                            height: 8,
                            margin: const EdgeInsets.only(top: 4),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryBlue,
                              shape: BoxShape.circle,
                            ),
                          ),
                        PopupMenuButton<String>(
                          tooltip: 'More',
                          color: context.surfaceColor,
                          onSelected: (value) {
                            if (value == 'delete') {
                              ref
                                  .read(pbDataSourceProvider)
                                  .deleteNotification(id);
                            }
                          },
                          itemBuilder: (context) => [
                            PopupMenuItem(
                              value: 'delete',
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.delete_outline_rounded,
                                    size: 18,
                                    color: AppTheme.error,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    Localizations.localeOf(
                                              context,
                                            ).languageCode ==
                                            'tr'
                                        ? 'Sil'
                                        : 'Delete',
                                    style: TextStyle(
                                      color: context.textPrimary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          child: Icon(
                            Icons.more_horiz_rounded,
                            size: 18,
                            color: context.textTertiaryColor,
                          ),
                        ),
                        if (!canOpenThread && body.isNotEmpty)
                          Icon(
                            _expanded
                                ? Icons.keyboard_arrow_up_rounded
                                : Icons.keyboard_arrow_down_rounded,
                            size: 18,
                            color: context.textTertiaryColor,
                          ),
                      ],
                    ),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      AnimatedCrossFade(
                        duration: const Duration(milliseconds: 200),
                        crossFadeState: _expanded
                            ? CrossFadeState.showSecond
                            : CrossFadeState.showFirst,
                        firstChild: Text(
                          body,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            color: context.textSecondary,
                            height: 1.4,
                          ),
                        ),
                        secondChild: Text(
                          body,
                          style: TextStyle(
                            fontSize: 13,
                            color: context.textSecondary,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          senderName,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.primaryBlue,
                          ),
                        ),
                        if (timeText.isNotEmpty) ...[
                          Text(
                            ' · ',
                            style: TextStyle(
                              fontSize: 11,
                              color: context.textTertiaryColor,
                            ),
                          ),
                          Text(
                            timeText,
                            style: TextStyle(
                              fontSize: 11,
                              color: context.textTertiaryColor,
                            ),
                          ),
                        ],
                        if (canReply) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.accentCyan.withValues(
                                alpha: 0.12,
                              ),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              'Yanıtla →',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.accentCyan,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _formatTimeAgo(DateTime dateTime) {
  final diff = DateTime.now().difference(dateTime);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  if (diff.inDays < 30) return '${diff.inDays ~/ 7}w ago';
  return '${diff.inDays ~/ 30}mo ago';
}
