"use client"

import { SunIcon, MoonIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "next-themes"
import { WalletConnectionButton } from "./wallet-connection-button"

export function Header() {
  const { theme, setTheme } = useTheme()
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between p-4 border-b border-border bg-background text-foreground">
      <div className="flex items-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Sui LP DEX</h1>
      </div>
      <div className="flex items-center space-x-4">
        <WalletConnectionButton />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-foreground hover:bg-secondary transition-colors duration-200"
        >
          {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </header>
  )
}
