import { Button as AstryxButton } from "@astryxdesign/core/Button";
import type { ReactNode } from "react";

type Props = {
  variant?: "default" | "outline" | "ghost";
  children?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
};

const VARIANT = { default: "primary", outline: "secondary", ghost: "ghost" } as const;

/** Thin adapter so call sites keep their API while rendering the Astryx button. */
export function Button({ variant = "default", children, disabled, className, "aria-label": ariaLabel, ...rest }: Props) {
  return (
    <AstryxButton
      label={ariaLabel ?? "Action"}
      aria-label={ariaLabel}
      variant={VARIANT[variant]}
      size="lg"
      isDisabled={disabled}
      className={className}
      {...rest}
    >
      {children}
    </AstryxButton>
  );
}
