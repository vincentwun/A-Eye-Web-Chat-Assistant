const functions = require('@google-cloud/functions-framework');
const { VertexAI, HarmCategory, HarmBlockThreshold } = require('@google-cloud/vertexai');
const http = require('http');

const LOCATION = 'us-central1';

let vertex_ai;
let projectId = null;

async function getProjectId() {
  if (projectId) {
    return projectId;
  }

  if (!process.env.GCP_PROJECT && !process.env.K_SERVICE) {
    console.warn('GCP_PROJECT or K_SERVICE env var not set. Assuming local or non-standard env.');
    projectId = process.env.GCP_PROJECT;
    if (!projectId) {
      throw new Error('Project ID could not be determined. Set GCP_PROJECT env var for local testing.');
    }
    console.log(`Using Project ID from env var: ${projectId}`);
    return projectId;
  }


  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET) {
    const options = {
      hostname: 'metadata.google.internal',
      port: 80,
      path: '/computeMetadata/v1/project/project-id',
      method: 'GET',
      headers: {
        'Metadata-Flavor': 'Google'
      }
    };

    return new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`Successfully fetched Project ID from metadata server: ${data}`);
            projectId = data;
            resolve(projectId);
          } else {
            console.error(`Error fetching project ID from metadata server. Status: ${res.statusCode}, Data: ${data}`);
            if (process.env.GCP_PROJECT) {
              console.warn(`Metadata failed, falling back to GCP_PROJECT env var: ${process.env.GCP_PROJECT}`);
              projectId = process.env.GCP_PROJECT;
              resolve(projectId);
            } else {
              reject(new Error(`Metadata server request failed with status ${res.statusCode} and no GCP_PROJECT fallback.`));
            }
          }
        });
      });

      req.on('error', (error) => {
        console.error('Error fetching project ID from metadata server:', error);
        if (process.env.GCP_PROJECT) {
          console.warn(`Metadata request error, falling back to GCP_PROJECT env var: ${process.env.GCP_PROJECT}`);
          projectId = process.env.GCP_PROJECT;
          resolve(projectId);
        } else {
          reject(error);
        }
      });

      req.end();
    });
  } else {
    throw new Error('Cannot determine Project ID: Not in a recognized GCP environment and GCP_PROJECT not set.');
  }
}

function initVertexAI(fetchedProjectId, location) {
  if (!vertex_ai) {
    if (!fetchedProjectId || !location) {
      console.error('Error: Project ID and LOCATION must be available for Vertex AI init.');
      throw new Error('Vertex AI client configuration missing.');
    }
    console.log(`Initializing Vertex AI for project ${fetchedProjectId} in ${location}`);
    vertex_ai = new VertexAI({ project: fetchedProjectId, location: location });
    console.log('Vertex AI Client Initialized.');
  }
  return vertex_ai;
}

functions.http('geminiProxyFunction', async (req, res) => {

  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Model-Name, x-api-key');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    console.warn(`Received non-POST request: ${req.method}`);
    return res.status(405).send('Method Not Allowed');
  }

  const modelName = req.headers['x-model-name'];
  if (!modelName) {
    console.error('Error: Missing X-Model-Name header');
    return res.status(400).send({ error: 'Missing X-Model-Name header' });
  }
  console.log(`Received request for model: ${modelName}`);

  const requestBody = req.body;
  if (!requestBody || !requestBody.contents) {
    console.error('Error: Invalid request body or missing contents');
    return res.status(400).send({ error: 'Invalid request body or missing contents' });
  }
  console.log('Received request body:', JSON.stringify(requestBody).substring(0, 500) + '...');

  try {
    const currentProjectId = await getProjectId();
    const vertexClient = initVertexAI(currentProjectId, LOCATION);

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const modelParams = {
      model: modelName,
      safety_settings: safetySettings,
    };

    if (requestBody.systemInstruction) {
      modelParams.systemInstruction = requestBody.systemInstruction;
    }

    if (requestBody.generationConfig) {
      modelParams.generationConfig = requestBody.generationConfig;
    }

    if (Array.isArray(requestBody.tools)) {
      const urlContextTool = requestBody.tools.find(tool => tool && typeof tool === 'object' && tool.hasOwnProperty('urlContext'));

      if (urlContextTool) {
        modelParams.groundingConfig = { urlContext: urlContextTool.urlContext };
      } else {
        const filteredTools = requestBody.tools.filter(Boolean);
        if (filteredTools.length > 0) {
          modelParams.tools = filteredTools;
        }
      }
    }

    const generativeModel = vertexClient.getGenerativeModel(modelParams);
    const contents = requestBody.contents;

    console.log(`Sending request to Vertex AI model: ${modelName} in project ${currentProjectId}`);
    const streamingResp = await generativeModel.generateContentStream({ contents });

    let aggregatedText = "";
    let lastChunk = null;

    for await (const item of streamingResp.stream) {
      if (item.promptFeedback && item.promptFeedback.blockReason) {
        console.error('Request blocked by prompt feedback:', item.promptFeedback);
        return res.status(400).send({
          error: `Request blocked due to prompt feedback. Reason: ${item.promptFeedback.blockReason}`,
          promptFeedback: item.promptFeedback
        });
      }

      if (item.candidates && item.candidates.length > 0 && item.candidates[0].content && item.candidates[0].content.parts && item.candidates[0].content.parts.length > 0) {
        const partText = item.candidates[0].content.parts[0].text;
        if (typeof partText === 'string') {
          aggregatedText += partText;
        }
        lastChunk = item;
      } else {
        if (item) {
          lastChunk = item;
        }
        console.log("Received a chunk without text content, possibly final metadata.");
      }
    }

    if (!lastChunk) {
      console.error('Error: No valid response or chunks received from Vertex AI stream.');
      if (streamingResp.response && streamingResp.response.promptFeedback && streamingResp.response.promptFeedback.blockReason) {
        console.error('Request blocked by initial prompt feedback:', streamingResp.response.promptFeedback);
        return res.status(400).send({
          error: `Request blocked. Reason: ${streamingResp.response.promptFeedback.blockReason}`,
          promptFeedback: streamingResp.response.promptFeedback
        });
      }
      return res.status(500).send({ error: 'Failed to get any response from Vertex AI stream' });
    }

    if (lastChunk.candidates && lastChunk.candidates.length > 0) {
      const lastCandidate = lastChunk.candidates[0];
      if (lastCandidate.finishReason && ['SAFETY', 'RECITATION', 'OTHER'].includes(lastCandidate.finishReason)) {
        console.error(`Content generation stopped due to finish reason: ${lastCandidate.finishReason}`, lastCandidate.safetyRatings);
        const finalResponse = {
          ...(lastChunk.usageMetadata && { usageMetadata: lastChunk.usageMetadata }),
          candidates: [{
            content: { role: 'model', parts: [{ text: aggregatedText }] },
            finishReason: lastCandidate.finishReason,
            safetyRatings: lastCandidate.safetyRatings || [],
            ...(lastCandidate.citationMetadata && { citationMetadata: lastCandidate.citationMetadata })
          }],
          ...(lastChunk.promptFeedback && { promptFeedback: lastChunk.promptFeedback }),
        };
        return res.status(400).send(finalResponse);
      }
    } else if (!aggregatedText) {
      console.error('Error: Stream finished, but no text content was aggregated and no clear blocking reason found in the last chunk.');
      return res.status(500).send({ error: 'Received empty or non-text response from Vertex AI' });
    }


    const finalResponse = {
      ...(lastChunk.usageMetadata && { usageMetadata: lastChunk.usageMetadata }),
      candidates: [{
        content: { role: 'model', parts: [{ text: aggregatedText }] },
        finishReason: lastChunk.candidates?.[0]?.finishReason || 'FINISH_REASON_UNSPECIFIED',
        safetyRatings: lastChunk.candidates?.[0]?.safetyRatings || [],
        ...(lastChunk.candidates?.[0]?.citationMetadata && { citationMetadata: lastChunk.candidates[0].citationMetadata })
      }],
      ...(lastChunk.promptFeedback && { promptFeedback: lastChunk.promptFeedback }),
    };


    console.log('Final aggregated response content being sent:', JSON.stringify(finalResponse));
    console.log('Sending aggregated response back to client.');
    res.status(200).send(finalResponse);
    console.log('Successfully sent response back to client.');

  } catch (error) {
    console.error('Error processing request:', error);
    let statusCode = 500;
    let errorMessage = error.message || 'An internal error occurred.';

    if (error instanceof Error && error.message?.includes('Metadata server request failed')) {
      statusCode = 503;
      errorMessage = 'Failed to contact metadata server.';
    } else if (error instanceof Error && error.message?.includes('Project ID could not be determined')) {
      statusCode = 500;
      errorMessage = 'Server configuration error: Project ID missing.';
    } else if (error.code === 5 || error.message?.includes("NOT_FOUND") || error.message?.includes("404")) {
      statusCode = 404;
      errorMessage = `Resource not found: ${error.message}`;
    } else if (error.code === 7 || error.message?.includes("PERMISSION_DENIED") || error.message?.includes("403")) {
      statusCode = 403;
      errorMessage = `Permission denied: ${error.message}`;
    } else if (error.code === 3 || error.message?.includes("INVALID_ARGUMENT") || error.message?.includes("400")) {
      statusCode = 400;
      errorMessage = `Invalid request argument: ${error.message}`;
    } else if (error.code === 8 || error.message?.includes("RESOURCE_EXHAUSTED") || error.message?.includes("429")) {
      statusCode = 429;
      errorMessage = `Quota exceeded: ${error.message}`;
    } else if (error.code === 13) {
      statusCode = 500;
      errorMessage = `Vertex AI internal error: ${error.message}`;
    } else if (error.code === 14 || error.message?.includes("UNAVAILABLE") || error.message?.includes("503")) {
      statusCode = 503;
      errorMessage = `Vertex AI service unavailable: ${error.message}`;
    }


    res.status(statusCode).send({
      error: `Request failed: ${errorMessage}`,
    });
  }
});