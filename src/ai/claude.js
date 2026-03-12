// src/ai/claude.js
// ─────────────────────────────────────────────────────────
// TEAMMATE A (You) — This is your main file.
// All Claude API calls go through here.
// ─────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-haiku-4-5-20251001'; // Cheapest Claude model — good enough for this

/**
 * Parses a prescription image (as base64) and returns structured medicine data.
 * @param {string} imageBase64 - Base64 encoded image
 * @param {string} mediaType - e.g. 'image/jpeg' or 'image/png'
 * @returns {Promise<Array>} Array of medicine objects
 */
async function parsePrescription(imageBase64, mediaType = 'image/jpeg') {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `You are a medical assistant helping patients in India understand their prescriptions.

Look at this prescription image and extract all medicines. 
Return ONLY valid JSON in this exact format, no other text:

{
  "medicines": [
    {
      "name": "medicine name",
      "dose": "e.g. 500mg or unknown",
      "frequency": "e.g. twice daily, after meals or unknown",
      "duration": "e.g. 5 days or unknown",
      "instructions": "any special instructions like take after food"
    }
  ],
  "doctor_notes": "any other important notes from the prescription or null"
}

If you cannot read the prescription clearly, return:
{ "error": "Cannot read prescription clearly. Please take a clearer photo." }`,
          },
        ],
      },
    ],
  });

  const text = response.content[0].text.trim();

  try {
    return JSON.parse(text);
  } catch {
    // Claude sometimes wraps JSON in backticks — strip them
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  }
}

/**
 * Explains a list of medicines in simple language.
 * @param {Array} medicines - Array of medicine objects from parsePrescription
 * @param {string} language - 'hi' for Hindi, 'en' for English
 * @returns {Promise<string>} Plain text explanation
 */
async function explainMedicines(medicines, language = 'en') {
  const langInstruction = language === 'hi'
    ? 'Respond in simple Hindi (Devanagari script). Use everyday words, not medical jargon.'
    : 'Respond in simple English. Use everyday words, not medical jargon.';

  const medList = medicines.map(m =>
    `- ${m.name}: ${m.dose || ''}, ${m.frequency || ''}, ${m.duration || ''}, ${m.instructions || ''}`
  ).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `${langInstruction}

You are DawaiSathi, a friendly medicine helper for patients in India.
Explain the following medicines in a warm, simple way suitable for someone with no medical background.

For each medicine, briefly explain:
1. What it is / what it treats
2. How and when to take it
3. One important precaution

Keep each explanation to 2-3 sentences. Be encouraging and friendly.

Medicines:
${medList}`,
      },
    ],
  });

  return response.content[0].text.trim();
}

/**
 * Checks for dangerous interactions between a list of medicine names.
 * Uses Claude's knowledge — no paid API needed.
 * @param {string[]} medicineNames
 * @returns {Promise<string>}
 */
async function checkInteractions(medicineNames) {
  if (medicineNames.length < 2) {
    return null; // Nothing to check with one medicine
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are a pharmacist assistant. Check if there are any SIGNIFICANT drug interactions between these medicines:

${medicineNames.join(', ')}

If there are serious interactions, explain briefly in 1-2 sentences and say "Please consult your doctor."
If there are no significant interactions, just say "No major interactions found between these medicines."

Keep it simple and non-alarming unless the interaction is truly dangerous.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

module.exports = { parsePrescription, explainMedicines, checkInteractions };
