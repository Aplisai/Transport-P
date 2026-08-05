import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // Si l'erreur vient d'un ancien fichier en cache (PWA), on nettoie et on recharge
    if (typeof caches !== "undefined") {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary"
          className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F4F4F5] p-6 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#17BEBB] text-white">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </div>
          <div>
            <h1 className="font-head text-lg font-semibold text-[#14161C]">Une erreur est survenue</h1>
            <p className="mt-1 text-sm text-gray-500">
              Rechargez la page pour continuer. Vos données ne sont pas perdues.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            data-testid="error-boundary-reload"
            className="rounded-full bg-[#14161C] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#2a2d36] transition-[background-color]"
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
