const LABELS = {
  tr: {
    '5G': '5G',
    '4G': '4G',
    '2G': '2G',
    '3G': '3G',
    'Audio Output': 'Ses çıkışı',
    'Announcement Date': 'Duyuru tarihi',
    'Battery capacity': 'Pil kapasitesi',
    'Battery cycle life': 'Pil şarj döngüsü',
    'Battery Specifications': 'Pil özellikleri',
    'Battery Technology': 'Pil teknolojisi',
    'Bluetooth': 'Bluetooth',
    'Brightness': 'Parlaklık',
    'Camera aperture': 'Kamera diyaframı',
    'Charging port': 'Şarj portu',
    'Chipset': 'Yonga seti',
    'Color': 'Renk',
    'CPU cores': 'CPU çekirdeği',
    'CPU frequency': 'CPU frekansı',
    'Dimensions': 'Boyutlar',
    'Display / Body Ratio': 'Ekran/gövde oranı',
    'Display Size': 'Ekran boyutu',
    'Fast charging': 'Hızlı şarj',
    'Fast charging features': 'Hızlı şarj özellikleri',
    'Fast charging power': 'Hızlı şarj gücü',
    'Front camera': 'Ön kamera',
    'GPU': 'GPU',
    'Height': 'Yükseklik',
    'Main camera': 'Ana kamera',
    'NFC': 'NFC',
    'Operating system': 'İşletim sistemi',
    'Optical Image Stabilization (OIS)': 'Optik görüntü sabitleme (OIS)',
    'Optical Image Stabilizer (OIS)': 'Optik görüntü sabitleyici (OIS)',
    'Panel type': 'Panel türü',
    'Pixel density': 'Piksel yoğunluğu',
    'Processor': 'İşlemci',
    'Processor family': 'İşlemci ailesi',
    'RAM': 'RAM',
    'RAM type': 'RAM türü',
    'Refresh rate': 'Yenileme hızı',
    'Removable battery': 'Çıkarılabilir pil',
    'Resolution': 'Çözünürlük',
    'SAR Value 10g (Head)': 'SAR değeri 10g (baş)',
    'Screen size': 'Ekran boyutu',
    'Sensors': 'Sensörler',
    'SIM': 'SIM',
    'SIM Count': 'SIM sayısı',
    'Speakers': 'Hoparlörler',
    'Storage': 'Depolama',
    'Storage type': 'Depolama türü',
    'Thickness': 'Kalınlık',
    'USB': 'USB',
    'USB-C charging': 'USB-C şarj',
    'Video playback': 'Video oynatma',
    'Video recording': 'Video kaydı',
    'Water resistance': 'Suya dayanıklılık',
    'Weight': 'Ağırlık',
    'Wi-Fi': 'Wi-Fi',
    'Width': 'Genişlik',
    'Wireless charging': 'Kablosuz şarj',
  },
  de: {
    '5G': '5G',
    '4G': '4G',
    '3G': '3G',
    '2G': '2G',
    'Audio Output': 'Audioausgang',
    'Audio Output Gücü (RMS)': 'Audioausgangsleistung (RMS)',
    'Ses çıkışı': 'Audioausgang',
    'Announcement Date': 'Ankündigungsdatum',
    'Duyuru tarihi': 'Ankündigungsdatum',
    'Battery capacity': 'Akkukapazität',
    'Pil kapasitesi': 'Akkukapazität',
    'Pil Kapasitesi': 'Akkukapazität',
    'Batarya': 'Akku',
    'Battery cycle life': 'Akkuladezyklen',
    'Pil şarj döngüsü': 'Akkuladezyklen',
    'Battery Specifications': 'Akkudaten',
    'Pil özellikleri': 'Akkudaten',
    'Battery Technology': 'Akkutechnologie',
    'Pil teknolojisi': 'Akkutechnologie',
    'Bluetooth': 'Bluetooth',
    'Brightness': 'Helligkeit',
    'Parlaklık': 'Helligkeit',
    'Camera aperture': 'Kamera-Blende',
    'Kamera diyaframı': 'Kamera-Blende',
    'Charging port': 'Ladeanschluss',
    'Şarj portu': 'Ladeanschluss',
    'Chipset': 'Chipsatz',
    'Yonga seti': 'Chipsatz',
    'Color': 'Farbe',
    'Renk': 'Farbe',
    'CPU cores': 'CPU-Kerne',
    'CPU çekirdeği': 'CPU-Kerne',
    'CPU frequency': 'CPU-Takt',
    'CPU frekansı': 'CPU-Takt',
    'Dimensions': 'Abmessungen',
    'Boyutlar': 'Abmessungen',
    'Display / Body Ratio': 'Display/Gehäuse-Verhältnis',
    'Ekran/gövde oranı': 'Display/Gehäuse-Verhältnis',
    'Display Size': 'Displaygröße',
    'Display Boyutu': 'Displaygröße',
    'Ekran': 'Display',
    'Ekran boyutu': 'Displaygröße',
    'Ekran Boyutu': 'Displaygröße',
    'Ekran Kartı Modeli': 'Grafikkartenmodell',
    'Display Kartı Modeli': 'Grafikkartenmodell',
    'Ekran Çözünürlüğü': 'Displayauflösung',
    'Ekran çözünürlüğü': 'Displayauflösung',
    'Fast charging': 'Schnellladen',
    'Hızlı şarj': 'Schnellladen',
    'Fast charging features': 'Schnellladefunktionen',
    'Hızlı şarj özellikleri': 'Schnellladefunktionen',
    'Fast charging power': 'Schnellladeleistung',
    'Hızlı şarj gücü': 'Schnellladeleistung',
    'Şarj süresi': 'Ladedauer',
    'Şarj Süresi': 'Ladedauer',
    'Front camera': 'Frontkamera',
    'Ön kamera': 'Frontkamera',
    'GPU': 'GPU',
    'Height': 'Höhe',
    'Yükseklik': 'Höhe',
    'Main camera': 'Hauptkamera',
    'Ana kamera': 'Hauptkamera',
    'NFC': 'NFC',
    'Operating system': 'Betriebssystem',
    'İşletim sistemi': 'Betriebssystem',
    'Optical Image Stabilization (OIS)': 'Optische Bildstabilisierung (OIS)',
    'Optical Image Stabilizer (OIS)': 'Optischer Bildstabilisator (OIS)',
    'Optik görüntü sabitleme (OIS)': 'Optische Bildstabilisierung (OIS)',
    'Panel type': 'Paneltyp',
    'Panel türü': 'Paneltyp',
    'Pixel density': 'Pixeldichte',
    'Piksel yoğunluğu': 'Pixeldichte',
    'Processor': 'Prozessor',
    'İşlemci': 'Prozessor',
    'Processor family': 'Prozessorfamilie',
    'İşlemci ailesi': 'Prozessorfamilie',
    'RAM': 'RAM',
    'RAM type': 'RAM-Typ',
    'RAM türü': 'RAM-Typ',
    'Refresh rate': 'Bildwiederholrate',
    'Yenileme hızı': 'Bildwiederholrate',
    'Removable battery': 'Wechselbarer Akku',
    'Çıkarılabilir pil': 'Wechselbarer Akku',
    'Resolution': 'Auflösung',
    'Çözünürlük': 'Auflösung',
    'SAR Value 10g (Head)': 'SAR-Wert 10g (Kopf)',
    'Screen size': 'Displaygröße',
    'Sensors': 'Sensoren',
    'Sensörler': 'Sensoren',
    'SIM': 'SIM',
    'SIM Count': 'SIM-Anzahl',
    'SIM sayısı': 'SIM-Anzahl',
    'Speakers': 'Lautsprecher',
    'Hoparlörler': 'Lautsprecher',
    'Storage': 'Speicher',
    'Depolama': 'Speicher',
    'Storage type': 'Speichertyp',
    'Depolama türü': 'Speichertyp',
    'Thickness': 'Dicke',
    'Kalınlık': 'Dicke',
    'USB': 'USB',
    'USB-C charging': 'USB-C-Laden',
    'USB-C şarj': 'USB-C-Laden',
    'Video playback': 'Videowiedergabe',
    'Video oynatma': 'Videowiedergabe',
    'Video recording': 'Videoaufnahme',
    'Video kaydı': 'Videoaufnahme',
    'Water resistance': 'Wasserbeständigkeit',
    'Suya dayanıklılık': 'Wasserbeständigkeit',
    'Weight': 'Gewicht',
    'Ağırlık': 'Gewicht',
    'Wi-Fi': 'WLAN',
    'Wi-Fi Frekansı': 'WLAN-Frequenz',
    'Wi Fi Frekansı': 'WLAN-Frequenz',
    'WLAN Frekansı': 'WLAN-Frequenz',
    'Width': 'Breite',
    'Genişlik': 'Breite',
    'Wireless charging': 'Kabelloses Laden',
    'Kablosuz şarj': 'Kabelloses Laden',
    'Dönüş Hızı': 'Drehzahl',
    'Dönüş hızı': 'Drehzahl',
    'Rastgele Okuma': 'Zufälliges Lesen',
    'Rastgele Yazma': 'Zufälliges Schreiben',
    'Sıralı Okuma': 'Sequenzielles Lesen',
    'Sıralı Yazma': 'Sequenzielles Schreiben',
    'Bağlantı': 'Anschluss',
    'Bağlantı Arayüzü': 'Schnittstelle',
    'Arabirim': 'Schnittstelle',
    'Güç tüketimi': 'Stromverbrauch',
    'Gürültü seviyesi': 'Geräuschpegel',
    'Lamba ömrü': 'Lampenlebensdauer',
    'Dinamik Kontrast': 'Dynamischer Kontrast',
    'Renk Sayısı': 'Farbenanzahl',
    'HDMI Sayısı': 'HDMI-Anzahl',
    'HDMI Versiyonu': 'HDMI-Version',
    'Görüntü Standardı': 'Bildstandard',
    'Dijital Zoom Oranı': 'Digitalzoom',
    'Düşük Frekans (Bas)': 'Niedrige Frequenz (Bass)',
    'Düşük frekans (bas)': 'Niedrige Frequenz (Bass)',
    'Düşük Takt (Bas)': 'Niedriger Takt (Bass)',
    'Düşük takt (bas)': 'Niedriger Takt (Bass)',
    'Düşük Takt (Bass)': 'Niedriger Takt (Bass)',
    'En Düşük Takt': 'Niedrigster Takt',
    'En Yüksek Takt': 'Höchster Takt',
    'Hassasiyet': 'Empfindlichkeit',
    'Bellek Hızı (OC)': 'Speichertakt (OC)',
    'Bellek Kapasitesi': 'Speicherkapazität',
    'Bellek Teknolojisi': 'Speichertechnologie',
    'Output Yılı': 'Erscheinungsjahr',
  },
};

const TR_WORDS = [
  [/\bbattery\b/gi, 'pil'],
  [/\bcapacity\b/gi, 'kapasitesi'],
  [/\bcamera\b/gi, 'kamera'],
  [/\bcharging\b/gi, 'şarj'],
  [/\bdisplay\b/gi, 'ekran'],
  [/\bscreen\b/gi, 'ekran'],
  [/\bfrequency\b/gi, 'frekansı'],
  [/\bprocessor\b/gi, 'işlemci'],
  [/\bstorage\b/gi, 'depolama'],
  [/\bweight\b/gi, 'ağırlık'],
  [/\bwidth\b/gi, 'genişlik'],
  [/\bheight\b/gi, 'yükseklik'],
  [/\btype\b/gi, 'türü'],
  [/\bcount\b/gi, 'sayısı'],
  [/\bfeatures?\b/gi, 'özellikleri'],
  [/\btechnology\b/gi, 'teknolojisi'],
  [/\bspecifications?\b/gi, 'özellikleri'],
  [/\boperating system\b/gi, 'işletim sistemi'],
  [/\bannouncement date\b/gi, 'duyuru tarihi'],
];

const DE_WORDS = [
  [/çözünürlük/gi, 'Auflösung'],
  [/charging\s+süresi/gi, 'Ladedauer'],
  [/charging\s+suresi/gi, 'Ladedauer'],
  [/düşük takt/gi, 'Niedriger Takt'],
  [/dusuk takt/gi, 'Niedriger Takt'],
  [/düşük frekans/gi, 'Niedrige Frequenz'],
  [/İnç/gi, 'Zoll'],
  [/Inç/gi, 'Zoll'],
  [/inç/gi, 'Zoll'],
  [/\bekran kartı modeli\b/gi, 'Grafikkartenmodell'],
  [/\bdisplay kartı modeli\b/gi, 'Grafikkartenmodell'],
  [/\bdisplay boyutu\b/gi, 'Displaygröße'],
  [/\bekran çözünürlüğü\b/gi, 'Displayauflösung'],
  [/\bçözünürlük\b/gi, 'Auflösung'],
  [/wi[\s-]*fi\s*frekans[ıi]/gi, 'WLAN-Frequenz'],
  [/wlan\s*frekans[ıi]/gi, 'WLAN-Frequenz'],
  [/\bfrekansı\b/gi, 'Frequenz'],
  [/\bfrekansları\b/gi, 'Frequenzen'],
  [/\bbellek hızı\b/gi, 'Speichertakt'],
  [/\bbellek hizi\b/gi, 'Speichertakt'],
  [/\bbellek kapasitesi\b/gi, 'Speicherkapazität'],
  [/\bbellek teknolojisi\b/gi, 'Speichertechnologie'],
  [/\bbellek\b/gi, 'Speicher'],
  [/\bgücü\b/gi, 'Leistung'],
  [/\bgucu\b/gi, 'Leistung'],
  [/\boutput yılı\b/gi, 'Erscheinungsjahr'],
  [/\byılı\b/gi, 'Jahr'],
  [/\byili\b/gi, 'Jahr'],
  [/\btakt\b/gi, 'Takt'],
  [/\bdepolama\b/gi, 'Speicher'],
  [/\bbatarya\b/gi, 'Akku'],
  [/\bpil\b/gi, 'Akku'],
  [/\bekran\b/gi, 'Display'],
  [/\bağırlık\b/gi, 'Gewicht'],
  [/\bagirlik\b/gi, 'Gewicht'],
  [/\bboyutlar\b/gi, 'Abmessungen'],
  [/\bparlaklık\b/gi, 'Helligkeit'],
  [/\bşarj süresi\b/gi, 'Ladedauer'],
  [/\bsarj suresi\b/gi, 'Ladedauer'],
  [/\bsüresi\b/gi, 'Dauer'],
  [/\bsuresi\b/gi, 'Dauer'],
  [/\bdüşük frekans\b/gi, 'Niedrige Frequenz'],
  [/\bdusuk frekans\b/gi, 'Niedrige Frequenz'],
  [/\bbas\b/gi, 'Bass'],
  [/\bhassasiyet\b/gi, 'Empfindlichkeit'],
  [/\bgürültü seviyesi\b/gi, 'Geräuschpegel'],
  [/\bguc tüketimi\b/gi, 'Stromverbrauch'],
  [/\bgüç tüketimi\b/gi, 'Stromverbrauch'],
  [/\bdönüş hızı\b/gi, 'Drehzahl'],
  [/\brastgele okuma\b/gi, 'Zufälliges Lesen'],
  [/\brastgele yazma\b/gi, 'Zufälliges Schreiben'],
  [/\bsıralı okuma\b/gi, 'Sequenzielles Lesen'],
  [/\bsıralı yazma\b/gi, 'Sequenzielles Schreiben'],
  [/\bbağlantı arayüzü\b/gi, 'Schnittstelle'],
  [/\bbağlantı\b/gi, 'Anschluss'],
  [/\barabirim\b/gi, 'Schnittstelle'],
  [/\brenk sayısı\b/gi, 'Farbenanzahl'],
  [/\bdinamik kontrast\b/gi, 'Dynamischer Kontrast'],
  [/\blamba ömrü\b/gi, 'Lampenlebensdauer'],
  [/\bhdmi sayısı\b/gi, 'HDMI-Anzahl'],
  [/\bhdmi versiyonu\b/gi, 'HDMI-Version'],
  [/\bgörüntü standardı\b/gi, 'Bildstandard'],
  [/\bdijital zoom oranı\b/gi, 'Digitalzoom'],
  [/\bbattery\b/gi, 'Akku'],
  [/\bcapacity\b/gi, 'Kapazität'],
  [/\bcamera\b/gi, 'Kamera'],
  [/\bcharging\b/gi, 'Laden'],
  [/\bdisplay\b/gi, 'Display'],
  [/\bscreen\b/gi, 'Display'],
  [/\bfrequency\b/gi, 'Takt'],
  [/\bprocessor\b/gi, 'Prozessor'],
  [/\bstorage\b/gi, 'Speicher'],
  [/\bweight\b/gi, 'Gewicht'],
  [/\bwidth\b/gi, 'Breite'],
  [/\bheight\b/gi, 'Höhe'],
  [/\btype\b/gi, 'Typ'],
  [/\bcount\b/gi, 'Anzahl'],
  [/\bfeatures?\b/gi, 'Funktionen'],
  [/\btechnology\b/gi, 'Technologie'],
  [/\bspecifications?\b/gi, 'Daten'],
  [/\boperating system\b/gi, 'Betriebssystem'],
  [/\bannouncement date\b/gi, 'Ankündigungsdatum'],
  [/\bmain\b/gi, 'Haupt'],
  [/\bfront\b/gi, 'Front'],
  [/\bpanel\b/gi, 'Panel'],
  [/\bbrightness\b/gi, 'Helligkeit'],
  [/\bresolution\b/gi, 'Auflösung'],
  [/\brefresh rate\b/gi, 'Bildwiederholrate'],
  [/\bdimensions?\b/gi, 'Abmessungen'],
];

// German spec words that leak through on Geizhals-sourced products (the DE
// scrape dictionary is tiny, so the German source text often survives). These
// are scrubbed at display time so a Turkish/English visitor never sees German.
// Order: longest phrases first so partials don't pre-empt full matches.
const DE_RESIDUE = [
  // charging / battery
  [/\bumgekehrtes\s+laden\b/gi, { tr: 'Ters şarj', en: 'Reverse charging' }],
  [/\bkabelloses\s+laden\b/gi, { tr: 'Kablosuz şarj', en: 'Wireless charging' }],
  [/\bkabelgebunden(?:es)?\b/gi, { tr: 'kablolu', en: 'wired' }],
  [/\bfest\s+verbaut\b/gi, { tr: 'sabit', en: 'built-in' }],
  [/\bbuilt-?in\b/gi, { tr: 'Dahili', en: 'Built-in' }],
  [/\bschnellladen\b/gi, { tr: 'Hızlı şarj', en: 'Fast charging' }],
  [/\bakkulaufzeit\b/gi, { tr: 'Pil ömrü', en: 'Battery life' }],
  [/\bladezyklen\b/gi, { tr: 'şarj döngüsü', en: 'charge cycles' }],
  [/\bladedauer\b/gi, { tr: 'Şarj süresi', en: 'Charging time' }],
  [/\bakku\b/gi, { tr: 'Pil', en: 'Battery' }],
  // SAR / body
  [/\bkopf\b/gi, { tr: 'baş', en: 'head' }],
  [/\bkörper\b/gi, { tr: 'vücut', en: 'body' }],
  // form factor / material
  [/\bbarren\b/gi, { tr: 'Düz (bar)', en: 'Bar' }],
  [/\bkunststoff\b/gi, { tr: 'Plastik', en: 'Plastic' }],
  [/\bedelstahl\b/gi, { tr: 'Paslanmaz çelik', en: 'Stainless steel' }],
  [/\baluminium\b/gi, { tr: 'Alüminyum', en: 'Aluminium' }],
  [/\bglas\b/gi, { tr: 'Cam', en: 'Glass' }],
  [/\brahmen\b/gi, { tr: 'Çerçeve', en: 'Frame' }],
  [/\brückseite\b/gi, { tr: 'arka', en: 'back' }],
  // camera
  [/\bweitwinkelobjektiv\b/gi, { tr: 'Geniş açı objektifi', en: 'Wide-angle lens' }],
  [/\bultraweitwinkel\b/gi, { tr: 'Ultra geniş açı', en: 'Ultra-wide' }],
  [/\bweitwinkel\b/gi, { tr: 'Geniş açı', en: 'Wide-angle' }],
  [/\bteleobjektiv\b/gi, { tr: 'Telefoto', en: 'Telephoto' }],
  [/\bhauptkamera\b/gi, { tr: 'Ana kamera', en: 'Main camera' }],
  [/\bfrontkamera\b/gi, { tr: 'Ön kamera', en: 'Front camera' }],
  [/\bdual-?led-?blitz\b/gi, { tr: 'Çift LED flaş', en: 'Dual-LED flash' }],
  [/\bled-?blitz\b/gi, { tr: 'LED flaş', en: 'LED flash' }],
  [/\bblitz\b/gi, { tr: 'Flaş', en: 'Flash' }],
  [/\bphasenerkennung\b/gi, { tr: 'Faz algılama', en: 'Phase detection' }],
  [/\bautofokus\b/gi, { tr: 'Otomatik odaklama', en: 'Autofocus' }],
  // os / updates
  [/\bbetriebssystem-?updates?\b/gi, { tr: 'İşletim sistemi güncellemeleri', en: 'OS updates' }],
  [/\bsicherheits?-?updates?\b/gi, { tr: 'Güvenlik güncellemeleri', en: 'Security updates' }],
  [/\bbetriebssystem\b/gi, { tr: 'İşletim sistemi', en: 'Operating system' }],
  [/\bjahre\b/gi, { tr: 'yıl', en: 'years' }],
  [/\bab\s+werk\b/gi, { tr: 'fabrika çıkışı', en: 'factory' }],
  // sensors
  [/\bbeschleunigungssensor\b/gi, { tr: 'İvmeölçer', en: 'Accelerometer' }],
  [/\bgyroskop\b/gi, { tr: 'Jiroskop', en: 'Gyroscope' }],
  [/\bannäherungssensor\b/gi, { tr: 'Yakınlık sensörü', en: 'Proximity sensor' }],
  [/\bhelligkeitssensor\b/gi, { tr: 'Işık sensörü', en: 'Light sensor' }],
  [/\bfingerabdrucksensor\b/gi, { tr: 'Parmak izi sensörü', en: 'Fingerprint sensor' }],
  [/\bkompass\b/gi, { tr: 'Pusula', en: 'Compass' }],
  // connectivity / misc
  [/\bschnittstelle\b/gi, { tr: 'Arayüz', en: 'Interface' }],
  [/\banschluss\b/gi, { tr: 'Bağlantı', en: 'Connection' }],
  [/\breparierbarkeitsklasse\b/gi, { tr: 'Onarılabilirlik sınıfı', en: 'Repairability class' }],
  [/\bfreifall\b/gi, { tr: 'Düşme', en: 'Free fall' }],
  [/\bspeicher\b/gi, { tr: 'Depolama', en: 'Storage' }],
  [/\bzoll\b/gi, { tr: 'İnç', en: 'inch' }],
  [/\bstück\b/gi, { tr: 'Adet', en: 'pcs' }],
  [/\bstunden\b/gi, { tr: 'saat', en: 'hours' }],
  [/\btage\b/gi, { tr: 'gün', en: 'days' }],
  // leaked English in a non-EN context
  [/\bphase\b/gi, { tr: 'Faz', en: 'Phase' }],
  [/\bvideos\b/gi, { tr: 'Videolar', en: 'Videos' }],
];

// German spec LABELS that leak on Geizhals products (applied to labels only).
const DE_LABEL_RESIDUE = [
  [/\bkamera\s+hinten\b/gi, { tr: 'Arka kamera', en: 'Rear camera' }],
  [/\bkamera\s+vorne\b/gi, { tr: 'Ön kamera', en: 'Front camera' }],
  [/\bakkulaufzeit\s+pro\s+zyklus\b/gi, { tr: 'Döngü başına pil ömrü', en: 'Battery life per cycle' }],
  [/\bbatterieausdauer\b/gi, { tr: 'Pil dayanıklılığı', en: 'Battery endurance' }],
  [/\benergieeffizienzklasse\b/gi, { tr: 'Enerji verimliliği sınıfı', en: 'Energy efficiency class' }],
  [/\bschutzart\b/gi, { tr: 'Koruma sınıfı', en: 'Protection rating' }],
  [/\bsar[\s-]?wert\b/gi, { tr: 'SAR değeri', en: 'SAR value' }],
  [/\bnavigation\b/gi, { tr: 'Navigasyon', en: 'Navigation' }],
  [/\bsensoren\b/gi, { tr: 'Sensörler', en: 'Sensors' }],
  [/\bsim[\s-]?karte\b/gi, { tr: 'SIM kartı', en: 'SIM card' }],
  [/\babmessungen\b/gi, { tr: 'Boyutlar', en: 'Dimensions' }],
  [/\bgewicht\b/gi, { tr: 'Ağırlık', en: 'Weight' }],
  [/\bbetriebssystem\b/gi, { tr: 'İşletim sistemi', en: 'Operating system' }],
  [/\barbeitsspeicher\b/gi, { tr: 'RAM', en: 'RAM' }],
  [/\binterner\s+speicher\b/gi, { tr: 'Dahili depolama', en: 'Internal storage' }],
  [/\banschlüsse\b/gi, { tr: 'Bağlantılar', en: 'Connections' }],
  [/\bmaterial\b/gi, { tr: 'Malzeme', en: 'Material' }],
];

// Uppercase the first visible letter of a value line (Turkish-aware), so every
// spec reads "Sabit takılı" / "Dahili" rather than "sabit takılı" / "built-in".
function upperFirst(text, code) {
  const s = String(text || '');
  const i = s.search(/[\p{L}\p{N}]/u);
  if (i === -1) return s;
  const ch = s[i];
  const up = code === 'tr' ? ch.toLocaleUpperCase('tr-TR') : ch.toUpperCase();
  return s.slice(0, i) + up + s.slice(i + 1);
}

function cleanupLabel(label) {
  return String(label || '').normalize('NFC').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(text) {
  return cleanupLabel(text).replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function labelCase(text, locale = 'en-US') {
  return cleanupLabel(text)
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (/^[A-Z0-9][A-Z0-9+.-]*$/.test(word)) return word;
      return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
    })
    .join(' ');
}

export function localizedSpecLabel(label, lang = 'en') {
  const rawCode = String(lang || 'en').slice(0, 2).toLowerCase();
  const code = rawCode === 'tr' || rawCode === 'de' ? rawCode : 'en';
  const clean = cleanupLabel(label);
  if (!clean) return '';
  const exact = LABELS[code]?.[clean] || LABELS[code]?.[titleCase(clean)];
  if (exact) return exact;
  if (code === 'de') {
    let out = clean;
    for (const [re, replacement] of DE_WORDS) out = out.replace(re, replacement);
    out = out
      .replace(/\bCPU\b/gi, 'CPU')
      .replace(/\bGPU\b/gi, 'GPU')
      .replace(/\bRAM\b/gi, 'RAM')
      .replace(/\bSIM\b/gi, 'SIM')
      .replace(/\bUSB\b/gi, 'USB')
      .replace(/\bWi Fi\b/gi, 'WLAN')
      .replace(/\s*\/\s*/g, '/')
      .replace(/\s+/g, ' ')
      .trim();
    return labelCase(out, 'de-DE');
  }
  if (code !== 'tr') {
    // English view: scrub any German label residue from Geizhals products.
    let outEn = clean;
    for (const [re, map] of DE_LABEL_RESIDUE) outEn = outEn.replace(re, map.en);
    for (const [re, map] of DE_RESIDUE) outEn = outEn.replace(re, map.en);
    return titleCase(outEn);
  }
  let out = clean;
  for (const [re, map] of DE_LABEL_RESIDUE) out = out.replace(re, map.tr);
  for (const [re, map] of DE_RESIDUE) out = out.replace(re, map.tr);
  for (const [re, replacement] of TR_WORDS) out = out.replace(re, replacement);
  out = out
    .replace(/\bCPU\b/gi, 'CPU')
    .replace(/\bGPU\b/gi, 'GPU')
    .replace(/\bRAM\b/gi, 'RAM')
    .replace(/\bSIM\b/gi, 'SIM')
    .replace(/\bUSB\b/gi, 'USB')
    .replace(/\bWi Fi\b/gi, 'Wi-Fi')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
  return out ? out.charAt(0).toLocaleUpperCase('tr-TR') + out.slice(1) : clean;
}

function cleanupValueLine(line, lang) {
  const rawCode = String(lang || 'en').slice(0, 2).toLowerCase();
  const code = rawCode === 'tr' || rawCode === 'de' ? rawCode : 'en';
  let out = String(line || '').replace(/\s+/g, ' ').trim();
  if (!out) return '';

  // Scrub German residue on tr/en views (Geizhals source text leaking through).
  if (code === 'tr' || code === 'en') {
    for (const [re, map] of DE_RESIDUE) out = out.replace(re, map[code] || map.en);
  }

  out = out
    .replace(/\bI\s*['’"]?\s*m\s+not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\bI\s*['’"]?\s*m\s*not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\bI\s*["'’]\s*m\s*not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\bI\s*['’"]?\s*not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\s+([.,)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();

  if (code === 'tr') {
    const lower = out.toLowerCase();
    if (lower === 'yes' || lower === 'true') return 'Var';
    if (lower === 'no' || lower === 'false') return 'Yok';
    out = out
      .replace(/\bYes\b/g, 'Var')
      .replace(/\bNo\b/g, 'Yok')
      .replace(/\bCore\b/g, 'Çekirdek')
      .replace(/\bpixels\b/gi, 'piksel')
      .replace(/\bSupport\b/g, 'desteği')
      .replace(/\bFast Charging\b/gi, 'Hızlı şarj')
      .replace(/\bOptical Image Stabilization\b/gi, 'Optik görüntü sabitleme')
      .replace(/\bOptical Image Stabilizer\b/gi, 'Optik görüntü sabitleyici')
      .replace(/\bOptical Zoom\b/gi, 'Optik zoom')
      .replace(/\bDigital Zoom\b/gi, 'Dijital zoom')
      .replace(/\bAutomatic Focus\b/gi, 'Otomatik odaklama')
      .replace(/\bAuto-?Focus\b/gi, 'Otomatik odaklama')
      .replace(/\bPhase Detect\b/gi, 'Faz algılamalı')
      .replace(/\bDual Pixel\b/gi, 'Çift piksel')
      .replace(/\bUltra Wide Angle\b/gi, 'Ultra geniş açı')
      .replace(/\bExtra Wide Angle\b/gi, 'Ekstra geniş açı')
      .replace(/\bTelephoto\b/gi, 'Telefoto')
      .replace(/\bPeriscope\b/gi, 'Periskop')
      .replace(/\bUltra Wide\b/gi, 'Ultra geniş')
      .replace(/\bExtra Wide\b/gi, 'Ekstra geniş')
      .replace(/\bWide Angle\b/gi, 'Geniş açı')
      .replace(/\bLaser AF\b/gi, 'Lazer AF')
      .replace(/\boption\b/gi, 'seçeneği')
      .replace(/\bSeptember\b/g, 'Eylül')
      .replace(/\(eSIM only\)/gi, '(yalnızca eSIM)')
      .replace(/\bDual SIM\b/g, 'Çift SIM')
      .replace(/\bVoice over LTE\b/g, 'LTE üzerinden ses')
      .replace(/\bLithium Ion\b/g, 'Lityum iyon');
  }

  if (code === 'de') {
    const lower = out.toLowerCase();
    if (lower === 'yes' || lower === 'true' || lower === 'var' || lower === 'evet') return 'Ja';
    if (lower === 'no' || lower === 'false' || lower === 'yok' || lower === 'hayır' || lower === 'hayir') return 'Nein';
    out = out
      .replace(/\bVar\b/g, 'Ja')
      .replace(/\bYok\b/g, 'Nein')
      .replace(/\bEvet\b/g, 'Ja')
      .replace(/\bHayır\b/g, 'Nein')
      .replace(/\bHayir\b/g, 'Nein')
      .replace(/İnç/gi, 'Zoll')
      .replace(/Inç/gi, 'Zoll')
      .replace(/inç/gi, 'Zoll')
      .replace(/\badet\b/gi, 'Stück')
      .replace(/\bsaat\b/gi, 'Stunden')
      .replace(/\bgün\b/gi, 'Tage')
      .replace(/\bçekirdek\b/gi, 'Kerne')
      .replace(/\bpiksel\b/gi, 'Pixel')
      .replace(/\bHızlı şarj\b/gi, 'Schnellladen')
      .replace(/\bOptik görüntü sabitleme\b/gi, 'Optische Bildstabilisierung')
      .replace(/\bOptik zoom\b/gi, 'Optischer Zoom')
      .replace(/\bDijital zoom\b/gi, 'Digitalzoom')
      .replace(/\bOtomatik odaklama\b/gi, 'Autofokus')
      .replace(/\bFaz algılamalı\b/gi, 'Phasenerkennung')
      .replace(/\bÇift piksel\b/gi, 'Dual Pixel')
      .replace(/\bUltra geniş açı\b/gi, 'Ultraweitwinkel')
      .replace(/\bGeniş açı\b/gi, 'Weitwinkel')
      .replace(/\bLazer AF\b/gi, 'Laser-AF')
      .replace(/\bLityum iyon\b/gi, 'Lithium-Ionen');
  }
  // Writing rule: every spec value line starts with a capital letter.
  return upperFirst(out, code);
}

export function localizedSpecValue(value, lang = 'en') {
  return String(value ?? '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => cleanupValueLine(line, lang))
    .filter(Boolean)
    .join('\n');
}

export function isDisplayableSpec(label, value) {
  const key = cleanupLabel(label).toLowerCase();
  const val = String(value ?? '').toLowerCase();
  if (!key || !String(value ?? '').trim()) return false;
  if (/sponsorlu|sponsored|reklam|advertisement/i.test(val)) return false;
  if (/^(steam \(max\.\)|max\. heater power)$/i.test(key)) return false;
  if (key === 'time' && /^\d+\s*(sn|sec|second|seconds)$/i.test(String(value ?? '').trim())) return false;
  return true;
}
