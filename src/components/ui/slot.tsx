import * as React from "react";
import { cn } from "@/lib/utils";

/** Minimal Slot: merges props (incl. className) onto a single child element. */
export function Slot({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) {
  if (React.isValidElement(children)) {
    const childProps = children.props as Record<string, unknown>;
    return React.cloneElement(children, {
      ...props,
      ...childProps,
      className: cn(props.className as string, childProps.className as string),
    } as Record<string, unknown>);
  }
  return null;
}
