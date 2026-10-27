import { LocationSuggestionDto } from '@vit-carpool/contracts';

export interface FallbackLandmark extends LocationSuggestionDto {
  aliases?: string[];
}

export const CHENNAI_FALLBACK_LANDMARKS: FallbackLandmark[] = [
  // Campus & Immediate Nodes
  {
    id: 'chennai-vit-campus',
    name: 'VIT Chennai Campus',
    address: 'Vandalur-Kelambakkam Road, Rajan Nagar, Chennai, Tamil Nadu 600127',
    latitude: 12.8406,
    longitude: 80.1534,
    category: 'landmark',
    aliases: ['vit', 'vit chennai', 'vit campus', 'vandalur kelambakkam road', 'vit university'],
  },
  {
    id: 'chennai-vandalur-station',
    name: 'Vandalur Railway Station',
    address: 'GST Road / Railway Station Road, Vandalur, Chennai 600048',
    latitude: 12.8885,
    longitude: 80.0817,
    category: 'station',
    aliases: ['vandalur', 'vandalur station', 'vandalur local'],
  },
  {
    id: 'chennai-vandalur-zoo',
    name: 'Vandalur Zoo (Arignar Anna Zoological Park)',
    address: 'Grand Southern Trunk Rd, Vandalur, Chennai, Tamil Nadu 600048',
    latitude: 12.8794,
    longitude: 80.0827,
    category: 'landmark',
    aliases: ['vandalur zoo', 'zoo', 'anna zoological park'],
  },
  {
    id: 'chennai-kelambakkam-junction',
    name: 'Kelambakkam Junction',
    address: 'OMR & Vandalur-Kelambakkam Road, Kelambakkam, Tamil Nadu 603103',
    latitude: 12.7844,
    longitude: 80.2201,
    category: 'locality',
    aliases: ['kelambakkam', 'kelambakkam bus stand', 'kelambakkam signal'],
  },
  {
    id: 'chennai-thiruporur',
    name: 'Thiruporur',
    address: 'Murugan Temple & OMR Highway, Thiruporur, Tamil Nadu 603110',
    latitude: 12.7247,
    longitude: 80.1895,
    category: 'locality',
    aliases: ['thiruporur', 'thiruporur temple', 'omr south'],
  },

  // GST Road & Suburban Rail Corridor
  {
    id: 'chennai-tambaram-station',
    name: 'Tambaram Railway Station',
    address: 'GST Road, Tambaram West / East, Chennai, Tamil Nadu 600045',
    latitude: 12.9254,
    longitude: 80.1174,
    category: 'station',
    aliases: ['tambaram', 'tambaram west', 'tambaram east', 'tambaram station', 'tambaram bus stand'],
  },
  {
    id: 'chennai-tambaram-sanatorium',
    name: 'Tambaram Sanatorium Railway Station',
    address: 'GST Road & MEPZ Junction, Tambaram Sanatorium, Chennai 600047',
    latitude: 12.9432,
    longitude: 80.1298,
    category: 'station',
    aliases: ['sanatorium', 'mepz', 'tambaram sanatorium', 'tb sanatorium'],
  },
  {
    id: 'chennai-chromepet',
    name: 'Chromepet Railway Station',
    address: 'GST Road & Station Road, Chromepet, Chennai, Tamil Nadu 600044',
    latitude: 12.9516,
    longitude: 80.1412,
    category: 'station',
    aliases: ['chromepet', 'chromepet station', 'mit bridge', 'saravana stores chromepet'],
  },
  {
    id: 'chennai-pallavaram',
    name: 'Pallavaram',
    address: 'GST Road & Dharga Road, Pallavaram, Chennai 600043',
    latitude: 12.9675,
    longitude: 80.1491,
    category: 'station',
    aliases: ['pallavaram', 'pallavaram station', 'cantonment'],
  },
  {
    id: 'chennai-airport',
    name: 'Chennai International Airport (MAA)',
    address: 'Meenambakkam / Tirusulam, Chennai, Tamil Nadu 600027',
    latitude: 12.9818,
    longitude: 80.1639,
    category: 'station',
    aliases: ['airport', 'chennai airport', 'maa', 'airport metro', 'tirusulam', 'meenambakkam'],
  },
  {
    id: 'chennai-guindy-kathipara',
    name: 'Guindy Metro & Kathipara Junction',
    address: 'Guindy Industrial Estate & Kathipara Flyover, Guindy, Chennai 600032',
    latitude: 13.0067,
    longitude: 80.2024,
    category: 'station',
    aliases: ['guindy', 'kathipara', 'guindy station', 'guindy metro', 'kathipara junction'],
  },

  // OMR (Rajiv Gandhi Salai) IT Corridor
  {
    id: 'chennai-sholinganallur',
    name: 'Sholinganallur Junction (OMR)',
    address: 'OMR & ECR Link Road Junction, Sholinganallur, Chennai, Tamil Nadu 600119',
    latitude: 12.901,
    longitude: 80.2279,
    category: 'locality',
    aliases: ['omr', 'sholinganallur', 'shollinganallur', 'omr junction', 'elcot sez'],
  },
  {
    id: 'chennai-navalur-vivira',
    name: 'Navalur (Vivira Mall / OMR)',
    address: 'Old Mahabalipuram Road (OMR), Navalur, Chennai, Tamil Nadu 603103',
    latitude: 12.8475,
    longitude: 80.2263,
    category: 'landmark',
    aliases: ['omr', 'navalur', 'vivira', 'vivira mall', 'navalur toll', 'omr navalur'],
  },
  {
    id: 'chennai-siruseri-sipcot',
    name: 'Siruseri (SIPCOT IT Park / OMR)',
    address: 'OMR, Siruseri, Chennai, Tamil Nadu 603103',
    latitude: 12.8258,
    longitude: 80.2194,
    category: 'locality',
    aliases: ['omr', 'siruseri', 'sipcot', 'siruseri sipcot', 'tcs siruseri', 'omr siruseri'],
  },
  {
    id: 'chennai-egattur-marina',
    name: 'Egattur (The Marina Mall / OMR)',
    address: 'Old Mahabalipuram Road (OMR), Egattur, Navalur 603103',
    latitude: 12.8354,
    longitude: 80.2255,
    category: 'landmark',
    aliases: ['omr', 'marina mall', 'egattur', 'marina mall omr'],
  },
  {
    id: 'chennai-karapakkam',
    name: 'Karapakkam (OMR)',
    address: 'Rajiv Gandhi Salai (OMR), Karapakkam, Chennai 600097',
    latitude: 12.923,
    longitude: 80.231,
    category: 'locality',
    aliases: ['omr', 'karapakkam', 'tcs karapakkam', 'omr food street'],
  },
  {
    id: 'chennai-thoraipakkam',
    name: 'Thoraipakkam (OMR & Radial Road)',
    address: 'OMR & Pallavaram-Thoraipakkam Radial Rd, Thoraipakkam, Chennai 600097',
    latitude: 12.9428,
    longitude: 80.2361,
    category: 'locality',
    aliases: ['omr', 'thoraipakkam', 'thuraipakkam', '200 feet radial road', 'radial road omr junction'],
  },
  {
    id: 'chennai-perungudi',
    name: 'Perungudi (OMR Toll Plaza)',
    address: 'Rajiv Gandhi Salai (OMR), Perungudi, Chennai 600096',
    latitude: 12.9654,
    longitude: 80.2443,
    category: 'locality',
    aliases: ['omr', 'perungudi', 'perungudi toll', 'kallukuttai'],
  },
  {
    id: 'chennai-kandanchavadi',
    name: 'Kandanchavadi (OMR)',
    address: 'Rajiv Gandhi Salai (OMR) & MGR Salai, Kandanchavadi, Chennai 600096',
    latitude: 12.973,
    longitude: 80.2464,
    category: 'locality',
    aliases: ['omr', 'kandanchavadi', 'mgr salai', 'rmz millenia'],
  },
  {
    id: 'chennai-taramani-tidel',
    name: 'Taramani (TIDEL Park / OMR)',
    address: 'Rajiv Gandhi Salai (OMR), Taramani, Chennai 600113',
    latitude: 12.9897,
    longitude: 80.2486,
    category: 'landmark',
    aliases: ['omr', 'taramani', 'tidel park', 'ascendas', 'iitm research park', 'taramani station'],
  },
  {
    id: 'chennai-madhya-kailash',
    name: 'Madhya Kailash (Adyar / OMR)',
    address: 'OMR Starting Point, Sardar Patel Road, Adyar, Chennai 600020',
    latitude: 13.007,
    longitude: 80.245,
    category: 'station',
    aliases: ['omr', 'madhya kailash', 'clri', 'omr start', 'adyar'],
  },

  // Velachery & Medavakkam Radial Belt
  {
    id: 'chennai-velachery-mrts',
    name: 'Velachery MRTS Station',
    address: 'Inner Ring Road & Byepass Road, Velachery, Chennai, Tamil Nadu 600042',
    latitude: 12.9815,
    longitude: 80.2212,
    category: 'station',
    aliases: ['velachery', 'velachery station', 'velachery mrts', 'vijaya nagar', 'velachery bus stand'],
  },
  {
    id: 'chennai-phoenix-mall',
    name: 'Phoenix Marketcity (Velachery)',
    address: '142 Velachery Road, Indira Gandhi Nagar, Velachery, Chennai 600042',
    latitude: 12.9915,
    longitude: 80.2167,
    category: 'landmark',
    aliases: ['phoenix mall', 'phoenix marketcity', 'palladium mall', 'velachery mall'],
  },
  {
    id: 'chennai-medavakkam',
    name: 'Medavakkam Koot Road',
    address: 'Perumbakkam Main Road & Velachery-Tambaram Rd, Medavakkam 600100',
    latitude: 12.9193,
    longitude: 80.1919,
    category: 'locality',
    aliases: ['medavakkam', 'medavakkam koot road', 'medavakkam junction'],
  },
  {
    id: 'chennai-perumbakkam',
    name: 'Perumbakkam (Global Hospital)',
    address: 'Cheran Nagar & Medavakkam-Sholinganallur Road, Perumbakkam, Chennai 600100',
    latitude: 12.9037,
    longitude: 80.2036,
    category: 'locality',
    aliases: ['perumbakkam', 'global hospital', 'gleneagles global', 'cheran nagar'],
  },

  // Central, T. Nagar & Commercial Hubs
  {
    id: 'chennai-t-nagar',
    name: 'T. Nagar (Pondy Bazaar / Panagal Park)',
    address: 'Pondy Bazaar, Usman Road & Panagal Park, T. Nagar, Chennai, Tamil Nadu 600017',
    latitude: 13.0418,
    longitude: 80.2341,
    category: 'locality',
    aliases: ['tea nagar', 't nagar', 't.nagar', 't. nagar', 'thyagaraya nagar', 'pondy bazaar', 'panagal park', 'usman road', 'tnagar'],
  },
  {
    id: 'chennai-mambalam-station',
    name: 'Mambalam Railway Station',
    address: 'Station Road, Mambalam / T. Nagar, Chennai, Tamil Nadu 600033',
    latitude: 13.0382,
    longitude: 80.2307,
    category: 'station',
    aliases: ['mambalam', 'mambalam station', 't nagar station', 'tea nagar station'],
  },
  {
    id: 'chennai-central-station',
    name: 'MGR Chennai Central Railway Station',
    address: 'Kannappar Thidal, Periamet, Chennai, Tamil Nadu 600003',
    latitude: 13.0827,
    longitude: 80.2755,
    category: 'station',
    aliases: ['central', 'chennai central', 'central station', 'mgr central', 'park town'],
  },
  {
    id: 'chennai-egmore-station',
    name: 'Chennai Egmore Railway Station',
    address: 'Gandhi Irwin Road, Egmore, Chennai, Tamil Nadu 600008',
    latitude: 13.0827,
    longitude: 80.2619,
    category: 'station',
    aliases: ['egmore', 'chennai egmore', 'egmore station'],
  },
  {
    id: 'chennai-koyambedu-cmbt',
    name: 'Koyambedu (CMBT Bus Terminus & Metro)',
    address: 'Inner Ring Road, Koyambedu, Chennai, Tamil Nadu 600107',
    latitude: 13.0694,
    longitude: 80.2057,
    category: 'station',
    aliases: ['koyambedu', 'cmbt', 'koyambedu bus stand', 'koyambedu market', 'koyambedu metro'],
  },
];

export function searchFallbackLandmarks(query: string, limit = 5): LocationSuggestionDto[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const matched = CHENNAI_FALLBACK_LANDMARKS.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.address.toLowerCase().includes(q)) return true;
    if (item.aliases && item.aliases.some((alias) => alias.toLowerCase().includes(q) || q.includes(alias.toLowerCase()))) {
      return true;
    }
    return false;
  });

  return matched.slice(0, limit).map(({ id, name, address, latitude, longitude, category }) => ({
    id,
    name,
    address,
    latitude,
    longitude,
    category,
  }));
}
