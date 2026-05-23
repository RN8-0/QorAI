"""Full pipeline test: 6 categories x (TR + DE) atom sets, measure speed,
coverage, and language-residue leaks."""
import json, time, urllib.request, sys, re

sys.stdout.reconfigure(encoding='utf-8')

# Clear worker cache to simulate fresh bulk scrape
urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8797/clear-cache', method='POST'))
time.sleep(0.5)

# Real atom sets observed in scrape logs, per category.
TR_SETS = {
    'smartphone': [
        '6.78 İnç', 'Çözünürlük', '2772x1272 (FHD+) Piksel', 'Çift SIM',
        'eSIM Desteği', '7300 mAh', '120 W', 'Kablosuz Hızlı Şarj (50W)',
        'Ters Kablosuz Şarj', '1100 Döngü', '74 saat 25 dakika', '39 Dakika',
        '5 Elementli Lens', '120x Dijital Zoom', '30° Açılı', '1080p @ 60fps Kayıt',
        'IP68 Su Geçirmez', 'Yüz Tanıma 3D', 'Parmak İzi Sensörü (Ekran Altı)',
        'Yapay Zeka Sahne Tanıma', '24-Bit RGB Renk', 'Stereo Hoparlör',
        'Dolby Atmos Desteği', 'NFC Desteği', 'Bluetooth 5.4', 'Wi-Fi 7',
        'USB Type-C 3.2', '6 Yıl Güvenlik Güncellemesi Garantisi',
        'Sanal RAM Artırma (12GB)', 'Buhar Soğutma Sistemi',
    ],
    'laptop': [
        'İşlemci Markası', 'İşlemci Modeli', 'Çekirdek Sayısı', 'İşlem Hızı',
        '5.30 GHz Hızlandırılmış', 'Ekran Kartı Çekirdek Hızı', 'Bellek Tipi',
        '128 GB Bellek', '5200 MHz Hız', '4 TB Depolama', '2 Adet M.2 Yuvası',
        'Sabit Disk (HDD)', 'Optik Sürücü', 'Parmak İzi Okuyucu',
        '24-Bölge RGB Klavye', 'Klavye Aydınlatma', 'Kart Okuyucu',
        '1 x Uyku Modunda Charging Support', 'Tüv Rheinland Düşük Mavi Işık Sertifikası',
        'AMD SmartAccess Belleği', 'DirectX 12 Ultimate Desteği',
        'Yapay Zeka Yongası', 'Nahimic Ses Sistemi', '2x 2W Hoparlör',
        '%100 sRGB Renk Gamı', 'Anti-Yansıma Mat Ekran', '240 Hz Tazeleme',
        'IPS LED Panel', '500 Nit Parlaklık', 'Gigabit Ethernet (RJ45)',
    ],
    'monitor': [
        'Panel Tipi', '4K UHD Çözünürlük', '144 Hz Tazeleme Hızı',
        '1 ms Tepki Süresi', 'HDR400 Sertifikalı', 'Curved Ekran (1500R)',
        'Eğim Ayarı', 'Yükseklik Ayarı', 'Pivot Dönüş', 'VESA 100x100 Uyumlu',
        'KVM Anahtarı', 'Picture-in-Picture Desteği', '%99 DCI-P3 Renk',
        'FreeSync Premium Pro', 'G-Sync Uyumlu',
    ],
    'headphone': [
        'Aktif Gürültü Engelleme', 'Şeffaflık Modu', '40 Saat Pil Ömrü',
        '5 Dakikada 2 Saat Şarj', 'Kablosuz Şarj Kılıfı', 'Çoklu Cihaz Bağlantısı',
        'Spatial Audio Desteği', 'Dokunmatik Kontrol', 'Ses Tanıma Asistanı',
        'Suya Dayanıklı (IPX4)', 'Bluetooth 5.3', 'LDAC Codec Desteği',
    ],
    'smartwatch': [
        'AMOLED Ekran', '1.5 İnç Yuvarlak Ekran', 'Safir Cam', 'Titanyum Kasa',
        '14 Gün Pil Ömrü', 'GPS Çift Bant', 'Kalp Atışı Sensörü',
        'Kan Oksijeni Ölçümü', 'EKG Desteği', '5ATM Su Dayanımı',
        '120 Spor Modu', 'Bluetooth Çağrı', 'Mikrofon Yerleşik',
    ],
    'tv': [
        'QLED Mini-LED Panel', '4K 144Hz Oyun Modu', 'Dolby Vision IQ',
        'Dolby Atmos 60W', '4 Adet HDMI 2.1', 'eARC Desteği',
        'Ambient Mod', 'Tek Uzaktan Kumanda', 'Solar Şarj Edilebilir',
        'Bixby Sesli Asistan', 'Çoklu Görünüm', '120 Hz Ekran',
    ],
}

DE_SETS = {
    'smartphone': [
        'Betriebssystem: Android 16', '7 Jahre Sicherheits-Updates',
        'Display: 6.3" 2424x1080 Pixel', 'P-OLED', 'kapazitiver Touchscreen',
        'Gorilla Glass 7i', 'flach', 'Kameraloch',
        'Kamera hinten: 48.0MP f/1.7 Phasenvergleich-AF OIS',
        'Videos @2160p/60fps (Kamera 1)', 'LED-Blitz',
        'Beschleunigungssensor', 'Annäherungssensor', 'Lichtsensor',
        'Kompass', 'Barometer', 'Fingerabdrucksensor (Display)',
        'SoC: Google Tensor G4', '1x 3.10GHz Cortex-X4', '8 Kerne',
        'ARM Mali-G715 MP7', 'RAM: 8GB', 'Speicher: 128GB',
        'Akku: 5100mAh', 'fest verbaut', 'kabelloses Laden',
        'Akkulaufzeit pro Zyklus 53h 14min', '1000x Laden',
        'Energieeffizienzklasse A (A bis G)', 'Schwarz', '183g',
    ],
    'laptop': [
        'Prozessor: Intel Core i9-14900HX', '24 Kerne', '32 Threads',
        '5.80 GHz Turbo', 'Grafikkarte: NVIDIA GeForce RTX 4090',
        '16 GB GDDR6', 'Display: 18.0" 2560x1600', '240 Hz',
        'matt entspiegelt', '32 GB DDR5-5600', '2 TB SSD M.2 NVMe',
        'Anschlüsse: 2x USB-C 3.2 Gen 2 (Thunderbolt 4)',
        '3x USB-A 3.2 Gen 1', '1x HDMI 2.1', '1x RJ45',
        'Wi-Fi 6E', 'Bluetooth 5.3', 'Tastatur mit DE Layout (beleuchtet, RGB)',
        'Touchpad (Precision)', 'Fingerabdruckleser', 'Windows 11 Home',
        'Aluminium Gehäuse', '2.5 kg', 'Stereo Lautsprecher mit Dolby Atmos',
        '99 Wh Akku', 'Schnellladung 330W', '2 Jahre Garantie',
    ],
    'monitor': [
        'Bildschirmdiagonale: 27"', 'Auflösung: 3840x2160', '4K UHD',
        '144 Hz Bildwiederholrate', '1 ms Reaktionszeit (GtG)',
        'IPS Panel', 'HDR400 zertifiziert', 'DisplayHDR 600',
        'sRGB 99%', 'DCI-P3 95%', 'Anschlüsse: 2x HDMI 2.1, 1x DisplayPort 1.4',
        'USB-C mit Power Delivery 90W', 'höhenverstellbar (130mm)',
        'Pivot (90°)', 'VESA 100x100', 'FreeSync Premium Pro',
    ],
    'headphone': [
        'Bauform: Over-Ear', 'kabellos (Bluetooth)', 'aktive Geräuschunterdrückung',
        'Transparenzmodus', 'Akkulaufzeit: 30 Stunden',
        'Schnellladung (5 min für 3 Std)', 'kabelloses Laden via Qi',
        'Multipoint-Verbindung', 'LDAC Codec', 'aptX Adaptive',
        'Bluetooth 5.4', 'IPX4 Spritzwasserschutz',
    ],
    'smartwatch': [
        'AMOLED Display', '1.43" rundes Display', 'Saphirglas',
        'Titan Gehäuse', '14 Tage Akkulaufzeit', 'GPS Dual-Band',
        'Herzfrequenzmesser', 'Blutsauerstoffmessung (SpO2)',
        'EKG Funktion', '5 ATM Wasserdichtigkeit',
        '120 Sportmodi', 'Bluetooth Anrufe',
    ],
    'tv': [
        'Bildschirmdiagonale: 65"', 'QLED Mini-LED', '4K @ 144Hz Gaming',
        'Dolby Vision IQ', 'Dolby Atmos 60W',
        'Anschlüsse: 4x HDMI 2.1 mit eARC',
        'Ambient Mode', 'One Remote', 'Bixby Sprachassistent',
        'Multi View', '120 Hz nativ',
    ],
}

TARGET = ['en','de','es','fr','pt','ru']

def call(payload):
    req = urllib.request.Request(
        'http://127.0.0.1:8797/translate',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        body = json.loads(r.read().decode('utf-8'))
    return body, time.time() - t0

TR_RESIDUE = re.compile(r'[şŞğĞıİ]')  # Türkçe-only chars (ü/ö/ç are also DE/FR/etc., skip)
DE_RESIDUE = set(['mit','und','oder','für','von','bei','auf','der','die','das','ein','eine','nicht','ja','nein','schwarz','weiß','grau','blau','grün','rot','gelb','klein','groß','schnell','langsam'])

def analyze(src_lang, body, targets):
    tr = body['translations']
    atoms = list(tr.keys())
    cells = len(atoms) * len(targets)
    filled = sum(1 for a in atoms for l in targets if tr[a].get(l))
    issues = []
    for a in atoms:
        for l in targets:
            v = tr[a].get(l, '')
            if not v:
                issues.append(('empty', a, l, ''))
                continue
            if l != 'tr' and TR_RESIDUE.search(v):
                issues.append(('TR_residue', a, l, v))
            if src_lang == 'de' and l == 'en':
                # Almanca-İngilizce kalıntısı: küçük harfli alman kelime tek başına
                words = re.findall(r'\b[a-zäöüß]+\b', v.lower())
                bad = [w for w in words if w in DE_RESIDUE and w not in ('a','an','i','it','is')]
                if bad:
                    issues.append(('DE_residue', a, l, f'{v}  [{",".join(bad)}]'))
    return cells, filled, issues

print('='*80)
print('FULL PIPELINE TEST — Argos+CT2+CUDA, beam=4, post-fix glossary')
print('='*80)

total_atoms = 0
total_time = 0
all_issues = []

for src_lang, sets in [('tr', TR_SETS), ('de', DE_SETS)]:
    label = 'EPEY (TR→6 dil)' if src_lang == 'tr' else 'GEIZHALS (DE→6 dil)'
    print(f'\n{"="*80}\n{label}\n{"="*80}')
    targets = [l for l in TARGET if l != src_lang] + (['tr'] if src_lang == 'de' else [])
    targets = list(dict.fromkeys(targets))
    for cat, atoms in sets.items():
        payload = {'from': src_lang, 'to': targets, 'texts': atoms}
        body, dt = call(payload)
        cells, filled, issues = analyze(src_lang, body, targets)
        total_atoms += len(atoms)
        total_time += dt
        residues = [i for i in issues if i[0] in ('TR_residue','DE_residue')]
        empties = [i for i in issues if i[0] == 'empty']
        all_issues.extend(issues)
        flag = '✓' if not issues else f'⚠ {len(residues)} kalıntı, {len(empties)} boş'
        print(f'  {cat:12s} · {len(atoms):3d} atom × {len(targets)} dil = {cells:4d} · {dt*1000:6.0f}ms · cover {filled}/{cells} · {flag}')

print(f'\n{"="*80}')
print(f'TOPLAM · {total_atoms} atom · {total_time*1000:.0f}ms · ortalama {total_time*1000/total_atoms:.1f}ms/atom')
print(f'Tahmini ürün başı (60 atom): {60 * total_time*1000/total_atoms:.0f}ms')
print('='*80)

if all_issues:
    print(f'\n=== {len(all_issues)} ISSUE BULUNDU ===')
    for kind, atom, lang, val in all_issues[:30]:
        print(f'[{kind:12s}] {lang}: {atom!r}  →  {val!r}')
else:
    print('\n✅ HİÇ HATA YOK — TÜM ATOMLAR TÜM DİLLERE DOĞRU ÇEVRİLDİ')

# Test cache hit
print('\n=== CACHE HIT TEST (aynı isteği tekrar gönder) ===')
sample = {'from': 'tr', 'to': TARGET, 'texts': TR_SETS['smartphone']}
body, dt = call(sample)
print(f'30 atom × 6 dil cache hit: {dt*1000:.0f}ms (worker raporu {body["elapsedMs"]}ms)')
