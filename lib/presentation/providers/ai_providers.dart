part of 'providers.dart';

// ─── Chat Session State ───────────────────────────────────────────────────

class ChatSessionState {
  final String? conversationId;
  final List<PersistedChatMsg> messages; // newest first (index 0 = latest)
  final bool isLoading;
  final String title;

  const ChatSessionState({
    this.conversationId,
    this.messages = const [],
    this.isLoading = false,
    this.title = 'New Chat',
  });

  ChatSessionState copyWith({
    String? conversationId,
    List<PersistedChatMsg>? messages,
    bool? isLoading,
    String? title,
  }) => ChatSessionState(
    conversationId: conversationId ?? this.conversationId,
    messages: messages ?? this.messages,
    isLoading: isLoading ?? this.isLoading,
    title: title ?? this.title,
  );
}

class ChatSessionNotifier extends StateNotifier<ChatSessionState> {
  final Ref _ref;

  ChatSessionNotifier(this._ref) : super(const ChatSessionState()) {
    _initWelcome();
  }

  void _initWelcome() {
    final locale = _ref.read(localeProvider);
    final langCode = locale?.languageCode ?? 'en';
    const greetings = <String, String>{
      'tr': 'Merhaba! Ben yapay zeka alışveriş asistanınım. Telefon, laptop, kulaklık hakkında her şeyi sorabilir veya ürün görseli göndererek analiz ettirebilirsiniz! 🚀',
      'de': 'Hallo! Ich bin dein KI-Einkaufsassistent. Frag mich alles über Smartphones, Laptops, Kopfhörer oder sende ein Produktbild zur Analyse! 🚀',
      'fr': 'Salut! Je suis votre assistant shopping IA. Posez-moi des questions sur les téléphones, laptops, écouteurs ou envoyez une image produit! 🚀',
      'es': '¡Hola! Soy tu asistente de compras IA. ¡Pregúntame sobre teléfonos, laptops, auriculares o envía una imagen de producto! 🚀',
      'ar': 'مرحباً! أنا مساعدك الذكي للتسوق. اسألني عن الهواتف والأجهزة المحمولة أو أرسل صورة منتج للتحليل! 🚀',
      'ru': 'Привет! Я ваш ИИ-помощник по покупкам. Спрашивайте меня о телефонах, ноутбуках, наушниках! 🚀',
      'zh': '你好！我是您的AI购物助手。询问手机、笔记本、耳机相关问题，或发送产品图片分析！🚀',
      'ja': 'こんにちは！AIショッピングアシスタントです。スマホ・ノートPC・ヘッドホンについて何でも聞いてください！🚀',
      'ko': '안녕하세요! AI 쇼핑 도우미입니다. 스마트폰, 노트북, 헤드폰에 대해 무엇이든 물어보세요! 🚀',
      'pt': 'Olá! Sou seu assistente de compras IA. Pergunte-me sobre telefones, laptops, fones de ouvido! 🚀',
      'it': 'Ciao! Sono il tuo assistente shopping IA. Chiedimi di telefoni, laptop, cuffie! 🚀',
    };
    final text = greetings[langCode] ??
        'Hey! I\'m your AI shopping assistant. Ask me anything about phones, laptops, headphones, or send me a product image to analyze! 🚀';
    final welcome = PersistedChatMsg(
      id: 'welcome',
      role: PersistedMsgRole.ai,
      text: text,
    );
    state = state.copyWith(messages: [welcome]);
  }

  String _autoTitle(String firstUserMsg) {
    final t = firstUserMsg.trim();
    return t.length > 45 ? '${t.substring(0, 45)}...' : t;
  }

  Future<void> send(
    String text, {
    String? imageBase64,
    String? imageMimeType,
    Map<String, dynamic>? pageContext,
  }) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty && imageBase64 == null) return;

    final user = _ref.read(userProfileProvider).valueOrNull;
    if (user == null) {
      _addMsg(PersistedChatMsg(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        role: PersistedMsgRole.system,
        text: 'Please sign in to use AI Chat.',
        status: PersistedMsgStatus.error,
      ));
      return;
    }

    final sub = _ref.read(subscriptionServiceProvider);
    final quota = sub.recordAIQuestion();
    if (quota.isFailure) {
      _addMsg(PersistedChatMsg(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        role: PersistedMsgRole.system,
        text: 'Daily AI question limit reached. Upgrade to Premium for unlimited!',
        status: PersistedMsgStatus.error,
      ));
      return;
    }

    final userMsg = PersistedChatMsg(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: PersistedMsgRole.user,
      text: trimmed,
    );
    _addMsg(userMsg);
    state = state.copyWith(isLoading: true);

    // Auto-title from first user message
    final userMsgCount =
        state.messages.where((m) => m.role == PersistedMsgRole.user).length;
    final isFirstUserMsg = userMsgCount == 1;
    final title = isFirstUserMsg ? _autoTitle(trimmed) : state.title;
    if (isFirstUserMsg) state = state.copyWith(title: title);

    final convId = await _ensureConversation(user.uid, title);

    try {
      final gemini = _ref.read(geminiServiceProvider);

      if (imageBase64 != null) {
        // Image analysis: non-streaming (multimodal)
        final response = await gemini.analyzeImage(
          base64Image: imageBase64,
          mimeType: imageMimeType ?? 'image/jpeg',
          prompt: trimmed.isNotEmpty
              ? trimmed
              : 'Identify this product. What is it? Is it good?',
        );
        final aiMsg = PersistedChatMsg(
          id: '${DateTime.now().millisecondsSinceEpoch}_ai',
          role: PersistedMsgRole.ai,
          text: response,
        );
        _addMsg(aiMsg);
      } else {
        // Text chat: streaming for instant response feel
        final turns = _buildTurns(trimmed, user, pageContext: pageContext);
        final aiMsgId = '${DateTime.now().millisecondsSinceEpoch}_ai';
        String accumulated = '';

        try {
          await for (final chunk in gemini.chatConversationStream(turns, user)) {
            accumulated += chunk;
            // Clean JSON wrapper if AI still returns it
            final cleanText = _stripJsonWrapper(accumulated);
            // Update the AI message in-place for live streaming effect
            final aiMsg = PersistedChatMsg(
              id: aiMsgId,
              role: PersistedMsgRole.ai,
              text: cleanText,
            );
            _updateOrAddMsg(aiMsg);
          }
        } catch (_) {
          // Streaming failed — fallback to batch
          if (accumulated.isEmpty) {
            final response = await gemini.chatConversation(turns, user);
            accumulated = response;
          }
        }

        if (accumulated.isEmpty) {
          accumulated = 'Sorry, I couldn\'t process that. Please try again.';
        }

        // Final update with complete text
        final cleanText = _stripJsonWrapper(accumulated);
        final aiMsg = PersistedChatMsg(
          id: aiMsgId,
          role: PersistedMsgRole.ai,
          text: cleanText,
        );
        _updateOrAddMsg(aiMsg);
      }

      // Persist to Firestore in background (fire-and-forget)
      final ds = _ref.read(pbDataSourceProvider);
      final allMsgs = List<PersistedChatMsg>.from(state.messages.reversed);
      ds
          .updateChatConversation(user.uid, convId, allMsgs, title)
          .catchError((_) {/* silent fail */});
    } catch (e) {
      _addMsg(PersistedChatMsg(
        id: '${DateTime.now().millisecondsSinceEpoch}_err',
        role: PersistedMsgRole.ai,
        text: 'Sorry, I couldn\'t process that. Please try again.',
        status: PersistedMsgStatus.error,
      ));
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Strip JSON wrapper if AI returns {"message": "..."} format
  static String _stripJsonWrapper(String text) {
    final trimmed = text.trim();
    if (!trimmed.startsWith('{')) return trimmed;
    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is Map && decoded['message'] != null) {
        return decoded['message'] as String;
      }
    } catch (_) {
      // Partial JSON during streaming — try to extract message field
      final match = RegExp(r'"message"\s*:\s*"((?:[^"\\]|\\.)*)').firstMatch(trimmed);
      if (match != null) {
        return match.group(1)?.replaceAll(r'\"', '"').replaceAll(r'\n', '\n') ?? trimmed;
      }
    }
    return trimmed;
  }

  /// Update existing message by id, or add if not found
  void _updateOrAddMsg(PersistedChatMsg msg) {
    final idx = state.messages.indexWhere((m) => m.id == msg.id);
    if (idx >= 0) {
      final updated = List<PersistedChatMsg>.from(state.messages);
      updated[idx] = msg;
      state = state.copyWith(messages: updated);
    } else {
      _addMsg(msg);
    }
  }

  Future<String> _ensureConversation(String userId, String title) async {
    if (state.conversationId != null) return state.conversationId!;
    // Use local ID immediately, persist to Firestore in background
    final localId = 'local_${DateTime.now().millisecondsSinceEpoch}';
    state = state.copyWith(conversationId: localId);
    // Fire-and-forget Firestore creation (don't block chat on it)
    final ds = _ref.read(pbDataSourceProvider);
    final now = DateTime.now();
    final conv = ChatConversation(
      id: '',
      userId: userId,
      title: title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    );
    ds.createChatConversation(conv).then((newId) {
      if (newId != localId) state = state.copyWith(conversationId: newId);
    }).catchError((_) {/* keep localId */});
    return localId;
  }

  List<Map<String, String>> _buildTurns(String newMsg, dynamic user, {Map<String, dynamic>? pageContext}) {
    final recent = state.messages
        .where((m) => m.role != PersistedMsgRole.system)
        .take(10)
        .toList()
        .reversed
        .toList();
    final turns = <Map<String, String>>[];
    for (final m in recent) {
      turns.add({
        'role': m.role == PersistedMsgRole.user ? 'user' : 'model',
        'text': m.text,
      });
    }
    final parts = <String>[];
    try {
      if ((user.language as String?)?.isNotEmpty == true &&
          user.language != 'en') {
        parts.add('Language: ${user.language}');
      }
      if ((user.ecosystem as String?)?.isNotEmpty == true &&
          user.ecosystem != 'mixed') {
        parts.add('Ecosystem: ${user.ecosystem}');
      }
      if ((user.budgetRange as String?)?.isNotEmpty == true) {
        parts.add('Budget: ${user.budgetRange}');
      }
      if ((user.priorities as List?)?.isNotEmpty == true) {
        parts.add('Priorities: ${(user.priorities as List).join(', ')}');
      }
      if ((user.interestCategories as List?)?.isNotEmpty == true) {
        parts.add('Interests: ${(user.interestCategories as List).join(', ')}');
      }
      if ((user.country as String?)?.isNotEmpty == true) {
        parts.add('Country: ${user.country}');
      }
    } catch (_) {}

    // Add page context so AI knows what the user is looking at
    final pageCtxStr = <String>[];
    if (pageContext != null) {
      if (pageContext['page'] != null) pageCtxStr.add('Currently viewing: ${pageContext['page']}');
      if (pageContext['route'] != null) pageCtxStr.add('Route: ${pageContext['route']}');
      if (pageContext['productName'] != null) pageCtxStr.add('Product: ${pageContext['productName']}');
      if (pageContext['productBrand'] != null) pageCtxStr.add('Brand: ${pageContext['productBrand']}');
      if (pageContext['productCategory'] != null) pageCtxStr.add('Category: ${pageContext['productCategory']}');
      if (pageContext['techScore'] != null) pageCtxStr.add('Tech Score: ${pageContext['techScore']}');
      if (pageContext['matchScore'] != null) pageCtxStr.add('Match Score: ${pageContext['matchScore']}');
    }

    final ctx =
        parts.isEmpty ? '' : '\n[User Profile: ${parts.join(' | ')}]';
    final pageInfo =
        pageCtxStr.isEmpty ? '' : '\n[Page Context: ${pageCtxStr.join(' | ')}]';
    turns.add({'role': 'user', 'text': '$newMsg$ctx$pageInfo'});
    return turns;
  }

  void _addMsg(PersistedChatMsg msg) {
    state = state.copyWith(messages: [msg, ...state.messages]);
  }

  Future<void> loadConversation(String userId, String convId) async {
    state = state.copyWith(isLoading: true);
    try {
      final ds = _ref.read(pbDataSourceProvider);
      final conv = await ds.getChatConversation(userId, convId);
      if (conv != null) {
        state = ChatSessionState(
          conversationId: conv.id,
          messages: conv.messages.reversed.toList(), // newest first
          title: conv.title,
          isLoading: false,
        );
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void newConversation() {
    state = const ChatSessionState();
    _initWelcome();
  }
}

final chatSessionProvider =
    StateNotifierProvider<ChatSessionNotifier, ChatSessionState>((ref) {
  return ChatSessionNotifier(ref);
});

final chatHistoryProvider =
    StreamProvider.family<List<ChatConversation>, String>(
  (ref, userId) {
    return ref
        .read(pbDataSourceProvider)
        .streamChatConversations(userId);
  },
);
