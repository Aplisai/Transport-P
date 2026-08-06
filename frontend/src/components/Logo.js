import { PersonParcel } from "@/components/icons/PersonParcel";

/* Logo officiel Transport P — badge turquoise + T blanc + porteur de colis */
export const Logo = ({ className = "" }) => (
  <div
    data-testid="app-logo"
    className={`flex h-7 items-center justify-center gap-0.5 rounded-lg bg-[#17BEBB] px-1.5 ${className}`}
  >
    <span className="font-head text-xl font-bold leading-none text-white">T</span>
    <PersonParcel className="h-[18px] w-[18px] text-black" />
  </div>
);
