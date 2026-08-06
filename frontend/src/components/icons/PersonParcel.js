export const PersonParcel = ({ className = "", strokeWidth = 1.8, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    {/* tête */}
    <circle cx="12" cy="3.6" r="2.3" />
    {/* épaules */}
    <path d="M8.6 8.3 h6.8" />
    {/* bras qui descendent tenir le colis */}
    <path d="M8.6 8.3 Q7.1 9.7 7.8 11.2" />
    <path d="M15.4 8.3 Q16.9 9.7 16.2 11.2" />
    {/* colis tenu devant */}
    <rect x="7.5" y="11" width="9" height="6.3" rx="1" />
    <path d="M12 11 v6.3" />
    <path d="M7.5 14.15 h9" />
    {/* jambes */}
    <path d="M9.7 17.3 L9 21" />
    <path d="M14.3 17.3 L15 21" />
  </svg>
);
