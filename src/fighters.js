// Fighter roster - all original fictional characters.
// Base stats 1-10: power, speed, defense, stamina, technique
// Grappling stats 1-10: wrestling (takedowns), submissions, takedownDef, clinch
// Specialty keys influence AI preferences and animation cadence.

export const SPECIALTIES = {
  striker:   { label: 'Striker',   clinchAffinity: 0.25, groundAffinity: 0.15, walkCadence: 1.00 },
  boxer:     { label: 'Boxer',     clinchAffinity: 0.45, groundAffinity: 0.10, walkCadence: 0.95 },
  karate:    { label: 'Karate',    clinchAffinity: 0.20, groundAffinity: 0.10, walkCadence: 1.10 },
  brawler:   { label: 'Brawler',   clinchAffinity: 0.60, groundAffinity: 0.35, walkCadence: 0.80 },
  muay_thai: { label: 'Muay Thai', clinchAffinity: 0.85, groundAffinity: 0.20, walkCadence: 1.00 },
  bjj:       { label: 'BJJ',       clinchAffinity: 0.70, groundAffinity: 0.95, walkCadence: 1.00 },
  wrestler:  { label: 'Wrestler',  clinchAffinity: 0.90, groundAffinity: 0.85, walkCadence: 0.92 },
  judo:      { label: 'Judo',      clinchAffinity: 0.90, groundAffinity: 0.70, walkCadence: 0.95 },
  taekwondo: { label: 'Taekwondo', clinchAffinity: 0.10, groundAffinity: 0.05, walkCadence: 1.15 },
  mma:       { label: 'All-rounder', clinchAffinity: 0.55, groundAffinity: 0.55, walkCadence: 1.00 },
};

// Weight classes — affect hp, speed modifier and animation scale.
export const WEIGHT_CLASSES = {
  flyweight:        { label: 'Flyweight',          kg: 57,  hpMul: 0.90, speedMul: 1.12, powerMul: 0.85, footstepBob: 1.15 },
  bantamweight:     { label: 'Bantamweight',       kg: 61,  hpMul: 0.94, speedMul: 1.08, powerMul: 0.90, footstepBob: 1.10 },
  featherweight:    { label: 'Featherweight',      kg: 66,  hpMul: 0.97, speedMul: 1.06, powerMul: 0.95, footstepBob: 1.05 },
  lightweight:      { label: 'Lightweight',        kg: 70,  hpMul: 1.00, speedMul: 1.03, powerMul: 1.00, footstepBob: 1.00 },
  welterweight:     { label: 'Welterweight',       kg: 77,  hpMul: 1.05, speedMul: 1.00, powerMul: 1.05, footstepBob: 0.95 },
  middleweight:     { label: 'Middleweight',       kg: 84,  hpMul: 1.10, speedMul: 0.97, powerMul: 1.10, footstepBob: 0.90 },
  light_heavyweight:{ label: 'Light Heavyweight',  kg: 93,  hpMul: 1.16, speedMul: 0.92, powerMul: 1.18, footstepBob: 0.85 },
  heavyweight:      { label: 'Heavyweight',        kg: 110, hpMul: 1.25, speedMul: 0.85, powerMul: 1.30, footstepBob: 0.80 },
};

export const ROSTER = [
  {
    id: 'kai',
    name: 'KAI',
    nickname: 'Thunder',
    style: 'Striker',
    specialty: 'striker',
    flag: '🌊',
    weight: 'Lightweight',
    weight_class: 'lightweight',
    stats: { power: 6, speed: 8, defense: 6, stamina: 8, technique: 7 },
    grappling: { wrestling: 4, submissions: 3, takedownDef: 6, clinch: 5 },
    palette: { skin: '#d8a17a', hair: '#1a1a1a', trunks: '#1862c8', accent: '#ffcc33', gloves: '#1862c8', shorts2: '#0a3a8a' },
    height: 1.02,
    build: 0.92,
    muscle: 0.8,
    special: { name: 'THUNDER STRIKE', kind: 'flying_knee' },
    bio: 'Coastal striker with relentless tempo.',
  },
  {
    id: 'tony',
    name: 'TONY',
    nickname: 'Iron Fist',
    style: 'Boxer',
    specialty: 'boxer',
    flag: '🥊',
    weight: 'Welterweight',
    weight_class: 'welterweight',
    stats: { power: 9, speed: 5, defense: 7, stamina: 7, technique: 8 },
    grappling: { wrestling: 3, submissions: 2, takedownDef: 5, clinch: 7 }, // heavy clinch-boxing
    palette: { skin: '#e6b78a', hair: '#3a2a1a', trunks: '#cc1133', accent: '#fff', gloves: '#aa0022', shorts2: '#7a0011' },
    height: 1.0,
    build: 1.08,
    muscle: 0.85,
    special: { name: 'IRON FURY', kind: 'haymaker' },
    bio: 'Heavy hands. Each cross can end a fight.',
  },
  {
    id: 'hiro',
    name: 'HIRO',
    nickname: 'Shadow Crane',
    style: 'Karate',
    specialty: 'karate',
    flag: '🥋',
    weight: 'Featherweight',
    weight_class: 'featherweight',
    stats: { power: 5, speed: 9, defense: 6, stamina: 8, technique: 9 },
    grappling: { wrestling: 3, submissions: 4, takedownDef: 7, clinch: 4 },
    palette: { skin: '#e8c098', hair: '#0a0a0a', trunks: '#f4f4f4', accent: '#cc1133', gloves: '#222', shorts2: '#cccccc' },
    height: 0.94,
    build: 0.82,
    muscle: 0.7,
    special: { name: 'CRANE FLURRY', kind: 'rapid_combo' },
    bio: 'Karate master, blink-and-miss footwork.',
  },
  {
    id: 'boris',
    name: 'BORIS',
    nickname: 'The Bear',
    style: 'Brawler',
    specialty: 'brawler',
    flag: '🐻',
    weight: 'Heavyweight',
    weight_class: 'heavyweight',
    stats: { power: 10, speed: 3, defense: 8, stamina: 9, technique: 5 },
    grappling: { wrestling: 6, submissions: 3, takedownDef: 8, clinch: 8 },
    palette: { skin: '#ddb088', hair: '#5a3a22', trunks: '#222', accent: '#cc0011', gloves: '#444', shorts2: '#0a0a0a' },
    height: 1.12,
    build: 1.32,
    muscle: 0.55,
    belly: 0.35,
    special: { name: 'BEAR HUG', kind: 'slam' },
    bio: 'Mountain of a man. Never tires, never falls easy.',
  },
  {
    id: 'rafa',
    name: 'RAFA',
    nickname: 'Mamba',
    style: 'BJJ',
    specialty: 'bjj',
    flag: '🐍',
    weight: 'Middleweight',
    weight_class: 'middleweight',
    stats: { power: 6, speed: 7, defense: 7, stamina: 9, technique: 10 },
    grappling: { wrestling: 7, submissions: 10, takedownDef: 9, clinch: 8 },
    palette: { skin: '#c08866', hair: '#1a0e08', trunks: '#1a8a3a', accent: '#ffcc33', gloves: '#0c5022', shorts2: '#0c5022' },
    height: 1.06,
    build: 0.96,
    muscle: 0.75,
    special: { name: 'GUILLOTINE', kind: 'submission' },
    bio: 'Submission wizard. Catches you slipping once - it\'s over.',
  },
  {
    id: 'amir',
    name: 'AMIR',
    nickname: 'Desert Storm',
    style: 'Muay Thai',
    specialty: 'muay_thai',
    flag: '🌪',
    weight: 'Middleweight',
    weight_class: 'middleweight',
    stats: { power: 8, speed: 7, defense: 6, stamina: 8, technique: 8 },
    grappling: { wrestling: 4, submissions: 3, takedownDef: 6, clinch: 10 }, // plum clinch king
    palette: { skin: '#c89060', hair: '#0a0a0a', trunks: '#cc9911', accent: '#000', gloves: '#aa6600', shorts2: '#7a4400' },
    height: 1.04,
    build: 1.04,
    muscle: 0.85,
    special: { name: 'SANDSTORM ELBOW', kind: 'spinning_elbow' },
    bio: 'Eight limbs of fury - elbows, knees, shins.',
  },
  {
    id: 'jin',
    name: 'JIN',
    nickname: 'Lightning',
    style: 'Taekwondo',
    specialty: 'taekwondo',
    flag: '⚡',
    weight: 'Lightweight',
    weight_class: 'lightweight',
    stats: { power: 6, speed: 10, defense: 5, stamina: 7, technique: 9 },
    grappling: { wrestling: 2, submissions: 3, takedownDef: 4, clinch: 3 },
    palette: { skin: '#ecc8a0', hair: '#0a0a0a', trunks: '#ffcc11', accent: '#1862c8', gloves: '#222', shorts2: '#cc8800' },
    height: 1.0,
    build: 0.86,
    muscle: 0.7,
    special: { name: 'LIGHTNING KICK', kind: 'spin_kick' },
    bio: 'Blinding speed. Head kicks come from nowhere.',
  },
  {
    id: 'diana',
    name: 'DIANA',
    nickname: 'Phoenix',
    style: 'All-rounder',
    specialty: 'mma',
    flag: '🔥',
    weight: 'Bantamweight',
    weight_class: 'bantamweight',
    stats: { power: 7, speed: 8, defense: 7, stamina: 8, technique: 8 },
    grappling: { wrestling: 6, submissions: 7, takedownDef: 7, clinch: 6 },
    palette: { skin: '#ddb088', hair: '#aa3322', trunks: '#ee5522', accent: '#ffcc33', gloves: '#cc2200', shorts2: '#aa2200' },
    height: 0.96,
    build: 0.9,
    muscle: 0.6,
    sex: 'f',
    special: { name: 'PHOENIX RISE', kind: 'rising_uppercut' },
    bio: 'Reborn from every loss, hotter every fight.',
  },
  {
    id: 'viktor',
    name: 'VIKTOR',
    nickname: 'The Anvil',
    style: 'Wrestling',
    specialty: 'wrestler',
    flag: '🤼',
    weight: 'Light Heavyweight',
    weight_class: 'light_heavyweight',
    stats: { power: 8, speed: 5, defense: 9, stamina: 10, technique: 7 },
    grappling: { wrestling: 10, submissions: 6, takedownDef: 10, clinch: 9 },
    palette: { skin: '#cda080', hair: '#7a5830', trunks: '#202a55', accent: '#c0c4cc', gloves: '#1a2040', shorts2: '#0a1030' },
    height: 1.08,
    build: 1.15,
    muscle: 0.92,
    special: { name: 'ANVIL SLAM', kind: 'slam' },
    bio: 'Freestyle wrestler. Drags you to the mat and empties the tank.',
  },
  {
    id: 'zara',
    name: 'ZARA',
    nickname: 'Tempest',
    style: 'Judo',
    specialty: 'judo',
    flag: '🥋',
    weight: 'Lightweight',
    weight_class: 'lightweight',
    stats: { power: 7, speed: 8, defense: 8, stamina: 8, technique: 9 },
    grappling: { wrestling: 9, submissions: 8, takedownDef: 9, clinch: 10 },
    palette: { skin: '#d8a680', hair: '#141018', trunks: '#2d1a3a', accent: '#e8b040', gloves: '#1a1020', shorts2: '#1a0a22' },
    height: 0.98,
    build: 0.92,
    muscle: 0.7,
    sex: 'f',
    special: { name: 'URA NAGE', kind: 'slam' },
    bio: 'Olympic judoka — one grip and you are in the air.',
  },
];

// === Uniform silhouette + per-fighter vibrant color palette ===============
// All fighters share an identical stickman silhouette body shape (same
// height, build, no belly, no sex-specific frame), but each one is rendered
// in a different VIBRANT body color so they're clearly visible against the
// dark arena background. Per-fighter HAIR (style + color) + GLOVE color
// gives each fighter an instantly readable identity. Stats / gameplay
// (power, speed, grappling, weight class…) are untouched.
const UNIFORM_HEIGHT = 1.0;
const UNIFORM_BUILD = 0.86;
const UNIFORM_MUSCLE = 0.45;

// Per-fighter palette:
//   body  — main silhouette color (vibrant, easily readable on dark bg)
//   hair  — contrasting hair color
//   glove — boxing-glove + waistband stripe color
//   hairStyle — read by render.js drawHead
const SIGNATURE = {
  kai:    { hairStyle: 'spiky',       body: '#1f78ff', hair: '#9ce8ff', glove: '#ffffff' }, // electric blue
  tony:   { hairStyle: 'mohawk',      body: '#e02030', hair: '#ffffff', glove: '#1a1a1a' }, // crimson
  hiro:   { hairStyle: 'topknot',     body: '#e8e8ec', hair: '#1a1a1a', glove: '#cc1133' }, // white karate
  boris:  { hairStyle: 'wild',        body: '#ff7d1a', hair: '#3a2010', glove: '#1a1a1a' }, // wild orange
  rafa:   { hairStyle: 'long_pony',   body: '#1ea84a', hair: '#1a0e08', glove: '#ffffff' }, // jungle green
  amir:   { hairStyle: 'crew',        body: '#e8b340', hair: '#1a1a1a', glove: '#1a1a1a' }, // sand gold
  jin:    { hairStyle: 'tall_spike',  body: '#ffd71a', hair: '#1a1a1a', glove: '#1a1a1a' }, // lightning yellow
  diana:  { hairStyle: 'long_flame',  body: '#ff3d8a', hair: '#3a0a18', glove: '#ffffff' }, // phoenix pink
  viktor: { hairStyle: 'buzz',        body: '#3a4eaa', hair: '#c4cdde', glove: '#ffffff' }, // royal navy
  zara:   { hairStyle: 'high_pony',   body: '#8a3dd6', hair: '#ffffff', glove: '#e8b340' }, // royal purple
};

for (const f of ROSTER) {
  f.height = UNIFORM_HEIGHT;
  f.build = UNIFORM_BUILD;
  f.muscle = UNIFORM_MUSCLE;
  delete f.belly;
  delete f.sex;
  const sig = SIGNATURE[f.id] || { hairStyle: 'short', body: '#ff3a3a', hair: '#ffffff', glove: '#ffffff' };
  f.hairStyle = sig.hairStyle;
  f.color = sig.body;
  f.palette = {
    ...f.palette,
    skin: sig.body,
    body: sig.body,
    hair: sig.hair,
    hairStyle: sig.hairStyle,
    gloves: sig.glove,
    accent: sig.glove,
    trunks: sig.body,
    shorts2: sig.body,
  };
}
// ===========================================================================

export function getFighter(id) {
  return ROSTER.find(f => f.id === id);
}

export function getWeightClass(f) {
  return WEIGHT_CLASSES[f.weight_class] || WEIGHT_CLASSES.lightweight;
}

export function getSpecialty(f) {
  return SPECIALTIES[f.specialty] || SPECIALTIES.mma;
}
