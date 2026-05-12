/**
 * Qor AI Category & Brand Definitions
 * geizhalsSlug values are search terms for ?fs= (geizhals search)
 */

window.QorAiCategories = {
  groups: [
    {
      name: 'Hardware',
      categories: [
        { id: 'grafikkarten', name: 'Grafikkarten (GPUs)', geizhalsSlug: 'grafikkarte' },
        { id: 'monitore', name: 'Monitore', geizhalsSlug: 'monitor' },
        { id: 'arbeitsspeicher', name: 'Arbeitsspeicher (RAM)', geizhalsSlug: 'ram' },
        { id: 'mainboards', name: 'Mainboards', geizhalsSlug: 'mainboard' },
        { id: 'netzteile', name: 'Netzteile (PSU)', geizhalsSlug: 'netzteil' },
        { id: 'gehaeuse', name: 'PC-Gehäuse', geizhalsSlug: 'gehäuse' },
        { id: 'cpus', name: 'Prozessoren (CPUs)', geizhalsSlug: 'cpu' },
        { id: 'ssds', name: 'Festplatten & SSDs', geizhalsSlug: 'ssd' },
        { id: 'eingabegeraete', name: 'Eingabegeräte', geizhalsSlug: 'tastatur' },
        { id: 'netzwerk', name: 'Netzwerk', geizhalsSlug: 'router' },
        { id: 'luftkuehlung', name: 'Luftkühlung', geizhalsSlug: 'lüfter' },
        { id: 'wasserkuehlung', name: 'Wasserkühlung', geizhalsSlug: 'wasserkühlung' },
        { id: 'systeme', name: 'Systeme', geizhalsSlug: 'pc' },
      ]
    },
    {
      name: 'Computer & Mobile',
      categories: [
        { id: 'notebooks', name: 'Notebooks', geizhalsSlug: 'notebook' },
        { id: 'tablets', name: 'Tablets', geizhalsSlug: 'tablet' },
        { id: 'handys', name: 'Handy & Smartphones', geizhalsSlug: 'handy' },
        { id: 'smartwatches', name: 'Smartwatches', geizhalsSlug: 'smartwatch' },
      ]
    },
    {
      name: 'Video, Foto & TV',
      categories: [
        { id: 'fernseher', name: 'Fernseher', geizhalsSlug: 'fernseher' },
        { id: 'fotografie', name: 'Fotografie', geizhalsSlug: 'kamera' },
        { id: 'projektoren', name: 'Projektoren', geizhalsSlug: 'beamer' },
      ]
    },
    {
      name: 'Audio & HiFi',
      categories: [
        { id: 'kopfhoerer', name: 'Kopfhörer & Headsets', geizhalsSlug: 'kopfhörer' },
        { id: 'lautsprecher', name: 'Lautsprecher', geizhalsSlug: 'lautsprecher' },
        { id: 'soundbars', name: 'Soundbars', geizhalsSlug: 'soundbar' },
        { id: 'mikrofone', name: 'Mikrofone', geizhalsSlug: 'mikrofon' },
      ]
    },
    {
      name: 'Spiele & Konsolen',
      categories: [
        { id: 'spielkonsolen', name: 'Spielkonsolen', geizhalsSlug: 'konsole' },
        { id: 'gamepads', name: 'Gamepads', geizhalsSlug: 'gamepad' },
      ]
    },
    {
      name: 'Büro & Schule',
      categories: [
        { id: 'drucker', name: 'Drucker & Scanner', geizhalsSlug: 'drucker' },
        { id: 'webcams', name: 'Webcams', geizhalsSlug: 'webcam' },
      ]
    },
    {
      name: 'Smart Home & Zubehör',
      categories: [
        { id: 'saugroboter', name: 'Saugroboter', geizhalsSlug: 'saugroboter' },
        { id: 'powerbanks', name: 'Powerbanks', geizhalsSlug: 'powerbank' },
        { id: 'ebook-reader', name: 'E-Book Reader', geizhalsSlug: 'ebook reader' },
        { id: 'drohnen', name: 'Drohnen', geizhalsSlug: 'drohne' },
      ]
    },
  ],

  getAll() {
    return this.groups.flatMap(g => g.categories);
  },

  getById(id) {
    return this.getAll().find(c => c.id === id);
  },

  getByGroup(groupName) {
    const g = this.groups.find(g => g.name === groupName);
    return g ? g.categories : [];
  }
};

window.QorAiBrands = [
  'Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Oppo', 'Vivo', 'OnePlus', 'Realme', 'Honor',
  'Google', 'Sony', 'LG', 'Nokia', 'Motorola', 'Asus', 'Lenovo', 'HP', 'Dell', 'Acer',
  'MSI', 'Razer', 'Corsair', 'Logitech', 'HyperX', 'SteelSeries', 'JBL', 'Bose',
  'Sennheiser', 'Audio-Technica', 'Beyerdynamic', 'Marshall', 'Anker', 'Baseus',
  'Intel', 'AMD', 'Nvidia', 'Kingston', 'Crucial', 'Western Digital', 'Seagate',
  'Gigabyte', 'ASRock', 'EVGA', 'Cooler Master', 'NZXT', 'be quiet!', 'Thermaltake',
  'BenQ', 'ViewSonic', 'AOC', 'Philips', 'TCL', 'Hisense', 'Vestel',
  'Canon', 'Nikon', 'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'Insta360',
  'Nintendo', 'Microsoft', 'Valve', 'Meta',
  'TP-Link', 'Netgear', 'Zyxel', 'iRobot', 'Roborock', 'Dreame', 'Ecovacs',
  'Kindle', 'Kobo', 'PocketBook'
];
