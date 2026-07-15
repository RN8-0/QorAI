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
    final category = data['productCategory']?.toString().trim();

    String subGreeting() {
      final suffix = subscriptions?.isNotEmpty == true
          ? (isTr ? ': $subscriptions' : ': $subscriptions')
          : '';
      return isTr
          ? 'Abonelik Analizi ekranındasınız$suffix; seçili servisleri ve quiz cevaplarını yorumlayabilirim.'
          : 'You are on the Subscription Analysis screen$suffix; I can interpret the selected services and quiz answers.';
    }

    String linkGreeting() {
      final suffix = linkProducts?.isNotEmpty == true ? ' ($linkProducts)' : '';
      return isTr
          ? 'Link Analizi ekranındasınız$suffix; yapıştırdığınız ürün linklerini ve analiz sonucunu okuyabilirim.'
          : 'You are on the Link Analysis screen$suffix; I can read the pasted product links and analysis result.';
    }

    String productGreeting() => isTr
        ? '$product ürün detayındasınız; özellikleri, fiyatı ve alternatifleri yorumlayabilirim.'
        : 'You are on the $product product detail page; I can review its specs, price and alternatives.';
    String compareGreeting() {
      if (compareProducts?.isNotEmpty == true) {
        return isTr
            ? 'Karşılaştırma ekranındasınız: $compareProducts. Farklarını netleştirebilirim.'
            : 'You are on the Comparison screen: $compareProducts. I can clarify the differences.';
      }
      return isTr
          ? 'Karşılaştırma ekranındasınız; eklediğiniz ürünlerin farklarını ve hangisinin size uygun olduğunu netleştirebilirim.'
          : 'You are on the Comparison screen; I can clarify the differences between the products you add and which fits you best.';
    }

    String homeGreeting() => isTr
        ? 'Ana Sayfadasınız; öne çıkan ürünler, kategoriler ve size özel öneriler konusunda yardımcı olabilirim.'
        : 'You are on the Home screen; I can help with featured products, categories and personalized picks.';
    String categoryGreeting() => isTr
        ? '${category?.isNotEmpty == true ? '$category kategorisindesiniz' : 'Kategori sayfasındasınız'}; bu kategorideki ürünleri karşılaştırıp önerebilirim.'
        : '${category?.isNotEmpty == true ? 'You are browsing the $category category' : 'You are on a category page'}; I can compare and recommend products here.';
    String searchGreeting() => isTr
        ? 'Arama ekranındasınız; aradığınız ürünü bulup karşılaştırabilir veya alternatif önerebilirim.'
        : 'You are on the Search screen; I can find the product you are looking for, compare it or suggest alternatives.';
    String collectionGreeting() => isTr
        ? 'Koleksiyonunuzdasınız; kaydettiğiniz ürünler hakkında yardımcı olabilirim.'
        : 'You are in your Collection; I can help with the products you saved.';
    String savedComparesGreeting() => isTr
        ? 'Karşılaştırmalarınızdasınız; kayıtlı karşılaştırmaları yorumlayabilirim.'
        : 'You are in your Comparisons; I can interpret your saved comparisons.';
    String defaultGreeting() => isTr
        ? 'Ürünler, karşılaştırmalar ve alışveriş kararlarınız konusunda yardımcı olabilirim.'
        : 'I can help with products, comparisons and your shopping decisions.';

    // ── ROUTE-AUTHORITATIVE ── (route = kullanıcının GERÇEKTEN bulunduğu sayfa)
    // Her sayfa için SPESİFİK karşılama; asla "bu sayfadasınız" deme. Sıra
    // önemli: '/home/browse' hem 'browse' hem 'home' içerir → browse önce.
    if (route.isNotEmpty) {
      if (route.contains('product')) {
        return product?.isNotEmpty == true ? productGreeting() : defaultGreeting();
      }
      if (route.contains('link-paste')) return linkGreeting();
      if (route.contains('subscriptions') || route.contains('premium')) {
        return subGreeting();
      }
      if (route.contains('browse') || route.contains('categor')) {
        return categoryGreeting();
      }
      if (route.contains('search')) return searchGreeting();
      if (route.contains('collection')) return collectionGreeting();
      if (route.contains('comparison')) return savedComparesGreeting();
      if (route.contains('compare')) return compareGreeting();
      if (route.contains('home')) return homeGreeting();
    }

    // ── DATA FALLBACK (route bilinmiyor/belirsiz) ──
    if (activeScreen.contains('subscription')) return subGreeting();
    if (activeScreen.contains('link')) return linkGreeting();
    if (product?.isNotEmpty == true) return productGreeting();
    if (subscriptions?.isNotEmpty == true) return subGreeting();
    if (linkProducts?.isNotEmpty == true) return linkGreeting();
    if (compareProducts?.isNotEmpty == true) return compareGreeting();
    return defaultGreeting();
  }

  String _welcomeText([Map<String, dynamic>? pageContext]) {
    final langCode = _activeLanguageCode();
    const greetings = <String, String>{
      'tr': '🚀 Ben Qor AI, ürün asistanınız.',
      'de': '🚀 Hallo, ich bin Qor AI, dein Produktassistent.',
      'fr': '🚀 Bonjour, je suis Qor AI, votre assistant produit.',
      'es': '🚀 Hola, soy Qor AI, tu asistente de productos.',
      'ar': '🚀 مرحباً، أنا Qor AI، مساعدك للمنتجات.',
      'ru': '🚀 Привет, я Qor AI, ваш продуктовый ассистент.',
      'zh': '🚀 你好，我是 Qor AI，你的产品助手。',
      'ja': '🚀 こんにちは、Qor AI 製品アシスタントです。',
      'ko': '🚀 안녕하세요, 제품 어시스턴트 Qor AI입니다.',
      'pt': '🚀 Olá, sou Qor AI, seu assistente de produtos.',
      'it': '🚀 Ciao, sono Qor AI, il tuo assistente prodotto.',
    };
    final base =
        greetings[langCode] ?? '🚀 Hi, I am Qor AI, your product assistant.';
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

  void updatePageContext(
    Map<String, dynamic>? pageContext, {
    bool forceWelcome = false,
  }) {
    _lastPageContext = pageContext;
    final userMsgCount = state.messages
        .where((m) => m.role == PersistedMsgRole.user)
        .length;
    final welcomeIndex = state.messages.indexWhere((m) => m.id == 'welcome');
    // Görsel tarama tohumu (scan-*) varsa ASLA karşılama ekleme — overlay
    // açılırken forceWelcome:true gelse bile tohumun üstüne çift karşılama
    // basılmasın (kullanıcı: "saçma sapan yazı + karşılama çift geliyor").
    final hasScanSeed = state.messages.any((m) => m.id.startsWith('scan-'));
    if (userMsgCount > 0 ||
        hasScanSeed ||
        (!forceWelcome && welcomeIndex < 0)) {
      return;
    }
    final updated = List<PersistedChatMsg>.from(state.messages);
    final previousWelcome = welcomeIndex >= 0
        ? updated.removeAt(welcomeIndex)
        : null;
    final nextWelcome = PersistedChatMsg(
      id: 'welcome',
      role: PersistedMsgRole.ai,
      text: _welcomeText(pageContext),
      timestamp: previousWelcome?.timestamp,
    );
    if (forceWelcome || welcomeIndex < 0) {
      updated.insert(0, nextWelcome);
    } else if (welcomeIndex >= 0) {
      updated.insert(welcomeIndex, nextWelcome);
    } else {
      updated.insert(0, nextWelcome);
    }
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
      final effectivePageContext = pageContext ?? _lastPageContext;
      _lastPageContext = effectivePageContext;
      final turns = await _buildTurns(
        trimmed,
        user,
        pageContext: effectivePageContext,
      );
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
        String? cc;
        String? cur;
        try {
          cc = (user.country as String?)?.toUpperCase();
          cur = (user.currency as String?)?.toUpperCase();
        } catch (_) {}
        context.add(
          'Database matches: ${matches.map((p) => _formatProductContext(p, cc, cur)).join(' ; ')}',
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

  String _formatProductContext(
    ProductEntity product, [
    String? countryCode,
    String? currency,
  ]) {
    final specs = product.keySpecs.entries
        .take(4)
        .map((entry) => '${entry.key}: ${entry.value}')
        .join(', ');
    final pros = product.pros.take(2).join(', ');
    final cons = product.cons.take(2).join(', ');
    // Site-first Qor price for the user's market, so the chat can quote the real
    // catalog price instead of guessing — same as the web assistant.
    final price = (countryCode != null && countryCode.isNotEmpty)
        ? product.getPriceForCountry(countryCode)
        : null;
    final priceStr = (price != null && price > 0)
        ? 'Qor price (${countryCode!}): ${price.round()}${currency != null && currency.isNotEmpty ? ' $currency' : ''}'
        : null;
    return [
      '${product.name} (${product.brand ?? 'brand unknown'}, ${product.category}/${product.subcategory}, score ${product.techScore.round()}/100)',
      ?priceStr,
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

  void newConversation({Map<String, dynamic>? pageContext}) {
    // Fresh conversation → greet for the CURRENT page. Callers (the floating
    // overlay) pass the live page context so the greeting never describes a
    // page the user already navigated away from; fall back to the last known
    // context only when none is supplied.
    if (pageContext != null) _lastPageContext = pageContext;
    state = const ChatSessionState();
    _initWelcome(pageContext ?? _lastPageContext);
  }

  /// Kullanıcı bir analiz sürerken yenisini başlatmaya çalıştı. Qor chat
  /// bandına "analiz sürüyor" uyarısı düşürür (analysisHub.alert) ve paneli açar
  /// ki kullanıcı görsün. Yeni analiz ÇAĞRILMAZ. (Thread'e mesaj YAZILMAZ →
  /// kalıcı geçmiş kirlenmez.)
  void notifyAnalysisBusy() {
    final isTr = _activeLanguageCode() == 'tr';
    final text = isTr
        ? '⏳ Şu anda bir analiz işlemi sürüyor. Yeni bir analiz başlatmadan önce mevcut analizin tamamlanmasını bekleyin.'
        : '⏳ An analysis is already in progress. Please wait for it to finish before starting a new one.';
    _ref.read(analysisHubProvider.notifier).setAlert(text);
    // Paneli aç (kullanıcı uyarıyı görsün). Zaten açıksa dinleyici no-op.
    _ref.read(chatOverlayRequestProvider.notifier).state = true;
  }

  /// Görsel tarama sonucunu ana chat'e QOR (AI) mesajı olarak tohumlar —
  /// SAHTE kullanıcı mesajı YAZMAZ (kullanıcı isteği: "ben göndermişim gibi
  /// saçma yazı olmasın"). Kullanıcı buradan normal yazarak devam eder.
  void seedScanResult(String text, {Map<String, dynamic>? pageContext}) {
    _lastPageContext = pageContext;
    state = const ChatSessionState().copyWith(
      messages: [
        PersistedChatMsg(
          id: 'scan-${DateTime.now().millisecondsSinceEpoch}',
          role: PersistedMsgRole.ai,
          text: text,
        ),
      ],
    );
  }
}

final chatSessionProvider =
    StateNotifierProvider<ChatSessionNotifier, ChatSessionState>((ref) {
      return ChatSessionNotifier(ref);
    });

/// Aynı anda birden fazla analiz koşmasını engeller. Zaten bir analiz
/// sürüyorsa (`analysisHubProvider.isBusy`) Qor chat'e uyarı düşürüp `true`
/// (engellendi) döner; çağıran yeni analizi BAŞLATMAMALIDIR. Analiz yoksa
/// `false` döner. UI tetikleyicileri (ürün analizi butonu, çoklu-link
/// karşılaştırma) için; `_ref`'i olan notifier'lar aynı kontrolü satır içi yapar.
bool blockIfAnalysisBusy(WidgetRef ref) {
  if (!ref.read(analysisHubProvider).isBusy) return false;
  ref.read(chatSessionProvider.notifier).notifyAnalysisBusy();
  return true;
}

final chatHistoryProvider = FutureProvider.autoDispose
    .family<List<ChatConversation>, String>((ref, userId) {
      return ref.read(pbDataSourceProvider).getChatConversations(userId);
    });
