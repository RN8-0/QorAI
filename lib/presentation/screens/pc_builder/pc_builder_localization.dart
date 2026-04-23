library;

import 'package:flutter/material.dart';
import 'package:compair/core/spec_word_dictionary.dart' as spec_dict;

String localizePcBuilderText(
  BuildContext context, {
  required String en,
  String? tr,
}) {
  final locale = Localizations.localeOf(context).languageCode;
  if (locale == 'en') return en;
  if (locale == 'tr' && tr != null) return tr;

  final exact = _exactPhraseTranslations[en]?[locale];
  if (exact != null && exact.isNotEmpty) {
    return exact;
  }

  return spec_dict.translateSpec(en, locale);
}

const Map<String, Map<String, String>> _exactPhraseTranslations = {
  'PC Builder': {
    'tr': 'PC Toplayici',
    'de': 'PC-Baukasten',
    'es': 'Constructor de PC',
    'fr': 'Assembleur PC',
    'it': 'Configuratore PC',
    'ja': 'PCビルダー',
    'nl': 'PC-bouwer',
    'pl': 'Kreator PC',
    'pt': 'Montador de PC',
    'sv': 'PC-byggare',
    'ar': 'منشئ الكمبيوتر',
  },
  'Start Building': {
    'tr': 'Toplamaya Basla',
    'de': 'Build starten',
    'es': 'Comenzar a montar',
    'fr': 'Commencer le montage',
    'it': 'Inizia a configurare',
    'ja': '構成を開始',
    'nl': 'Begin met bouwen',
    'pl': 'Rozpocznij skladanie',
    'pt': 'Comecar montagem',
    'sv': 'Borja bygga',
    'ar': 'ابدأ التجميع',
  },
  'AI-powered compatibility check\nand performance analysis': {
    'tr': 'YZ destekli uyumluluk kontrolu\nve performans analizi',
    'de': 'KI-gestutzte Kompatibilitatsprufung\nund Leistungsanalyse',
    'es': 'Comprobacion de compatibilidad\ny analisis de rendimiento con IA',
    'fr': 'Verification de compatibilite\net analyse des performances par IA',
    'it': 'Controllo compatibilita\ne analisi prestazioni con IA',
    'ja': 'AIによる互換性チェックと\nパフォーマンス分析',
    'nl': 'AI-gestuurde compatibiliteitscontrole\nen prestatieanalyse',
    'pl': 'Kontrola kompatybilnosci i\nanaliza wydajnosci wspierana przez AI',
    'pt': 'Verificacao de compatibilidade\n e analise de desempenho com IA',
    'sv': 'AI-driven kompatibilitetskontroll\noch prestandaanalys',
    'ar': 'فحص التوافق وتحليل الأداء\nبواسطة الذكاء الاصطناعي',
  },
  'Compatibility Check': {
    'tr': 'Uyumluluk Kontrolu',
    'de': 'Kompatibilitatsprufung',
    'es': 'Comprobacion de compatibilidad',
    'fr': 'Verification de compatibilite',
    'it': 'Controllo compatibilita',
    'ja': '互換性チェック',
    'nl': 'Compatibiliteitscontrole',
    'pl': 'Sprawdzenie kompatybilnosci',
    'pt': 'Verificacao de compatibilidade',
    'sv': 'Kompatibilitetskontroll',
    'ar': 'فحص التوافق',
  },
  'Socket, RAM and PSU compatibility is verified automatically. Incompatible parts cannot be selected.': {
    'tr':
        'Soket, RAM ve PSU uyumlulugu otomatik kontrol edilir. Uyumsuz parcalar secilemez.',
    'de':
        'Die Kompatibilitat von Sockel, RAM und Netzteil wird automatisch gepruft. Inkompatible Teile konnen nicht ausgewahlt werden.',
    'es':
        'La compatibilidad de socket, RAM y PSU se verifica automaticamente. No se pueden seleccionar piezas incompatibles.',
    'fr':
        'La compatibilite du socket, de la RAM et de l alimentation est verifiee automatiquement. Les pieces incompatibles ne peuvent pas etre selectionnees.',
    'it':
        'La compatibilita di socket, RAM e PSU viene verificata automaticamente. I componenti incompatibili non possono essere selezionati.',
    'ja': 'ソケット、RAM、PSU の互換性は自動で確認されます。互換性のないパーツは選択できません。',
    'nl':
        'Compatibiliteit van socket, RAM en PSU wordt automatisch gecontroleerd. Incompatibele onderdelen kunnen niet worden geselecteerd.',
    'pl':
        'Kompatybilnosc gniazda, RAM i PSU jest sprawdzana automatycznie. Niekompatybilnych czesci nie mozna wybrac.',
    'pt':
        'A compatibilidade de socket, RAM e PSU e verificada automaticamente. Pecas incompativeis nao podem ser selecionadas.',
    'sv':
        'Kompatibilitet for socket, RAM och PSU verifieras automatiskt. Inkompatibla delar kan inte valjas.',
    'ar':
        'يتم التحقق من توافق المقبس وذاكرة RAM ومزود الطاقة تلقائياً. لا يمكن اختيار القطع غير المتوافقة.',
  },
  'AI Performance Analysis': {
    'tr': 'YZ Performans Analizi',
    'de': 'KI-Leistungsanalyse',
    'es': 'Analisis de rendimiento con IA',
    'fr': 'Analyse de performances par IA',
    'it': 'Analisi prestazioni IA',
    'ja': 'AIパフォーマンス分析',
    'nl': 'AI-prestatieanalyse',
    'pl': 'Analiza wydajnosci AI',
    'pt': 'Analise de desempenho com IA',
    'sv': 'AI-prestandaanalys',
    'ar': 'تحليل الأداء بالذكاء الاصطناعي',
  },
  'Bottleneck detection, gaming FPS estimates and performance tier powered by Compair AI.': {
    'tr':
        'Darbogaz tespiti, oyun FPS tahmini ve performans seviyesi Compair AI ile sunulur.',
    'de':
        'Engpasserkennung, Gaming-FPS-Schatzungen und Leistungsklasse mit Compair AI.',
    'es':
        'Deteccion de cuello de botella, estimaciones de FPS en juegos y nivel de rendimiento con Compair AI.',
    'fr':
        'Detection des goulots d etranglement, estimation FPS gaming et niveau de performance par Compair AI.',
    'it':
        'Rilevamento colli di bottiglia, stime FPS gaming e fascia prestazionale con Compair AI.',
    'ja': 'ボトルネック検出、ゲームFPS推定、性能ランクを Compair AI が提供します。',
    'nl':
        'Bottleneck-detectie, gaming-FPS-schattingen en prestatieniveau aangedreven door Compair AI.',
    'pl':
        'Wykrywanie waskich gardel, szacowanie FPS w grach i poziom wydajnosci przez Compair AI.',
    'pt':
        'Deteccao de gargalo, estimativas de FPS em jogos e nivel de desempenho com Compair AI.',
    'sv':
        'Flaskhalsdetektering, spel-FPS-prognoser och prestandaniva med Compair AI.',
    'ar':
        'اكتشاف عنق الزجاجة وتقدير FPS للألعاب ومستوى الأداء بواسطة Compair AI.',
  },
  'Power Calculation': {
    'tr': 'Guc Hesaplama',
    'de': 'Leistungsberechnung',
    'es': 'Calculo de energia',
    'fr': 'Calcul de puissance',
    'it': 'Calcolo potenza',
    'ja': '消費電力計算',
    'nl': 'Vermogensberekening',
    'pl': 'Obliczanie mocy',
    'pt': 'Calculo de energia',
    'sv': 'Effektberakning',
    'ar': 'حساب الطاقة',
  },
  'Total power draw of selected components and PSU adequacy shown in real time.': {
    'tr':
        'Secilen bilesenlerin toplam guc tuketimi ve PSU yeterliligi anlik gosterilir.',
    'de':
        'Gesamtleistungsaufnahme der ausgewahlten Komponenten und Netzteil-Eignung werden in Echtzeit angezeigt.',
    'es':
        'El consumo total de energia de los componentes seleccionados y la suficiencia de la PSU se muestran en tiempo real.',
    'fr':
        'La consommation totale des composants selectionnes et l adequation de l alimentation sont affichees en temps reel.',
    'it':
        'Il consumo totale dei componenti selezionati e l adeguatezza del PSU sono mostrati in tempo reale.',
    'ja': '選択したコンポーネントの総消費電力とPSUの余裕をリアルタイムで表示します。',
    'nl':
        'Totaal stroomverbruik van geselecteerde componenten en geschiktheid van de PSU worden realtime getoond.',
    'pl':
        'Laczny pobor mocy wybranych komponentow i wystarczalnosc PSU sa pokazywane w czasie rzeczywistym.',
    'pt':
        'O consumo total de energia dos componentes selecionados e a adequacao da PSU sao exibidos em tempo real.',
    'sv':
        'Total effektforbrukning for valda komponenter och PSU-lamplighet visas i realtid.',
    'ar':
        'يتم عرض استهلاك الطاقة الكلي للمكونات المختارة ومدى كفاية مزود الطاقة في الوقت الفعلي.',
  },
  '12 Component Categories': {
    'tr': '12 Bilesen Kategorisi',
    'de': '12 Komponenten-Kategorien',
    'es': '12 categorias de componentes',
    'fr': '12 categories de composants',
    'it': '12 categorie di componenti',
    'ja': '12種類のコンポーネントカテゴリ',
    'nl': '12 componentcategorieen',
    'pl': '12 kategorii komponentow',
    'pt': '12 categorias de componentes',
    'sv': '12 komponentkategorier',
    'ar': '12 فئة من المكونات',
  },
  'From CPU to keyboard, monitor to headset — build a complete system on one screen.': {
    'tr':
        'CPU dan klavyeye, monitorden kulakliga kadar tam sistemi tek ekranda kurun.',
    'de':
        'Von CPU bis Tastatur, von Monitor bis Headset — stelle ein komplettes System auf einem Bildschirm zusammen.',
    'es':
        'Desde CPU hasta teclado, de monitor a auriculares: monta un sistema completo en una sola pantalla.',
    'fr':
        'Du CPU au clavier, de l ecran au casque — construisez un systeme complet sur un seul ecran.',
    'it':
        'Dalla CPU alla tastiera, dal monitor alle cuffie: crea un sistema completo in una sola schermata.',
    'ja': 'CPUからキーボード、モニターからヘッドセットまで、1画面でフル構成を組めます。',
    'nl':
        'Van CPU tot toetsenbord, van monitor tot headset — bouw een compleet systeem op een scherm.',
    'pl':
        'Od CPU po klawiature, od monitora po zestaw sluchawkowy — zloz kompletny zestaw na jednym ekranie.',
    'pt':
        'De CPU ao teclado, do monitor ao headset — monte um sistema completo em uma unica tela.',
    'sv':
        'Fran CPU till tangentbord, fran skarm till headset — bygg ett komplett system pa en skarm.',
    'ar':
        'من المعالج إلى لوحة المفاتيح، ومن الشاشة إلى السماعة — ابنِ نظاماً كاملاً على شاشة واحدة.',
  },
  'Analyze': {
    'tr': 'Analiz Et',
    'de': 'Analysieren',
    'es': 'Analizar',
    'fr': 'Analyser',
    'it': 'Analizza',
    'ja': '分析',
    'nl': 'Analyseren',
    'pl': 'Analizuj',
    'pt': 'Analisar',
    'sv': 'Analysera',
    'ar': 'تحليل',
  },
  'Build Summary': {
    'tr': 'Sistem Ozeti',
    'de': 'Build-Zusammenfassung',
    'es': 'Resumen de la build',
    'fr': 'Resume de la configuration',
    'it': 'Riepilogo build',
    'ja': '構成サマリー',
    'nl': 'Buildsamenvatting',
    'pl': 'Podsumowanie zestawu',
    'pt': 'Resumo da build',
    'sv': 'Buildsammanfattning',
    'ar': 'ملخص التجميعة',
  },
  'Share Build': {
    'tr': 'Sistemi Paylas',
    'de': 'Build teilen',
    'es': 'Compartir build',
    'fr': 'Partager la configuration',
    'it': 'Condividi build',
    'ja': '構成を共有',
    'nl': 'Build delen',
    'pl': 'Udostepnij zestaw',
    'pt': 'Compartilhar build',
    'sv': 'Dela build',
    'ar': 'مشاركة التجميعة',
  },
  'Build Complete!': {
    'tr': 'Sistem Tamamlandi!',
    'de': 'Build abgeschlossen!',
    'es': 'Build completada',
    'fr': 'Configuration terminee',
    'it': 'Build completata',
    'ja': '構成が完成しました',
    'nl': 'Build voltooid',
    'pl': 'Zestaw gotowy',
    'pt': 'Build concluida',
    'sv': 'Bygget ar klart',
    'ar': 'اكتملت التجميعة',
  },
  'Not selected': {
    'tr': 'Secilmedi',
    'de': 'Nicht ausgewahlt',
    'es': 'No seleccionado',
    'fr': 'Non selectionne',
    'it': 'Non selezionato',
    'ja': '未選択',
    'nl': 'Niet geselecteerd',
    'pl': 'Nie wybrano',
    'pt': 'Nao selecionado',
    'sv': 'Inte vald',
    'ar': 'غير محدد',
  },
  'Newest': {
    'tr': 'En Yeni',
    'de': 'Neueste',
    'es': 'Mas recientes',
    'fr': 'Plus recents',
    'it': 'Piu recenti',
    'ja': '新着順',
    'nl': 'Nieuwste',
    'pl': 'Najnowsze',
    'pt': 'Mais recentes',
    'sv': 'Nyaste',
    'ar': 'الأحدث',
  },
  'No specifications available.': {
    'tr': 'Özellik bilgisi yok.',
    'de': 'Keine technischen Daten verfugbar.',
    'es': 'No hay especificaciones disponibles.',
    'fr': 'Aucune specification disponible.',
    'it': 'Nessuna specifica disponibile.',
    'ja': '仕様情報がありません。',
    'nl': 'Geen specificaties beschikbaar.',
    'pl': 'Brak dostepnych specyfikacji.',
    'pt': 'Nenhuma especificacao disponivel.',
    'sv': 'Inga specifikationer tillgangliga.',
    'ar': 'لا توجد مواصفات متاحة.',
  },
};
