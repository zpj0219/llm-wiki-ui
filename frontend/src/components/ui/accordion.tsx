import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface AccordionContextValue {
  open: boolean
  toggle: () => void
}

const AccordionContext = React.createContext<AccordionContextValue | undefined>(undefined)

interface AccordionProps {
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}

export function Accordion({ children, defaultOpen = false, className }: AccordionProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  const toggle = React.useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  return (
    <AccordionContext.Provider value={{ open, toggle }}>
      <div className={cn("w-full", className)}>{children}</div>
    </AccordionContext.Provider>
  )
}

interface AccordionItemProps {
  children: React.ReactNode
  className?: string
}

export function AccordionItem({ children, className }: AccordionItemProps) {
  return <div className={cn("w-full", className)}>{children}</div>
}

interface AccordionTriggerProps {
  children: React.ReactNode
  className?: string
}

export function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const context = React.useContext(AccordionContext)
  if (!context) {
    throw new Error("AccordionTrigger must be used within Accordion")
  }

  const { open, toggle } = context

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "flex w-full items-center justify-between py-2 text-left font-medium transition-all hover:underline",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200",
          open && "transform rotate-180"
        )}
      />
    </button>
  )
}

interface AccordionContentProps {
  children: React.ReactNode
  className?: string
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const context = React.useContext(AccordionContext)
  if (!context) {
    throw new Error("AccordionContent must be used within Accordion")
  }

  const { open } = context

  if (!open) {
    return null
  }

  return <div className={cn("pb-2 pt-0", className)}>{children}</div>
}

