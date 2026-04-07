import 'package:cloud_firestore/cloud_firestore.dart';

enum PersistedMsgRole { user, ai, system }
enum PersistedMsgStatus { sent, error }

class PersistedChatMsg {
  final String id;
  final PersistedMsgRole role;
  final String text;
  final PersistedMsgStatus status;
  final DateTime timestamp;

  PersistedChatMsg({
    required this.id,
    required this.role,
    required this.text,
    this.status = PersistedMsgStatus.sent,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  factory PersistedChatMsg.fromMap(Map<String, dynamic> m) => PersistedChatMsg(
    id: m['id'] as String? ??
        DateTime.now().millisecondsSinceEpoch.toString(),
    role: PersistedMsgRole.values.byName(m['role'] as String? ?? 'ai'),
    text: m['text'] as String? ?? '',
    status: PersistedMsgStatus.values
        .byName(m['status'] as String? ?? 'sent'),
    timestamp: m['timestamp'] is Timestamp
        ? (m['timestamp'] as Timestamp).toDate()
        : DateTime.now(),
  );

  Map<String, dynamic> toMap() => {
    'id': id,
    'role': role.name,
    'text': text,
    'status': status.name,
    'timestamp': Timestamp.fromDate(timestamp),
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

  factory ChatConversation.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    return ChatConversation(
      id: doc.id,
      userId: d['userId'] as String? ?? '',
      title: d['title'] as String? ?? 'Chat',
      messages: (d['messages'] as List<dynamic>? ?? [])
          .map((m) => PersistedChatMsg.fromMap(m as Map<String, dynamic>))
          .toList(),
      createdAt: d['createdAt'] is Timestamp
          ? (d['createdAt'] as Timestamp).toDate()
          : DateTime.now(),
      updatedAt: d['updatedAt'] is Timestamp
          ? (d['updatedAt'] as Timestamp).toDate()
          : DateTime.now(),
      storedMessageCount: d['messageCount'] as int?,
    );
  }

  Map<String, dynamic> toFirestore() => {
    'userId': userId,
    'title': title,
    'messages': messages.map((m) => m.toMap()).toList(),
    'createdAt': Timestamp.fromDate(createdAt),
    'updatedAt': Timestamp.fromDate(updatedAt),
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
