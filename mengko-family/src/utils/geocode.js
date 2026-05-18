// Coordinates stored as [longitude, latitude] — GeoJSON/react-simple-maps convention
const CITY_COORDS = {
  // Indonesia
  'jakarta':           [106.8456, -6.2088],
  'jakarta pusat':     [106.8283, -6.1801],
  'jakarta selatan':   [106.8106, -6.2615],
  'jakarta timur':     [106.9004, -6.2251],
  'jakarta barat':     [106.7644, -6.1683],
  'jakarta utara':     [106.8551, -6.1381],
  'surabaya':          [112.7521, -7.2575],
  'bandung':           [107.6191, -6.9175],
  'medan':             [98.6722,   3.5952],
  'semarang':          [110.4203, -6.9932],
  'makassar':          [119.4327, -5.1477],
  'ujung pandang':     [119.4327, -5.1477],
  'palembang':         [104.7754, -2.9761],
  'tangerang':         [106.6298, -6.1781],
  'tangerang selatan': [106.7439, -6.2936],
  'depok':             [106.7942, -6.4025],
  'bekasi':            [106.9896, -6.2349],
  'yogyakarta':        [110.3688, -7.7972],
  'yogya':             [110.3688, -7.7972],
  'solo':              [110.8243, -7.5755],
  'surakarta':         [110.8243, -7.5755],
  'malang':            [112.6304, -7.9797],
  'denpasar':          [115.2126, -8.6705],
  'bali':              [115.0920, -8.3405],
  'bogor':             [106.8060, -6.5971],
  'pontianak':         [109.3425, -0.0263],
  'balikpapan':        [116.8289, -1.2675],
  'samarinda':         [117.1536, -0.5022],
  'manado':            [124.8421,  1.4748],
  'pekanbaru':         [101.4478,  0.5071],
  'batam':             [104.0305,  1.0456],
  'padang':            [100.4172, -0.9471],
  'kupang':            [123.6070, -10.1772],
  'jayapura':          [140.6690, -2.5916],
  'ambon':             [128.1908, -3.6554],
  'banjarmasin':       [114.5908, -3.3194],
  'mataram':           [116.1167, -8.5833],
  'cirebon':           [108.5523, -6.7320],
  'cilegon':           [106.0549, -6.0028],
  'tasikmalaya':       [108.2207, -7.3274],
  'sukabumi':          [106.9278, -6.9277],
  'serang':            [106.1503, -6.1105],
  'palu':              [119.8707, -0.9003],
  'flores':            [121.0794, -8.6574],
  'lombok':            [116.3220, -8.6500],
  // Singapore
  'singapore':         [103.8198,  1.3521],
  // Malaysia
  'kuala lumpur':      [101.6869,  3.1390],
  'kl':                [101.6869,  3.1390],
  'penang':            [100.3288,  5.4141],
  'johor bahru':       [103.7414,  1.4927],
  'kota kinabalu':     [116.0753,  5.9804],
  'kuching':           [110.3592,  1.5497],
  // Australia
  'sydney':            [151.2093, -33.8688],
  'melbourne':         [144.9631, -37.8136],
  'brisbane':          [153.0251, -27.4698],
  'perth':             [115.8605, -31.9505],
  'adelaide':          [138.6007, -34.9285],
  'canberra':          [149.1300, -35.2809],
  // USA
  'new york':          [-74.0060,  40.7128],
  'new york city':     [-74.0060,  40.7128],
  'nyc':               [-74.0060,  40.7128],
  'los angeles':       [-118.2437, 34.0522],
  'la':                [-118.2437, 34.0522],
  'chicago':           [-87.6298,  41.8781],
  'houston':           [-95.3698,  29.7604],
  'san francisco':     [-122.4194, 37.7749],
  'seattle':           [-122.3321, 47.6062],
  'boston':            [-71.0589,  42.3601],
  'miami':             [-80.1918,  25.7617],
  'dallas':            [-96.7970,  32.7767],
  'washington dc':     [-77.0369,  38.9072],
  'atlanta':           [-84.3879,  33.7490],
  'denver':            [-104.9903, 39.7392],
  'san diego':         [-117.1611, 32.7157],
  // Netherlands
  'amsterdam':         [4.9041,   52.3676],
  'rotterdam':         [4.4777,   51.9244],
  // Japan
  'tokyo':             [139.6503,  35.6762],
  'osaka':             [135.5023,  34.6937],
  'kyoto':             [135.7681,  35.0116],
  'fukuoka':           [130.4017,  33.5904],
  // Taiwan
  'taipei':            [121.5654,  25.0330],
  // Hong Kong
  'hong kong':         [114.1694,  22.3193],
  // UK
  'london':            [-0.1278,   51.5074],
  'manchester':        [-2.2426,   53.4808],
  'birmingham':        [-1.8904,   52.4862],
  'edinburgh':         [-3.1883,   55.9533],
  // Germany
  'berlin':            [13.4050,   52.5200],
  'munich':            [11.5820,   48.1351],
  'frankfurt':         [8.6821,    50.1109],
  'hamburg':           [9.9937,    53.5753],
  // France
  'paris':             [2.3522,    48.8566],
  // South Korea
  'seoul':             [126.9780,  37.5665],
  'busan':             [129.0756,  35.1796],
  // China
  'beijing':           [116.4074,  39.9042],
  'shanghai':          [121.4737,  31.2304],
  'shenzhen':          [114.0579,  22.5431],
  'guangzhou':         [113.2644,  23.1291],
  // Thailand
  'bangkok':           [100.5018,  13.7563],
  'chiang mai':        [98.9817,   18.7061],
  // Vietnam
  'ho chi minh city':  [106.6297,  10.8231],
  'hcmc':              [106.6297,  10.8231],
  'saigon':            [106.6297,  10.8231],
  'hanoi':             [105.8542,  21.0285],
  'da nang':           [108.2022,  16.0544],
  // Philippines
  'manila':            [120.9842,  14.5995],
  'cebu':              [123.8854,  10.3157],
  'davao':             [125.6128,   7.0731],
  // Canada
  'toronto':           [-79.3470,  43.6510],
  'vancouver':         [-123.1207, 49.2827],
  'montreal':          [-73.5673,  45.5017],
  'calgary':           [-114.0719, 51.0447],
  // UAE
  'dubai':             [55.2708,   25.2048],
  'abu dhabi':         [54.3773,   24.4539],
  // India
  'mumbai':            [72.8777,   19.0760],
  'delhi':             [77.2090,   28.6139],
  'new delhi':         [77.2090,   28.6139],
  'bangalore':         [77.5946,   12.9716],
  'bengaluru':         [77.5946,   12.9716],
  'chennai':           [80.2707,   13.0827],
  'hyderabad':         [78.4867,   17.3850],
  'kolkata':           [88.3639,   22.5726],
  // Switzerland
  'zurich':            [8.5417,    47.3769],
  'geneva':            [6.1432,    46.2044],
  // Sweden
  'stockholm':         [18.0686,   59.3293],
  // Spain
  'madrid':            [-3.7038,   40.4168],
  'barcelona':         [2.1734,    41.3851],
  // Italy
  'rome':              [12.4964,   41.9028],
  'milan':             [9.1900,    45.4642],
  // New Zealand
  'auckland':          [174.7645, -36.8509],
  'wellington':        [174.7762, -41.2865],
  // South Africa
  'cape town':         [18.4241,  -33.9249],
  'johannesburg':      [28.0473,  -26.2041],
  // Brazil
  'sao paulo':         [-46.6333, -23.5505],
  'rio de janeiro':    [-43.1729, -22.9068],
  // Mexico
  'mexico city':       [-99.1332,  19.4326],
  // Saudi Arabia
  'riyadh':            [46.7219,   24.6877],
  'jeddah':            [39.1925,   21.4858],
  // Turkey
  'istanbul':          [28.9784,   41.0082],
};

export function getCityCoords(cityName) {
  if (!cityName) return null;
  const key = cityName.toLowerCase().trim();
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  for (const [k, coords] of Object.entries(CITY_COORDS)) {
    if (key.includes(k) || k.includes(key)) return coords;
  }
  return null;
}
