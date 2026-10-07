export const getToken = () => localStorage.getItem("adminToken");
export const logout = () => localStorage.removeItem("adminToken");

export async function api(path, { method = "GET", body, redirectOnUnauthorized = true } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path.startsWith("/admin") && path !== "/admin/login") {
    logout();
    if (redirectOnUnauthorized) window.location.href = "/admin/login";
  }
  if (!res.ok) throw Object.assign(new Error(data.error || "An error occurred."), { details: data.details });
  return data;
}
