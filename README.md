# Image Hosting untuk Vercel (Fixed)

## Struktur (penting!)

```
image-hosting-vercel-v2/
├── api/
│   └── upload.js      ← Endpoint /api/upload
├── index.html         ← Halaman depan
├── package.json
└── README.md
```

## Cara Deploy

1. Push folder ini ke GitHub
2. Import di Vercel
3. **Wajib** set Environment Variables:

| Name | Value |
|------|-------|
| `BLOB_READ_WRITE_TOKEN` | Dari Vercel → Storage → Blob |
| `API_KEYS` | `key1,key2,key3` (pisah koma) |

4. Redeploy selepas set env var

## Demo Key

Kalau `API_KEYS` belum diisi, gunakan:

```
demo-key-change-me
```

## Uji API

```bash
curl -X POST https://YOUR-APP.vercel.app/api/upload \
  -H "X-API-Key: demo-key-change-me" \
  -F "file=@test.jpg"
```
