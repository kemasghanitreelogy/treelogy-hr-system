import { cn } from "@/lib/utils";
import { Slot } from "./slot";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-forest-600 text-cream hover:bg-forest-700 shadow-sm",
  secondary: "bg-forest-100 text-forest-700 hover:bg-forest-200",
  outline: "border border-line bg-panel text-ink hover:bg-sand/60",
  ghost: "text-muted hover:bg-sand/60 hover:text-ink",
  danger: "bg-clay text-white hover:bg-clay/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-9 w-9",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild,
  ...props
}: ButtonProps) {
  const Comp: React.ElementType = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-xl font-medium transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 focus-visible:ring-offset-2 focus-visible:ring-offset-cream",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
