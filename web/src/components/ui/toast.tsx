import * as React from "react"
import { cn } from "@/lib/utils"

interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "destructive"
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-md transition-colors",
          variant === "default" && "bg-primary text-primary-foreground",
          variant === "destructive" && "bg-destructive text-destructive-foreground",
          className
        )}
        {...props}
      />
    )
  }
)
Toast.displayName = "Toast"

interface ToastContainerProps extends React.HTMLAttributes<HTMLDivElement> {}

const ToastContainer = React.forwardRef<HTMLDivElement, ToastContainerProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("fixed top-4 z-[100] flex flex-col gap-2", className)}
        {...props}
      />
    )
  }
)
ToastContainer.displayName = "ToastContainer"

export { Toast, ToastContainer }
