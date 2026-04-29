import 'package:pocketbase/pocketbase.dart';

enum PersistedMsgRole { user, ai, system }

enum PersistedMsgStatus { sent, error }

class PersistedChatMsg {
  final String id;
  final PersistedMsgRole role;
  final String text;
  final String? imagePath;
  final PersistedMsgStatus status;
  final DateTime timestamp;

  PersistedChatMsg({
    required this.id,
    required this.role,
    required this.text,
    this.imagePath,
    this.status = PersistedMsgStatus.sent,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  factory PersistedChatMsg.fromMap(Map<String, dynamic> m) {
    PersistedMsgRole parseRole(dynamic value) {
      final name = value?.toString() ?? 'ai';
      for (final role in PersistedMsgRole.values) {
        if (role.name == name) return role;
      }
      return PersistedMsgRole.ai;
    }

    PersistedMsgStatus parseStatus(dynamic value) {
      final name = value?.toString() ?? 'sent';
      for (final status in PersistedMsgStatus.values) {
        if (status.name == name) return status;
      }
      return PersistedMsgStatus.sent;
    }

    return PersistedChatMsg(
      id:
          m['id'] as String? ??
          DateTime.now().millisecondsSinceEpoch.toString(),
      role: parseRole(m['role']),
      text: m['text'] as String? ?? '',
      imagePath: (m['imagePath'] as String?)?.trim().isNotEmpty == true
          ? (m['imagePath'] as String).trim()
          : null,
      status: parseStatus(m['status']),
      timestamp: m['timestamp'] is String
          ? DateTime.tryParse(m['timestamp'] as String) ?? DateTime.now()
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toMap() => {
    'id': id,
    'role': role.name,
    'text': text,
    if (imagePath != null && imagePath!.isNotEmpty) 'imagePath': imagePath,
    'status': status.name,
    'timestamp': timestamp.toIso8601String(),
  };
}

class ChatConversation {
  final String id;
  final String userId;
  final String title;
  final List<PersistedChatMsg> messages;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int? storedMessageCount;

  ChatConversation({
    required this.id,
    required this.userId,
    required this.title,
    required this.messages,
    required this.createdAt,
    required this.updatedAt,
    this.storedMessageCount,
  });

  int get messageCount => storedMessageCount ?? messages.length;

  factory ChatConversation.fromPb(RecordModel record) {
    final d = record.data;
    return ChatConversation(
      id: record.id,
      userId: d['userId'] as String? ?? '',
      title: d['title'] as String? ?? 'Chat',
      messages: (d['messages'] as List<dynamic>? ?? [])
          .whereType<Map>()
          .map((m) => PersistedChatMsg.fromMap(Map<String, dynamic>.from(m)))
          .toList(),
      createdAt:
          DateTime.tryParse(d['created'] as String? ?? '') ?? DateTime.now(),
      updatedAt:
          DateTime.tryParse(d['updated'] as String? ?? '') ?? DateTime.now(),
      storedMessageCount: d['messageCount'] as int?,
    );
  }

  /// Legacy alias for backward compatibility
  factory ChatConversation.fromFirestore(dynamic doc) =>
      ChatConversation.fromPb(doc as RecordModel);

  Map<String, dynamic> toFirestore() => {
    'userId': userId,
    'title': title,
    'messages': messages.map((m) => m.toMap()).toList(),
    'messageCount': messages.length,
  };

  ChatConversation copyWith({
    String? title,
    List<PersistedChatMsg>? messages,
    DateTime? updatedAt,
  }) => ChatConversation(
    id: id,
    userId: userId,
    title: title ?? this.title,
    messages: messages ?? this.messages,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    storedMessageCount: storedMessageCount,
  );
}
