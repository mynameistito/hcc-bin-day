import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "default" | "outline";
}

const buttonTypeProps = (
  type: ButtonHTMLAttributes<HTMLButtonElement>["type"]
): Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type"> => {
  if (type === "submit") {
    return { type: "submit" };
  }
  if (type === "reset") {
    return { type: "reset" };
  }
  return { type: "button" };
};

export const Button = ({
  className = "",
  variant = "default",
  type = "button",
  ...props
}: ButtonProps) => (
  <button
    {...props}
    type="button"
    {...buttonTypeProps(type)}
    className={`inline-flex items-center justify-center rounded-xl px-6 py-3.5 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#668747] disabled:pointer-events-none disabled:opacity-60 ${variant === "default" ? "bg-[#174e39] text-white hover:bg-[#226449]" : "border border-[#d6ddd4] bg-white text-[#33483a] hover:bg-[#f6f7f2]"} ${className}`}
  />
);
