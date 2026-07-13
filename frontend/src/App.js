import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import MapApp from "@/pages/MapApp";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <MapApp />
        <Toaster position="top-center" theme="dark" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
