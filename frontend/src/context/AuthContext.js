import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api, setUnauthorizedHandler, setToken } from "@/lib/api";
import { toast } from "sonner";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking
  const [favorites, setFavorites] = useState([]);
  const [expiredTick, setExpiredTick] = useState(0);
  const userRef = useRef(null);
  userRef.current = user;

  const refreshFavorites = useCallback(async () => {
    try {
      const { data } = await api.get("/favorites");
      setFavorites(data.map((p) => p.id));
    } catch {
      setFavorites([]);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const wasLoggedIn = !!userRef.current;
      setUser(false);
      setFavorites([]);
      if (wasLoggedIn) {
        toast.error("Session expirée. Veuillez vous reconnecter.");
        setExpiredTick((t) => t + 1);
      }
    });
  }, []);

  useEffect(() => {
    api
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data);
        refreshFavorites();
      })
      .catch(() => setUser(false));
  }, [refreshFavorites]);

  const onAuthed = async (u) => {
    if (u && u.token) setToken(u.token);
    setUser(u);
    await refreshFavorites();
  };

  const patchUser = (partial) =>
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));

  const logout = async () => {
    await api.post("/auth/logout");
    setToken(null);
    setUser(false);
    setFavorites([]);
  };

  const toggleFavorite = async (pointId) => {
    if (!user) return false;
    try {
      if (favorites.includes(pointId)) {
        const { data } = await api.delete(`/favorites/${pointId}`);
        setFavorites(data.favorites);
      } else {
        const { data } = await api.post("/favorites", { point_id: pointId });
        setFavorites(data.favorites);
      }
      return true;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, favorites, onAuthed, patchUser, logout, toggleFavorite, refreshFavorites, expiredTick }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
