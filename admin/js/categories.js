/**
 * Compair Category & Brand Definitions
 * 40 categories across 13 groups, 68 brands
 */

window.CompairCategories = {
  groups: [
    {
      name: 'Mobile',
      categories: [
        { id: 'smartphones', name: 'Smartphones', epeyPath: 'akilli-telefonlar' },
        { id: 'tablets', name: 'Tablets', epeyPath: 'tablet' }
      ]
    },
    {
      name: 'Computers',
      categories: [
        { id: 'laptops', name: 'Laptops', epeyPath: 'laptop' },
        { id: 'desktops', name: 'Desktops', epeyPath: 'masaustu-bilgisayar' }
      ]
    },
    {
      name: 'PC Components',
      categories: [
        { id: 'cpus', name: 'CPUs', epeyPath: 'islemci' },
        { id: 'gpus', name: 'Graphics Cards', epeyPath: 'ekran-karti' },
        { id: 'ram', name: 'RAM', epeyPath: 'bellek-ram' },
        { id: 'ssd', name: 'SSDs', epeyPath: 'depolama/cihaz-sinifi/ssd' },
        { id: 'motherboards', name: 'Motherboards', epeyPath: 'anakart' },
        { id: 'psu', name: 'Power Supplies', epeyPath: 'power-supply-psu' },
        { id: 'cases', name: 'Cases', epeyPath: 'bilgisayar-kasasi' },
        { id: 'coolers', name: 'Coolers', epeyPath: 'islemci-sogutucu' }
      ]
    },
    {
      name: 'Display',
      categories: [
        { id: 'tvs', name: 'TVs', epeyPath: 'televizyon' },
        { id: 'monitors', name: 'Monitors', epeyPath: 'monitor' },
        { id: 'projectors', name: 'Projectors', epeyPath: 'projeksiyon-makinesi' },
        { id: 'media-players', name: 'Media Players', epeyPath: 'medya-oynatici' }
      ]
    },
    {
      name: 'Audio',
      categories: [
        { id: 'headphones', name: 'Headphones', epeyPath: 'kulaklik' },
        { id: 'speakers', name: 'Speakers', epeyPath: 'ses-sistemi/urun-tipi/bluetooth-hoparlor' },
        { id: 'soundbars', name: 'Soundbars', epeyPath: 'ses-sistemi/urun-tipi/soundbar' },
        { id: 'microphones', name: 'Microphones', epeyPath: 'mikrofon' }
      ]
    },
    {
      name: 'Wearables',
      categories: [
        { id: 'smartwatches', name: 'Smartwatches', epeyPath: 'akilli-saat' },
        { id: 'smart-rings', name: 'Smart Rings', epeyPath: 'akilli-yuzuk' }
      ]
    },
    {
      name: 'Cameras',
      categories: [
        { id: 'cameras', name: 'Cameras', epeyPath: 'fotograf-kamera' },
        { id: 'action-cameras', name: 'Action Cameras', epeyPath: 'aksiyon-kamera' },
        { id: 'ip-cameras', name: 'IP Cameras', epeyPath: 'ip-kamera' },
        { id: 'dashcams', name: 'Dashcams', epeyPath: 'arac-ici-kamera' },
        { id: 'gimbals', name: 'Gimbals', epeyPath: 'gimbal' },
        { id: 'tripods', name: 'Tripods', epeyPath: 'tripod' },
        { id: 'lenses', name: 'Lenses', epeyPath: 'lens' }
      ]
    },
    {
      name: 'Gaming',
      categories: [
        { id: 'consoles', name: 'Gaming Consoles', epeyPath: 'oyun-konsolu' },
        { id: 'gamepads', name: 'Gamepads', epeyPath: 'oyun-kolu' },
        { id: 'vr-headsets', name: 'VR Headsets', epeyPath: 'sanal-gerceklik' }
      ]
    },
    {
      name: 'Peripherals',
      categories: [
        { id: 'keyboards', name: 'Keyboards', epeyPath: 'klavye-mouse/urun-tipi/klavye' },
        { id: 'mice', name: 'Mice', epeyPath: 'klavye-mouse/urun-tipi/mouse' },
        { id: 'printers', name: 'Printers', epeyPath: 'yazici' },
        { id: 'webcams', name: 'Webcams', epeyPath: 'webcam' }
      ]
    },
    {
      name: 'Networking',
      categories: [
        { id: 'routers', name: 'Routers & Modems', epeyPath: 'modem' }
      ]
    },
    {
      name: 'Smart Home',
      categories: [
        { id: 'robot-vacuums', name: 'Robot Vacuums', epeyPath: 'robot-supurge' }
      ]
    },
    {
      name: 'Accessories',
      categories: [
        { id: 'powerbanks', name: 'Power Banks', epeyPath: 'powerbank' },
        { id: 'e-readers', name: 'E-Readers', epeyPath: 'e-kitap-okuyucu' }
      ]
    },
    {
      name: 'Drones',
      categories: [
        { id: 'drones', name: 'Drones', epeyPath: 'drone' }
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
  },

  getEpeyUrl(categoryId) {
    const cat = this.getById(categoryId);
    return cat ? 'https://www.epey.com/' + cat.epeyPath + '/' : null;
  }
};

window.CompairBrands = [
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
