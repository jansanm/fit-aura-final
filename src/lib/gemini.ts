export async function extractProductInfo(url: string) {
  const response = await fetch('/api/gemini/extract-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to extract product info');
  }
  
  return response.json();
}

export async function estimateMeasurements(photoBase64: string) {
  const response = await fetch('/api/gemini/estimate-measurements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoBase64 }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to estimate measurements');
  }
  
  return response.json();
}
