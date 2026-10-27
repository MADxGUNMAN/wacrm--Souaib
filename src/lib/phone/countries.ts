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
  // Remaining ITU calling codes — without these, "+CC" numbers from
  // unlisted countries fell back to the default (+91) when displayed.
  // Africa
  {
    name: 'Burkina Faso',
    code: 'BF',
    dialCode: '+226',
    flag: '🇧🇫',
    lengths: [8],
  },
  { name: 'Burundi', code: 'BI', dialCode: '+257', flag: '🇧🇮', lengths: [8] },
  {
    name: 'Cape Verde',
    code: 'CV',
    dialCode: '+238',
    flag: '🇨🇻',
    lengths: [7],
  },
  {
    name: 'Central African Republic',
    code: 'CF',
    dialCode: '+236',
    flag: '🇨🇫',
    lengths: [8],
  },
  { name: 'Chad', code: 'TD', dialCode: '+235', flag: '🇹🇩', lengths: [8] },
  { name: 'Comoros', code: 'KM', dialCode: '+269', flag: '🇰🇲', lengths: [7] },
  { name: 'Congo', code: 'CG', dialCode: '+242', flag: '🇨🇬', lengths: [9] },
  {
    name: 'Congo (DRC)',
    code: 'CD',
    dialCode: '+243',
    flag: '🇨🇩',
    lengths: [7, 8, 9],
  },
  { name: 'Djibouti', code: 'DJ', dialCode: '+253', flag: '🇩🇯', lengths: [8] },
  {
    name: 'Equatorial Guinea',
    code: 'GQ',
    dialCode: '+240',
    flag: '🇬🇶',
    lengths: [9],
  },
  { name: 'Eritrea', code: 'ER', dialCode: '+291', flag: '🇪🇷', lengths: [7] },
  { name: 'Eswatini', code: 'SZ', dialCode: '+268', flag: '🇸🇿', lengths: [8] },
  { name: 'Gabon', code: 'GA', dialCode: '+241', flag: '🇬🇦', lengths: [7, 8] },
  { name: 'Gambia', code: 'GM', dialCode: '+220', flag: '🇬🇲', lengths: [7] },
  { name: 'Guinea', code: 'GN', dialCode: '+224', flag: '🇬🇳', lengths: [8, 9] },
  {
    name: 'Guinea-Bissau',
    code: 'GW',
    dialCode: '+245',
    flag: '🇬🇼',
    lengths: [7, 9],
  },
  { name: 'Lesotho', code: 'LS', dialCode: '+266', flag: '🇱🇸', lengths: [8] },
  {
    name: 'Liberia',
    code: 'LR',
    dialCode: '+231',
    flag: '🇱🇷',
    lengths: [7, 8, 9],
  },
  { name: 'Libya', code: 'LY', dialCode: '+218', flag: '🇱🇾', lengths: [8, 9] },
  {
    name: 'Madagascar',
    code: 'MG',
    dialCode: '+261',
    flag: '🇲🇬',
    lengths: [9],
  },
  { name: 'Malawi', code: 'MW', dialCode: '+265', flag: '🇲🇼', lengths: [7, 9] },
  { name: 'Mali', code: 'ML', dialCode: '+223', flag: '🇲🇱', lengths: [8] },
  {
    name: 'Mauritania',
    code: 'MR',
    dialCode: '+222',
    flag: '🇲🇷',
    lengths: [8],
  },
  {
    name: 'Mozambique',
    code: 'MZ',
    dialCode: '+258',
    flag: '🇲🇿',
    lengths: [8, 9],
  },
  {
    name: 'Namibia',
    code: 'NA',
    dialCode: '+264',
    flag: '🇳🇦',
    lengths: [8, 9],
  },
  { name: 'Niger', code: 'NE', dialCode: '+227', flag: '🇳🇪', lengths: [8] },
  { name: 'Réunion', code: 'RE', dialCode: '+262', flag: '🇷🇪', lengths: [9] },
  {
    name: 'Saint Helena',
    code: 'SH',
    dialCode: '+290',
    flag: '🇸🇭',
    lengths: [4, 5],
  },
  {
    name: 'São Tomé and Príncipe',
    code: 'ST',
    dialCode: '+239',
    flag: '🇸🇹',
    lengths: [7],
  },
  {
    name: 'Seychelles',
    code: 'SC',
    dialCode: '+248',
    flag: '🇸🇨',
    lengths: [7],
  },
  {
    name: 'Sierra Leone',
    code: 'SL',
    dialCode: '+232',
    flag: '🇸🇱',
    lengths: [8],
  },
  {
    name: 'Somalia',
    code: 'SO',
    dialCode: '+252',
    flag: '🇸🇴',
    lengths: [7, 8, 9],
  },
  {
    name: 'South Sudan',
    code: 'SS',
    dialCode: '+211',
    flag: '🇸🇸',
    lengths: [9],
  },
  { name: 'Sudan', code: 'SD', dialCode: '+249', flag: '🇸🇩', lengths: [9] },
  { name: 'Togo', code: 'TG', dialCode: '+228', flag: '🇹🇬', lengths: [8] },
  // Middle East & Asia
  {
    name: 'Iran',
    code: 'IR',
    dialCode: '+98',
    flag: '🇮🇷',
    format: '912 345 6789',
    lengths: [10],
  },
  { name: 'Syria', code: 'SY', dialCode: '+963', flag: '🇸🇾', lengths: [8, 9] },
  {
    name: 'Yemen',
    code: 'YE',
    dialCode: '+967',
    flag: '🇾🇪',
    lengths: [7, 8, 9],
  },
  {
    name: 'Palestine',
    code: 'PS',
    dialCode: '+970',
    flag: '🇵🇸',
    lengths: [8, 9],
  },
  {
    name: 'Kyrgyzstan',
    code: 'KG',
    dialCode: '+996',
    flag: '🇰🇬',
    lengths: [9],
  },
  {
    name: 'Tajikistan',
    code: 'TJ',
    dialCode: '+992',
    flag: '🇹🇯',
    lengths: [9],
  },
  {
    name: 'Turkmenistan',
    code: 'TM',
    dialCode: '+993',
    flag: '🇹🇲',
    lengths: [8],
  },
  {
    name: 'Laos',
    code: 'LA',
    dialCode: '+856',
    flag: '🇱🇦',
    lengths: [8, 9, 10],
  },
  {
    name: 'Myanmar',
    code: 'MM',
    dialCode: '+95',
    flag: '🇲🇲',
    lengths: [7, 8, 9, 10],
  },
  { name: 'Macau', code: 'MO', dialCode: '+853', flag: '🇲🇴', lengths: [8] },
  {
    name: 'North Korea',
    code: 'KP',
    dialCode: '+850',
    flag: '🇰🇵',
    lengths: [8, 10],
  },
  {
    name: 'Timor-Leste',
    code: 'TL',
    dialCode: '+670',
    flag: '🇹🇱',
    lengths: [7, 8],
  },
  // Europe
  { name: 'Moldova', code: 'MD', dialCode: '+373', flag: '🇲🇩', lengths: [8] },
  {
    name: 'Montenegro',
    code: 'ME',
    dialCode: '+382',
    flag: '🇲🇪',
    lengths: [8],
  },
  {
    name: 'North Macedonia',
    code: 'MK',
    dialCode: '+389',
    flag: '🇲🇰',
    lengths: [8],
  },
  {
    name: 'Liechtenstein',
    code: 'LI',
    dialCode: '+423',
    flag: '🇱🇮',
    lengths: [7, 9],
  },
  {
    name: 'San Marino',
    code: 'SM',
    dialCode: '+378',
    flag: '🇸🇲',
    lengths: [6, 8, 10],
  },
  { name: 'Kosovo', code: 'XK', dialCode: '+383', flag: '🇽🇰', lengths: [8, 9] },
  { name: 'Gibraltar', code: 'GI', dialCode: '+350', flag: '🇬🇮', lengths: [8] },
  {
    name: 'Faroe Islands',
    code: 'FO',
    dialCode: '+298',
    flag: '🇫🇴',
    lengths: [6],
  },
  { name: 'Greenland', code: 'GL', dialCode: '+299', flag: '🇬🇱', lengths: [6] },
  // Americas
  { name: 'Guyana', code: 'GY', dialCode: '+592', flag: '🇬🇾', lengths: [7] },
  {
    name: 'Suriname',
    code: 'SR',
    dialCode: '+597',
    flag: '🇸🇷',
    lengths: [6, 7],
  },
  { name: 'Nicaragua', code: 'NI', dialCode: '+505', flag: '🇳🇮', lengths: [8] },
  { name: 'Haiti', code: 'HT', dialCode: '+509', flag: '🇭🇹', lengths: [8] },
  { name: 'Cuba', code: 'CU', dialCode: '+53', flag: '🇨🇺', lengths: [8] },
  {
    name: 'French Guiana',
    code: 'GF',
    dialCode: '+594',
    flag: '🇬🇫',
    lengths: [9],
  },
  {
    name: 'Guadeloupe',
    code: 'GP',
    dialCode: '+590',
    flag: '🇬🇵',
    lengths: [9],
  },
  {
    name: 'Martinique',
    code: 'MQ',
    dialCode: '+596',
    flag: '🇲🇶',
    lengths: [9],
  },
  { name: 'Aruba', code: 'AW', dialCode: '+297', flag: '🇦🇼', lengths: [7] },
  {
    name: 'Curaçao',
    code: 'CW',
    dialCode: '+599',
    flag: '🇨🇼',
    lengths: [7, 8],
  },
  {
    name: 'Falkland Islands',
    code: 'FK',
    dialCode: '+500',
    flag: '🇫🇰',
    lengths: [5],
  },
  // North American Numbering Plan territories (+1 + 3-digit area code)
  {
    name: 'Puerto Rico',
    code: 'PR',
    dialCode: '+1787',
    flag: '🇵🇷',
    lengths: [7],
  },
  {
    name: 'Trinidad and Tobago',
    code: 'TT',
    dialCode: '+1868',
    flag: '🇹🇹',
    lengths: [7],
  },
  {
    name: 'Antigua and Barbuda',
    code: 'AG',
    dialCode: '+1268',
    flag: '🇦🇬',
    lengths: [7],
  },
  { name: 'Dominica', code: 'DM', dialCode: '+1767', flag: '🇩🇲', lengths: [7] },
  { name: 'Grenada', code: 'GD', dialCode: '+1473', flag: '🇬🇩', lengths: [7] },
  {
    name: 'Saint Kitts and Nevis',
    code: 'KN',
    dialCode: '+1869',
    flag: '🇰🇳',
    lengths: [7],
  },
  {
    name: 'Saint Lucia',
    code: 'LC',
    dialCode: '+1758',
    flag: '🇱🇨',
    lengths: [7],
  },
  {
    name: 'Saint Vincent and the Grenadines',
    code: 'VC',
    dialCode: '+1784',
    flag: '🇻🇨',
    lengths: [7],
  },
  { name: 'Bermuda', code: 'BM', dialCode: '+1441', flag: '🇧🇲', lengths: [7] },
  {
    name: 'Cayman Islands',
    code: 'KY',
    dialCode: '+1345',
    flag: '🇰🇾',
    lengths: [7],
  },
  {
    name: 'Turks and Caicos Islands',
    code: 'TC',
    dialCode: '+1649',
    flag: '🇹🇨',
    lengths: [7],
  },
  {
    name: 'British Virgin Islands',
    code: 'VG',
    dialCode: '+1284',
    flag: '🇻🇬',
    lengths: [7],
  },
  {
    name: 'U.S. Virgin Islands',
    code: 'VI',
    dialCode: '+1340',
    flag: '🇻🇮',
    lengths: [7],
  },
  { name: 'Anguilla', code: 'AI', dialCode: '+1264', flag: '🇦🇮', lengths: [7] },
  {
    name: 'Montserrat',
    code: 'MS',
    dialCode: '+1664',
    flag: '🇲🇸',
    lengths: [7],
  },
  {
    name: 'Sint Maarten',
    code: 'SX',
    dialCode: '+1721',
    flag: '🇸🇽',
    lengths: [7],
  },
  { name: 'Guam', code: 'GU', dialCode: '+1671', flag: '🇬🇺', lengths: [7] },
  {
    name: 'Northern Mariana Islands',
    code: 'MP',
    dialCode: '+1670',
    flag: '🇲🇵',
    lengths: [7],
  },
  {
    name: 'American Samoa',
    code: 'AS',
    dialCode: '+1684',
    flag: '🇦🇸',
    lengths: [7],
  },
  // Oceania
  {
    name: 'Papua New Guinea',
    code: 'PG',
    dialCode: '+675',
    flag: '🇵🇬',
    lengths: [7, 8],
  },
  {
    name: 'Solomon Islands',
    code: 'SB',
    dialCode: '+677',
    flag: '🇸🇧',
    lengths: [5, 7],
  },
  {
    name: 'Vanuatu',
    code: 'VU',
    dialCode: '+678',
    flag: '🇻🇺',
    lengths: [5, 7],
  },
  {
    name: 'Samoa',
    code: 'WS',
    dialCode: '+685',
    flag: '🇼🇸',
    lengths: [5, 6, 7],
  },
  { name: 'Tonga', code: 'TO', dialCode: '+676', flag: '🇹🇴', lengths: [5, 7] },
  {
    name: 'Kiribati',
    code: 'KI',
    dialCode: '+686',
    flag: '🇰🇮',
    lengths: [5, 8],
  },
  {
    name: 'Micronesia',
    code: 'FM',
    dialCode: '+691',
    flag: '🇫🇲',
    lengths: [7],
  },
  {
    name: 'Marshall Islands',
    code: 'MH',
    dialCode: '+692',
    flag: '🇲🇭',
    lengths: [7],
  },
  { name: 'Palau', code: 'PW', dialCode: '+680', flag: '🇵🇼', lengths: [7] },
  { name: 'Nauru', code: 'NR', dialCode: '+674', flag: '🇳🇷', lengths: [7] },
  { name: 'Tuvalu', code: 'TV', dialCode: '+688', flag: '🇹🇻', lengths: [5, 6] },
  {
    name: 'New Caledonia',
    code: 'NC',
    dialCode: '+687',
    flag: '🇳🇨',
    lengths: [6],
  },
  {
    name: 'French Polynesia',
    code: 'PF',
    dialCode: '+689',
    flag: '🇵🇫',
    lengths: [6, 8],
  },
  {
    name: 'Cook Islands',
    code: 'CK',
    dialCode: '+682',
    flag: '🇨🇰',
    lengths: [5],
  },
];

/** Countries sorted by dial-code length, longest first (+1809 before +1). */
const COUNTRIES_BY_DIAL_LENGTH = [...COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length
);

/**
 * Country whose dial code prefixes `digits` (longest code wins), or
 * undefined when no known calling code matches.
 */
export function findCountryByDialPrefix(digits: string): Country | undefined {
  return COUNTRIES_BY_DIAL_LENGTH.find((c) =>
    digits.startsWith(c.dialCode.slice(1))
  );
}

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
): { country: Country; nationalNumber: string; matched: boolean } {
  const fallback = findCountryByCode(defaultCountryCode) || DEFAULT_COUNTRY;
  if (!phone) {
    return { country: fallback, nationalNumber: '', matched: false };
  }

  const cleaned = phone.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');

  if (!digits) {
    return { country: fallback, nationalNumber: '', matched: false };
  }

  if (cleaned.startsWith('+')) {
    // An explicit "+CC" is authoritative — never swap in the default.
    const c = findCountryByDialPrefix(digits);
    if (c) {
      return {
        country: c,
        nationalNumber: digits.slice(c.dialCode.length - 1),
        matched: true,
      };
    }
    return { country: fallback, nationalNumber: digits, matched: false };
  }

  // No "+": the digits may or may not carry a country code (WhatsApp
  // wa_ids do, bare national numbers don't). Prefer, in order:
  //   1. a dial code whose remaining digits are an exact national length
  //   2. the default country, when the digits fit its national length
  //   3. a dial code with a plausible (6–14 digit) remainder
  const national = (c: Country) => digits.slice(c.dialCode.length - 1);
  const candidates = COUNTRIES_BY_DIAL_LENGTH.filter((c) =>
    digits.startsWith(c.dialCode.slice(1))
  );

  const exact = candidates.find((c) => c.lengths.includes(national(c).length));
  if (exact) {
    return { country: exact, nationalNumber: national(exact), matched: true };
  }

  if (fallback.lengths.includes(digits.length)) {
    return { country: fallback, nationalNumber: digits, matched: true };
  }

  const loose = candidates.find((c) => {
    const len = national(c).length;
    return len >= 6 && len <= 14;
  });
  if (loose) {
    return { country: loose, nationalNumber: national(loose), matched: true };
  }

  return { country: fallback, nationalNumber: digits, matched: false };
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

/**
 * Formats a national number using the country's example format or fallback grouping.
 */
export function formatNationalNumber(
  country: Country,
  nationalNumber: string
): string {
  const digits = nationalNumber.replace(/\D/g, '');
  if (!digits) return '';

  if (country.format) {
    const formatDigitsCount = (country.format.match(/\d/g) || []).length;
    if (formatDigitsCount === digits.length) {
      let digitIdx = 0;
      let res = '';
      for (const ch of country.format) {
        if (/\d/.test(ch)) {
          res += digits[digitIdx++];
        } else {
          res += ch;
        }
      }
      return res;
    }
  }

  // Fallback grouping based on digit length
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  }
  if (digits.length === 7) {
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  }
  return digits.match(/.{1,4}/g)?.join(' ') ?? digits;
}

export interface FormattedPhoneParts {
  dialCode: string;
  nationalNumber: string;
  country: Country | null;
  formatted: string;
}

/**
 * Parses and formats an E.164-like phone string into structured parts:
 * dialCode (e.g. "+91"), nationalNumber (e.g. "63594 63987"), country object, and full string ("+91 63594 63987").
 */
export function formatPhoneNumberParts(
  phone: string | null | undefined,
  defaultCountryCode = 'IN'
): FormattedPhoneParts {
  if (!phone || !phone.trim()) {
    return {
      dialCode: '',
      nationalNumber: '',
      country: null,
      formatted: '',
    };
  }

  const raw = phone.trim();
  const digits = raw.replace(/\D/g, '');

  // Too short to be a valid phone number
  if (digits.length < 5) {
    const fallback = raw.startsWith('+') ? raw : `+${raw}`;
    return {
      dialCode: '',
      nationalNumber: fallback,
      country: null,
      formatted: fallback,
    };
  }

  const hasPlus = raw.startsWith('+');

  // A local number with a domestic trunk 0 (e.g. "050 675 1025") has no
  // country code — show it as entered rather than inventing one.
  if (!hasPlus && digits.startsWith('0')) {
    return { dialCode: '', nationalNumber: raw, country: null, formatted: raw };
  }

  const { country, nationalNumber, matched } = parsePhoneToCountryAndNational(
    raw,
    defaultCountryCode
  );

  if (!matched) {
    // Unknown "+CC" or an unrecognisable bare number: keep the digits we
    // have instead of prefixing the default country's code.
    const shown = hasPlus ? `+${digits}` : raw;
    return {
      dialCode: '',
      nationalNumber: shown,
      country: null,
      formatted: shown,
    };
  }

  if (!nationalNumber) {
    const withPlus = raw.startsWith('+') ? raw : `+${raw}`;
    return {
      dialCode: '',
      nationalNumber: withPlus,
      country: null,
      formatted: withPlus,
    };
  }

  const formattedNat = formatNationalNumber(country, nationalNumber);
  const formatted = `${country.dialCode} ${formattedNat}`.trim();

  return {
    dialCode: country.dialCode,
    nationalNumber: formattedNat,
    country,
    formatted,
  };
}

/**
 * Returns a professionally formatted phone number with leading `+` and country code separation.
 * E.g. "916359463987" -> "+91 63594 63987"
 */
export function formatPhoneNumber(
  phone: string | null | undefined,
  defaultCountryCode = 'IN'
): string {
  return formatPhoneNumberParts(phone, defaultCountryCode).formatted;
}
