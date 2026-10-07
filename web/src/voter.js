export const vToken = () => sessionStorage.getItem("voterToken");

export async function vapi(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/vote${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(vToken() ? { Authorization: `Bearer ${vToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || "An error occurred.");
    e.status = res.status;
    e.code = data.code;
    throw e;
  }
  return data;
}
