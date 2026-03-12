// src/ai/claude.js
// ─────────────────────────────────────────────────────────
// TEAMMATE A (You) — This is your main file.
// Uses OpenRouter API — free models, works in India.
// All three functions have the same signature —
// Teammate B's code does NOT need to change at all.
// ─────────────────────────────────────────────────────────

const fetch = require('node-fetch');
const Groq = require('groq-sdk');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const VISION_MODEL = 'openrouter/free';
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Helper: strips markdown code fences if the model wraps JSON in them
 */
function cleanJson(text) {
  return text.replace(/```json|```/g, '').trim();
}

/**
 * Call Groq API
 */
async function callGroq(content) {
  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content }],
  });
  return response.choices[0].message.content.trim();
}


/**
 * Correct any major errors from the vision model's extracted data using Groq
 */
async function correctPrescriptionData(parsed) {
  const corrected = await callGroq(`You are a medical data validator for Indian prescriptions.
Here is prescription data extracted by a vision model:
${JSON.stringify(parsed, null, 2)}

Fix ONLY things that are obviously wrong:
- duration in minutes/seconds → convert to likely days (e.g. "8 minutes" → "8 days")
- dose and frequency fields that are clearly swapped → swap them back
- nonsensical doctor_notes → set to null

Do NOT change medicine names, doses that look unusual but plausible, or anything you're unsure about.
Return ONLY the corrected JSON, no other text.`);

  try {
    return JSON.parse(cleanJson(corrected));
  } catch {
    return parsed; // if Groq messes up, just return original
  }
}


/**
 * Core function to call OpenRouter API
 */
async function callOpenRouter(model, messages, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/DuttaNeel07/DawaiSaathi',
        'X-Title': 'DawaiSathi',
      },
      body: JSON.stringify({ model, messages }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content.trim();
    }

    if (response.status === 429) {
      const wait = (i + 1) * 3000; // 3s, 6s, 9s
      console.log(`Rate limited, retrying in ${wait/1000}s... (attempt ${i+1}/${retries})`);
      await new Promise(res => setTimeout(res, wait));
      continue;
    }

    const err = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${err}`);
  }
  throw new Error('OpenRouter still rate limited after retries. Try again in a minute.');
}

/**
 * Parses a prescription image (as base64) and returns structured medicine data.
 */
async function parsePrescription(imageBase64, mediaType = 'image/jpeg') {
  const text = await callOpenRouter(VISION_MODEL, [
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mediaType};base64,${imageBase64}` },
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
  ]);

  try {
    return correctPrescriptionData(JSON.parse(cleanJson(text)));
  } catch {
    console.error('Model returned non-JSON:', text);
    return { error: 'Could not understand the prescription format. Please try again.' };
  }
}

/**
 * Explains a list of medicines in simple language.
 */
async function explainMedicines(medicines, language = 'en') {
  const langInstruction = language === 'hi'
    ? 'Respond in simple Hindi (Devanagari script). Use everyday words, not medical jargon.'
    : 'Respond in simple English. Use everyday words, not medical jargon.';

  const medList = medicines.map(m =>
    `- ${m.name}: ${m.dose || ''}, ${m.frequency || ''}, ${m.duration || ''}, ${m.instructions || ''}`
  ).join('\n');

  return callGroq(`

${langInstruction}
You are DawaiSathi, a friendly medicine helper for patients in India.
Explain the following medicines in a warm, simple way suitable for someone with no medical background.

For each medicine, briefly explain:
1. What it is / what it treats
2. How and when to take it
3. One important precaution

Keep each explanation to 2-3 sentences. Be encouraging and friendly.

Medicines:
${medList}`,
  )
}

/**
 * Checks for dangerous interactions between a list of medicine names.
 */
async function checkInteractions(medicineNames) {
  if (medicineNames.length < 2) return null;

  return callGroq(`
You are a pharmacist assistant. Check if there are any SIGNIFICANT drug interactions between these medicines:

${medicineNames.join(', ')}

If there are serious interactions, explain briefly in 1-2 sentences and say "Please consult your doctor."
If there are no significant interactions, just say "No major interactions found between these medicines."

Keep it simple and non-alarming unless the interaction is truly dangerous.`,
  )
}

module.exports = { parsePrescription, explainMedicines, checkInteractions };