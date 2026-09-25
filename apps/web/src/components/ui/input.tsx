import type { InputHTMLAttributes } from "react";

export const Input = ({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={`min-w-0 flex-1 rounded-xl px-4 py-3.5 text-base outline-none placeholder:text-[#a0a8a0] focus-visible:ring-2 focus-visible:ring-[#a8c18b] ${className}`}
    {...props}
  />
);
