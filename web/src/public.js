export async function publicApi(path) {
  const response = await fetch(`/api/public${path}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load election updates.");
  return data;
}
