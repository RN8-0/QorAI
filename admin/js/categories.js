/**
 * Qor AI Category & Brand Definitions
 * 40 categories across 13 groups, 68 brands
 */

window.QorAiCategories = {
  groups: [
    {
      name: 'Mobile',
      categories: [
        { id: 'smartphones', name: 'Smartphones' },
        { id: 'tablets', name: 'Tablets' }
      ]
    },
    {
      name: 'Computers',
      categories: [
        { id: 'laptops', name: 'Laptops' },
        { id: 'desktops', name: 'Desktops' }
      ]
    },
    {
      name: 'PC Components',
      categories: [
        { id: 'cpus', name: 'CPUs' },
        { id: 'gpus', name: 'Graphics Cards' },
        { id: 'ram', name: 'RAM' },
        { id: 'ssd', name: 'SSDs' },
        { id: 'motherboards', name: 'Motherboards' },
        { id: 'psu', name: 'Power Supplies' },
        { id: 'cases', name: 'Cases' },
        { id: 'coolers', name: 'Coolers' }
      ]
    },
    {
      name: 'Display',
      categories: [
        { id: 'tvs', name: 'TVs' },
        { id: 'monitors', name: 'Monitors' },
        { id: 'projectors', name: 'Projectors' },
        { id: 'media-players', name: 'Media Players' }
      ]
    },
    {
      name: 'Audio',
      categories: [
        { id: 'headphones', name: 'Headphones' },
        { id: 'speakers', name: 'Speakers' },
        { id: 'soundbars', name: 'Soundbars' },
        { id: 'microphones', name: 'Microphones' }
      ]
    },
    {
      name: 'Wearables',
      categories: [
        { id: 'smartwatches', name: 'Smartwatches' },
        { id: 'smart-rings', name: 'Smart Rings' }
      ]
    },
    {
      name: 'Cameras',
      categories: [
        { id: 'cameras', name: 'Cameras' },
        { id: 'action-cameras', name: 'Action Cameras' },
        { id: 'ip-cameras', name: 'IP Cameras' },
        { id: 'dashcams', name: 'Dashcams' },
        { id: 'gimbals', name: 'Gimbals' },
        { id: 'tripods', name: 'Tripods' },
        { id: 'lenses', name: 'Lenses' }
      ]
    },
    {
      name: 'Gaming',
      categories: [
        { id: 'consoles', name: 'Gaming Consoles' },
        { id: 'gamepads', name: 'Gamepads' },
        { id: 'vr-headsets', name: 'VR Headsets' }
      ]
    },
    {
      name: 'Peripherals',
      categories: [
        { id: 'keyboards', name: 'Keyboards' },
        { id: 'mice', name: 'Mice' },
        { id: 'printers', name: 'Printers' },
        { id: 'webcams', name: 'Webcams' }
      ]
    },
    {
      name: 'Networking',
      categories: [
        { id: 'routers', name: 'Routers & Modems' }
      ]
    },
    {
      name: 'Smart Home',
      categories: [
        { id: 'robot-vacuums', name: 'Robot Vacuums' }
      ]
    },
    {
      name: 'Accessories',
      categories: [
        { id: 'powerbanks', name: 'Power Banks' },
        { id: 'e-readers', name: 'E-Readers' }
      ]
    },
    {
      name: 'Drones',
      categories: [
        { id: 'drones', name: 'Drones' }
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
