import 'dotenv/config';

import { AppDataSource } from '../data-source';

/**
 * Idempotent BD administrative-geography seed (FR-CART-044/045): 8 divisions → 64 districts →
 * ~495 upazilas/thanas as `geo_areas` rows, each classified to a `delivery_zone` by the
 * §Appendix-A rule:
 *   - `inside_dhaka`  = Dhaka North & South City Corporation thanas (Dhaka-metro)
 *   - `near_dhaka`    = the remaining Dhaka-district upazilas + Gazipur + Narayanganj districts
 *   - `outside_dhaka` = every other district nationwide
 * Rerunning inserts nothing new (ON CONFLICT on the unique (district, upazila) index) and does
 * NOT overwrite admin zone overrides (FR-CART-047). Run: `npm run seed:geo-area`.
 */

// Dhaka North & South City Corporation thanas → inside_dhaka (SRS 04 Appendix A).
const DHAKA_METRO_THANAS = [
  'Adabor', 'Badda', 'Banani', 'Bangshal', 'Bhashantek', 'Bimanbandar', 'Cantonment',
  'Chawkbazar', 'Dakshinkhan', 'Darus Salam', 'Demra', 'Dhanmondi', 'Gendaria', 'Gulshan',
  'Hatirjheel', 'Hazaribagh', 'Jatrabari', 'Kadamtali', 'Kafrul', 'Kalabagan', 'Kamrangirchar',
  'Khilgaon', 'Khilkhet', 'Kotwali', 'Lalbagh', 'Mirpur', 'Mohakhali', 'Mohammadpur', 'Motijheel',
  'Mugda', 'New Market', 'Pallabi', 'Paltan', 'Ramna', 'Rampura', 'Rupnagar', 'Sabujbagh',
  'Shah Ali', 'Shahbagh', 'Shahjahanpur', 'Sher-e-Bangla Nagar', 'Shyampur', 'Sutrapur',
  'Tejgaon', 'Turag', 'Uttara', 'Uttarkhan', 'Vatara', 'Wari',
];

// The five rural Dhaka-district upazilas → near_dhaka (SRS 04 Appendix A).
const DHAKA_RURAL_UPAZILAS = ['Savar', 'Keraniganj', 'Dhamrai', 'Dohar', 'Nawabganj'];

// Districts whose every area is near_dhaka (SRS 04 Appendix A).
const NEAR_DHAKA_DISTRICTS = new Set(['Gazipur', 'Narayanganj']);

type DivisionMap = Record<string, Record<string, string[]>>;

/** division → district → [upazilas/thanas]. */
const GEO: DivisionMap = {
  Dhaka: {
    Dhaka: [...DHAKA_METRO_THANAS, ...DHAKA_RURAL_UPAZILAS],
    Gazipur: ['Gazipur Sadar', 'Kaliakair', 'Kaliganj', 'Kapasia', 'Sreepur'],
    Narayanganj: ['Narayanganj Sadar', 'Araihazar', 'Bandar', 'Rupganj', 'Sonargaon'],
    Narsingdi: ['Narsingdi Sadar', 'Belabo', 'Monohardi', 'Palash', 'Raipura', 'Shibpur'],
    Manikganj: ['Manikganj Sadar', 'Daulatpur', 'Ghior', 'Harirampur', 'Saturia', 'Shibalaya', 'Singair'],
    Munshiganj: ['Munshiganj Sadar', 'Gazaria', 'Lohajang', 'Sirajdikhan', 'Sreenagar', 'Tongibari'],
    Tangail: ['Tangail Sadar', 'Basail', 'Bhuapur', 'Delduar', 'Dhanbari', 'Ghatail', 'Gopalpur', 'Kalihati', 'Madhupur', 'Mirzapur', 'Nagarpur', 'Sakhipur'],
    Kishoreganj: ['Kishoreganj Sadar', 'Austagram', 'Bajitpur', 'Bhairab', 'Hossainpur', 'Itna', 'Karimganj', 'Katiadi', 'Kuliarchar', 'Mithamain', 'Nikli', 'Pakundia', 'Tarail'],
    Faridpur: ['Faridpur Sadar', 'Alfadanga', 'Bhanga', 'Boalmari', 'Charbhadrasan', 'Madhukhali', 'Nagarkanda', 'Sadarpur', 'Saltha'],
    Gopalganj: ['Gopalganj Sadar', 'Kashiani', 'Kotalipara', 'Muksudpur', 'Tungipara'],
    Madaripur: ['Madaripur Sadar', 'Kalkini', 'Rajoir', 'Shibchar', 'Dasar'],
    Rajbari: ['Rajbari Sadar', 'Baliakandi', 'Goalando', 'Kalukhali', 'Pangsha'],
    Shariatpur: ['Shariatpur Sadar', 'Bhedarganj', 'Damudya', 'Gosairhat', 'Naria', 'Zanjira'],
  },
  Chattogram: {
    Chattogram: ['Anwara', 'Banshkhali', 'Boalkhali', 'Chandanaish', 'Fatikchhari', 'Hathazari', 'Karnaphuli', 'Lohagara', 'Mirsharai', 'Patiya', 'Rangunia', 'Raozan', 'Sandwip', 'Satkania', 'Sitakunda'],
    "Cox's Bazar": ["Cox's Bazar Sadar", 'Chakaria', 'Kutubdia', 'Maheshkhali', 'Pekua', 'Ramu', 'Teknaf', 'Ukhia'],
    Bandarban: ['Bandarban Sadar', 'Alikadam', 'Lama', 'Naikhongchhari', 'Rowangchhari', 'Ruma', 'Thanchi'],
    Khagrachhari: ['Khagrachhari Sadar', 'Dighinala', 'Guimara', 'Lakshmichhari', 'Mahalchhari', 'Manikchhari', 'Matiranga', 'Panchhari', 'Ramgarh'],
    Rangamati: ['Rangamati Sadar', 'Baghaichhari', 'Barkal', 'Belaichhari', 'Juraichhari', 'Kaptai', 'Kawkhali', 'Langadu', 'Naniarchar', 'Rajasthali'],
    Feni: ['Feni Sadar', 'Chhagalnaiya', 'Daganbhuiyan', 'Fulgazi', 'Parshuram', 'Sonagazi'],
    Lakshmipur: ['Lakshmipur Sadar', 'Kamalnagar', 'Raipur', 'Ramganj', 'Ramgati'],
    Cumilla: ['Cumilla Adarsha Sadar', 'Barura', 'Brahmanpara', 'Burichang', 'Chandina', 'Chauddagram', 'Cumilla Sadar Dakshin', 'Daudkandi', 'Debidwar', 'Homna', 'Laksam', 'Meghna', 'Monohorgonj', 'Muradnagar', 'Nangalkot', 'Titas'],
    Noakhali: ['Noakhali Sadar', 'Begumganj', 'Chatkhil', 'Companiganj', 'Hatiya', 'Kabirhat', 'Senbagh', 'Sonaimuri', 'Subarnachar'],
    Brahmanbaria: ['Brahmanbaria Sadar', 'Akhaura', 'Ashuganj', 'Bancharampur', 'Bijoynagar', 'Kasba', 'Nabinagar', 'Nasirnagar', 'Sarail'],
    Chandpur: ['Chandpur Sadar', 'Faridganj', 'Haimchar', 'Haziganj', 'Kachua', 'Matlab Dakshin', 'Matlab Uttar', 'Shahrasti'],
  },
  Rajshahi: {
    Rajshahi: ['Rajshahi Sadar', 'Bagha', 'Bagmara', 'Charghat', 'Durgapur', 'Godagari', 'Mohanpur', 'Paba', 'Puthia', 'Tanore'],
    Natore: ['Natore Sadar', 'Bagatipara', 'Baraigram', 'Gurudaspur', 'Lalpur', 'Naldanga', 'Singra'],
    Naogaon: ['Naogaon Sadar', 'Atrai', 'Badalgachhi', 'Dhamoirhat', 'Mahadebpur', 'Manda', 'Niamatpur', 'Patnitala', 'Porsha', 'Raninagar', 'Sapahar'],
    Chapainawabganj: ['Chapainawabganj Sadar', 'Bholahat', 'Gomastapur', 'Nachole', 'Shibganj'],
    Pabna: ['Pabna Sadar', 'Atgharia', 'Bera', 'Bhangura', 'Chatmohar', 'Faridpur', 'Ishwardi', 'Santhia', 'Sujanagar'],
    Bogura: ['Bogura Sadar', 'Adamdighi', 'Dhunat', 'Dhupchanchia', 'Gabtali', 'Kahaloo', 'Nandigram', 'Sariakandi', 'Shajahanpur', 'Sherpur', 'Shibganj', 'Sonatala'],
    Sirajganj: ['Sirajganj Sadar', 'Belkuchi', 'Chauhali', 'Kamarkhanda', 'Kazipur', 'Raiganj', 'Shahjadpur', 'Tarash', 'Ullapara'],
    Joypurhat: ['Joypurhat Sadar', 'Akkelpur', 'Kalai', 'Khetlal', 'Panchbibi'],
  },
  Khulna: {
    Khulna: ['Khulna Sadar', 'Batiaghata', 'Dacope', 'Dighalia', 'Dumuria', 'Koyra', 'Paikgachha', 'Phultala', 'Rupsa', 'Terokhada'],
    Bagerhat: ['Bagerhat Sadar', 'Chitalmari', 'Fakirhat', 'Kachua', 'Mollahat', 'Mongla', 'Morrelganj', 'Rampal', 'Sarankhola'],
    Satkhira: ['Satkhira Sadar', 'Assasuni', 'Debhata', 'Kalaroa', 'Kaliganj', 'Shyamnagar', 'Tala'],
    Jashore: ['Jashore Sadar', 'Abhaynagar', 'Bagherpara', 'Chaugachha', 'Jhikargachha', 'Keshabpur', 'Manirampur', 'Sharsha'],
    Jhenaidah: ['Jhenaidah Sadar', 'Harinakunda', 'Kaliganj', 'Kotchandpur', 'Maheshpur', 'Shailkupa'],
    Magura: ['Magura Sadar', 'Mohammadpur', 'Shalikha', 'Sreepur'],
    Narail: ['Narail Sadar', 'Kalia', 'Lohagara'],
    Kushtia: ['Kushtia Sadar', 'Bheramara', 'Daulatpur', 'Khoksa', 'Kumarkhali', 'Mirpur'],
    Chuadanga: ['Chuadanga Sadar', 'Alamdanga', 'Damurhuda', 'Jibannagar'],
    Meherpur: ['Meherpur Sadar', 'Gangni', 'Mujibnagar'],
  },
  Barishal: {
    Barishal: ['Barishal Sadar', 'Agailjhara', 'Babuganj', 'Bakerganj', 'Banaripara', 'Gaurnadi', 'Hizla', 'Mehendiganj', 'Muladi', 'Wazirpur'],
    Patuakhali: ['Patuakhali Sadar', 'Bauphal', 'Dashmina', 'Dumki', 'Galachipa', 'Kalapara', 'Mirzaganj', 'Rangabali'],
    Bhola: ['Bhola Sadar', 'Burhanuddin', 'Char Fasson', 'Daulatkhan', 'Lalmohan', 'Manpura', 'Tazumuddin'],
    Pirojpur: ['Pirojpur Sadar', 'Bhandaria', 'Kawkhali', 'Mathbaria', 'Nazirpur', 'Nesarabad', 'Zianagar'],
    Barguna: ['Barguna Sadar', 'Amtali', 'Bamna', 'Betagi', 'Patharghata', 'Taltali'],
    Jhalokati: ['Jhalokati Sadar', 'Kathalia', 'Nalchity', 'Rajapur'],
  },
  Sylhet: {
    Sylhet: ['Sylhet Sadar', 'Balaganj', 'Beanibazar', 'Bishwanath', 'Companiganj', 'Dakshin Surma', 'Fenchuganj', 'Golapganj', 'Gowainghat', 'Jaintiapur', 'Kanaighat', 'Osmaninagar', 'Zakiganj'],
    Moulvibazar: ['Moulvibazar Sadar', 'Barlekha', 'Juri', 'Kamalganj', 'Kulaura', 'Rajnagar', 'Sreemangal'],
    Habiganj: ['Habiganj Sadar', 'Ajmiriganj', 'Bahubal', 'Baniyachong', 'Chunarughat', 'Lakhai', 'Madhabpur', 'Nabiganj', 'Shayestaganj'],
    Sunamganj: ['Sunamganj Sadar', 'Bishwambarpur', 'Chhatak', 'Derai', 'Dharmapasha', 'Dowarabazar', 'Jagannathpur', 'Jamalganj', 'Madhyanagar', 'Shantiganj', 'Sulla', 'Tahirpur'],
  },
  Rangpur: {
    Rangpur: ['Rangpur Sadar', 'Badarganj', 'Gangachara', 'Kaunia', 'Mithapukur', 'Pirgachha', 'Pirganj', 'Taraganj'],
    Dinajpur: ['Dinajpur Sadar', 'Birampur', 'Birganj', 'Biral', 'Bochaganj', 'Chirirbandar', 'Ghoraghat', 'Hakimpur', 'Kaharole', 'Khansama', 'Nawabganj', 'Parbatipur', 'Phulbari'],
    Gaibandha: ['Gaibandha Sadar', 'Fulchhari', 'Gobindaganj', 'Palashbari', 'Sadullapur', 'Saghata', 'Sundarganj'],
    Kurigram: ['Kurigram Sadar', 'Bhurungamari', 'Char Rajibpur', 'Chilmari', 'Nageshwari', 'Phulbari', 'Rajarhat', 'Raomari', 'Ulipur'],
    Lalmonirhat: ['Lalmonirhat Sadar', 'Aditmari', 'Hatibandha', 'Kaliganj', 'Patgram'],
    Nilphamari: ['Nilphamari Sadar', 'Dimla', 'Domar', 'Jaldhaka', 'Kishoreganj', 'Saidpur'],
    Panchagarh: ['Panchagarh Sadar', 'Atwari', 'Boda', 'Debiganj', 'Tetulia'],
    Thakurgaon: ['Thakurgaon Sadar', 'Baliadangi', 'Haripur', 'Pirganj', 'Ranisankail'],
  },
  Mymensingh: {
    Mymensingh: ['Mymensingh Sadar', 'Bhaluka', 'Dhobaura', 'Fulbaria', 'Gaffargaon', 'Gauripur', 'Haluaghat', 'Ishwarganj', 'Muktagachha', 'Nandail', 'Phulpur', 'Tarakanda', 'Trishal'],
    Jamalpur: ['Jamalpur Sadar', 'Bakshiganj', 'Dewanganj', 'Islampur', 'Madarganj', 'Melandaha', 'Sarishabari'],
    Netrokona: ['Netrokona Sadar', 'Atpara', 'Barhatta', 'Durgapur', 'Kalmakanda', 'Kendua', 'Khaliajuri', 'Madan', 'Mohanganj', 'Purbadhala'],
    Sherpur: ['Sherpur Sadar', 'Jhenaigati', 'Nakla', 'Nalitabari', 'Sreebardi'],
  },
};

function zoneFor(district: string, upazila: string): string {
  if (district === 'Dhaka') {
    return DHAKA_RURAL_UPAZILAS.includes(upazila) ? 'near_dhaka' : 'inside_dhaka';
  }
  if (NEAR_DHAKA_DISTRICTS.has(district)) {
    return 'near_dhaka';
  }
  return 'outside_dhaka';
}

async function seed(): Promise<void> {
  const ds = await AppDataSource.initialize();

  let inserted = 0;
  for (const [division, districts] of Object.entries(GEO)) {
    for (const [district, upazilas] of Object.entries(districts)) {
      for (const upazila of upazilas) {
        const zone = zoneFor(district, upazila);
        await ds.query(
          `INSERT INTO "geo_areas" ("division","district","upazila","delivery_zone","is_active")
           VALUES ($1,$2,$3,$4,true)
           ON CONFLICT ("district","upazila") DO NOTHING`,
          [division, district, upazila, zone],
        );
        inserted += 1;
      }
    }
  }

  const counts = await ds.query(
    `SELECT
       (SELECT count(DISTINCT "division")::int FROM "geo_areas") AS divisions,
       (SELECT count(DISTINCT "district")::int FROM "geo_areas") AS districts,
       (SELECT count(*)::int FROM "geo_areas") AS areas,
       (SELECT count(*)::int FROM "geo_areas" WHERE "delivery_zone" = 'inside_dhaka') AS inside_dhaka,
       (SELECT count(*)::int FROM "geo_areas" WHERE "delivery_zone" = 'near_dhaka') AS near_dhaka,
       (SELECT count(*)::int FROM "geo_areas" WHERE "delivery_zone" = 'outside_dhaka') AS outside_dhaka`,
  );
  console.log(`Geo-area seed complete (${inserted} rows processed):`, counts[0]);
  await ds.destroy();
}

seed().catch((err) => {
  console.error('Geo-area seed failed:', err);
  process.exit(1);
});
