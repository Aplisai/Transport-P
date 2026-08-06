export const PersonParcel = ({ className = "", ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
    {...props}
  >
    {/* tête (profil, regard vers la droite) */}
    <circle cx="6.7" cy="4" r="2.7" />
    {/* torse debout */}
    <rect x="4.9" y="6" width="3.5" height="9" rx="1.7" />
    {/* bras tendus vers l'avant tenant le colis */}
    <rect x="6" y="8.4" width="8.6" height="2.5" rx="1.25" />
    {/* colis dans les mains, devant */}
    <rect x="12.4" y="5" width="7.4" height="7.4" rx="1.4" />
    {/* jambes debout, sans pas */}
    <rect x="4.9" y="13.6" width="1.9" height="8.2" rx="0.95" />
    <rect x="7.1" y="13.6" width="1.9" height="8.2" rx="0.95" />
    {/* pieds orientés vers la droite */}
    <rect x="4.9" y="20.1" width="3.4" height="1.9" rx="0.95" />
    <rect x="7.1" y="20.1" width="3.6" height="1.9" rx="0.95" />
  </svg>
);
