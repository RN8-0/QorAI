import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/presentation/providers/providers.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifsAsync = ref.watch(notificationsProvider);
    final notifs = notifsAsync.valueOrNull ?? [];

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded,
              color: context.textPrimary, size: 20),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Notifications',
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
                final uid = ref
                    .read(authStateProvider)
                    .valueOrNull;
                if (uid != null) {
                  ref
                      .read(pbDataSourceProvider)
                      .markAllNotificationsRead(uid);
                }
              },
              child: Text(
                'Mark all read',
                style: TextStyle(
                  fontSize: 12,
                  color: AppTheme.primaryBlue,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
      body: notifs.isEmpty
          ? _EmptyState()
          : ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: notifs.length,
              separatorBuilder: (_, __) => const SizedBox(height: 6),
              itemBuilder: (context, index) {
                final notif = notifs[index];
                return _NotificationTile(notif: notif)
                    .animate()
                    .fadeIn(duration: 250.ms, delay: (index * 40).ms)
                    .slideX(begin: 0.03, end: 0);
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
          Icon(Icons.notifications_none_rounded,
              size: 64, color: context.textTertiaryColor),
          const SizedBox(height: 16),
          Text(
            'No notifications yet',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: context.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'You\'ll see replies to your reviews here',
            style: TextStyle(
              fontSize: 13,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _NotificationTile extends ConsumerWidget {
  final Map<String, dynamic> notif;
  const _NotificationTile({required this.notif});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isRead = notif['read'] == true;
    final title = notif['title'] as String? ?? '';
    final body = notif['body'] as String? ?? '';
    final senderName = notif['senderName'] as String? ?? '';
    final created = notif['created'] as String? ?? '';
    final id = notif['id'] as String? ?? '';

    DateTime? createdAt;
    try {
      createdAt = DateTime.parse(created);
    } catch (_) {}

    final timeText = createdAt != null ? _formatTimeAgo(createdAt) : '';

    return Material(
      color: isRead
          ? context.surfaceVariantColor
          : AppTheme.primaryBlue.withValues(alpha: 0.06),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () {
          if (!isRead) {
            ref.read(pbDataSourceProvider).markNotificationRead(id);
          }
        },
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isRead
                      ? context.textTertiaryColor.withValues(alpha: 0.1)
                      : AppTheme.primaryBlue.withValues(alpha: 0.12),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.reply_rounded,
                  size: 20,
                  color: isRead ? context.textTertiaryColor : AppTheme.primaryBlue,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight:
                                  isRead ? FontWeight.w500 : FontWeight.w700,
                              color: context.textPrimary,
                            ),
                          ),
                        ),
                        if (!isRead)
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: AppTheme.primaryBlue,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: context.textSecondary,
                        height: 1.3,
                      ),
                    ),
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
