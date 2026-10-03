import type { ButtonHTMLAttributes, Ref } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly ref?: Ref<HTMLButtonElement>;
  readonly variant?: "default" | "icon" | "outline";
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

const buttonVariantClass: Record<
  NonNullable<ButtonProps["variant"]>,
  string
> = {
  default: "bg-forest rounded-xl px-6 py-3.5 text-white hover:brightness-110",
  icon: "border-sage-border bg-surface text-step-copy hover:bg-panel rounded-full border text-lg",
  outline:
    "border-sage-border bg-surface text-step-copy hover:bg-panel rounded-xl border px-6 py-3.5",
};

export const Button = ({
  className = "",
  ref,
  variant = "default",
  type = "button",
  ...props
}: ButtonProps) => (
  <button
    {...props}
    ref={ref}
    type="button"
    {...buttonTypeProps(type)}
    className={`focus-visible:outline-focus-leaf inline-flex items-center justify-center font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-60 ${buttonVariantClass[variant]} ${className}`}
  />
);
