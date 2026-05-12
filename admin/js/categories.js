/**
 * Qor AI Category & Brand Definitions
 * Aligned with geizhals.eu technology categories
 */

window.QorAiCategories = {
  groups: [
    {
      name: 'Hardware',
      categories: [
        { id: 'grafikkarten', name: 'Grafikkarten (GPUs)', geizhalsSlug: 'gra16_512' },
        { id: 'monitore', name: 'Monitore', geizhalsSlug: 'monitore' },
        { id: 'festplatten-ssds', name: 'Festplatten & SSDs', geizhalsSlug: 'festplatten' },
        { id: 'notebooks', name: 'Notebooks', geizhalsSlug: 'notebooks' },
        { id: 'cpus', name: 'Prozessoren (CPUs)', geizhalsSlug: 'cpu' },
        { id: 'mainboards', name: 'Mainboards', geizhalsSlug: 'mainboards' },
        { id: 'eingabegeraete', name: 'Eingabegeräte', geizhalsSlug: 'eingabegeraete' },
        { id: 'gehaeuse', name: 'Gehäuse', geizhalsSlug: 'gehaeuse' },
        { id: 'tablets', name: 'Tablets', geizhalsSlug: 'tablets' },
        { id: 'arbeitsspeicher', name: 'Arbeitsspeicher (RAM)', geizhalsSlug: 'ramddr3' },
        { id: 'netzwerk', name: 'Netzwerk', geizhalsSlug: 'netzwerk' },
        { id: 'luftkuehlung', name: 'Luftkühlung', geizhalsSlug: 'luftkuehlung' },
        { id: 'netzteile-usv', name: 'Netzteile & USV', geizhalsSlug: 'netzteile' },
        { id: 'systeme', name: 'Systeme', geizhalsSlug: 'systeme' },
        { id: 'wasserkuehlung', name: 'Wasserkühlung', geizhalsSlug: 'wasserkuehlung' },
      ]
    },
    {
      name: 'Telefon',
      categories: [
        { id: 'handys', name: 'Handy & Smartphones', geizhalsSlug: 'handys' },
        { id: 'smartwatches', name: 'Smartwatches', geizhalsSlug: 'smartwatches' },
      ]
    },
    {
      name: 'Video, Foto & TV',
      categories: [
        { id: 'fernseher', name: 'Fernseher', geizhalsSlug: 'fernseher' },
        { id: 'fotografie', name: 'Fotografie', geizhalsSlug: 'fotografie' },
        { id: 'foto-video-zubehoer', name: 'Foto-/Videozubehör', geizhalsSlug: 'foto-video-zubehoer' },
      ]
    },
    {
      name: 'Audio & HiFi',
      categories: [
        { id: 'kopfhoerer-headsets', name: 'Kopfhörer & Headsets', geizhalsSlug: 'kopfhoerer' },
        { id: 'hifi-komponenten', name: 'HiFi-Komponenten', geizhalsSlug: 'hifi-komponenten' },
        { id: 'professional-audio', name: 'Professional Audio', geizhalsSlug: 'professional-audio' },
      ]
    },
    {
      name: 'Spiele & Konsolen',
      categories: [
        { id: 'playstation-5', name: 'PlayStation 5 (PS5)', geizhalsSlug: 'playstation-5' },
        { id: 'nintendo-switch', name: 'Nintendo Switch', geizhalsSlug: 'nintendo-switch' },
        { id: 'xbox-series', name: 'Xbox Series X & S', geizhalsSlug: 'xbox-series' },
      ]
    },
    {
      name: 'Büro & Schule',
      categories: [
        { id: 'drucker-scanner', name: 'Drucker & Scanner', geizhalsSlug: 'drucker' },
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
