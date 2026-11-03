// Parody names for everything with a sign. Famous chains and buildings get a fixed parody (so every Cafe Coughy Day
// is the same chain); every other café, darshini, pub and shop gets a generated name, unique across the map.
// Deterministic: the page and the world worker build the same names from the same seed and the same order.
import { makeRng } from './util.js';

// [pattern on the real name, parody]
const BRANDS = [
  [/cafe coffee day|\bccd\b/, 'Cafe Coughy Day'], [/starbucks/, 'Starbox Coffee'], [/third wave/, 'Fourth Wave Coffee'],
  [/blue tokai/, 'Blue Tokay Roasters'], [/chai point/, 'Chai Pointless'], [/chaayos/, "Chaay-Yo's"], [/barista/, 'Baristaaa'],
  [/costa coffee/, 'Costly Coffee'], [/maverick/, 'Maverick & Farmer-ish'], [/sendhoor/, 'Sindoor Kaapi'],
  [/mcdonald/, "McDosa's"], [/domino/, "Domino Effect Pizza"], [/pizza hut/, 'Pizza Hutt'], [/burger king/, 'Burger Raja'],
  [/\bkfc\b|kentucky/, 'BFC · Bengaluru Fried Chicken'], [/subway/, 'Subwait'], [/wendy/, "Windy's"], [/gopizza/, 'GoPizzza'],
  [/good flippin/, "Good Floppin' Burgers"], [/boss burger/, 'Bossy Burger'], [/krispy kreme/, 'Crispy Cream'],
  [/baskin/, "Baskin-Robbin' You"], [/ibaco/, 'Ibako'], [/naturals/, 'Naturalz Ice Cream'], [/frozen bottle/, 'Frozen Bottleneck'],
  [/theobroma/, 'Theobromance'], [/truffles/, 'Trifles'], [/glen'?s bake/, "Glenn's Fakehouse"], [/corner house/, 'Korner House'],
  [/smoke house/, 'Smog House Deli'], [/barbeque nation|barbecue nation/, 'Barbeque Notion'], [/mainland china/, 'Mainland Chai-na'],
  [/beijing bites/, 'Beijing Bytes'], [/chung wah/, 'Chung Wow'], [/empire/, 'Vampire Restaurant'], [/meghana/, 'Meghna Feeds'],
  [/nagarjuna/, 'Nagarjunaaa Andhra Meals'], [/truffle/, 'Trifles'], [/mtr\b|mavalli tiffin/, 'RTM 1924'], [/vidyarthi/, 'Vidyaarthi Bhavana'],
  [/\bctr\b|central tiffin/, 'CRT Benne Dosa'], [/brahmin'?s coffee/, "Brahmin's Kaapi Bar"], [/shiv sagar/, 'Shiv Saagar'],
  [/adyar ananda|a2b/, 'Adyar Anandam Bhavan'], [/haldiram/, "Haldiraam's"], [/kamat/, 'Kaamath Upachar'], [/sukh sagar/, 'Sukh Saagar'],
  [/toit/, 'Taut Brewpub'], [/social/, 'Sociable'], [/hard rock/, 'Soft Rock Cafe'], [/arbor/, 'Arbour-ish Brewing'],
  [/windmills/, 'Windmill Craftworks-ish'], [/byg brewski/, 'Big Brewsky'], [/biergarten/, 'Beergarten'], [/bob'?s bar/, "Rob's Bar"],
  [/indira canteen/, 'Namma ₹10 Canteen'], [/hopcoms/, 'HOPCORNS'], [/nandini/, 'Nandhini Milk Parlour'],
  [/ambur biri?yani/, 'Ambur Biryani Junction'], [/mast kalandar/, 'Mast Kalander'], [/kota kachori/, 'Kota Kachori Express'],
  [/sharief bhai/, 'Shareef Bhaiyya'], [/si nonna/, "Si Nonna-ish's"], [/burma burma/, 'Myanmar Myanmar'], [/paris panini/, 'Paris Panini-ish'],
  [/the filter coffee/, 'The Decoction'], [/juice junction/, 'Juice Jn.'], [/chianti/, 'Chianti-ish'], [/brik oven/, 'Bric Oven'],
  [/easy bites/, 'Easy Bites by Vampire'], [/daily sushi/, 'Daily Sushi-ish'], [/doner company/, 'The Doner Kebab Company'],
  // buildings people search for
  [/hdfc/, 'HDFZ Bank'], [/icici/, 'ICICU Bank'], [/\bsbi\b|state bank/, 'State Bank of Bengaluru-ish'], [/axis bank/, 'Axes Bank'],
  [/godrej nature/, "Godrej Nurture's Basket"], [/prestige/, 'Prestij'], [/brigade (?!road)/, 'Brigaid'], [/embassy/, 'Embezzy'],
  [/mantri/, 'Mantra'], [/nitesh/, 'Nitish'], [/sobha/, 'Shobha-ish'], [/salarpuria/, 'Salaryporia'], [/\brmz\b/, 'RMZed'],
  [/indiqube/, 'IndiCube'], [/infosys/, 'Infosis'], [/wipro/, 'Wipeout'], [/manipal/, 'Manipaal'], [/forum/, 'Forumm'],
  [/\bitc\b/, 'ITZ'], [/\btaj\b/, 'Taaj'], [/oberoi/, 'Obreroi'], [/\bub city\b/, 'UV City'], [/bescom/, 'BESCOMplaint'],
];
export function parodyOf(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  for (const [re, p] of BRANDS) if (re.test(n)) {
    // a parody of a building keeps the rest of its name ("Prestij Tudor Court")
    const m = n.match(re); return m && /prestige|brigade|embassy|mantri|nitesh|sobha|salarpuria|rmz|indiqube/.test(m[0])
      ? name.replace(new RegExp(m[0], 'i'), p) : p;
  }
  return null;
}

const DEITY = ['Ganesha', 'Lakshmi', 'Venkateshwara', 'Annapoorna', 'Kaveri', 'Tunga', 'Nandi', 'Chamundi', 'Manjunatha', 'Raghavendra', 'Brindavan', 'Krishna', 'Mayura', 'Kamadhenu', 'Sharada', 'Ranga', 'Banashankari', 'Hampi', 'Kodagu', 'Malnad'];
const PREFIX = ['Sri', 'Shree', 'New', 'Hotel', 'Namma', 'Udupi', 'Mysore', 'Dodda', 'Swalpa', 'Hosa'];
const TIFFIN = ['Darshini', 'Sagar', 'Bhavan', 'Upahar', 'Tiffins', 'Idli House', 'Dosa Camp', 'Refreshments', 'Military Hotel', 'Mess', 'Thindi Mane', 'Oota Mane'];
const TECH = ['Sprint', 'Agile', 'Standup', 'Pivot', 'Unicorn', 'Series A', 'Bootstrap', 'Stealth Mode', 'Cloud', 'Scrum', 'Hackathon', 'Burnout', 'Appraisal', 'Notice Period', 'Hike', 'Offsite', 'Synergy', 'Bandwidth', 'Deadline', 'ESOP', 'Sabbatical', 'Onsite', 'WFH', 'Bench', 'Hotfix', 'Rollback', 'Merge Conflict', 'Code Freeze', 'Townhall', 'All-Hands'];
const DISH = ['Biryani', 'Kitchen', 'Meals', 'Canteen', 'Thali', 'Grill', 'Bistro', 'Pulao', 'Shawarma', 'Momos', 'Rolls', 'Bowls', 'Ghee Roast', 'Kebabs', 'Parottas'];
const BREW = ['Filter', 'Decoction', 'Kaapi', 'Brew', 'Bean', 'Roast', 'Chicory', 'Cold Brew', 'Pour Over', 'Fifth Wave', 'Sixth Wave', 'Monsoon Malabar', 'Arabica', 'Single Origin'];
const BREW2 = ['Labs', 'Collective', 'Co.', 'Theory', 'Project', 'Republic', 'Society', 'Junction', 'Station', 'Hub', 'Studio', 'Club', 'Works'];
const PLACE = ['Ring Road', 'Silk Board', 'Flyover', 'Pothole', 'Signal', 'Monsoon', 'Traffic Jam', 'Puncture', 'Diversion', 'One-Way', 'U-Turn', 'Speed Breaker', 'Power Cut', 'Water Tanker'];
const BAR = ['Brewing Co.', 'Taproom', 'Brewhouse', 'Arms', 'Tavern', 'Ale House', 'Pub', 'Bar & Kitchen', 'Beer Garden', 'Brewery'];
const SNACK = ['Bun', 'Roll', 'Burger', 'Momo', 'Frankie', 'Shawarma', 'Puff', 'Chaat', 'Pav', 'Vada Pav', 'Bajji', 'Gobi', 'Maggi', 'Sandwich'];
const SNACK2 = ['Bros', 'Factory', 'Express', 'Point', 'Corner', 'Junction', 'Station', 'Adda', 'Stop', 'Wala', 'Republic', 'Hub'];
const SWEET = ['Scoop', 'Cone', 'Kulfi', 'Sundae', 'Gadbad', 'Falooda', 'Gelato', 'Softy', 'Tender Coconut', 'Mango'];
const SWEET2 = ['Studio', 'Parlour', 'Lab', 'Corner', 'Bar', 'Point', 'Stop', 'Republic'];
const BAKE = ["Iyengar's Bakery", 'Ayyangar Bake House', 'Hot Chips & Bakery', 'Sweets & Bakery', 'Puff House', 'Rusk Corner', 'Honey Cake Point', 'Dil Pasand Bakery'];
const BAKE1 = ['Sri', 'New', 'Hosa', 'Namma', 'Royal', 'Famous', 'Original', 'Old', 'Grand', 'Hot'];
const SHOP1 = ['Ganesh', 'Lakshmi', 'Balaji', 'Sai', 'Raj', 'Royal', 'Classic', 'Super', 'Galaxy', 'Prestige-ish', 'Namma', 'Silicon', 'Garden City', 'Pink', 'Cauvery'];
const SHOP2 = [['Mobiles', 'ಮೊಬೈಲ್ಸ್'], ['Medicals', 'ಮೆಡಿಕಲ್ಸ್'], ['Opticals', 'ಕನ್ನಡಕ'], ['Textiles', 'ಬಟ್ಟೆ ಅಂಗಡಿ'], ['Silks', 'ರೇಷ್ಮೆ'], ['Provision Stores', 'ದಿನಸಿ'],
  ['Electricals', 'ಎಲೆಕ್ಟ್ರಿಕಲ್ಸ್'], ['Hardware', 'ಹಾರ್ಡ್‌ವೇರ್'], ['Xerox & Printouts', 'ಜೆರಾಕ್ಸ್'], ['Hair Saloon', 'ಸಲೂನ್'], ['Tailors', 'ಟೈಲರ್ಸ್'],
  ['Footwear', 'ಪಾದರಕ್ಷೆ'], ['Fancy Stores', 'ಫ್ಯಾನ್ಸಿ'], ['Book House', 'ಪುಸ್ತಕ'], ['Tyres', 'ಟೈರ್ಸ್'], ['Jewellers', 'ಆಭರಣ'], ['Flowers', 'ಹೂವು'], ['Laptop Repairs', 'ರಿಪೇರಿ']];
const TECHSHOP = ['Ctrl+Alt+Chai', 'Git Pull Juice Bar', 'Stack Overflow Dosa', '404 Biryani Not Found', 'Ping Pong Paratha', 'Localhost Lassi',
  'Kubernetes Kaapi', 'Pull Request Puri', 'Null Pointer Noodles', 'Async Appam', 'Docker Dabeli', 'Cache Miss Chaat', 'Prod Down Pakoda', 'Standup Sandwich',
  'Jira Juice Centre', 'Slack Off Snacks', 'Lunch & Learn Meals', 'Reply-All Rolls', 'Out of Office Omelette', 'Story Points Sweets'];

// one generator per map build: names come out unique, in a fixed order
export function createNamer(seed = 1729) {
  const rng = makeRng(seed), used = new Set(), pick = (a) => a[Math.floor(rng() * a.length)];
  const uniq = (make) => { for (let i = 0; i < 40; i++) { const n = make(); if (!used.has(n)) { used.add(n); return n; } } const n = `${make()} ${used.size}`; used.add(n); return n; };
  const tech = TECHSHOP.slice();
  const KINDS = {
    darshini: () => uniq(() => `${pick(PREFIX)} ${pick(DEITY)} ${pick(TIFFIN)}`),
    restaurant: () => uniq(() => (rng() < 0.12 && tech.length ? tech.splice(Math.floor(rng() * tech.length), 1)[0] : rng() < 0.5 ? `${pick(TECH)} ${pick(DISH)}` : `${pick(PREFIX)} ${pick(DEITY)} ${pick(TIFFIN)}`)),
    cafe: () => uniq(() => (rng() < 0.3 ? `${pick(PLACE)} ${pick(['Coffee', 'Kaapi', 'Brews', 'Roasters'])}` : `${pick(BREW)} ${pick(BREW2)}`)),
    pub: () => uniq(() => (rng() < 0.6 ? `${pick(PLACE)} ${pick(BAR)}` : `${pick(['Hoppy', 'Malty', 'Tipsy', 'Pint-Sized', 'Barrel', 'Whistling', 'Pitcher', 'Fermented', 'Foamy', 'Swalpa'])} ${pick(BAR)}`)),
    fast_food: () => uniq(() => `${pick(SNACK)} ${pick(SNACK2)}`),
    ice_cream: () => uniq(() => `${pick(SWEET)} ${pick(SWEET2)}`),
    bakery: () => uniq(() => `${pick(BAKE1)} ${pick(BAKE)}`),
    shop: () => { let kn = ''; const n = uniq(() => { const [en, k] = pick(SHOP2); kn = k; return `${pick(SHOP1)} ${en}`; }); return [n, kn]; },
  };
  KINDS.bar = KINDS.pub;
  return { name: (kind) => (KINDS[kind] || KINDS.restaurant)(), shop: KINDS.shop, used };
}

// a café, restaurant or pub from OpenStreetMap: its famous-chain parody, or a generated name of the right kind
export function poiParody(p, namer) {
  const fixed = parodyOf(p.n);
  if (fixed) return fixed;
  const n = (p.n || '').toLowerCase();
  const kind = /bakery|bake|iyengar|ayyangar/.test(n) ? 'bakery'
    : /darshini|tiffin|bhavan|sagar|udupi|upahar|idli|dosa|mess|meals/.test(n) ? 'darshini' : p.a;
  return namer.name(kind);
}

// the shop signs on every street: the hand-made ones first, then generated food spots and shops up to `count`.
// Each is [english, kannada line, background, text colour, door theme or null].
const KIND_STYLE = {
  darshini: ['#c62828', '#fff59d', 'ದರ್ಶಿನಿ · ತಿಂಡಿ'], cafe: ['#3e2723', '#ffcc80', 'ಕಾಫಿ · COFFEE'], bakery: ['#f9a825', '#4e2600', 'ಬೇಕರಿ'],
  pub: ['#1b1b1b', '#ffb300', 'ಪಬ್ · ಬಿಯರ್'], fast_food: ['#e65100', '#ffffff', 'ಫಾಸ್ಟ್ ಫುಡ್'], ice_cream: ['#ad1457', '#ffffff', 'ಐಸ್ ಕ್ರೀಂ'],
  restaurant: ['#00695c', '#ffffff', 'ಹೋಟೆಲ್ · ಊಟ'],
};
const SHOP_COLS = [['#1565c0', '#ffffff'], ['#2e7d32', '#ffffff'], ['#6a1b9a', '#ffd54f'], ['#00897b', '#ffffff'], ['#ad1457', '#ffffff'], ['#37474f', '#ffeb3b'], ['#5d4037', '#fff3e0'], ['#ef6c00', '#1a1a1a']];
const DOOR = { darshini: 'darshini', restaurant: 'darshini', cafe: 'cafe', bakery: 'bakery', pub: 'pub', fast_food: 'cafe', ice_cream: 'cafe' };
export function genericSigns(handmade, namer, count = 256) {
  const out = handmade.map(([en, kn, bg, fg], i) => [en, kn, bg, fg, ({ 0: 'darshini', 1: 'darshini', 2: 'cafe', 3: 'bakery', 6: 'darshini', 7: 'darshini', 8: 'pub', 10: 'darshini', 12: 'cafe' })[i] || null]);
  for (const s of handmade) namer.used.add(s[0].toLowerCase());
  const order = ['darshini', 'shop', 'cafe', 'shop', 'restaurant', 'shop', 'bakery', 'fast_food', 'shop', 'pub', 'shop', 'ice_cream'];
  for (let i = 0; out.length < count; i++) {
    const k = order[i % order.length];
    if (k === 'shop') { const [n, kn] = namer.shop(); const [bg, fg] = SHOP_COLS[i % SHOP_COLS.length]; out.push([n, kn, bg, fg, null]); continue; }
    const [bg, fg, kn] = KIND_STYLE[k];
    out.push([namer.name(k), kn, bg, fg, DOOR[k]]);
  }
  return out;
}
