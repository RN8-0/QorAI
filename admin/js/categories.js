/**
 * Qor AI Category & Brand Definitions
 * Real geizhals.eu ?cat= IDs discovered from homepage
 */

window.QorAiCategories = {
  groups: [
    {
      name: 'Hardware',
      categories: [
        { id: 'gra16_512', name: 'Grafikkarten (GPUs)', geizhalsSlug: 'gra16_512' },
        { id: 'monlcd19wide', name: 'Monitore', geizhalsSlug: 'monlcd19wide' },
        { id: 'ramddr3', name: 'Arbeitsspeicher (RAM)', geizhalsSlug: 'ramddr3' },
        { id: 'mainboards', name: 'Mainboards', geizhalsSlug: 'mainboards' },
        { id: 'gehps', name: 'Netzteile (PSU)', geizhalsSlug: 'gehps' },
        { id: 'gehatx', name: 'PC-Gehäuse', geizhalsSlug: 'gehatx' },
      ]
    },
    {
      name: 'Computer & Mobile',
      categories: [
        { id: 'nb', name: 'Notebooks', geizhalsSlug: 'nb' },
        { id: 'nbtabl', name: 'Tablets', geizhalsSlug: 'nbtabl' },
        { id: 'umtsover', name: 'Handy & Smartphones', geizhalsSlug: 'umtsover' },
        { id: 'uhrpm', name: 'Smartwatches', geizhalsSlug: 'uhrpm' },
      ]
    },
    {
      name: 'Video, Foto & TV',
      categories: [
        { id: 'tvlcd', name: 'Fernseher', geizhalsSlug: 'tvlcd' },
      ]
    },
    {
      name: 'Audio',
      categories: [
        { id: 'sphd', name: 'Kopfhörer & Headsets', geizhalsSlug: 'sphd' },
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
