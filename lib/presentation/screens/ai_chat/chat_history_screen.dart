import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

class ChatHistoryScreen extends ConsumerWidget {
  const ChatHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(userProfileProvider);
    return userAsync.when(
      data: (user) {
        if (user == null) {
          return Scaffold(
            appBar: AppBar(title: const Text('Chat History')),
            body: const Center(child: Text('Sign in to view chat history')),
          );
        }
        final historyAsync = ref.watch(chatHistoryProvider(user.uid));
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
          body: historyAsync.when(
            data: (conversations) {
              if (conversations.isEmpty) {
                return Center(
                  child: Text(
                    'No chat history yet',
                    style: GoogleFonts.plusJakartaSans(color: Colors.grey),
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
                          .deleteChatConversation(user.uid, conv.id);
                    },
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 10),
                      decoration: BoxDecoration(
                        color: Theme.of(context).cardColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: Theme.of(context)
                              .dividerColor
                              .withValues(alpha: 0.3),
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
                              .loadConversation(user.uid, conv.id);
                          Navigator.of(context).pop();
                        },
                      ),
                    ),
                  );
                },
              );
            },
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          ),
        );
      },
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) =>
          Scaffold(body: Center(child: Text('Error: $e'))),
    );
  }
}
