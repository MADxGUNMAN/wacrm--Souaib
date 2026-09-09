export interface Country {
  name: string;
  code: string; // ISO 3166-1 alpha-2
  dialCode: string; // E.164 dial code with +
  flag: string; // Emoji flag
  format?: string; // Example placeholder
  lengths: number[]; // Valid national number digit lengths
  leadingDigits?: RegExp; // Optional mobile leading digits regex
}

export const COUNTRIES: Country[] = [
  // Common / Popular
  {
    name: 'India',
    code: 'IN',
    dialCode: '+91',
    flag: '🇮🇳',
    format: '98765 43210',
    lengths: [10],
    leadingDigits: /^[6-9]/,
  },
  {
    name: 'United States',
    code: 'US',
    dialCode: '+1',
    flag: '🇺🇸',
    format: '(555) 012-3456',
    lengths: [10],
    leadingDigits: /^[2-9]/,
  },
  {
    name: 'United Kingdom',
    code: 'GB',
    dialCode: '+44',
    flag: '🇬🇧',
    format: '7123 456789',
    lengths: [10, 11],
  },
  {
    name: 'United Arab Emirates',
    code: 'AE',
    dialCode: '+971',
    flag: '🇦🇪',
    format: '50 123 4567',
    lengths: [9],
    leadingDigits: /^[5]/,
  },
  {
    name: 'Saudi Arabia',
    code: 'SA',
    dialCode: '+966',
    flag: '🇸🇦',
    format: '50 123 4567',
    lengths: [9],
    leadingDigits: /^[5]/,
  },
  {
    name: 'Canada',
    code: 'CA',
    dialCode: '+1',
    flag: '🇨🇦',
    format: '(555) 012-3456',
    lengths: [10],
    leadingDigits: /^[2-9]/,
  },
  {
    name: 'Australia',
    code: 'AU',
    dialCode: '+61',
    flag: '🇦🇺',
    format: '412 345 678',
    lengths: [9],
    leadingDigits: /^[4]/,
  },
  {
    name: 'Qatar',
    code: 'QA',
    dialCode: '+974',
    flag: '🇶🇦',
    format: '3312 3456',
    lengths: [8],
  },
  {
    name: 'Kuwait',
    code: 'KW',
    dialCode: '+965',
    flag: '🇰🇼',
    format: '5123 4567',
    lengths: [8],
  },
  {
    name: 'Oman',
    code: 'OM',
    dialCode: '+968',
    flag: '🇴🇲',
    format: '9123 4567',
    lengths: [8],
  },
  {
    name: 'Bahrain',
    code: 'BH',
    dialCode: '+973',
    flag: '🇧🇭',
    format: '3612 3456',
    lengths: [8],
  },
  {
    name: 'Singapore',
    code: 'SG',
    dialCode: '+65',
    flag: '🇸🇬',
    format: '8123 4567',
    lengths: [8],
    leadingDigits: /^[89]/,
  },
  {
    name: 'Malaysia',
    code: 'MY',
    dialCode: '+60',
    flag: '🇲🇾',
    format: '12 345 6789',
    lengths: [9, 10],
    leadingDigits: /^[1]/,
  },
  {
    name: 'Pakistan',
    code: 'PK',
    dialCode: '+92',
    flag: '🇵🇰',
    format: '300 1234567',
    lengths: [10],
    leadingDigits: /^[3]/,
  },
  {
    name: 'Bangladesh',
    code: 'BD',
    dialCode: '+880',
    flag: '🇧🇩',
    format: '1712 345678',
    lengths: [10],
    leadingDigits: /^[1]/,
  },
  {
    name: 'Sri Lanka',
    code: 'LK',
    dialCode: '+94',
    flag: '🇱🇰',
    format: '71 234 5678',
    lengths: [9],
    leadingDigits: /^[7]/,
  },
  {
    name: 'Nepal',
    code: 'NP',
    dialCode: '+977',
    flag: '🇳🇵',
    format: '981 2345678',
    lengths: [10],
    leadingDigits: /^[9]/,
  },
  {
    name: 'Germany',
    code: 'DE',
    dialCode: '+49',
    flag: '🇩🇪',
    format: '151 23456789',
    lengths: [10, 11],
  },
  {
    name: 'France',
    code: 'FR',
    dialCode: '+33',
    flag: '🇫🇷',
    format: '6 12 34 56 78',
    lengths: [9],
  },
  {
    name: 'Italy',
    code: 'IT',
    dialCode: '+39',
    flag: '🇮🇹',
    format: '312 345 6789',
    lengths: [10],
  },
  {
    name: 'Spain',
    code: 'ES',
    dialCode: '+34',
    flag: '🇪🇸',
    format: '612 34 56 78',
    lengths: [9],
  },
  {
    name: 'Netherlands',
    code: 'NL',
    dialCode: '+31',
    flag: '🇳🇱',
    format: '6 12345678',
    lengths: [9],
  },
  {
    name: 'Switzerland',
    code: 'CH',
    dialCode: '+41',
    flag: '🇨🇭',
    format: '79 123 45 67',
    lengths: [9],
  },
  {
    name: 'Sweden',
    code: 'SE',
    dialCode: '+46',
    flag: '🇸🇪',
    format: '70 123 45 67',
    lengths: [9],
  },
  {
    name: 'Norway',
    code: 'NO',
    dialCode: '+47',
    flag: '🇳🇴',
    format: '412 34 567',
    lengths: [8],
  },
  {
    name: 'Denmark',
    code: 'DK',
    dialCode: '+45',
    flag: '🇩🇰',
    format: '21 34 56 78',
    lengths: [8],
  },
  {
    name: 'Finland',
    code: 'FI',
    dialCode: '+358',
    flag: '🇫🇮',
    format: '41 2345678',
    lengths: [9, 10],
  },
  {
    name: 'Ireland',
    code: 'IE',
    dialCode: '+353',
    flag: '🇮🇪',
    format: '85 123 4567',
    lengths: [9],
  },
  {
    name: 'Belgium',
    code: 'BE',
    dialCode: '+32',
    flag: '🇧🇪',
    format: '470 12 34 56',
    lengths: [9],
  },
  {
    name: 'Austria',
    code: 'AT',
    dialCode: '+43',
    flag: '🇦🇹',
    format: '664 1234567',
    lengths: [10, 11],
  },
  {
    name: 'Poland',
    code: 'PL',
    dialCode: '+48',
    flag: '🇵🇱',
    format: '512 345 678',
    lengths: [9],
  },
  {
    name: 'Portugal',
    code: 'PT',
    dialCode: '+351',
    flag: '🇵🇹',
    format: '912 345 678',
    lengths: [9],
  },
  {
    name: 'Greece',
    code: 'GR',
    dialCode: '+30',
    flag: '🇬🇷',
    format: '691 234 5678',
    lengths: [10],
  },
  {
    name: 'Turkey',
    code: 'TR',
    dialCode: '+90',
    flag: '🇹🇷',
    format: '512 345 6789',
    lengths: [10],
  },
  {
    name: 'Egypt',
    code: 'EG',
    dialCode: '+20',
    flag: '🇪🇬',
    format: '10 1234 5678',
    lengths: [10],
    leadingDigits: /^[1]/,
  },
  {
    name: 'South Africa',
    code: 'ZA',
    dialCode: '+27',
    flag: '🇿🇦',
    format: '71 234 5678',
    lengths: [9],
  },
  {
    name: 'Nigeria',
    code: 'NG',
    dialCode: '+234',
    flag: '🇳🇬',
    format: '802 123 4567',
    lengths: [10],
  },
  {
    name: 'Kenya',
    code: 'KE',
    dialCode: '+254',
    flag: '🇰🇪',
    format: '712 345678',
    lengths: [9],
  },
  {
    name: 'Brazil',
    code: 'BR',
    dialCode: '+55',
    flag: '🇧🇷',
    format: '11 91234 5678',
    lengths: [10, 11],
  },
  {
    name: 'Mexico',
    code: 'MX',
    dialCode: '+52',
    flag: '🇲🇽',
    format: '55 1234 5678',
    lengths: [10],
  },
  {
    name: 'Argentina',
    code: 'AR',
    dialCode: '+54',
    flag: '🇦🇷',
    format: '9 11 1234 5678',
    lengths: [10, 11],
  },
  {
    name: 'Chile',
    code: 'CL',
    dialCode: '+56',
    flag: '🇨🇱',
    format: '9 1234 5678',
    lengths: [9],
  },
  {
    name: 'Colombia',
    code: 'CO',
    dialCode: '+57',
    flag: '🇨🇴',
    format: '300 123 4567',
    lengths: [10],
  },
  {
    name: 'Peru',
    code: 'PE',
    dialCode: '+51',
    flag: '🇵🇪',
    format: '912 345 678',
    lengths: [9],
  },
  {
    name: 'New Zealand',
    code: 'NZ',
    dialCode: '+64',
    flag: '🇳🇿',
    format: '21 123 4567',
    lengths: [8, 9, 10],
  },
  {
    name: 'Philippines',
    code: 'PH',
    dialCode: '+63',
    flag: '🇵🇭',
    format: '912 345 6789',
    lengths: [10],
    leadingDigits: /^[9]/,
  },
  {
    name: 'Indonesia',
    code: 'ID',
    dialCode: '+62',
    flag: '🇮🇩',
    format: '812 3456 7890',
    lengths: [9, 10, 11, 12],
    leadingDigits: /^[8]/,
  },
  {
    name: 'Vietnam',
    code: 'VN',
    dialCode: '+84',
    flag: '🇻🇳',
    format: '91 234 5678',
    lengths: [9],
  },
  {
    name: 'Thailand',
    code: 'TH',
    dialCode: '+66',
    flag: '🇹🇭',
    format: '81 234 5678',
    lengths: [9],
  },
  {
    name: 'Japan',
    code: 'JP',
    dialCode: '+81',
    flag: '🇯🇵',
    format: '90 1234 5678',
    lengths: [10],
  },
  {
    name: 'South Korea',
    code: 'KR',
    dialCode: '+82',
    flag: '🇰🇷',
    format: '10 1234 5678',
    lengths: [9, 10],
  },
  {
    name: 'Hong Kong',
    code: 'HK',
    dialCode: '+852',
    flag: '🇭🇰',
    format: '5123 4567',
    lengths: [8],
  },
  {
    name: 'China',
    code: 'CN',
    dialCode: '+86',
    flag: '🇨🇳',
    format: '138 1234 5678',
    lengths: [11],
    leadingDigits: /^[1]/,
  },
  {
    name: 'Taiwan',
    code: 'TW',
    dialCode: '+886',
    flag: '🇹🇼',
    format: '912 345 678',
    lengths: [9],
  },
  {
    name: 'Russia',
    code: 'RU',
    dialCode: '+7',
    flag: '🇷🇺',
    format: '912 345-67-89',
    lengths: [10],
  },
  {
    name: 'Ukraine',
    code: 'UA',
    dialCode: '+380',
    flag: '🇺🇦',
    format: '50 123 4567',
    lengths: [9],
  },
  {
    name: 'Israel',
    code: 'IL',
    dialCode: '+972',
    flag: '🇮🇱',
    format: '50 123 4567',
    lengths: [9],
  },
  {
    name: 'Jordan',
    code: 'JO',
    dialCode: '+962',
    flag: '🇯🇴',
    format: '7 9012 3456',
    lengths: [9],
  },
  {
    name: 'Lebanon',
    code: 'LB',
    dialCode: '+961',
    flag: '🇱🇧',
    format: '70 123 456',
    lengths: [8],
  },
  {
    name: 'Morocco',
    code: 'MA',
    dialCode: '+212',
    flag: '🇲🇦',
    format: '612 345678',
    lengths: [9],
  },
  {
    name: 'Ghana',
    code: 'GH',
    dialCode: '+233',
    flag: '🇬🇭',
    format: '24 123 4567',
    lengths: [9],
  },
  {
    name: 'Tanzania',
    code: 'TZ',
    dialCode: '+255',
    flag: '🇹🇿',
    format: '712 345 678',
    lengths: [9],
  },
  {
    name: 'Uganda',
    code: 'UG',
    dialCode: '+256',
    flag: '🇺🇬',
    format: '712 345678',
    lengths: [9],
  },
  {
    name: 'Ethiopia',
    code: 'ET',
    dialCode: '+251',
    flag: '🇪🇹',
    format: '91 123 4567',
    lengths: [9],
  },
  {
    name: 'Afghanistan',
    code: 'AF',
    dialCode: '+93',
    flag: '🇦🇫',
    format: '70 123 4567',
    lengths: [9],
  },
  {
    name: 'Albania',
    code: 'AL',
    dialCode: '+355',
    flag: '🇦🇱',
    format: '67 123 4567',
    lengths: [9],
  },
  {
    name: 'Algeria',
    code: 'DZ',
    dialCode: '+213',
    flag: '🇩🇿',
    format: '551 23 45 67',
    lengths: [9],
  },
  {
    name: 'Andorra',
    code: 'AD',
    dialCode: '+376',
    flag: '🇦🇩',
    format: '312 345',
    lengths: [6],
  },
  {
    name: 'Angola',
    code: 'AO',
    dialCode: '+244',
    flag: '🇦🇴',
    format: '923 123 456',
    lengths: [9],
  },
  {
    name: 'Armenia',
    code: 'AM',
    dialCode: '+374',
    flag: '🇦🇲',
    format: '77 123456',
    lengths: [8],
  },
  {
    name: 'Azerbaijan',
    code: 'AZ',
    dialCode: '+994',
    flag: '🇦🇿',
    format: '50 123 45 67',
    lengths: [9],
  },
  {
    name: 'Bahamas',
    code: 'BS',
    dialCode: '+1242',
    flag: '🇧🇸',
    format: '359 1234',
    lengths: [7],
  },
  {
    name: 'Barbados',
    code: 'BB',
    dialCode: '+1246',
    flag: '🇧🇧',
    format: '256 1234',
    lengths: [7],
  },
  {
    name: 'Belarus',
    code: 'BY',
    dialCode: '+375',
    flag: '🇧🇾',
    format: '29 123 45 67',
    lengths: [9],
  },
  {
    name: 'Belize',
    code: 'BZ',
    dialCode: '+501',
    flag: '🇧🇿',
    format: '622 1234',
    lengths: [7],
  },
  {
    name: 'Benin',
    code: 'BJ',
    dialCode: '+229',
    flag: '🇧🇯',
    format: '97 12 34 56',
    lengths: [8],
  },
  {
    name: 'Bhutan',
    code: 'BT',
    dialCode: '+975',
    flag: '🇧🇹',
    format: '17 12 34 56',
    lengths: [8],
  },
  {
    name: 'Bolivia',
    code: 'BO',
    dialCode: '+591',
    flag: '🇧🇴',
    format: '71234567',
    lengths: [8],
  },
  {
    name: 'Bosnia and Herzegovina',
    code: 'BA',
    dialCode: '+387',
    flag: '🇧🇦',
    format: '61 123 456',
    lengths: [8],
  },
  {
    name: 'Botswana',
    code: 'BW',
    dialCode: '+267',
    flag: '🇧🇼',
    format: '71 123 456',
    lengths: [8],
  },
  {
    name: 'Brunei',
    code: 'BN',
    dialCode: '+673',
    flag: '🇧🇳',
    format: '712 3456',
    lengths: [7],
  },
  {
    name: 'Bulgaria',
    code: 'BG',
    dialCode: '+359',
    flag: '🇧🇬',
    format: '87 123 4567',
    lengths: [9],
  },
  {
    name: 'Cambodia',
    code: 'KH',
    dialCode: '+855',
    flag: '🇰🇭',
    format: '12 345 678',
    lengths: [8, 9],
  },
  {
    name: 'Cameroon',
    code: 'CM',
    dialCode: '+237',
    flag: '🇨🇲',
    format: '6 71 23 45 67',
    lengths: [9],
  },
  {
    name: 'Costa Rica',
    code: 'CR',
    dialCode: '+506',
    flag: '🇨🇷',
    format: '8312 3456',
    lengths: [8],
  },
  {
    name: 'Croatia',
    code: 'HR',
    dialCode: '+385',
    flag: '🇭🇷',
    format: '91 123 4567',
    lengths: [9],
  },
  {
    name: 'Cyprus',
    code: 'CY',
    dialCode: '+357',
    flag: '🇨🇾',
    format: '96 123456',
    lengths: [8],
  },
  {
    name: 'Czech Republic',
    code: 'CZ',
    dialCode: '+420',
    flag: '🇨🇿',
    format: '601 123 456',
    lengths: [9],
  },
  {
    name: 'Dominican Republic',
    code: 'DO',
    dialCode: '+1809',
    flag: '🇩🇴',
    format: '234 5678',
    lengths: [7],
  },
  {
    name: 'Ecuador',
    code: 'EC',
    dialCode: '+593',
    flag: '🇪🇨',
    format: '99 123 4567',
    lengths: [9],
  },
  {
    name: 'El Salvador',
    code: 'SV',
    dialCode: '+503',
    flag: '🇸🇻',
    format: '7012 3456',
    lengths: [8],
  },
  {
    name: 'Estonia',
    code: 'EE',
    dialCode: '+372',
    flag: '🇪🇪',
    format: '5123 4567',
    lengths: [7, 8],
  },
  {
    name: 'Fiji',
    code: 'FJ',
    dialCode: '+679',
    flag: '🇫🇯',
    format: '701 2345',
    lengths: [7],
  },
  {
    name: 'Georgia',
    code: 'GE',
    dialCode: '+995',
    flag: '🇬🇪',
    format: '555 12 34 56',
    lengths: [9],
  },
  {
    name: 'Guatemala',
    code: 'GT',
    dialCode: '+502',
    flag: '🇬🇹',
    format: '5123 4567',
    lengths: [8],
  },
  {
    name: 'Honduras',
    code: 'HN',
    dialCode: '+504',
    flag: '🇭🇳',
    format: '9123 4567',
    lengths: [8],
  },
  {
    name: 'Hungary',
    code: 'HU',
    dialCode: '+36',
    flag: '🇭🇺',
    format: '20 123 4567',
    lengths: [9],
  },
  {
    name: 'Iceland',
    code: 'IS',
    dialCode: '+354',
    flag: '🇮🇸',
    format: '612 3456',
    lengths: [7],
  },
  {
    name: 'Iraq',
    code: 'IQ',
    dialCode: '+964',
    flag: '🇮🇶',
    format: '790 123 4567',
    lengths: [10],
  },
  {
    name: 'Ivory Coast',
    code: 'CI',
    dialCode: '+225',
    flag: '🇨🇮',
    format: '01 23 45 67 89',
    lengths: [10],
  },
  {
    name: 'Jamaica',
    code: 'JM',
    dialCode: '+1876',
    flag: '🇯🇲',
    format: '234 5678',
    lengths: [7],
  },
  {
    name: 'Kazakhstan',
    code: 'KZ',
    dialCode: '+7',
    flag: '🇰🇿',
    format: '701 234 5678',
    lengths: [10],
  },
  {
    name: 'Latvia',
    code: 'LV',
    dialCode: '+371',
    flag: '🇱🇻',
    format: '2123 4567',
    lengths: [8],
  },
  {
    name: 'Lithuania',
    code: 'LT',
    dialCode: '+370',
    flag: '🇱🇹',
    format: '612 34567',
    lengths: [8],
  },
  {
    name: 'Luxembourg',
    code: 'LU',
    dialCode: '+352',
    flag: '🇱🇺',
    format: '621 123 456',
    lengths: [9],
  },
  {
    name: 'Maldives',
    code: 'MV',
    dialCode: '+960',
    flag: '🇲🇻',
    format: '771 2345',
    lengths: [7],
  },
  {
    name: 'Malta',
    code: 'MT',
    dialCode: '+356',
    flag: '🇲🇹',
    format: '9912 3456',
    lengths: [8],
  },
  {
    name: 'Mauritius',
    code: 'MU',
    dialCode: '+230',
    flag: '🇲🇺',
    format: '5123 4567',
    lengths: [8],
  },
  {
    name: 'Monaco',
    code: 'MC',
    dialCode: '+377',
    flag: '🇲🇨',
    format: '6 12 34 56 78',
    lengths: [8, 9],
  },
  {
    name: 'Mongolia',
    code: 'MN',
    dialCode: '+976',
    flag: '🇲🇳',
    format: '8812 3456',
    lengths: [8],
  },
  {
    name: 'Panama',
    code: 'PA',
    dialCode: '+507',
    flag: '🇵🇦',
    format: '6123 4567',
    lengths: [8],
  },
  {
    name: 'Paraguay',
    code: 'PY',
    dialCode: '+595',
    flag: '🇵🇾',
    format: '981 123456',
    lengths: [9],
  },
  {
    name: 'Romania',
    code: 'RO',
    dialCode: '+40',
    flag: '🇷🇴',
    format: '712 345 678',
    lengths: [9],
  },
  {
    name: 'Rwanda',
    code: 'RW',
    dialCode: '+250',
    flag: '🇷🇼',
    format: '788 123 456',
    lengths: [9],
  },
  {
    name: 'Senegal',
    code: 'SN',
    dialCode: '+221',
    flag: '🇸🇳',
    format: '77 123 45 67',
    lengths: [9],
  },
  {
    name: 'Serbia',
    code: 'RS',
    dialCode: '+381',
    flag: '🇷🇸',
    format: '60 1234567',
    lengths: [8, 9],
  },
  {
    name: 'Slovakia',
    code: 'SK',
    dialCode: '+421',
    flag: '🇸🇰',
    format: '912 345 678',
    lengths: [9],
  },
  {
    name: 'Slovenia',
    code: 'SI',
    dialCode: '+386',
    flag: '🇸🇮',
    format: '41 123 456',
    lengths: [8],
  },
  {
    name: 'Tunisia',
    code: 'TN',
    dialCode: '+216',
    flag: '🇹🇳',
    format: '20 123 456',
    lengths: [8],
  },
  {
    name: 'Uruguay',
    code: 'UY',
    dialCode: '+598',
    flag: '🇺🇾',
    format: '94 123 456',
    lengths: [8],
  },
  {
    name: 'Uzbekistan',
    code: 'UZ',
    dialCode: '+998',
    flag: '🇺🇿',
    format: '90 123 45 67',
    lengths: [9],
  },
  {
    name: 'Venezuela',
    code: 'VE',
    dialCode: '+58',
    flag: '🇻🇪',
    format: '412 1234567',
    lengths: [10],
  },
  {
    name: 'Zambia',
    code: 'ZM',
    dialCode: '+260',
    flag: '🇿🇲',
    format: '97 1234567',
    lengths: [9],
  },
  {
    name: 'Zimbabwe',
    code: 'ZW',
    dialCode: '+263',
    flag: '🇿🇼',
    format: '71 234 5678',
    lengths: [9],
  },
];

export const DEFAULT_COUNTRY =
  COUNTRIES.find((c) => c.code === 'IN') || COUNTRIES[0];

export const POPULAR_COUNTRY_CODES = [
  'IN',
  'AE',
  'SA',
  'US',
  'GB',
  'CA',
  'AU',
  'QA',
  'KW',
  'OM',
  'BH',
  'SG',
  'MY',
  'PK',
  'BD',
];

/** Find country by 2-letter ISO code (case-insensitive) */
export function findCountryByCode(code: string): Country | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase().trim();
  return COUNTRIES.find((c) => c.code === upper);
}

/**
 * Parses an incoming phone string (e.g. "+919876543210", "919876543210", or "9876543210")
 * into a matching Country and national number digits.
 */
export function parsePhoneToCountryAndNational(
  phone: string,
  defaultCountryCode = 'IN'
): { country: Country; nationalNumber: string } {
  const fallback = findCountryByCode(defaultCountryCode) || DEFAULT_COUNTRY;
  if (!phone) {
    return { country: fallback, nationalNumber: '' };
  }

  const cleaned = phone.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');

  if (!digits) {
    return { country: fallback, nationalNumber: '' };
  }

  // Sort dial codes by length descending (e.g. +1809 before +1)
  const sortedCountries = [...COUNTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length
  );

  if (cleaned.startsWith('+')) {
    for (const c of sortedCountries) {
      const dialDigits = c.dialCode.replace(/\D/g, '');
      if (digits.startsWith(dialDigits)) {
        const national = digits.slice(dialDigits.length);
        return { country: c, nationalNumber: national };
      }
    }
  } else {
    // If no leading +, test if it matches dial codes
    for (const c of sortedCountries) {
      const dialDigits = c.dialCode.replace(/\D/g, '');
      if (digits.startsWith(dialDigits)) {
        const national = digits.slice(dialDigits.length);
        // Ensure the national part matches expected length for that country
        if (
          c.lengths.includes(national.length) ||
          (national.length >= 6 && national.length <= 14)
        ) {
          return { country: c, nationalNumber: national };
        }
      }
    }
  }

  // If already at default country length, use default
  return { country: fallback, nationalNumber: digits };
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  formattedNumber?: string;
  fullE164?: string;
}

/**
 * Validates a national phone number against a selected country.
 */
export function validateCountryPhoneNumber(
  country: Country,
  nationalNumber: string
): ValidationResult {
  const cleaned = nationalNumber.replace(/\D/g, '');

  if (!cleaned) {
    return {
      isValid: false,
      error: 'Phone number is required',
    };
  }

  const minLen = Math.min(...country.lengths);
  const maxLen = Math.max(...country.lengths);

  if (minLen === maxLen) {
    if (cleaned.length !== minLen) {
      return {
        isValid: false,
        error: `${country.name} (${country.dialCode}) phone numbers must be exactly ${minLen} digits (you entered ${cleaned.length})`,
      };
    }
  } else {
    if (cleaned.length < minLen || cleaned.length > maxLen) {
      return {
        isValid: false,
        error: `${country.name} (${country.dialCode}) phone numbers must be between ${minLen} and ${maxLen} digits (you entered ${cleaned.length})`,
      };
    }
  }

  if (country.leadingDigits && !country.leadingDigits.test(cleaned)) {
    if (cleaned.startsWith('0')) {
      return {
        isValid: false,
        error: `${country.name} numbers should not start with domestic trunk 0`,
      };
    }
    return {
      isValid: false,
      error: `Invalid number format for ${country.name}`,
    };
  }

  const fullE164 = `${country.dialCode}${cleaned}`;
  return {
    isValid: true,
    fullE164,
    formattedNumber: cleaned,
  };
}
