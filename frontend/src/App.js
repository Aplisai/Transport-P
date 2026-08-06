import "@/App.css";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import MapApp from "@/pages/MapApp";

function App() {
  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof window !== "undefined" && window.__hideSplash) window.__hideSplash();
    }, 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="App">
      <ErrorBoundary>
        <AuthProvider>
          <MapApp />
          <Toaster position="top-center" theme="dark" richColors />
        </AuthProvider>
      </ErrorBoundary>
    </div>
  );
}

export default App;
