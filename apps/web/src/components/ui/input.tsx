import type { InputHTMLAttributes } from "react";

export const Input = ({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className={`placeholder:text-placeholder focus-visible:ring-focus-leaf min-w-0 flex-1 rounded-xl px-4 py-3.5 text-base outline-none focus-visible:ring-2 ${className}`}
    {...props}
  />
);
