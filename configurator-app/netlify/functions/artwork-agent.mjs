import { randomUUID } from 'node:crypto';

import { getStore } from '@netlify/blobs';

// GPT Image 2 does not support transparent backgrounds. Apparel artwork must
// retain alpha, so keep this endpoint on GPT Image 1.5 until its replacement
// supports transparent PNG output.
const MODEL = process.env.DSPLN_ARTWORK_MODEL || 'gpt-image-1.5';
const STORE_NAME = 'dspln-preview-images';
const MAX_PROMPT_LENGTH = 2_000;
const MAX_SOURCE_BYTES = 6_000_000;
const MAX_OUTPUT_BYTES = 6_000_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

const isAllowedArtworkUrl = (rawUrl, requestUrl) => {
  try {
    const source = new URL(rawUrl);
    const request = new URL(requestUrl);
    return (
      source.protocol === 'https:' &&
      source.host === request.host &&
      source.pathname === '/.netlify/functions/preview-image'
    );
  } catch {
    return false;
  }
};

const productionPrompt = (operation, prompt) => {
  const common = `Create a finished raster artwork asset for placement on custom BJJ apparel.
Return only the artwork on a fully transparent background: no garment mockup, frame, room, scenery, checkerboard, drop shadow outside the subject, or added caption.
Preserve exact spelling and recognizable brand elements. Keep edges clean and the subject centered with modest transparent padding.
Do not add elements the customer did not request.`;

  if (operation === 'edit') {
    return `${common}
Use the supplied image as the source. Preserve every unmentioned part as faithfully as possible.
Customer edit: ${prompt}`;
  }

  return `${common}
Customer artwork request: ${prompt}`;
};

const callImageApi = async ({ apiKey, operation, prompt, source }) => {
  if (operation === 'edit') {
    const form = new FormData();
    form.set('model', MODEL);
    form.set('prompt', productionPrompt(operation, prompt));
    form.set('image', new Blob([source.bytes], { type: source.contentType }), source.filename);
    form.set('size', '1024x1024');
    form.set('quality', 'medium');
    form.set('background', 'transparent');
    form.set('output_format', 'png');
    return fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  }

  return fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: productionPrompt(operation, prompt),
      size: '1024x1024',
      quality: 'medium',
      background: 'transparent',
      output_format: 'png',
      n: 1,
    }),
  });
};

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Netlify.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json(
      {
        error: 'artwork_agent_unconfigured',
        message: 'Artwork creation is not available right now.',
      },
      503,
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const operation = payload.operation === 'edit' ? 'edit' : 'generate';
  const prompt = String(payload.prompt ?? '').trim().slice(0, MAX_PROMPT_LENGTH);
  if (!prompt) return json({ error: 'An artwork instruction is required' }, 400);

  try {
    let source = null;
    if (operation === 'edit') {
      const imageUrl = String(payload.imageUrl ?? '');
      if (!isAllowedArtworkUrl(imageUrl, request.url)) {
        return json({ error: 'Invalid source artwork URL' }, 400);
      }
      const sourceResponse = await fetch(imageUrl);
      if (!sourceResponse.ok) return json({ error: 'Source artwork could not be read' }, 400);
      const bytes = new Uint8Array(await sourceResponse.arrayBuffer());
      if (!bytes.byteLength || bytes.byteLength > MAX_SOURCE_BYTES) {
        return json({ error: 'Source artwork is too large' }, 413);
      }
      const contentType = sourceResponse.headers.get('content-type') || 'image/png';
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        return json({ error: 'Source artwork format is not supported' }, 400);
      }
      source = {
        bytes,
        contentType,
        filename: String(payload.filename ?? 'artwork.png').slice(0, 160),
      };
    }

    const response = await callImageApi({ apiKey, operation, prompt, source });
    const data = await response.json();
    if (!response.ok) {
      const requestId = response.headers.get('x-request-id') || undefined;
      const isDevDeploy = new URL(request.url).hostname.startsWith('dev--');
      console.error('[artwork-agent] OpenAI error', {
        status: response.status,
        requestId,
        code: data?.error?.code,
        type: data?.error?.type,
        message: data?.error?.message,
      });
      return json(
        {
          error: 'artwork_upstream',
          message:
            response.status === 429
              ? 'The artwork service is busy right now. Please retry this edit in a moment.'
              : 'The artwork edit did not finish. Please retry it; your original artwork is still available.',
          retryable: response.status === 429 || response.status >= 500,
          requestId,
          ...(isDevDeploy
            ? {
                diagnostic: {
                  code: data?.error?.code,
                  type: data?.error?.type,
                  message: data?.error?.message,
                },
              }
            : {}),
        },
        502,
      );
    }

    const encoded = data?.data?.[0]?.b64_json;
    if (typeof encoded !== 'string') {
      return json({ error: 'Artwork service returned no image' }, 502);
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.byteLength || bytes.byteLength > MAX_OUTPUT_BYTES) {
      return json({ error: 'Generated artwork is too large' }, 502);
    }

    const id = randomUUID();
    const key = `gi/ai/${new Date().toISOString().slice(0, 10)}/${id}.png`;
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });
    await store.set(key, bytes, {
      metadata: {
        contentType: 'image/png',
        createdAt: new Date().toISOString(),
        operation,
        model: MODEL,
      },
    });

    const origin = new URL(request.url).origin;
    return json({
      artwork: {
        id,
        url: `${origin}/.netlify/functions/preview-image?key=${encodeURIComponent(key)}`,
        filename: operation === 'edit' ? 'edited-artwork.png' : 'generated-artwork.png',
        width: 1024,
        height: 1024,
        operation,
      },
    });
  } catch (error) {
    console.error('[artwork-agent]', error);
    return json(
      {
        error: 'Artwork request failed',
        message: 'I could not create that artwork revision. Please try again.',
      },
      500,
    );
  }
};

export const config = {
  path: '/api/artwork-agent',
};
