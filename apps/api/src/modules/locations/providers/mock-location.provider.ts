import { Injectable, Logger } from '@nestjs/common';
import { ILocationProvider } from './location-provider.interface';
import { LocationSuggestionDto } from '@vit-carpool/contracts';

interface MockLandmark extends LocationSuggestionDto {
  aliases?: string[];
}

/**
 * Deterministic mock location provider covering the entire Chennai metropolitan region,
 * suburban railway stations, metro lines, bus terminuses, IT corridors, and campus nodes.
 * Works completely offline for reliable development and testing.
 */
@Injectable()
export class MockLocationProvider implements ILocationProvider {
  private readonly logger = new Logger(MockLocationProvider.name);

  // Authoritative, comprehensive catalog of Chennai commuting landmarks and localities
  private readonly CHENNAI_LANDMARKS: MockLandmark[] = [
    // -------------------------------------------------------------------------
    // 1. Central Chennai, T. Nagar & Commercial Belt
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-t-nagar',
      name: 'T. Nagar (Thyagaraya Nagar)',
      address: 'Pondy Bazaar, Usman Road & Panagal Park, T. Nagar, Chennai, Tamil Nadu 600017',
      latitude: 13.0418,
      longitude: 80.2341,
      category: 'locality',
      aliases: [
        'tea nagar',
        't nagar',
        't.nagar',
        't. nagar',
        'thyagaraya nagar',
        'pondy bazaar',
        'panagal park',
        'usman road',
        'ranganathan street',
        'tnagar',
      ],
    },
    {
      id: 'mock-chennai-mambalam-station',
      name: 'Mambalam Railway Station',
      address: 'Station Road, Mambalam / T. Nagar, Chennai, Tamil Nadu 600033',
      latitude: 13.0382,
      longitude: 80.2307,
      category: 'station',
      aliases: ['mambalam', 'mambalam station', 't nagar station', 'tea nagar station', 'mambalam local'],
    },
    {
      id: 'mock-chennai-west-mambalam',
      name: 'West Mambalam',
      address: 'Arya Gowda Road & Postal Colony, West Mambalam, Chennai 600033',
      latitude: 13.0360,
      longitude: 80.2220,
      category: 'locality',
      aliases: ['west mambalam', 'arya gowda road', 'postal colony'],
    },
    {
      id: 'mock-chennai-nungambakkam',
      name: 'Nungambakkam',
      address: 'Nungambakkam High Road, Sterling Road & College Road, Chennai 600034',
      latitude: 13.0569,
      longitude: 80.2425,
      category: 'locality',
      aliases: ['nungambakkam', 'nh road', 'sterling road', 'loyola college', 'nungambakkam station'],
    },
    {
      id: 'mock-chennai-egmore',
      name: 'Chennai Egmore Railway Station',
      address: 'Gandhi Irwin Road, Egmore, Chennai, Tamil Nadu 600008',
      latitude: 13.0827,
      longitude: 80.2619,
      category: 'station',
      aliases: ['egmore', 'chennai egmore', 'egmore station', 'gandhi irwin'],
    },
    {
      id: 'mock-chennai-central',
      name: 'MGR Chennai Central Railway Station',
      address: 'Kannappar Thidal, Periamet, Chennai, Tamil Nadu 600003',
      latitude: 13.0827,
      longitude: 80.2755,
      category: 'station',
      aliases: ['central', 'chennai central', 'central station', 'mgr central', 'park town', 'moore market'],
    },
    {
      id: 'mock-chennai-chetpet',
      name: 'Chetpet',
      address: 'Harrington Road & McNichols Road, Chetpet, Chennai 600031',
      latitude: 13.0718,
      longitude: 80.2415,
      category: 'locality',
      aliases: ['chetpet', 'chetpet station', 'harrington road', 'chetpet ecopark'],
    },
    {
      id: 'mock-chennai-kodambakkam',
      name: 'Kodambakkam',
      address: 'Arcot Road & Station Road, Kodambakkam, Chennai 600024',
      latitude: 13.0514,
      longitude: 80.2238,
      category: 'locality',
      aliases: ['kodambakkam', 'kodambakkam bridge', 'arcot road', 'meenakshi college'],
    },
    {
      id: 'mock-chennai-vadapalani',
      name: 'Vadapalani',
      address: 'Arcot Road & 100 Feet Road, Vadapalani, Chennai 600026',
      latitude: 13.0500,
      longitude: 80.2120,
      category: 'locality',
      aliases: ['vadapalani', 'forum mall', 'forum vijaya mall', 'vadapalani metro', 'vadapalani murugan temple'],
    },
    {
      id: 'mock-chennai-ashok-nagar',
      name: 'Ashok Nagar',
      address: 'Ashok Pillar & 1st Avenue, Ashok Nagar, Chennai 600083',
      latitude: 13.0373,
      longitude: 80.2123,
      category: 'locality',
      aliases: ['ashok nagar', 'ashok pillar', 'ashok nagar metro'],
    },
    {
      id: 'mock-chennai-kk-nagar',
      name: 'K.K. Nagar (Kalaignar Karunanidhi Nagar)',
      address: 'PT Rajan Salai, KK Nagar, Chennai 600078',
      latitude: 13.0337,
      longitude: 80.1970,
      category: 'locality',
      aliases: ['kk nagar', 'k.k. nagar', 'kk.nagar', 'kalaignar karunanidhi nagar', 'pt rajan salai', 'sivan park'],
    },
    {
      id: 'mock-chennai-saidapet',
      name: 'Saidapet',
      address: 'Anna Salai, Saidapet Court & Station, Chennai 600015',
      latitude: 13.0213,
      longitude: 80.2231,
      category: 'locality',
      aliases: ['saidapet', 'saidapet court', 'saidapet metro', 'saidapet station', 'panagal building'],
    },
    {
      id: 'mock-chennai-guindy',
      name: 'Guindy (Kathipara Junction)',
      address: 'Kathipara Cloverleaf & Metro Station, Guindy, Chennai, Tamil Nadu 600032',
      latitude: 13.0067,
      longitude: 80.2025,
      category: 'station',
      aliases: ['guindy', 'kathipara', 'kathipara junction', 'guindy station', 'guindy metro', 'guindy industrial estate', 'race course'],
    },
    {
      id: 'mock-chennai-alandur',
      name: 'Alandur Metro Interchange',
      address: 'GST Road & Inner Ring Road, Alandur, Chennai 600016',
      latitude: 13.0040,
      longitude: 80.2015,
      category: 'station',
      aliases: ['alandur', 'alandur metro', 'asarkhana'],
    },
    {
      id: 'mock-chennai-ekkatuthangal',
      name: 'Ekkatuthangal (Olympia Tech Park)',
      address: 'Inner Ring Road & CIPET Road, Ekkatuthangal, Chennai 600032',
      latitude: 13.0224,
      longitude: 80.2052,
      category: 'locality',
      aliases: ['ekkatuthangal', 'olympia', 'olympia tech park', 'cipet', 'ekkatuthangal metro'],
    },
    {
      id: 'mock-chennai-royapettah',
      name: 'Royapettah (Express Avenue Mall)',
      address: 'Whites Road, Royapettah, Chennai 600014',
      latitude: 13.0587,
      longitude: 80.2642,
      category: 'locality',
      aliases: ['royapettah', 'express avenue', 'ea mall', 'royapettah clock tower', 'whites road'],
    },
    {
      id: 'mock-chennai-mylapore',
      name: 'Mylapore',
      address: 'Kapaleeshwarar Temple, Luz Church Rd & Kutchery Rd, Mylapore, Chennai 600004',
      latitude: 13.0339,
      longitude: 80.2678,
      category: 'locality',
      aliases: ['mylapore', 'kapaleeshwarar', 'luz', 'luz corner', 'kutchery road', 'san thome'],
    },
    {
      id: 'mock-chennai-mandaveli',
      name: 'Mandaveli',
      address: 'RK Mutt Road, Mandaveli, Chennai 600028',
      latitude: 13.0280,
      longitude: 80.2610,
      category: 'locality',
      aliases: ['mandaveli', 'mandaveli station', 'rk mutt road'],
    },
    {
      id: 'mock-chennai-alwarpet',
      name: 'Alwarpet',
      address: 'TTK Road & CP Ramaswamy Road, Alwarpet, Chennai 600018',
      latitude: 13.0333,
      longitude: 80.2500,
      category: 'locality',
      aliases: ['alwarpet', 'ttk road', 'cp ramaswamy road', 'alwarpet signal', 'music academy'],
    },
    {
      id: 'mock-chennai-ra-puram',
      name: 'R.A. Puram (Raja Annamalaipuram)',
      address: 'Greenways Road, RA Puram, Chennai 600028',
      latitude: 13.0210,
      longitude: 80.2570,
      category: 'locality',
      aliases: ['ra puram', 'raja annamalaipuram', 'greenways road', 'greenways station'],
    },
    {
      id: 'mock-chennai-teynampet',
      name: 'Teynampet',
      address: 'Anna Salai, DMS Metro & SIET College, Teynampet, Chennai 600018',
      latitude: 13.0405,
      longitude: 80.2504,
      category: 'locality',
      aliases: ['teynampet', 'dms metro', 'siet', 'cenotaph road', 'chamiers road'],
    },
    {
      id: 'mock-chennai-triplicane',
      name: 'Triplicane',
      address: 'Pycrofts Road & Triplicane High Road, Chennai 600005',
      latitude: 13.0587,
      longitude: 80.2757,
      category: 'locality',
      aliases: ['triplicane', 'parthasarathy temple', 'pycrofts road', 'chepauk', 'chepauk stadium'],
    },
    {
      id: 'mock-chennai-marina-beach',
      name: 'Marina Beach',
      address: 'Kamarajar Salai, Marina Promenade, Chennai 600005',
      latitude: 13.0500,
      longitude: 80.2824,
      category: 'landmark',
      aliases: ['marina', 'marina beach', 'light house', 'kamarajar salai'],
    },

    // -------------------------------------------------------------------------
    // 2. South Chennai & Velachery Belt
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-adyar',
      name: 'Adyar Bus Depot',
      address: 'Sardar Patel Road & LB Road, Adyar, Chennai, Tamil Nadu 600020',
      latitude: 13.0064,
      longitude: 80.2559,
      category: 'station',
      aliases: ['adyar', 'adyar depot', 'sardar patel road', 'lb road', 'gandhi nagar', 'malar hospital'],
    },
    {
      id: 'mock-chennai-besant-nagar',
      name: "Besant Nagar (Elliot's Beach)",
      address: '6th Avenue, Besant Nagar, Chennai 600090',
      latitude: 12.9995,
      longitude: 80.2707,
      category: 'locality',
      aliases: ['besant nagar', 'elliots beach', 'bessie', 'velankanni shrine', 'olcott memorial'],
    },
    {
      id: 'mock-chennai-thiruvanmiyur',
      name: 'Thiruvanmiyur Bus Depot / MRTS',
      address: 'East Coast Road & LB Road, Thiruvanmiyur, Chennai 600041',
      latitude: 12.9830,
      longitude: 80.2594,
      category: 'station',
      aliases: ['thiruvanmiyur', 'thiruvanmiyur depot', 'marundeeswarar temple', 'thiruvanmiyur mrts'],
    },
    {
      id: 'mock-chennai-kotturpuram',
      name: 'Kotturpuram (Anna Centenary Library)',
      address: 'Gandhi Mandapam Road, Kotturpuram, Chennai 600085',
      latitude: 13.0135,
      longitude: 80.2405,
      category: 'locality',
      aliases: ['kotturpuram', 'anna centenary library', 'gandhi mandapam'],
    },
    {
      id: 'mock-chennai-velachery',
      name: 'Velachery',
      address: 'Velachery Bypass Road / MRTS Terminal, Chennai, Tamil Nadu 600042',
      latitude: 12.9756,
      longitude: 80.2206,
      category: 'locality',
      aliases: ['velachery', 'velachery mrts', 'velachery station', 'vijayanagar', 'velachery bypass'],
    },
    {
      id: 'mock-chennai-velachery-phoenix',
      name: 'Phoenix Marketcity (Velachery)',
      address: 'Velachery Road, Indira Gandhi Nagar, Velachery, Chennai, Tamil Nadu 600042',
      latitude: 12.9918,
      longitude: 80.2173,
      category: 'landmark',
      aliases: ['phoenix', 'phoenix mall', 'phoenix marketcity', 'palladium mall', 'guru nanak college'],
    },
    {
      id: 'mock-chennai-madipakkam',
      name: 'Madipakkam',
      address: 'Madipakkam Koot Road & Bazaar Road, Chennai 600091',
      latitude: 12.9647,
      longitude: 80.1961,
      category: 'locality',
      aliases: ['madipakkam', 'madipakkam koot road', 'kaiveli', 'bazaar road'],
    },
    {
      id: 'mock-chennai-keelkattalai',
      name: 'Keelkattalai Signal',
      address: 'Medavakkam Main Road & 200 Feet Radial Rd, Keelkattalai, Chennai 600117',
      latitude: 12.9560,
      longitude: 80.1830,
      category: 'locality',
      aliases: ['keelkattalai', 'kilkattalai', 'eachangadu'],
    },
    {
      id: 'mock-chennai-kovilambakkam',
      name: 'Kovilambakkam',
      address: '200 Feet Radial Road, Kovilambakkam, Chennai 600129',
      latitude: 12.9377,
      longitude: 80.1870,
      category: 'locality',
      aliases: ['kovilambakkam', 'sunnambu kolathur', 'radial road'],
    },
    {
      id: 'mock-chennai-medavakkam',
      name: 'Medavakkam Junction',
      address: 'Tambaram-Velachery Main Road & Perumbakkam Main Rd, Chennai, Tamil Nadu',
      latitude: 12.9202,
      longitude: 80.1873,
      category: 'locality',
      aliases: ['medavakkam', 'medavakkam junction', 'perumbakkam', 'medavakkam flyover'],
    },
    {
      id: 'mock-chennai-sembakkam',
      name: 'Sembakkam / Gowrivakkam',
      address: 'Velachery Main Road, Sembakkam, Chennai 600073',
      latitude: 12.9248,
      longitude: 80.1601,
      category: 'locality',
      aliases: ['sembakkam', 'gowrivakkam', 'kamarajapuram'],
    },
    {
      id: 'mock-chennai-chitlapakkam',
      name: 'Chitlapakkam',
      address: 'Chitlapakkam Main Road, Chennai 600064',
      latitude: 12.9370,
      longitude: 80.1430,
      category: 'locality',
      aliases: ['chitlapakkam', 'chitlapakkam lake'],
    },
    {
      id: 'mock-chennai-chromepet',
      name: 'Chromepet (MIT Gate / Station)',
      address: 'GST Road, Chromepet, Chennai, Tamil Nadu 600044',
      latitude: 12.9516,
      longitude: 80.1409,
      category: 'station',
      aliases: ['chromepet', 'mit', 'mit chromepet', 'madras institute of technology', 'chromepet station', 'saravana stores chromepet'],
    },
    {
      id: 'mock-chennai-pallavaram',
      name: 'Pallavaram',
      address: 'GST Road & Cantonment, Pallavaram, Chennai 600043',
      latitude: 12.9675,
      longitude: 80.1491,
      category: 'station',
      aliases: ['pallavaram', 'pallavaram station', 'pallavaram friday market', 'cantonment'],
    },
    {
      id: 'mock-chennai-pammal',
      name: 'Pammal',
      address: 'Pammal Main Road, Chennai 600075',
      latitude: 12.9750,
      longitude: 80.1340,
      category: 'locality',
      aliases: ['pammal', 'pammal main road', 'pozhichalur'],
    },
    {
      id: 'mock-chennai-airport',
      name: 'Chennai International Airport (Meenambakkam)',
      address: 'GST Road, Meenambakkam, Chennai, Tamil Nadu 600027',
      latitude: 12.9941,
      longitude: 80.1709,
      category: 'station',
      aliases: ['airport', 'chennai airport', 'meenambakkam', 'domestic terminal', 'international terminal', 'airport metro'],
    },
    {
      id: 'mock-chennai-st-thomas-mount',
      name: 'St. Thomas Mount Station',
      address: 'Station Road & Butt Road, St. Thomas Mount, Chennai 600016',
      latitude: 12.9948,
      longitude: 80.1983,
      category: 'station',
      aliases: ['st thomas mount', 'st. thomas mount', 'saint thomas mount', 'butt road', 'mount station'],
    },

    // -------------------------------------------------------------------------
    // 3. GST Southern Corridor & Suburban Belt
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-tambaram-station',
      name: 'Tambaram Railway Station',
      address: 'GST Road, East Tambaram, Chennai, Tamil Nadu 600045',
      latitude: 12.9249,
      longitude: 80.1275,
      category: 'station',
      aliases: ['tambaram', 'tambaram station', 'tambaram east', 'mcc', 'madras christian college'],
    },
    {
      id: 'mock-chennai-tambaram-west-bus',
      name: 'Tambaram West Bus Stand',
      address: 'Kakkarai St, West Tambaram, Chennai, Tamil Nadu 600045',
      latitude: 12.9261,
      longitude: 80.1189,
      category: 'station',
      aliases: ['tambaram west', 'tambaram bus stand', 'mudichur road'],
    },
    {
      id: 'mock-chennai-sanatorium',
      name: 'Tambaram Sanatorium (MEPZ)',
      address: 'GST Road & MEPZ Entrance, Tambaram Sanatorium, Chennai 600047',
      latitude: 12.9372,
      longitude: 80.1325,
      category: 'station',
      aliases: ['sanatorium', 'tambaram sanatorium', 'mepz', 'tb hospital'],
    },
    {
      id: 'mock-chennai-perungalathur',
      name: 'Perungalathur Junction',
      address: 'GST Road Bus Stop & Suburban Station, Perungalathur, Chennai, Tamil Nadu',
      latitude: 12.9056,
      longitude: 80.0911,
      category: 'station',
      aliases: ['perungalathur', 'perungalathur bus stop', 'perungalathur station', 'srinivasa nagar'],
    },
    {
      id: 'mock-chennai-vandalur',
      name: 'Vandalur',
      address: 'Grand Southern Trunk (GST) Road, Vandalur, Chennai, Tamil Nadu 600048',
      latitude: 12.8914,
      longitude: 80.0815,
      category: 'locality',
      aliases: ['vandalur', 'vandalur junction', 'vandalur flyover', 'crescent university', 'bsa crescent'],
    },
    {
      id: 'mock-chennai-vandalur-station',
      name: 'Vandalur Railway Station',
      address: 'Southern Railway Suburban Network, GST Road, Vandalur, Chennai, Tamil Nadu',
      latitude: 12.8906,
      longitude: 80.0818,
      category: 'station',
      aliases: ['vandalur railway station', 'vandalur train'],
    },
    {
      id: 'mock-chennai-vandalur-zoo',
      name: 'Vandalur Zoo (Arignar Anna Zoological Park)',
      address: 'Vandalur-Kelambakkam Road, Vandalur, Chennai, Tamil Nadu 600048',
      latitude: 12.8794,
      longitude: 80.0858,
      category: 'landmark',
      aliases: ['vandalur zoo', 'zoo', 'arignar anna zoo', 'chennai zoo'],
    },
    {
      id: 'mock-chennai-kilambakkam-kcbt',
      name: 'Kilambakkam Bus Terminus (KCBT)',
      address: 'Kalaignar Centenary Bus Terminus, GST Road, Kilambakkam, Chennai 600048',
      latitude: 12.8680,
      longitude: 80.0760,
      category: 'station',
      aliases: ['kilambakkam', 'kcbt', 'kalaignar centenary bus terminus', 'kilambakkam bus stand', 'new mofussil bus terminus'],
    },
    {
      id: 'mock-chennai-urapakkam',
      name: 'Urapakkam',
      address: 'GST Road & Railway Station, Urapakkam, Tamil Nadu 603210',
      latitude: 12.8640,
      longitude: 80.0680,
      category: 'locality',
      aliases: ['urapakkam', 'urapakkam station', 'revathipuram'],
    },
    {
      id: 'mock-chennai-guduvanchery',
      name: 'Guduvanchery',
      address: 'GST Road & Bus Terminus, Guduvanchery, Tamil Nadu 603202',
      latitude: 12.8440,
      longitude: 80.0610,
      category: 'locality',
      aliases: ['guduvanchery', 'guduvancheri', 'nandivaram', 'guduvanchery station'],
    },
    {
      id: 'mock-chennai-potheri-srm',
      name: 'Potheri (SRM University Campus)',
      address: 'GST Road & Potheri Station, SRM Nagar, Kattankulathur 603203',
      latitude: 12.8230,
      longitude: 80.0440,
      category: 'campus',
      aliases: ['potheri', 'srm', 'srm university', 'srm campus', 'potheri station'],
    },
    {
      id: 'mock-chennai-kattankulathur',
      name: 'Kattankulathur',
      address: 'GST Road, Kattankulathur, Tamil Nadu 603203',
      latitude: 12.8180,
      longitude: 80.0380,
      category: 'locality',
      aliases: ['kattankulathur', 'srm medical college'],
    },
    {
      id: 'mock-chennai-maraimalai-nagar',
      name: 'Maraimalai Nagar',
      address: 'GST Road & Industrial Estate, Maraimalai Nagar 603209',
      latitude: 12.7970,
      longitude: 80.0260,
      category: 'locality',
      aliases: ['maraimalai nagar', 'ford factory', 'mmnagar'],
    },
    {
      id: 'mock-chennai-singaperumal-koil',
      name: 'Singaperumal Koil',
      address: 'GST Road & Oragadam Rd Junction, Singaperumal Koil 603204',
      latitude: 12.7630,
      longitude: 80.0030,
      category: 'locality',
      aliases: ['singaperumal koil', 'sp koil', 'oragadam junction'],
    },
    {
      id: 'mock-chennai-mahindra-world-city',
      name: 'Mahindra World City (Paranur)',
      address: 'GST Road, Paranur Station, Chengalpattu 603004',
      latitude: 12.7300,
      longitude: 79.9930,
      category: 'landmark',
      aliases: ['mahindra world city', 'mwc', 'paranur', 'paranur station'],
    },
    {
      id: 'mock-chennai-chengalpattu',
      name: 'Chengalpattu Junction',
      address: 'Railway Station Rd, Chengalpattu, Tamil Nadu 603001',
      latitude: 12.6920,
      longitude: 79.9830,
      category: 'station',
      aliases: ['chengalpattu', 'chengalpet', 'chengalpattu junction', 'chengalpattu hospital'],
    },

    // -------------------------------------------------------------------------
    // 4. Vandalur-Kelambakkam Road & Campus Corridor
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-vit-campus',
      name: 'VIT Chennai Campus',
      address: 'Vandalur-Kelambakkam Road, Rajan Nagar, Melakottaiyur, Chennai 600127',
      latitude: 12.8406,
      longitude: 80.1534,
      category: 'campus',
      aliases: ['vit', 'vit chennai', 'vit campus', 'vit chennai campus', 'melakottaiyur', 'rajan nagar', 'vellore institute of technology'],
    },
    {
      id: 'mock-chennai-kandigai',
      name: 'Kandigai Junction',
      address: 'Vandalur-Kelambakkam Road & Rathinamangalam Rd, Kandigai 600127',
      latitude: 12.8590,
      longitude: 80.1250,
      category: 'locality',
      aliases: ['kandigai', 'rathinamangalam', 'tagore college'],
    },
    {
      id: 'mock-chennai-mambakkam-vk',
      name: 'Mambakkam Junction',
      address: 'Vandalur-Kelambakkam Road & Medavakkam-Mambakkam Rd, Mambakkam 600127',
      latitude: 12.8330,
      longitude: 80.1760,
      category: 'locality',
      aliases: ['mambakkam', 'ponmar', 'polachery'],
    },
    {
      id: 'mock-chennai-pudupakkam',
      name: 'Pudupakkam',
      address: 'Vandalur-Kelambakkam Road & Anjaneyar Temple, Pudupakkam 603103',
      latitude: 12.8080,
      longitude: 80.2010,
      category: 'locality',
      aliases: ['pudupakkam', 'anjaneyar temple pudupakkam'],
    },
    {
      id: 'mock-chennai-kelambakkam',
      name: 'Kelambakkam Junction',
      address: 'OMR & Vandalur-Kelambakkam Road, Kelambakkam, Tamil Nadu 603103',
      latitude: 12.7871,
      longitude: 80.2196,
      category: 'locality',
      aliases: ['kelambakkam', 'kelambakkam junction', 'kelambakkam bus stand'],
    },
    {
      id: 'mock-chennai-thiruporur',
      name: 'Thiruporur',
      address: 'Murugan Temple & OMR Highway, Thiruporur, Tamil Nadu 603110',
      latitude: 12.7260,
      longitude: 80.1910,
      category: 'locality',
      aliases: ['thiruporur', 'thiruporur murugan temple'],
    },

    // -------------------------------------------------------------------------
    // 5. OMR (Old Mahabalipuram Road) IT Corridor
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-madhya-kailash',
      name: 'Madhya Kailash (Adyar)',
      address: 'OMR Starting Point, Sardar Patel Road, Adyar, Chennai 600020',
      latitude: 13.0070,
      longitude: 80.2450,
      category: 'station',
      aliases: ['madhya kailash', 'clri', 'omr start'],
    },
    {
      id: 'mock-chennai-tidel-park',
      name: 'Tidel Park / Taramani MRTS',
      address: 'Rajiv Gandhi Salai (OMR), Taramani, Chennai 600113',
      latitude: 12.9897,
      longitude: 80.2478,
      category: 'station',
      aliases: ['tidel park', 'tidel', 'taramani mrts', 'csir road'],
    },
    {
      id: 'mock-chennai-taramani',
      name: 'Taramani (Ascendas Tech Park)',
      address: 'CSIR Road, International Tech Park Chennai (ITPC), Taramani 600113',
      latitude: 12.9850,
      longitude: 80.2420,
      category: 'landmark',
      aliases: ['taramani', 'ascendas', 'ramanujan it city', 'itpc'],
    },
    {
      id: 'mock-chennai-perungudi',
      name: 'Perungudi (OMR Toll Plaza)',
      address: 'Rajiv Gandhi Salai (OMR), Perungudi, Chennai 600096',
      latitude: 12.9654,
      longitude: 80.2443,
      category: 'locality',
      aliases: ['perungudi', 'perungudi toll', 'rmz millenia', 'sp infocity'],
    },
    {
      id: 'mock-chennai-kandanchavadi',
      name: 'Kandanchavadi',
      address: 'Rajiv Gandhi Salai (OMR) & MGR Salai, Kandanchavadi, Chennai 600096',
      latitude: 12.9600,
      longitude: 80.2430,
      category: 'locality',
      aliases: ['kandanchavadi', 'kandanchavadi bus stop', 'prince info city'],
    },
    {
      id: 'mock-chennai-thoraipakkam',
      name: 'Thoraipakkam (200ft Radial Rd Junction)',
      address: 'OMR & Pallavaram-Thoraipakkam Radial Rd, Thoraipakkam, Chennai 600097',
      latitude: 12.9424,
      longitude: 80.2366,
      category: 'locality',
      aliases: ['thoraipakkam', 'thuraipakkam', '200 feet radial road', 'radial road omr junction'],
    },
    {
      id: 'mock-chennai-karapakkam',
      name: 'Karapakkam',
      address: 'Rajiv Gandhi Salai (OMR), Karapakkam, Chennai 600097',
      latitude: 12.9230,
      longitude: 80.2310,
      category: 'locality',
      aliases: ['karapakkam', 'tcs karapakkam', 'omr food street'],
    },
    {
      id: 'mock-chennai-sholinganallur',
      name: 'Sholinganallur Junction',
      address: 'OMR & ECR Link Road Junction, Sholinganallur, Chennai, Tamil Nadu 600119',
      latitude: 12.9010,
      longitude: 80.2279,
      category: 'locality',
      aliases: ['sholinganallur', 'sholinganallur junction', 'elcot sez', 'wipro sholinganallur', 'sholing'],
    },
    {
      id: 'mock-chennai-semmancheri',
      name: 'Semmancheri (Sathyabama University)',
      address: 'OMR, Semmancheri, Chennai 600119',
      latitude: 12.8710,
      longitude: 80.2230,
      category: 'campus',
      aliases: ['semmancheri', 'sathyabama', 'sathyabama university', 'semmancherry'],
    },
    {
      id: 'mock-chennai-navalur-vivira',
      name: 'Navalur (Vivira Mall)',
      address: 'Old Mahabalipuram Road (OMR), Navalur, Chennai, Tamil Nadu 603103',
      latitude: 12.8475,
      longitude: 80.2263,
      category: 'landmark',
      aliases: ['navalur', 'vivira', 'vivira mall', 'navalur toll', 'omr navalur'],
    },
    {
      id: 'mock-chennai-egattur-marina-mall',
      name: 'The Marina Mall (Egattur)',
      address: 'Old Mahabalipuram Road (OMR), Egattur, Navalur 603103',
      latitude: 12.8360,
      longitude: 80.2260,
      category: 'landmark',
      aliases: ['marina mall', 'egattur', 'marina mall omr'],
    },
    {
      id: 'mock-chennai-siruseri-sipcot',
      name: 'SIPCOT IT Park (Siruseri)',
      address: 'OMR, Siruseri, Chennai, Tamil Nadu 603103',
      latitude: 12.8286,
      longitude: 80.2195,
      category: 'landmark',
      aliases: ['siruseri', 'sipcot', 'sipcot siruseri', 'tcs siruseri', 'siruseri it park'],
    },
    {
      id: 'mock-chennai-padur',
      name: 'Padur (Hindustan University / Chettinad)',
      address: 'OMR, Padur, Tamil Nadu 603103',
      latitude: 12.8120,
      longitude: 80.2220,
      category: 'campus',
      aliases: ['padur', 'chettinad', 'chettinad health city', 'hindustan university', 'hits'],
    },

    // -------------------------------------------------------------------------
    // 6. ECR (East Coast Road) Scenic Belt
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-kottivakkam',
      name: 'Kottivakkam',
      address: 'East Coast Road (ECR), Kottivakkam, Chennai 600041',
      latitude: 12.9690,
      longitude: 80.2580,
      category: 'locality',
      aliases: ['kottivakkam', 'kottivakkam beach'],
    },
    {
      id: 'mock-chennai-palavakkam',
      name: 'Palavakkam',
      address: 'East Coast Road (ECR), Palavakkam, Chennai 600041',
      latitude: 12.9570,
      longitude: 80.2570,
      category: 'locality',
      aliases: ['palavakkam', 'palavakkam beach'],
    },
    {
      id: 'mock-chennai-neelankarai',
      name: 'Neelankarai',
      address: 'East Coast Road (ECR), Neelankarai, Chennai 600115',
      latitude: 12.9460,
      longitude: 80.2560,
      category: 'locality',
      aliases: ['neelankarai', 'neelankarai beach', 'casuarina drive'],
    },
    {
      id: 'mock-chennai-injambakkam',
      name: 'Injambakkam (VGP / Prarthana)',
      address: 'East Coast Road (ECR), Injambakkam, Chennai 600115',
      latitude: 12.9220,
      longitude: 80.2510,
      category: 'landmark',
      aliases: ['injambakkam', 'vgp', 'vgp universal kingdom', 'prarthana beach', 'iskcon chennai', 'iskcon temple'],
    },
    {
      id: 'mock-chennai-akkarai',
      name: 'Akkarai (ECR-OMR Link Road)',
      address: 'ECR & Kalaignar Karunanidhi Salai Junction, Akkarai, Chennai 600119',
      latitude: 12.9050,
      longitude: 80.2480,
      category: 'locality',
      aliases: ['akkarai', 'waterman turf', 'ecr link road'],
    },
    {
      id: 'mock-chennai-uthandi',
      name: 'Uthandi Toll Plaza (ECR)',
      address: 'East Coast Road (ECR), Uthandi, Chennai 600119',
      latitude: 12.8750,
      longitude: 80.2440,
      category: 'station',
      aliases: ['uthandi', 'panaiyur', 'ecr toll plaza'],
    },
    {
      id: 'mock-chennai-kanathur',
      name: 'Kanathur (Mayajaal)',
      address: 'East Coast Road (ECR), Kanathur Reddykuppam, Chennai 603112',
      latitude: 12.8530,
      longitude: 80.2420,
      category: 'landmark',
      aliases: ['kanathur', 'mayajaal', 'mayajaal multiplex'],
    },
    {
      id: 'mock-chennai-muttukadu',
      name: 'Muttukadu Boat House',
      address: 'East Coast Road (ECR), Muttukadu, Tamil Nadu 603112',
      latitude: 12.8200,
      longitude: 80.2430,
      category: 'landmark',
      aliases: ['muttukadu', 'muttukadu boat house', 'muttukadu backwaters'],
    },
    {
      id: 'mock-chennai-kovalam',
      name: 'Kovalam (Covelong Beach)',
      address: 'Covelong Point, East Coast Road (ECR), Kovalam 603112',
      latitude: 12.7930,
      longitude: 80.2510,
      category: 'landmark',
      aliases: ['kovalam', 'covelong', 'surf school kovalam', 'kovalam beach'],
    },
    {
      id: 'mock-chennai-mahabalipuram',
      name: 'Mahabalipuram (Mamallapuram)',
      address: 'Shore Temple & Five Rathas, Mahabalipuram, Tamil Nadu 603104',
      latitude: 12.6200,
      longitude: 80.1940,
      category: 'landmark',
      aliases: ['mahabalipuram', 'mamallapuram', 'shore temple'],
    },

    // -------------------------------------------------------------------------
    // 7. West Chennai & Mount-Poonamallee Corridor
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-cmbt',
      name: 'Koyambedu CMBT Bus Terminus',
      address: 'Inner Ring Road, Koyambedu, Chennai, Tamil Nadu 600107',
      latitude: 13.0694,
      longitude: 80.2057,
      category: 'station',
      aliases: ['cmbt', 'koyambedu', 'koyambedu bus terminus', 'koyambedu market', 'omni bus stand', 'koyambedu metro'],
    },
    {
      id: 'mock-chennai-arumbakkam',
      name: 'Arumbakkam',
      address: 'Poonamallee High Road & DG Vaishnav College, Arumbakkam 600106',
      latitude: 13.0630,
      longitude: 80.2110,
      category: 'locality',
      aliases: ['arumbakkam', 'dg vaishnav college', 'arumbakkam metro'],
    },
    {
      id: 'mock-chennai-aminjikarai',
      name: 'Aminjikarai (Ampa Skywalk)',
      address: 'Poonamallee High Road & Nelson Manickam Rd, Aminjikarai 600029',
      latitude: 13.0720,
      longitude: 80.2220,
      category: 'locality',
      aliases: ['aminjikarai', 'ampa skywalk', 'nelson manickam road'],
    },
    {
      id: 'mock-chennai-anna-nagar',
      name: 'Anna Nagar (Roundtana / Tower Park)',
      address: '2nd Avenue, Shanti Colony & Tower Park, Anna Nagar, Chennai 600040',
      latitude: 13.0850,
      longitude: 80.2100,
      category: 'locality',
      aliases: ['anna nagar', 'annanagar', 'roundtana', 'tower park', 'shanti colony', 'anna nagar east', 'anna nagar tower metro'],
    },
    {
      id: 'mock-chennai-anna-nagar-west',
      name: 'Anna Nagar West Bus Depot',
      address: 'Inner Ring Road, Anna Nagar West, Chennai 600101',
      latitude: 13.0900,
      longitude: 80.1980,
      category: 'station',
      aliases: ['anna nagar west', 'anna nagar west depot', 'millennium park'],
    },
    {
      id: 'mock-chennai-mogappair',
      name: 'Mogappair (East / West)',
      address: 'Pari Salai & Golden Flats, Mogappair, Chennai 600037',
      latitude: 13.0830,
      longitude: 80.1780,
      category: 'locality',
      aliases: ['mogappair', 'mugappair', 'mogappair west', 'mogappair east', 'golden flats'],
    },
    {
      id: 'mock-chennai-maduravoyal',
      name: 'Maduravoyal Junction',
      address: 'Poonamallee High Road & Chennai Bypass Junction, Maduravoyal 600095',
      latitude: 13.0650,
      longitude: 80.1650,
      category: 'locality',
      aliases: ['maduravoyal', 'maduravoyal bypass', 'maduravoyal grade separator'],
    },
    {
      id: 'mock-chennai-porur',
      name: 'Porur Junction',
      address: 'Mount-Poonamallee Road & Arcot Road Junction, Porur, Chennai 600116',
      latitude: 13.0382,
      longitude: 80.1565,
      category: 'locality',
      aliases: ['porur', 'porur junction', 'porur toll', 'ramachandra', 'sri ramachandra medical college'],
    },
    {
      id: 'mock-chennai-ramapuram',
      name: 'Ramapuram (SRM Easwari / L&T)',
      address: 'Mount-Poonamallee Road, Ramapuram, Chennai 600089',
      latitude: 13.0310,
      longitude: 80.1780,
      category: 'campus',
      aliases: ['ramapuram', 'srm ramapuram', 'easwari engineering college', 'miot hospital'],
    },
    {
      id: 'mock-chennai-manapakkam',
      name: 'Manapakkam (DLF Cybercity)',
      address: 'Mount-Poonamallee Road, Manapakkam, Chennai 600125',
      latitude: 13.0200,
      longitude: 80.1740,
      category: 'landmark',
      aliases: ['manapakkam', 'dlf', 'dlf cybercity', 'lt manapakkam'],
    },
    {
      id: 'mock-chennai-iyyappanthangal',
      name: 'Iyyappanthangal Bus Depot',
      address: 'Mount-Poonamallee Road, Iyyappanthangal, Chennai 600056',
      latitude: 13.0440,
      longitude: 80.1410,
      category: 'station',
      aliases: ['iyyappanthangal', 'iyappanthangal', 'iyyappanthangal depot'],
    },
    {
      id: 'mock-chennai-mangadu',
      name: 'Mangadu',
      address: 'Kamakshi Amman Temple Road, Mangadu, Chennai 600122',
      latitude: 13.0420,
      longitude: 80.1170,
      category: 'locality',
      aliases: ['mangadu', 'kamakshi amman temple'],
    },
    {
      id: 'mock-chennai-kundrathur',
      name: 'Kundrathur',
      address: 'Murugan Temple & Bus Stand, Kundrathur, Chennai 600069',
      latitude: 12.9970,
      longitude: 80.0960,
      category: 'locality',
      aliases: ['kundrathur', 'kundrathur murugan temple'],
    },
    {
      id: 'mock-chennai-valasaravakkam',
      name: 'Valasaravakkam',
      address: 'Arcot Road, Valasaravakkam, Chennai 600087',
      latitude: 13.0410,
      longitude: 80.1730,
      category: 'locality',
      aliases: ['valasaravakkam', 'kesavardhini', 'arcot road valasaravakkam'],
    },
    {
      id: 'mock-chennai-virugambakkam',
      name: 'Virugambakkam',
      address: 'Arcot Road & Chinmaya Nagar, Virugambakkam, Chennai 600092',
      latitude: 13.0460,
      longitude: 80.1910,
      category: 'locality',
      aliases: ['virugambakkam', 'chinmaya nagar'],
    },
    {
      id: 'mock-chennai-poonamallee',
      name: 'Poonamallee Bus Terminus',
      address: 'Trunk Road, Poonamallee, Chennai, Tamil Nadu 600056',
      latitude: 13.0490,
      longitude: 80.0930,
      category: 'station',
      aliases: ['poonamallee', 'poonamalle', 'poovirundhavalli', 'poonamallee bypass'],
    },
    {
      id: 'mock-chennai-thirumazhisai',
      name: 'Thirumazhisai',
      address: 'Bangalore Highway & Kuthambakkam Bus Terminus, Thirumazhisai 600124',
      latitude: 13.0560,
      longitude: 80.0570,
      category: 'locality',
      aliases: ['thirumazhisai', 'kuthambakkam', 'kuthambakkam bus terminus'],
    },

    // -------------------------------------------------------------------------
    // 8. North & Northwest Chennai
    // -------------------------------------------------------------------------
    {
      id: 'mock-chennai-ambattur',
      name: 'Ambattur (Industrial Estate / OT)',
      address: 'CTH Road, Ambattur Industrial Estate & Bus Stand, Chennai 600058',
      latitude: 13.1143,
      longitude: 80.1548,
      category: 'station',
      aliases: ['ambattur', 'ambattur ot', 'ambattur estate', 'ambattur industrial estate', 'dunlop', 'ti cycles'],
    },
    {
      id: 'mock-chennai-thirumullaivoyal',
      name: 'Thirumullaivoyal',
      address: 'CTH Road, Thirumullaivoyal, Chennai 600062',
      latitude: 13.1250,
      longitude: 80.1330,
      category: 'locality',
      aliases: ['thirumullaivoyal', 'pachaiamman temple'],
    },
    {
      id: 'mock-chennai-avadi',
      name: 'Avadi Railway Station & Bus Terminus',
      address: 'CTH Road & HVF Estate, Avadi, Chennai, Tamil Nadu 600054',
      latitude: 13.1180,
      longitude: 80.1010,
      category: 'station',
      aliases: ['avadi', 'avadi station', 'avadi checkpost', 'hvf'],
    },
    {
      id: 'mock-chennai-pattabiram',
      name: 'Pattabiram (Tidel Park 3)',
      address: 'CTH Road & Hindu College Station, Pattabiram, Chennai 600072',
      latitude: 13.1230,
      longitude: 80.0630,
      category: 'station',
      aliases: ['pattabiram', 'tidel pattabiram', 'hindu college'],
    },
    {
      id: 'mock-chennai-padi',
      name: 'Padi Flyover',
      address: 'Jawaharlal Nehru Road & CTH Road, Padi, Chennai 600050',
      latitude: 13.0970,
      longitude: 80.1870,
      category: 'station',
      aliases: ['padi', 'padi flyover', 'lucas tvs', 'britannia'],
    },
    {
      id: 'mock-chennai-korattur',
      name: 'Korattur',
      address: 'Central Avenue & Railway Station, Korattur, Chennai 600080',
      latitude: 13.1070,
      longitude: 80.1770,
      category: 'locality',
      aliases: ['korattur', 'korattur station'],
    },
    {
      id: 'mock-chennai-villivakkam',
      name: 'Villivakkam Railway Station',
      address: 'Red Hills Road & Agatheeswarar Koil St, Villivakkam, Chennai 600049',
      latitude: 13.1070,
      longitude: 80.2070,
      category: 'station',
      aliases: ['villivakkam', 'villivakkam station', 'agatheeswarar temple'],
    },
    {
      id: 'mock-chennai-kolathur',
      name: 'Kolathur',
      address: '200 Feet Road & Retteri Signal, Kolathur, Chennai 600099',
      latitude: 13.1240,
      longitude: 80.2170,
      category: 'locality',
      aliases: ['kolathur', 'retteri', 'retteri signal', 'retteri flyover'],
    },
    {
      id: 'mock-chennai-perambur',
      name: 'Perambur Railway Station',
      address: 'Perambur High Road, Perambur, Chennai 600011',
      latitude: 13.1090,
      longitude: 80.2440,
      category: 'station',
      aliases: ['perambur', 'perambur station', 'loco works', 'perambur carriage works'],
    },
    {
      id: 'mock-chennai-madhavaram',
      name: 'Madhavaram Mofussil Bus Terminus (MMBT)',
      address: 'GNT Road & Inner Ring Rd, Madhavaram, Chennai 600110',
      latitude: 13.1490,
      longitude: 80.2280,
      category: 'station',
      aliases: ['madhavaram', 'mmbt', 'madhavaram bus terminus', 'madhavaram roundabout', 'gnt road'],
    },
    {
      id: 'mock-chennai-red-hills',
      name: 'Red Hills (Sothupakkam)',
      address: 'GNT Road & Puzhal Lake, Red Hills, Chennai 600052',
      latitude: 13.1890,
      longitude: 80.1980,
      category: 'locality',
      aliases: ['red hills', 'redhills', 'puzhal', 'sothupakkam', 'puzhal lake'],
    },
    {
      id: 'mock-chennai-kilpauk',
      name: 'Kilpauk (Medical College / Metro)',
      address: 'EVR Periyar Salai (Poonamallee High Rd), Kilpauk, Chennai 600010',
      latitude: 13.0800,
      longitude: 80.2430,
      category: 'station',
      aliases: ['kilpauk', 'kilpauk medical college', 'kmc', 'kilpauk metro'],
    },
    {
      id: 'mock-chennai-purasawalkam',
      name: 'Purasawalkam',
      address: 'Purasawalkam High Road & Doveton, Chennai 600007',
      latitude: 13.0890,
      longitude: 80.2560,
      category: 'locality',
      aliases: ['purasawalkam', 'purasaiwakkam', 'doveton', 'kellys'],
    },
    {
      id: 'mock-chennai-parrys',
      name: 'Parrys Corner / Broadway Bus Stand',
      address: 'NSC Bose Road & Rajaji Salai, George Town, Chennai 600001',
      latitude: 13.0890,
      longitude: 80.2880,
      category: 'station',
      aliases: ['parrys', 'parrys corner', 'broadway', 'broadway bus stand', 'george town', 'madras high court', 'beach station'],
    },
    {
      id: 'mock-chennai-royapuram',
      name: 'Royapuram Railway Station',
      address: 'MS Koil Street, Royapuram, Chennai 600013',
      latitude: 13.1090,
      longitude: 80.2950,
      category: 'station',
      aliases: ['royapuram', 'royapuram station', 'kalmandapam'],
    },
    {
      id: 'mock-chennai-washermanpet',
      name: 'Washermanpet Metro & Suburban Station',
      address: 'MC Road, Washermanpet, Chennai 600021',
      latitude: 13.1060,
      longitude: 80.2810,
      category: 'station',
      aliases: ['washermanpet', 'washermenpet', 'mc road'],
    },
    {
      id: 'mock-chennai-tondiarpet',
      name: 'Tondiarpet',
      address: 'TH Road, Tondiarpet, Chennai 600081',
      latitude: 13.1250,
      longitude: 80.2880,
      category: 'locality',
      aliases: ['tondiarpet', 'tondiarpet depot', 'th road'],
    },
    {
      id: 'mock-chennai-tiruvottiyur',
      name: 'Tiruvottiyur',
      address: 'Ennore Express Road & Theradi Metro, Tiruvottiyur, Chennai 600019',
      latitude: 13.1610,
      longitude: 80.3010,
      category: 'station',
      aliases: ['tiruvottiyur', 'thiruvottiyur', 'theradi', 'wimco nagar'],
    },
    {
      id: 'mock-chennai-ennore',
      name: 'Ennore (Thermal Station / Port)',
      address: 'Ennore Express Highway, Ennore, Chennai 600057',
      latitude: 13.2080,
      longitude: 80.3230,
      category: 'station',
      aliases: ['ennore', 'manali', 'ennore station', 'kamarajar port'],
    },
  ];

  /**
   * Normalize search string to strip punctuation and normalize phonetic variations
   * such as 'tea nagar' -> 't nagar', 't.nagar' -> 't nagar', 'st.' -> 'st', etc.
   */
  private normalizeQuery(input: string): string {
    let s = input.trim().toLowerCase();
    // Replace punctuation with spaces
    s = s.replace(/[.\-_,/()]/g, ' ');
    // Normalize common phonetic variations
    s = s.replace(/\btea\s+nagar\b/g, 't nagar');
    s = s.replace(/\bt\s*nagar\b/g, 't nagar');
    s = s.replace(/\bkk\s*nagar\b/g, 'k k nagar');
    s = s.replace(/\bdr\b/g, 'doctor');
    s = s.replace(/\bst\b/g, 'saint');
    // Collapse multiple whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  async search(query: string, limit: number): Promise<LocationSuggestionDto[]> {
    const rawQ = query.trim().toLowerCase();
    if (!rawQ || rawQ.length < 2) {
      return [];
    }

    const normQ = this.normalizeQuery(rawQ);
    const queryTokens = normQ.split(' ').filter((t) => t.length > 0);

    const scoredMatches: Array<{ score: number; baseLen: number; categoryOrder: number; item: LocationSuggestionDto }> = [];

    for (const item of this.CHENNAI_LANDMARKS) {
      const nameLower = item.name.toLowerCase();
      const nameNorm = this.normalizeQuery(item.name);
      const baseName = item.name.replace(/\s*\(.*\)/, '').trim();
      const baseNameLower = baseName.toLowerCase();
      const baseNameNorm = this.normalizeQuery(baseName);
      const addrLower = item.address.toLowerCase();
      const addrNorm = this.normalizeQuery(item.address);
      const aliases = (item.aliases || []).map((a) => a.toLowerCase());
      const aliasesNorm = (item.aliases || []).map((a) => this.normalizeQuery(a));

      let score = 999;

      // 1. Exact match on base name or full name
      if (baseNameLower === rawQ || baseNameNorm === normQ || nameLower === rawQ || nameNorm === normQ) {
        score = 1;
      }
      // 2. Exact match on any alias (e.g. "tea nagar" === "tea nagar", "cmbt" === "cmbt")
      else if (aliases.some((a) => a === rawQ) || aliasesNorm.some((a) => a === normQ)) {
        score = 2;
      }
      // 3. Prefix match on base name or full name (e.g. "anna nagar" matches "Anna Nagar (Roundtana...)")
      else if (
        baseNameLower.startsWith(rawQ) ||
        baseNameNorm.startsWith(normQ) ||
        nameLower.startsWith(rawQ) ||
        nameNorm.startsWith(normQ)
      ) {
        score = 3;
      }
      // 4. Prefix match on any alias (e.g. "tea" matches "tea nagar")
      else if (
        aliases.some((a) => a.startsWith(rawQ)) ||
        aliasesNorm.some((a) => a.startsWith(normQ))
      ) {
        score = 4;
      }
      // 5. Word boundary match on name (e.g. "nagar" matches "T. Nagar", "Anna Nagar")
      else if (
        new RegExp(`\\b${normQ}`, 'i').test(nameNorm) ||
        new RegExp(`\\b${rawQ}`, 'i').test(nameLower)
      ) {
        score = 5;
      }
      // 6. Word boundary match on any alias (e.g. "pondy" matches "pondy bazaar")
      else if (
        aliasesNorm.some((a) => new RegExp(`\\b${normQ}`, 'i').test(a)) ||
        aliases.some((a) => new RegExp(`\\b${rawQ}`, 'i').test(a))
      ) {
        score = 6;
      }
      // 7. Substring match on name
      else if (nameLower.includes(rawQ) || nameNorm.includes(normQ)) {
        score = 7;
      }
      // 8. Substring match on aliases
      else if (aliases.some((a) => a.includes(rawQ)) || aliasesNorm.some((a) => a.includes(normQ))) {
        score = 8;
      }
      // 9. Substring match on address
      else if (addrLower.includes(rawQ) || addrNorm.includes(normQ)) {
        score = 9;
      }
      // 10. Multi-token match: all tokens of the query appear in name, address, or aliases
      else if (queryTokens.length > 1) {
        const combined = `${nameNorm} ${addrNorm} ${aliasesNorm.join(' ')}`;
        if (queryTokens.every((token) => combined.includes(token))) {
          score = 10;
        }
      }

      if (score < 999) {
        // Strip out the internal aliases array before returning DTO
        const { aliases: _a, ...cleanItem } = item;
        const categoryOrder =
          cleanItem.category === 'locality' || cleanItem.category === 'campus'
            ? 0
            : cleanItem.category === 'station'
            ? 1
            : 2;
        scoredMatches.push({ score, baseLen: baseName.length, categoryOrder, item: cleanItem });
      }
    }

    // Sort by match score ascending (best match first), then category priority, then base name length ascending
    scoredMatches.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.categoryOrder !== b.categoryOrder) return a.categoryOrder - b.categoryOrder;
      return a.baseLen - b.baseLen;
    });

    const results = scoredMatches.slice(0, limit).map((m) => m.item);
    this.logger.debug(`MockLocationProvider: query="${rawQ}" (norm="${normQ}") returned ${results.length} results`);
    return results;
  }
}
