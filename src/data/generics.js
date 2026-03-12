// src/data/generics.js
// ─────────────────────────────────────────────────────────
// TEAMMATE C — This is your main file.
// Add more entries to generics.json as you research.
// Prices sourced from 1mg.com / PharmEasy (free to browse)
// ─────────────────────────────────────────────────────────

const genericsData = require('./generics.json');

/**
 * Looks up a generic alternative for a brand medicine name.
 * Does a case-insensitive fuzzy match.
 * @param {string} brandName
 * @returns {object|null} Generic info or null if not found
 */
function findGeneric(brandName) {
  const query = brandName.toLowerCase().trim();

  // Exact match first
  const exact = genericsData.find(
    (d) => d.brand.toLowerCase() === query
  );
  if (exact) return exact;

  // Partial match (handles "Tab. Crocin 500" matching "Crocin")
  const partial = genericsData.find(
    (d) => query.includes(d.brand.toLowerCase()) || d.brand.toLowerCase().includes(query)
  );
  return partial || null;
}

/**
 * Given a list of medicine objects from Claude, return savings summary.
 * @param {Array} medicines
 * @returns {{ results: Array, totalMonthlyBrandCost: number, totalMonthlyGenericCost: number }}
 */
function calculateSavings(medicines) {
  let totalBrand = 0;
  let totalGeneric = 0;

  const results = medicines.map((med) => {
    const match = findGeneric(med.name);
    if (match) {
      totalBrand += match.brand_price_monthly;
      totalGeneric += match.generic_price_monthly;
      return {
        original: med.name,
        genericName: match.generic_name,
        brandPrice: match.brand_price_monthly,
        genericPrice: match.generic_price_monthly,
        saving: match.brand_price_monthly - match.generic_price_monthly,
        note: match.note || null,
      };
    }
    return {
      original: med.name,
      genericName: null,
      note: 'No generic alternative found',
    };
  });

  return {
    results,
    totalMonthlyBrandCost: totalBrand,
    totalMonthlyGenericCost: totalGeneric,
    totalMonthlySaving: totalBrand - totalGeneric,
  };
}

/**
 * Format the savings result into a readable Telegram message.
 */
function formatSavingsMessage(savingsData) {
  const { results, totalMonthlyBrandCost, totalMonthlySaving } = savingsData;

  let message = '💊 *Generic Medicine Alternatives*\n\n';

  for (const r of results) {
    if (r.genericName) {
      message += `*${r.original}*\n`;
      message += `→ Generic: ${r.genericName}\n`;
      message += `→ Brand price: ₹${r.brandPrice}/month | Generic: ₹${r.genericPrice}/month\n`;
      message += `→ You save: *₹${r.saving}/month* 💰\n\n`;
    } else {
      message += `*${r.original}*: ${r.note}\n\n`;
    }
  }

  if (totalMonthlySaving > 0) {
    message += `─────────────────\n`;
    message += `💸 *Total monthly saving: ₹${totalMonthlySaving}*\n`;
    message += `_(₹${totalMonthlyBrandCost} → ₹${totalMonthlyBrandCost - totalMonthlySaving} per month)_\n\n`;
    message += `⚠️ Always consult your doctor before switching to a generic medicine.`;
  }

  return message;
}

module.exports = { findGeneric, calculateSavings, formatSavingsMessage };
