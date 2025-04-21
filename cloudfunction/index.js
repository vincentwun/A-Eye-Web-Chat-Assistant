const functions = require('@google-cloud/functions-framework');
const fetch = require('node-fetch');

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

functions.http('geminiProxy', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-Model-Name');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const apiKey = req.headers['x-api-key'];
  const modelName = req.headers['x-model-name'];
  const requestBody = req.body;

  if (!apiKey) {
    res.status(400).json({ error: 'Missing X-Api-Key header' });
    return;
  }

  if (!modelName) {
    res.status(400).json({ error: 'Missing X-Model-Name header' });
    return;
  }

  if (!requestBody || typeof requestBody !== 'object' || Object.keys(requestBody).length === 0) {
    res.status(400).json({ error: 'Invalid or empty JSON request body' });
    return;
  }

  const geminiUrl = `${GEMINI_API_BASE_URL}${modelName}:generateContent?key=${apiKey}`;

  try {
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await geminiResponse.json();

    res.status(geminiResponse.status).json(responseData);

  } catch (error) {
    console.error('Error proxying request to Gemini:', error);
    let errorMessage = 'Internal Server Error proxying to Gemini API';
    if (error instanceof fetch.FetchError) {
      errorMessage = `Network error connecting to Gemini: ${error.message}`;
    } else if (error instanceof SyntaxError) {
      errorMessage = 'Error parsing Gemini API response (Non-JSON)';
    }

    res.status(500).json({ error: errorMessage });
  }
});