import type { HTMLAttributes } from "react";

export const Card = ({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) => (
  <article
    className={`overflow-hidden rounded-[1.75rem] border border-[#e6e8df] bg-white shadow-[0_24px_70px_-40px_#293c2c] ${className}`}
    {...props}
  />
);
