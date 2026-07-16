import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setUnauthorizedHandler } from "@/lib/api";
import { toast } from "sonner";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking
  const [favorites, setFavorites] = useState([]);
  const [expiredTick, setExpiredTick] = useState(0);

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
      setUser((prev) => {
        if (prev) {
          toast.error("Session expirée. Veuillez vous reconnecter.");
          setExpiredTick((t) => t + 1);
        }
        return false;
      });
      setFavorites([]);
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
    setUser(u);
    await refreshFavorites();
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(false);
    setFavorites([]);
  };

  const toggleFavorite = async (pointId) => {
    if (!user) return false;
    if (favorites.includes(pointId)) {
      const { data } = await api.delete(`/favorites/${pointId}`);
      setFavorites(data.favorites);
    } else {
      const { data } = await api.post("/favorites", { point_id: pointId });
      setFavorites(data.favorites);
    }
    return true;
  };

  return (
    <AuthContext.Provider
      value={{ user, favorites, onAuthed, logout, toggleFavorite, refreshFavorites, expiredTick }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
