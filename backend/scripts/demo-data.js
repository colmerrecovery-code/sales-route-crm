/**
 * The forty companies the demo account is built from.
 *
 * All fictional. Real GTA industrial streets and postal codes so the routing
 * looks and behaves like a genuine day's driving — a demo where the map is
 * wrong is worse than no demo.
 *
 * Deliberately spread across tiers, with some touches already overdue: an app
 * that opens on "Nobody is overdue. Nice." shows none of the point of it.
 */
export const HOME = { address: '1 City Centre Drive', city: 'Mississauga', postal: 'L5B 1M2', lat: 43.5930, lng: -79.6440 };

// d = days ago the last contact happened. Left null for never-contacted leads.
export const COMPANIES = [
  // ---- tier1: current customers, buying regularly
  ['Harbour Foods Processing',     '2450 Meadowpine Blvd',   'Mississauga', 'L5N 6S2', 'tier1', null,   102, 43.6040, -79.7480],
  ['Redline Auto Components',      '1425 Cormorant Rd',      'Ancaster',    'L9G 4V5', 'tier1', null,    35, 43.2180, -79.9740],
  ['Northgate Cold Storage',       '6535 Millcreek Dr',      'Mississauga', 'L5N 2M2', 'tier1', null,    18, 43.5860, -79.7280],
  ['Pemberton Bakery Group',       '85 West Wilmot St',      'Richmond Hill','L4B 1K7','tier1', null,    64, 43.8420, -79.4110],
  ['Cavanagh Meat Packers',        '120 Nuggett Crt',        'Brampton',    'L6T 5H4', 'tier1', null,    12, 43.7180, -79.7060],
  ['Silverbrook Dairy',            '2900 Argentia Rd',       'Mississauga', 'L5N 7X9', 'tier1', null,    97, 43.6070, -79.7660],
  ['Kestrel Plastics Moulding',    '5155 Spectrum Way',      'Mississauga', 'L4W 5A1', 'tier1', null,    41, 43.6440, -79.6300],
  ['Ironvale Fabrication',         '1100 Fewster Dr',        'Mississauga', 'L4W 2A2', 'tier1', null,    88, 43.6300, -79.6120],
  ['Talbot Produce Distributors',  '165 The West Mall',      'Etobicoke',   'M9C 5K5', 'tier1', null,    26, 43.6280, -79.5580],
  ['Warrender Industrial Supply',  '2555 Meadowvale Blvd',   'Mississauga', 'L5N 8C1', 'tier1', null,   115, 43.6000, -79.7420],
  ['Beacon Hill Brewing',          '400 Bramalea Rd',        'Brampton',    'L6T 2W8', 'tier1', null,    52, 43.7060, -79.7010],
  ['Ashcroft Pharma Logistics',    '7050 Bramalea Rd',       'Mississauga', 'L5S 1S9', 'tier1', null,     8, 43.6890, -79.6560],

  // ---- tier2: warm and hot leads
  ['Delta Ridge Packaging',        '2680 Slough St',         'Mississauga', 'L4T 1G3', 'tier2', 'hot',   14, 43.7030, -79.6420],
  ['Norwood Seafoods',             '55 Milne Ave',           'Scarborough', 'M1L 0G7', 'tier2', 'hot',    9, 43.7290, -79.2590],
  ['Vantage Beverage Co',          '8500 Keele St',          'Concord',     'L4K 2A6', 'tier2', 'warm',  31, 43.8090, -79.5040],
  ['Braemar Confectionery',        '145 Trowers Rd',         'Woodbridge',  'L4L 6A2', 'tier2', 'warm',  47, 43.7830, -79.5710],
  ['Copperfield Machining',        '6150 Hwy 7',             'Woodbridge',  'L4H 0R6', 'tier2', 'hot',   21, 43.7900, -79.6220],
  ['Marlowe Textiles',             '2 Kenview Blvd',         'Brampton',    'L6T 5E4', 'tier2', 'warm',  73, 43.7140, -79.6910],
  ['Ridgeway Electrical Wholesale','1170 Burloak Dr',        'Burlington',  'L7L 6B8', 'tier2', 'warm',  38, 43.3720, -79.7290],
  ['Stonebridge Garden Centre',    '4100 Fairview St',       'Burlington',  'L7L 4Y8', 'tier2', 'warm', 126, 43.3600, -79.7530],
  ['Elmhurst Nutraceuticals',      '160 Vinyl Crt',          'Woodbridge',  'L4L 4A3', 'tier2', 'hot',    5, 43.7770, -79.5810],

  // ---- tier3: inactive, no purchase in over a year
  ['Aldergrove Millwork',          '1200 Aerowood Dr',       'Mississauga', 'L4W 2S7', 'tier3', null,   402, 43.6360, -79.6180],
  ['Fenwick Paper Converting',     '75 Watline Ave',         'Mississauga', 'L4Z 3E5', 'tier3', null,   455, 43.6180, -79.6640],
  ['Hollinger Tool & Die',         '3600 Laird Rd',          'Mississauga', 'L5L 6A5', 'tier3', null,   380, 43.5290, -79.6960],
  ['Westmount Janitorial',         '2180 Dunwin Dr',         'Mississauga', 'L5L 1C7', 'tier3', null,   512, 43.5340, -79.6870],
  ['Larkspur Greenhouse',          '10 Rutherford Rd S',     'Brampton',    'L6W 3J1', 'tier3', null,   431, 43.6790, -79.7350],
  ['Thornbury Furniture',          '8300 Woodbine Ave',      'Markham',     'L3R 9Y7', 'tier3', null,   367, 43.8320, -79.3450],

  // ---- tier4: cold leads picked up door-knocking
  ['Quarry Lane Aggregates',       '2000 Britannia Rd E',    'Mississauga', 'L4W 2P8', 'tier4', 'cold',  60, 43.6480, -79.6390],
  ['Pinehaven Pet Foods',          '1 Whitmore Rd',          'Woodbridge',  'L4L 6A5', 'tier4', 'cold',  90, 43.7810, -79.5860],
  ['Selkirk Metal Recycling',      '150 Bethridge Rd',       'Etobicoke',   'M9W 1N4', 'tier4', 'cold', 144, 43.7100, -79.5760],
  ['Ambleside Cosmetics',          '30 Precidio Crt',        'Brampton',    'L6S 6B7', 'tier4', 'cold',  75, 43.7360, -79.7080],
  ['Golden Sheaf Flour Mills',     '55 Ashbridge Circ',      'Woodbridge',  'L4L 3R5', 'tier4', 'cold', null, 43.7780, -79.5750],
  ['Rockcliffe Building Products', '190 Nebo Rd',            'Hamilton',    'L8W 2E4', 'tier4', 'cold', null, 43.1930, -79.8390],
  ['Hastings Wire & Cable',        '5155 Timberlea Blvd',    'Mississauga', 'L4W 2S3', 'tier4', 'cold', null, 43.6390, -79.6470],
  ['Merrivale Sign Systems',       '80 Konrad Cres',         'Markham',     'L3R 8T4', 'tier4', 'cold', null, 43.8300, -79.3560],
  ['Oakmont Window Systems',       '3300 Wharton Way',       'Mississauga', 'L4X 2C1', 'tier4', 'cold', 210, 43.6180, -79.5860],
  ['Chandler Marine Supply',       '2085 Lakeshore Rd W',    'Oakville',    'L6L 1H2', 'tier4', 'cold', null, 43.4200, -79.7160],
  ['Verity Lab Instruments',       '2 Bloor St W',           'Toronto',     'M4W 3E2', 'tier4', 'cold', null, 43.6700, -79.3870],
  ['Sandalwood Nursery',           '9100 Airport Rd',        'Brampton',    'L6S 0B8', 'tier4', 'cold', 168, 43.7530, -79.6960],
  ['Kingsmere Office Interiors',   '3300 Bloor St W',        'Etobicoke',   'M8X 2X2', 'tier4', 'cold', null, 43.6450, -79.5170],
];

/** first, last, title — attached to the tier1/tier2 companies so the demo has people in it. */
export const PEOPLE = [
  ['Dana',   'Whitfield',  'Purchasing Manager'],
  ['Marcus', 'Oyelaran',   'Operations Manager'],
  ['Priya',  'Raghunathan','Plant Manager'],
  ['Curtis', 'Beaudry',    'Buyer'],
  ['Ellen',  'Maziarz',    'Warehouse Supervisor'],
  ['Terrence','Okafor',    'General Manager'],
  ['Sofia',  'Bertolini',  'Procurement Lead'],
  ['Randy',  'Vandersloot','Shipping Manager'],
  ['Aisha',  'Karim',      'Facilities Manager'],
  ['Gordon', 'Fyfe',       'Owner'],
];

/** Believable history. `kind` matches the interaction_type enum. */
export const NOTES = {
  visit: [
    'Dropped in with the new catalogue. Asked about nesting totes for the pick line.',
    'Walked the warehouse. They are trialling a competitor pallet — worth a quote.',
    'Quick drop-in, buyer was out. Left literature with reception.',
    'Site visit. Damaged bins on the receiving dock, replacement opportunity.',
  ],
  call: [
    'Followed up on the quote. Waiting on their budget approval.',
    'Left voicemail. Trying again next week.',
    'Discussed lead times on the 24x16 containers.',
  ],
  email: [
    'Sent pricing on the bulk container range.',
    'Emailed spec sheets after the site visit.',
  ],
  note: [
    'Moved warehouses last year — reconfirm the shipping address.',
    'Buyer changes in the spring. Re-introduce then.',
  ],
};
