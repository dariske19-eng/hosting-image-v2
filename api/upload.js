import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function getApiKey(req) {
  return (
    req.headers['x-api-key'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  );
}

function isValidKey(key) {
  const envKeys = (process.env.API_KEYS || process.env.API_KEY || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (envKeys.length === 0) {
    // Demo mode
    return key === 'demo-key-change-me';
  }
  return envKeys.includes(key);
}

function sendJson(res, status, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  res.status(status).json(data);
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method not allowed. Use POST.' });
  }

  // Check API Key
  const apiKey = getApiKey(req);
  if (!apiKey || !isValidKey(apiKey)) {
    return sendJson(res, 401, {
      success: false,
      error: 'Invalid or missing API Key. Use header: X-API-Key',
    });
  }

  // Check Blob token
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(res, 500, {
      success: false,
      error: 'BLOB_READ_WRITE_TOKEN belum di-set. Pergi Vercel → Storage → Blob → copy token → Environment Variables.',
    });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return sendJson(res, 400, {
        success: false,
        error: 'Content-Type mesti multipart/form-data',
      });
    }

    // Collect body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length > MAX_SIZE + 200000) {
      return sendJson(res, 400, { success: false, error: 'File terlalu besar (max 10MB)' });
    }

    // Simple multipart parser
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      return sendJson(res, 400, { success: false, error: 'Boundary tidak dijumpai' });
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];

    const boundaryBuf = Buffer.from('--' + boundary);
    let fileBuffer = null;
    let filename = 'image';
    let mime = 'application/octet-stream';

    let pos = 0;
    while (pos < buffer.length) {
      const start = buffer.indexOf(boundaryBuf, pos);
      if (start === -1) break;

      const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
      if (next === -1) break;

      const part = buffer.slice(start + boundaryBuf.length, next);

      // Skip leading \r\n
      let partStart = 0;
      if (part[0] === 0x0d && part[1] === 0x0a) partStart = 2;

      const headerEnd = part.indexOf('\r\n\r\n', partStart);
      if (headerEnd === -1) {
        pos = next;
        continue;
      }

      const headers = part.slice(partStart, headerEnd).toString('utf8');
      // body ends before trailing \r\n
      let bodyEnd = part.length;
      if (part[bodyEnd - 2] === 0x0d && part[bodyEnd - 1] === 0x0a) bodyEnd -= 2;

      const body = part.slice(headerEnd + 4, bodyEnd);

      if (headers.includes('name="file"') || headers.includes('name="image"')) {
        const fnMatch = headers.match(/filename="([^"]*)"/i);
        if (fnMatch) filename = fnMatch[1] || 'image';

        const ctMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
        if (ctMatch) mime = ctMatch[1].trim();

        fileBuffer = body;
        break;
      }

      pos = next;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return sendJson(res, 400, {
        success: false,
        error: 'Tiada file dijumpai. Guna field name "file" atau "image"',
      });
    }

    if (fileBuffer.length > MAX_SIZE) {
      return sendJson(res, 400, { success: false, error: 'File terlalu besar (max 10MB)' });
    }

    // Detect mime from magic bytes if needed
    if (!ALLOWED[mime]) {
      if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8) mime = 'image/jpeg';
      else if (fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50) mime = 'image/png';
      else if (fileBuffer[0] === 0x47 && fileBuffer[1] === 0x49) mime = 'image/gif';
      else if (fileBuffer.toString('ascii', 0, 4) === 'RIFF' && fileBuffer.toString('ascii', 8, 12) === 'WEBP')
        mime = 'image/webp';
    }

    if (!ALLOWED[mime]) {
      return sendJson(res, 400, {
        success: false,
        error: `Jenis fail tidak disokong: ${mime}. Hanya jpeg/png/gif/webp/svg/bmp`,
      });
    }

    const ext = ALLOWED[mime];
    const id = randomUUID();
    const pathname = `images/${id}.${ext}`;

    const blob = await put(pathname, fileBuffer, {
      access: 'public',
      contentType: mime,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return sendJson(res, 200, {
      success: true,
      id,
      url: blob.url,
      size: fileBuffer.length,
      contentType: mime,
      filename,
    });
  } catch (err) {
    console.error('Upload error:', err);
    return sendJson(res, 500, {
      success: false,
      error: err.message || 'Internal server error',
    });
  }
}
