"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

// Root: primary token when checked or indeterminate (responds to the active
// color theme), input border when unchecked. Mirrors switch.tsx conventions.
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // `inline-flex` is load-bearing, not decoration.
        //
        // Base UI 1.6's Checkbox.Root renders a <span>, and width/height are
        // ignored on inline elements — so `size-4` did nothing and the box
        // collapsed to a 1px-wide vertical line. It LOOKED fine anywhere the
        // parent was a flex container (the tag filter dropdown, the staged
        // contact list), because a flex item gets blockified and the size
        // then applies. Inside a plain <td> there is no such rescue, which
        // is why the contacts table appeared to have no checkboxes at all.
        //
        // Setting the display here means the component never depends on what
        // its parent happens to be.
        "peer inline-flex size-4 shrink-0 items-center justify-center",
        "cursor-pointer rounded-[4px] border border-input bg-card shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[checked]:border-primary data-[checked]:bg-primary data-[checked]:text-primary-foreground",
        "data-[indeterminate]:border-primary data-[indeterminate]:bg-primary data-[indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {props.indeterminate ? (
          <Minus className="size-3.5" />
        ) : (
          <Check className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
