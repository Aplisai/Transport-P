import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "";
    const method = (error.config?.method || "get").toLowerCase();
    // Appels d'auth (login/register/me/forgot/reset) et lecture de favoris en
    // arrière-plan ne doivent jamais déclencher une déconnexion "session expirée".
    const isAuthEndpoint = url.includes("/auth/");
    const isBackgroundFavRead = url.includes("/favorites") && method === "get";
    if (
      error.response?.status === 401 &&
      !isAuthEndpoint &&
      !isBackgroundFavRead &&
      onUnauthorized
    ) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Une erreur est survenue. Réessayez.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
