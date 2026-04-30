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

  Map<String, dynamic>? _lastPageContext;

  String _activeLanguageCode() {
    final locale = _ref.read(localeProvider);
    if (locale?.languageCode.trim().isNotEmpty == true) {
      return locale!.languageCode.toLowerCase();
    }
    final profileLang = _ref.read(userProfileProvider).valueOrNull?.language;
    return (profileLang?.trim().isNotEmpty == true ? profileLang! : 'en')
        .toLowerCase();
  }

  String _contextGreeting(Map<String, dynamic>? pageContext, String langCode) {
    final data = pageContext ?? const <String, dynamic>{};
    final route = data['route']?.toString().toLowerCase() ?? '';
    final activeScreen = data['activeScreen']?.toString().toLowerCase() ?? '';
    final product = data['productName']?.toString().trim();
    final compareProducts = data['compareProducts']?.toString().trim();
    final linkProducts =
        data['linkCompareResults']?.toString().trim().isNotEmpty == true
        ? data['linkCompareResults'].toString().trim()
        : data['singleLinkProduct']?.toString().trim();
    final subscriptions = data['subscriptionServices']?.toString().trim();

    final isTr = langCode == 'tr';
    if (route.contains('subscriptions') ||
        activeScreen.contains('subscription') ||
        subscriptions?.isNotEmpty == true) {
      return isTr
          ? 'Abonelik analizi ekranını görüyorum; seçili servisleri, skorları ve quiz cevaplarını birlikte yorumlayabilirim.'
          : 'I can see the Subscription Analysis screen; I can interpret the selected services, scores, and quiz answers with you.';
    }
    if (route.contains('link-paste') ||
        activeScreen.contains('link') ||
        linkProducts?.isNotEmpty == true) {
      final suffix = linkProducts?.isNotEmpty == true ? ' ($linkProducts)' : '';
      return isTr
          ? 'Link Analysis ekranındasın$suffix; ürün linklerini, karşılaştırma sonucunu ve uyumluluk skorunu okuyabiliyorum.'
          : 'You are on Link Analysis$suffix; I can read the product links, comparison result, and compatibility score.';
    }
    if (product?.isNotEmpty == true) {
      return isTr
          ? '$product ürün detayını inceliyorsun; teknik skor, özellikler ve alternatifler üzerinden yardımcı olabilirim.'
          : 'You are viewing $product; I can help with its specs, score, trade-offs, and alternatives.';
    }
    if (compareProducts?.isNotEmpty == true) {
      return isTr
          ? 'Karşılaştırma ekranındaki ürünleri görüyorum: $compareProducts. Güçlü/zayıf yönleri netleştirebilirim.'
          : 'I can see your comparison: $compareProducts. I can clarify the strengths and trade-offs.';
    }
    if (route.contains('pc-builder')) {
      return isTr
          ? 'PC Builder ekranındasın; parça uyumu, darboğaz ve yükseltme önerilerinde yardımcı olabilirim.'
          : 'You are in PC Builder; I can help with compatibility, bottlenecks, and upgrade choices.';
    }
    return isTr
        ? 'Bu sayfadaki ürün ve alışveriş bağlamını okuyup sorularını ona göre yanıtlayabilirim.'
        : 'I can use the current product and shopping context on this screen when answering.';
  }

  String _welcomeText([Map<String, dynamic>? pageContext]) {
    final langCode = _activeLanguageCode();
    const greetings = <String, String>{
      'tr':
          '!Ben Qor AI! Ürün asistanıyım. Ürünler, markalar, abonelikler, link analizleri ve satın alma kararları için buradayım.',
      'de':
          'Hallo! Ich bin Qor AI, dein Produktassistent. Ich helfe dir bei Produkten, Links, Abos und Kaufentscheidungen.',
      'fr':
          'Bonjour! Je suis Qor AI, votre assistant produit. Je peux vous aider avec les produits, liens, abonnements et décisions d’achat.',
      'es':
          'Hola! Soy Qor AI, tu asistente de productos. Puedo ayudarte con productos, enlaces, suscripciones y decisiones de compra.',
      'ar': 'مرحباً! أنا مساعدك Qor AI. اسألني عن المنتجات والتسوق! 🚀',
      'ru':
          'Привет! Я ваш ассистент Qor AI. Спрашивайте меня о продуктах и покупках! 🚀',
      'zh': '你好！我是您的Qor AI助手。询问关于产品和购物的任何问题！🚀',
      'ja': 'こんにちは！Qor AIアシスタントです。製品やお買い物について何でも聞いてください！🚀',
      'ko': '안녕하세요! Qor AI 어시스턴트입니다. 제품과 쇼핑에 대해 무엇이든 물어보세요! 🚀',
      'pt':
          'Olá! Sou seu assistente Qor AI. Pergunte-me sobre produtos e compras! 🚀',
      'it':
          'Ciao! Sono Qor AI, il tuo assistente prodotto. Posso aiutarti con prodotti, link, abbonamenti e decisioni di acquisto.',
    };
    final base =
        greetings[langCode] ??
        'Hi! I am Qor AI, your product assistant. I can help with products, links, subscriptions, and buying decisions.';
    return '$base ${_contextGreeting(pageContext, langCode)}';
  }

  void _initWelcome([Map<String, dynamic>? pageContext]) {
    final text = _welcomeText(pageContext);
    final welcome = PersistedChatMsg(
      id: 'welcome',
      role: PersistedMsgRole.ai,
      text: text,
    );
    state = state.copyWith(messages: [welcome]);
  }

  void updatePageContext(Map<String, dynamic>? pageContext) {
    _lastPageContext = pageContext;
    final userMsgCount = state.messages
        .where((m) => m.role == PersistedMsgRole.user)
        .length;
    final welcomeIndex = state.messages.indexWhere((m) => m.id == 'welcome');
    if (userMsgCount > 0 || welcomeIndex < 0) return;
    final updated = List<PersistedChatMsg>.from(state.messages);
    updated[welcomeIndex] = PersistedChatMsg(
      id: 'welcome',
      role: PersistedMsgRole.ai,
      text: _welcomeText(pageContext),
      timestamp: updated[welcomeIndex].timestamp,
    );
    state = state.copyWith(messages: updated);
  }

  String _autoTitle(String firstUserMsg) {
    final t = firstUserMsg.trim();
    return t.length > 45 ? '${t.substring(0, 45)}...' : t;
  }

  Future<void> send(String text, {Map<String, dynamic>? pageContext}) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    final user = _ref.read(userProfileProvider).valueOrNull;
    if (user == null) {
      _addMsg(
        PersistedChatMsg(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          role: PersistedMsgRole.system,
          text: 'Please sign in to use AI Chat.',
          status: PersistedMsgStatus.error,
        ),
      );
      return;
    }

    final sub = _ref.read(subscriptionServiceProvider);
    final quota = sub.recordAIQuestion();
    if (quota.isFailure) {
      final locale = _ref.read(localeProvider);
      _addMsg(
        PersistedChatMsg(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          role: PersistedMsgRole.system,
          text: buildDailyQLimitMessage(locale?.languageCode),
          status: PersistedMsgStatus.error,
        ),
      );
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
    final userMsgCount = state.messages
        .where((m) => m.role == PersistedMsgRole.user)
        .length;
    final isFirstUserMsg = userMsgCount == 1;
    final title = isFirstUserMsg ? _autoTitle(trimmed) : state.title;
    if (isFirstUserMsg) state = state.copyWith(title: title);

    final convId = await _ensureConversation(user.uid, title);

    try {
      final gemini = _ref.read(geminiServiceProvider);

      // Text chat only — image analysis moved to Visual Scanner
      final turns = await _buildTurns(trimmed, user, pageContext: pageContext);
      final aiMsgId = '${DateTime.now().millisecondsSinceEpoch}_ai';
      String accumulated = '';

      try {
        await for (final chunk in gemini.chatConversationStream(turns, user)) {
          accumulated += chunk;
          final cleanText = _sanitizeAiText(_stripJsonWrapper(accumulated));
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
      final cleanText = _sanitizeAiText(_stripJsonWrapper(accumulated));
      final aiMsg = PersistedChatMsg(
        id: aiMsgId,
        role: PersistedMsgRole.ai,
        text: cleanText,
      );
      _updateOrAddMsg(aiMsg);

      // Persist to Firestore in background (fire-and-forget)
      final ds = _ref.read(pbDataSourceProvider);
      final allMsgs = List<PersistedChatMsg>.from(state.messages.reversed);
      ds.updateChatConversation(user.uid, convId, allMsgs, title).catchError((
        _,
      ) {
        /* silent fail */
      });
    } catch (e) {
      _addMsg(
        PersistedChatMsg(
          id: '${DateTime.now().millisecondsSinceEpoch}_err',
          role: PersistedMsgRole.ai,
          text: 'Sorry, I couldn\'t process that. Please try again.',
          status: PersistedMsgStatus.error,
        ),
      );
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
      final match = RegExp(
        r'"message"\s*:\s*"((?:[^"\\]|\\.)*)',
      ).firstMatch(trimmed);
      if (match != null) {
        return match.group(1)?.replaceAll(r'\"', '"').replaceAll(r'\n', '\n') ??
            trimmed;
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
    try {
      final newId = await ds.createChatConversation(conv);
      state = state.copyWith(conversationId: newId);
      return newId;
    } catch (_) {
      final localId = 'local_${DateTime.now().millisecondsSinceEpoch}';
      state = state.copyWith(conversationId: localId);
      return localId;
    }
  }

  Future<List<Map<String, String>>> _buildTurns(
    String newMsg,
    dynamic user, {
    Map<String, dynamic>? pageContext,
  }) async {
    // Keep last 5 messages to reduce token cost (~40% savings per call)
    final recent = state.messages
        .where((m) => m.role != PersistedMsgRole.system)
        .take(5)
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
    final appLanguage = _activeLanguageCode();
    parts.add('App language: $appLanguage');
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
      if (pageContext['page'] != null) {
        pageCtxStr.add('Currently viewing: ${pageContext['page']}');
      }
      if (pageContext['route'] != null) {
        pageCtxStr.add('Route: ${pageContext['route']}');
      }
      if (pageContext['productName'] != null) {
        pageCtxStr.add('Product: ${pageContext['productName']}');
      }
      if (pageContext['productBrand'] != null) {
        pageCtxStr.add('Brand: ${pageContext['productBrand']}');
      }
      if (pageContext['productCategory'] != null) {
        pageCtxStr.add('Category: ${pageContext['productCategory']}');
      }
      if (pageContext['techScore'] != null) {
        pageCtxStr.add('Tech Score: ${pageContext['techScore']}');
      }
      if (pageContext['matchScore'] != null) {
        pageCtxStr.add('Match Score: ${pageContext['matchScore']}');
      }
      if (pageContext['compareProducts'] != null) {
        pageCtxStr.add('Compared products: ${pageContext['compareProducts']}');
      }
      if (pageContext['pcBuilderParts'] != null) {
        pageCtxStr.add('PC build parts: ${pageContext['pcBuilderParts']}');
      }
      if (pageContext['recentChatMessages'] != null &&
          pageContext['recentChatMessages'].toString().trim().isNotEmpty) {
        pageCtxStr.add(
          'Recent chat context: ${pageContext['recentChatMessages']}',
        );
      }
      for (final entry in pageContext.entries) {
        final key = entry.key;
        if (const {
          'page',
          'route',
          'productName',
          'productBrand',
          'productCategory',
          'techScore',
          'matchScore',
          'compareProducts',
          'pcBuilderParts',
          'recentChatMessages',
        }.contains(key)) {
          continue;
        }
        final value = entry.value?.toString().trim() ?? '';
        if (value.isNotEmpty) pageCtxStr.add('$key: $value');
      }
    }

    try {
      final compare = _ref.read(compareSessionProvider);
      final compared = compare.comparedProducts;
      if (compared != null && compared.isNotEmpty) {
        pageCtxStr.add(
          'Active comparison: ${compared.map((p) => '${p.name} (${p.techScore.round()}/100)').take(4).join(' vs ')}',
        );
      }
      final pcBuild = _ref.read(pcBuilderSessionProvider);
      if (pcBuild.isNotEmpty) {
        pageCtxStr.add(
          'Current PC build: ${pcBuild.entries.map((e) => '${e.key}: ${e.value.name}').take(8).join(' | ')}',
        );
      }
    } catch (_) {}

    final liveContext = await _buildLiveResearchContext(
      newMsg,
      user,
      pageContext,
    );

    final liveInfo = liveContext.isEmpty
        ? ''
        : '\n[Qor Live Product Context: ${liveContext.join(' | ')} | Treat database matches as current app data. If a product appears here or in Page Context, do not claim it does not exist or has not launched based only on older model knowledge.]';

    final ctx = parts.isEmpty ? '' : '\n[User Profile: ${parts.join(' | ')}]';
    final pageInfo = pageCtxStr.isEmpty
        ? ''
        : '\n[Authoritative Page Context: ${pageCtxStr.join(' | ')} | Use this as the current screen state. You can analyze Subscription Analysis and Link Analysis data shown here. Do not infer a different current page/product from older messages.]';
    final languageInfo =
        '\n[Language Directive: Always answer in the current app language: $appLanguage. If the user writes in another language, mirror the user only when it clearly overrides the app language.]';
    turns.add({
      'role': 'user',
      'text': '$newMsg$ctx$pageInfo$liveInfo$languageInfo',
    });
    return turns;
  }

  Future<List<String>> _buildLiveResearchContext(
    String message,
    dynamic user,
    Map<String, dynamic>? pageContext,
  ) async {
    final context = <String>[];

    final url = _firstUrl(message);
    if (url != null) {
      try {
        final result = await _ref
            .read(geminiServiceProvider)
            .analyzeLink(url, user);
        final title = result.metadata.title?.trim();
        if (title != null && title.isNotEmpty) {
          context.add(
            'Link analysis: ${result.isProduct ? 'product' : 'not product'}; title=$title; category=${result.category ?? 'unknown'}; score=${result.aiScore.round()}/100; summary=${_compact(result.aiAnalysis, 420)}',
          );
        }
      } catch (_) {}
    }

    final queries = _productSearchQueries(message, pageContext);
    if (queries.isEmpty) return context;

    try {
      final repo = _ref.read(productRepositoryProvider);
      final seenProductIds = <String>{};
      final matches = <ProductEntity>[];
      for (final query in queries.take(3)) {
        final result = await repo.searchProducts(query: query, limit: 5);
        final products = result.dataOrNull ?? const <ProductEntity>[];
        for (final product in products) {
          if (seenProductIds.add(product.id)) matches.add(product);
          if (matches.length >= 5) break;
        }
        if (matches.length >= 5) break;
      }
      if (matches.isNotEmpty) {
        context.add(
          'Database matches: ${matches.map(_formatProductContext).join(' ; ')}',
        );
      }
    } catch (_) {}

    return context;
  }

  List<String> _productSearchQueries(
    String message,
    Map<String, dynamic>? pageContext,
  ) {
    final queries = <String>[];
    void addQuery(String? value) {
      final clean = value
          ?.replaceAll(RegExp(r'https?://\S+', caseSensitive: false), ' ')
          .replaceAll(RegExp(r'[^\w\s\-+./ğüşöçıİĞÜŞÖÇ]', unicode: true), ' ')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      if (clean == null || clean.length < 2 || clean.length > 90) return;
      if (!queries.any((query) => query.toLowerCase() == clean.toLowerCase())) {
        queries.add(clean);
      }
    }

    addQuery(pageContext?['productName']?.toString());
    addQuery(pageContext?['activeAnalysisProduct']?.toString());

    final modelMatches = RegExp(
      r'\b(?:[A-Za-zğüşöçıİĞÜŞÖÇ]+[\s-]+){0,3}[A-Za-zğüşöçıİĞÜŞÖÇ]*\d[A-Za-z0-9]*(?:[\s-]+(?:Ultra|Pro|Max|Plus|Mini|Air|Fold|Flip|Note|Galaxy|iPhone|Ryzen|Core|RTX|GTX|MacBook|iPad)){0,3}\b',
      caseSensitive: false,
      unicode: true,
    ).allMatches(message);
    for (final match in modelMatches) {
      addQuery(match.group(0));
    }

    if (queries.isEmpty || message.length <= 90) addQuery(message);
    return queries.take(5).toList(growable: false);
  }

  String? _firstUrl(String text) {
    final match = RegExp(
      r'https?://[^\s)\]}>,]+',
      caseSensitive: false,
    ).firstMatch(text);
    return match?.group(0);
  }

  String _formatProductContext(ProductEntity product) {
    final specs = product.keySpecs.entries
        .take(4)
        .map((entry) => '${entry.key}: ${entry.value}')
        .join(', ');
    final pros = product.pros.take(2).join(', ');
    final cons = product.cons.take(2).join(', ');
    return [
      '${product.name} (${product.brand ?? 'brand unknown'}, ${product.category}/${product.subcategory}, score ${product.techScore.round()}/100)',
      if (specs.isNotEmpty) 'specs: $specs',
      if (pros.isNotEmpty) 'pros: $pros',
      if (cons.isNotEmpty) 'cons: $cons',
    ].join(', ');
  }

  String _compact(String text, int maxChars) {
    final clean = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (clean.length <= maxChars) return clean;
    return '${clean.substring(0, maxChars).trim()}...';
  }

  static String _sanitizeAiText(String text) {
    return text
        .replaceAll(
          RegExp(r'\bGoogle\s+Search\b', caseSensitive: false),
          'web search',
        )
        .replaceAll(RegExp(r'\bGoogle\s+AI\b', caseSensitive: false), 'Qor AI')
        .replaceAll(RegExp(r'\bGemini\b', caseSensitive: false), 'Qor AI')
        .replaceAll(RegExp(r'\bDeepSeek\b', caseSensitive: false), 'Qor AI');
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
    _initWelcome(_lastPageContext);
  }
}

final chatSessionProvider =
    StateNotifierProvider<ChatSessionNotifier, ChatSessionState>((ref) {
      return ChatSessionNotifier(ref);
    });

final chatHistoryProvider = FutureProvider.autoDispose
    .family<List<ChatConversation>, String>((ref, userId) {
      return ref.read(pbDataSourceProvider).getChatConversations(userId);
    });
