// api/ask.js
export default async function handler(req, res) {
  // Allow CORS (optional but good practice)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight (OPTIONS) requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Missing 'q' parameter" });
  }

  try {
    const apiUrl = `https://api.zenzxz.my.id/api/ai/copilotai?message=${encodeURIComponent(q)}&model=default`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'AI-Website/1.0'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Upstream API error:', response.status, text);
      return res.status(502).json({ error: 'AI service returned an error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'AI service unavailable' });
  }
}
