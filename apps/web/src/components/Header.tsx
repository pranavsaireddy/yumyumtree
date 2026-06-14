// Site header — navy chrome with the gold wordmark and logo. Server component;
// only the <CartButton /> island inside is client-side.

import Image from "next/image";
import AuthButton from "@/components/AuthButton";
import CartButton from "@/components/CartButton";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-navy shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="YumYumTree logo"
            width={48}
            height={48}
            priority
            className="h-11 w-11 sm:h-12 sm:w-12"
          />
          <div className="leading-tight">
            <p className="text-lg font-extrabold tracking-wide text-gold sm:text-xl">
              YUM YUM TREE
            </p>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-cream/70 sm:text-xs">
              Arabian Food Court
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <AuthButton />
          <CartButton />
        </div>
      </div>
    </header>
  );
}
