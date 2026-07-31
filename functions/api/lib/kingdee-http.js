export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
export function safeText(value, max = 1000) {
  return String(value ?? "").replace(/(appsecret|password|authorization|cookie)\s*[:=]\s*[^,;\s]+/gi, "$1=[REDACTED]").slice(0, max);
}
export function roleFromRequest(request) {
  return String(request.headers.get("x-aeronex-role") || "").trim().toLowerCase();
}
export function userFromRequest(request) {
  return safeText(request.headers.get("x-aeronex-user") || "Unknown", 160);
}
export function requireAdminTech(request) {
  const role = roleFromRequest(request);
  if (role.includes("admin") || role.includes("technician") || role.includes("tech")) return null;
  return json({ ok: false, error: "Admin or Technician access only." }, 403);
}
export function requireAdmin(request) {
  if (roleFromRequest(request).includes("admin")) return null;
  return json({ ok: false, error: "Admin access only." }, 403);
}
