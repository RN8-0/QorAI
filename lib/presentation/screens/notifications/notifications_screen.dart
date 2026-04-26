import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifsAsync = ref.watch(notificationsProvider);
    final notifs = notifsAsync.valueOrNull ?? const <Map<String, dynamic>>[];

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
      body: notifsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => _EmptyState(),
        data: (items) {
          if (items.isEmpty) {
            return _EmptyState();
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 6),
            itemBuilder: (context, index) {
              final notif = items[index];
              return _NotificationTile(notif: notif)
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
            'Admin mesajlari ve destek yanitlari burada gorunur',
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
    final canReply =
      (notif['senderId'] as String? ?? '') == 'admin' ||
      senderName.toLowerCase().contains('destek') ||
      (notif['type'] as String? ?? '') == 'system';

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
                    if (canReply) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: () => showModalBottomSheet<void>(
                            context: context,
                            isScrollControlled: true,
                            backgroundColor: Theme.of(context).scaffoldBackgroundColor,
                            builder: (_) => _NotificationReplySheet(notif: notif),
                          ),
                          icon: const Icon(Icons.reply_rounded, size: 16),
                          label: const Text('Reply'),
                          style: TextButton.styleFrom(
                            foregroundColor: AppTheme.primaryBlue,
                            padding: const EdgeInsets.symmetric(horizontal: 0),
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            minimumSize: Size.zero,
                          ),
                        ),
                      ),
                    ],
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

class _NotificationReplySheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> notif;

  const _NotificationReplySheet({required this.notif});

  @override
  ConsumerState<_NotificationReplySheet> createState() =>
      _NotificationReplySheetState();
}

class _NotificationReplySheetState
    extends ConsumerState<_NotificationReplySheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _messageCtrl;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _messageCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _messageCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) return;

    final user = ref.read(userProfileProvider).valueOrNull;
    final authUid = ref.read(authStateProvider).valueOrNull;
    final authRecord = pb.authStore.record;
    final displayName =
        user?.displayName.trim().isNotEmpty == true
            ? user!.displayName.trim()
            : (authRecord?.data['displayName']?.toString().trim().isNotEmpty == true
                ? authRecord!.data['displayName'].toString().trim()
                : (authRecord?.data['name']?.toString().trim() ?? 'Qor AI User'));
    final email =
        user?.email.trim().isNotEmpty == true
            ? user!.email.trim()
            : authRecord?.data['email']?.toString().trim();

    if (authUid == null || email == null || email.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hesap bilgileri eksik. Lutfen tekrar giris yapin.')),
      );
      return;
    }

    final referenceId = widget.notif['referenceId']?.toString().trim() ?? '';
    final title = widget.notif['title']?.toString().trim() ?? 'Bildirim';
    final replyMessage = StringBuffer()
      ..writeln('Bildirim yaniti')
      ..writeln('Baslik: $title');
    if (referenceId.isNotEmpty) {
      replyMessage.writeln('Referans: $referenceId');
    }
    replyMessage
      ..writeln()
      ..write(_messageCtrl.text.trim());

    setState(() => _sending = true);
    try {
      await ref.read(pbDataSourceProvider).sendSupportMessage(
            userId: authUid,
            displayName: displayName,
            email: email,
            message: replyMessage.toString(),
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Yanıtın destek ekibine gonderildi.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } catch (error) {
      if (!mounted) return;
      final details = error.toString().replaceFirst('ServerException: ', '');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Gonderim hatasi: $details'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    final title = widget.notif['title']?.toString().trim() ?? 'Support';
    final body = widget.notif['body']?.toString().trim() ?? '';

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, bottomInset + 20),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Reply to Support',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: context.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              title,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: context.textPrimary,
              ),
            ),
            if (body.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                body,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  color: context.textSecondary,
                ),
              ),
            ],
            const SizedBox(height: 16),
            TextFormField(
              controller: _messageCtrl,
              minLines: 4,
              maxLines: 6,
              decoration: const InputDecoration(
                hintText: 'Write your reply...',
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return 'Reply cannot be empty';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _sending ? null : () => Navigator.of(context).pop(),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _sending ? null : _send,
                    child: Text(_sending ? 'Sending...' : 'Send'),
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

String _formatTimeAgo(DateTime dateTime) {
  final diff = DateTime.now().difference(dateTime);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  if (diff.inDays < 30) return '${diff.inDays ~/ 7}w ago';
  return '${diff.inDays ~/ 30}mo ago';
}
