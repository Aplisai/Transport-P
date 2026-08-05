import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import MapApp from "@/pages/MapApp";

function App() {
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
