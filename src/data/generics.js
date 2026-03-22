// src/data/generics.js
// ─────────────────────────────────────────────────────────
// TEAMMATE C — This is your main file.
// Prices are per strip (not monthly) — much more accurate
// for acute medicines like antibiotics, fever, etc.
// Prices sourced from 1mg.com / PharmEasy (free to browse)
// ─────────────────────────────────────────────────────────

const genericsData = require('./generics.json');

// ─────────────────────────────────────────────────────────
// Normalize a medicine name before matching.
// Strips dosage forms, strengths, punctuation.
//
// Examples:
//   "Tab. Crocin 500mg"   →  "crocin"
//   "CAP. Augmentin 625"  →  "augmentin"
//   "Syp. Benadryl 100ml" →  "benadryl"
//   "Pantop-40"           →  "pantop"
// ─────────────────────────────────────────────────────────
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .replace(/\b(tab\.?|cap\.?|syp\.?|inj\.?|oint\.?|susp\.?|drops?|cream|gel|lotion|spray|inhaler|patch)\b/g, '')
    .replace(/\d+(\.\d+)?\s*(mg|ml|mcg|g|iu|mmol|%)/g, '')
    .replace(/\b\d+\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────
// Score how well two normalized names match.
//   3 = exact match
//   2 = one contains the other
//   1 = first significant word matches
//   0 = no match
// ─────────────────────────────────────────────────────────
function matchScore(queryNorm, brandNorm) {
  if (!queryNorm || !brandNorm) return 0;
  if (queryNorm === brandNorm) return 3;
  if (queryNorm.includes(brandNorm) || brandNorm.includes(queryNorm)) return 2;

  const queryWords = queryNorm.split(' ').filter((w) => w.length > 2);
  const brandWords = brandNorm.split(' ').filter((w) => w.length > 2);
  if (queryWords.length > 0 && brandWords.length > 0 && queryWords[0] === brandWords[0]) return 1;

  return 0;
}

// ─────────────────────────────────────────────────────────
// Find a generic alternative for a brand medicine name.
//
// @param {string} brandName - Raw name from prescription
// @returns {object|null} - Matching entry, or null
// ─────────────────────────────────────────────────────────
function findGeneric(brandName) {
  if (!brandName || typeof brandName !== 'string') return null;

  const queryNorm = normalizeName(brandName);
  if (!queryNorm) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const entry of genericsData) {
    const brandNorm = normalizeName(entry.brand);
    const score = matchScore(queryNorm, brandNorm);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
    if (bestScore === 3) break;
  }

  return bestScore >= 1 ? bestMatch : null;
}

// ─────────────────────────────────────────────────────────
// Calculate savings per strip for each medicine.
// Note: We use per-strip pricing because:
//   - Acute medicines (fever, antibiotics) are bought per course
//   - Even chronic medicines are more honestly compared per strip
//
// @param {Array} medicines - From Claude: [{ name, dose, ... }]
// @returns {object} - Savings summary
// ─────────────────────────────────────────────────────────
function calculateSavings(medicines) {
  if (!Array.isArray(medicines) || medicines.length === 0) {
    return {
      results: [],
      totalBrandCost: 0,
      totalGenericCost: 0,
      totalSaving: 0,
    };
  }

  let totalBrand = 0;
  let totalGeneric = 0;

  const results = medicines.map((med) => {
    const match = findGeneric(med.name);

    if (match) {
      totalBrand += match.price_per_strip;
      totalGeneric += match.generic_price_per_strip;

      return {
        original: med.name,
        genericName: match.generic_name,
        brandPrice: match.price_per_strip,
        genericPrice: match.generic_price_per_strip,
        tabletsPerStrip: match.tablets_per_strip,
        saving: match.price_per_strip - match.generic_price_per_strip,
        note: match.note || null,
      };
    }

    return {
      original: med.name,
      genericName: null,
      brandPrice: null,
      genericPrice: null,
      tabletsPerStrip: null,
      saving: 0,
      note: 'No generic alternative found in our database',
    };
  });

  return {
    results,
    totalBrandCost: totalBrand,
    totalGenericCost: totalGeneric,
    totalSaving: totalBrand - totalGeneric,
  };
}

// ─────────────────────────────────────────────────────────
// Format savings into a readable Telegram message.
//
// @param {object} savingsData - Output from calculateSavings()
// @returns {string} - Telegram-formatted message
// ─────────────────────────────────────────────────────────
function formatSavingsMessage(savingsData) {
  const { results, totalBrandCost, totalSaving } = savingsData;

  if (!results || results.length === 0) {
    return '💊 No medicines found to check for generic alternatives.';
  }

  let message = '💊 *Generic Medicine Alternatives*\n\n';

  for (const r of results) {
    if (r.genericName) {
      message += `*${r.original}*\n`;
      message += `→ Generic: ${r.genericName}\n`;
      message += `→ Brand: ₹${r.brandPrice}/strip  |  Generic: ₹${r.genericPrice}/strip\n`;
      message += `→ You save: *₹${r.saving} per strip* 💰\n`;
      if (r.note) message += `→ _${r.note}_\n`;
      message += '\n';
    } else {
      message += `*${r.original}*\n→ ${r.note}\n\n`;
    }
  }

  if (totalSaving > 0) {
    const afterCost = totalBrandCost - totalSaving;
    message += `─────────────────\n`;
    message += `💸 *Total saving on this prescription: ₹${totalSaving}*\n`;
    message += `_(₹${totalBrandCost} → ₹${afterCost})_\n\n`;
    message += `⚠️ _Always consult your doctor before switching to a generic medicine._`;
  } else {
    message += `─────────────────\n`;
    message += `ℹ️ _No generic savings found for your current medicines._\n`;
    message += `⚠️ _Always consult your doctor before making any changes._`;
  }

  return message;
}

// ─────────────────────────────────────────────────────────
// Test utility — run from terminal to verify matching:
//
//   node -e "require('./src/data/generics').testNormalize()"
// ─────────────────────────────────────────────────────────
function testNormalize() {
  const testCases = [
    'Tab. Crocin 500mg',
    'CAP. Augmentin 625',
    'Syp. Benadryl 100ml',
    'Pantop-40',
    'Metformin HCl 500',
    'GLYCOMET 500 MG',
    'Tab Dolo650',
    'Telma 40mg',
    'Inj. Monocef 1g',
    'Becosules Capsules',
  ];

  console.log('=== normalizeName() + findGeneric() test ===\n');
  for (const t of testCases) {
    const normalized = normalizeName(t);
    const match = findGeneric(t);
    console.log(`Input:      "${t}"`);
    console.log(`Normalized: "${normalized}"`);
    if (match) {
      console.log(`Match:      ${match.brand} → ${match.generic_name}`);
      console.log(`Saving:     ₹${match.brand_price_strip - match.generic_price_strip} per strip`);
    } else {
      console.log(`Match:      null`);
    }
    console.log('');
  }
}

module.exports = { findGeneric, calculateSavings, formatSavingsMessage, testNormalize };