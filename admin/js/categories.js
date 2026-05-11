/**
 * Qor AI Category & Brand Definitions
 * 40 categories across 13 groups, 68 brands
 */

window.QorAiCategories = {
  groups: [
    {
      name: 'Mobile',
      categories: [
        { id: 'smartphones', name: 'Smartphones', geizhalsSlug: 'handys' },
        { id: 'tablets', name: 'Tablets', geizhalsSlug: 'tablets' }
      ]
    },
    {
      name: 'Computers',
      categories: [
        { id: 'laptops', name: 'Laptops', geizhalsSlug: 'notebooks' },
        { id: 'desktops', name: 'Desktops', geizhalsSlug: 'pcs' }
      ]
    },
    {
      name: 'PC Components',
      categories: [
        { id: 'cpus', name: 'CPUs', geizhalsSlug: 'cpus' },
        { id: 'gpus', name: 'Graphics Cards', geizhalsSlug: 'grafikkarten' },
        { id: 'ram', name: 'RAM', geizhalsSlug: 'ram' },
        { id: 'ssd', name: 'SSDs', geizhalsSlug: 'ssds' },
        { id: 'motherboards', name: 'Motherboards', geizhalsSlug: 'mainboards' },
        { id: 'psu', name: 'Power Supplies', geizhalsSlug: 'netzteile' },
        { id: 'cases', name: 'Cases', geizhalsSlug: 'gehaeuse' },
        { id: 'coolers', name: 'Coolers', geizhalsSlug: 'cpu-kuehler' }
      ]
    },
    {
      name: 'Display',
      categories: [
        { id: 'tvs', name: 'TVs', geizhalsSlug: 'fernseher' },
        { id: 'monitors', name: 'Monitors', geizhalsSlug: 'monitore' },
        { id: 'projectors', name: 'Projectors', geizhalsSlug: 'projektoren' },
        { id: 'media-players', name: 'Media Players', geizhalsSlug: 'media-player' }
      ]
    },
    {
      name: 'Audio',
      categories: [
        { id: 'headphones', name: 'Headphones', geizhalsSlug: 'kopfhoerer' },
        { id: 'speakers', name: 'Speakers', geizhalsSlug: 'lautsprecher' },
        { id: 'soundbars', name: 'Soundbars', geizhalsSlug: 'soundbars' },
        { id: 'microphones', name: 'Microphones', geizhalsSlug: 'mikrofone' }
      ]
    },
    {
      name: 'Wearables',
      categories: [
        { id: 'smartwatches', name: 'Smartwatches', geizhalsSlug: 'smartwatches' },
        { id: 'smart-rings', name: 'Smart Rings', geizhalsSlug: 'smart-ringe' }
      ]
    },
    {
      name: 'Cameras',
      categories: [
        { id: 'cameras', name: 'Cameras', geizhalsSlug: 'digitalkameras' },
        { id: 'action-cameras', name: 'Action Cameras', geizhalsSlug: 'actioncams' },
        { id: 'ip-cameras', name: 'IP Cameras', geizhalsSlug: 'ip-kameras' },
        { id: 'dashcams', name: 'Dashcams', geizhalsSlug: 'dashcams' },
        { id: 'gimbals', name: 'Gimbals', geizhalsSlug: 'gimbals' },
        { id: 'tripods', name: 'Tripods', geizhalsSlug: 'stative' },
        { id: 'lenses', name: 'Lenses', geizhalsSlug: 'objektive' }
      ]
    },
    {
      name: 'Gaming',
      categories: [
        { id: 'consoles', name: 'Gaming Consoles', geizhalsSlug: 'spielkonsolen' },
        { id: 'gamepads', name: 'Gamepads', geizhalsSlug: 'gamepads' },
        { id: 'vr-headsets', name: 'VR Headsets', geizhalsSlug: 'vr-brillen' }
      ]
    },
    {
      name: 'Peripherals',
      categories: [
        { id: 'keyboards', name: 'Keyboards', geizhalsSlug: 'tastaturen' },
        { id: 'mice', name: 'Mice', geizhalsSlug: 'maeuse' },
        { id: 'printers', name: 'Printers', geizhalsSlug: 'drucker' },
        { id: 'webcams', name: 'Webcams', geizhalsSlug: 'webcams' }
      ]
    },
    {
      name: 'Networking',
      categories: [
        { id: 'routers', name: 'Routers & Modems', geizhalsSlug: 'router' }
      ]
    },
    {
      name: 'Smart Home',
      categories: [
        { id: 'robot-vacuums', name: 'Robot Vacuums', geizhalsSlug: 'saugroboter' }
      ]
    },
    {
      name: 'Accessories',
      categories: [
        { id: 'powerbanks', name: 'Power Banks', geizhalsSlug: 'powerbanks' },
        { id: 'e-readers', name: 'E-Readers', geizhalsSlug: 'ebook-reader' }
      ]
    },
    {
      name: 'Drones',
      categories: [
        { id: 'drones', name: 'Drones', geizhalsSlug: 'drohnen' }
      ]
    }
  ],

  // Flat lookup helpers
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
