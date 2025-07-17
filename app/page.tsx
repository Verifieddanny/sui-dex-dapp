"use client"

import { useState, useEffect } from "react"
import { useCurrentAccount } from "@mysten/dapp-kit"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { PoolOverview } from "@/components/pool-overview"
import { LiquidityCard } from "@/components/liquidity-card"
import { SwapCard } from "@/components/swap-card"
import { WelcomeScreen } from "@/components/welcome-screen"
import { cn } from "@/lib/utils"
import { AdminPanel } from "@/components/admin-panel"

export default function Home() {
  const account = useCurrentAccount()
  const [isBlurred, setIsBlurred] = useState(true)
  const [showContent, setShowContent] = useState(false)

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      setIsBlurred(false)
      setShowContent(true)
    }, 400)
    return () => clearTimeout(initialTimer)
  }, [])

  useEffect(() => {
    if (account) {
      setIsBlurred(true)
      setShowContent(false)
      const connectTimer = setTimeout(() => {
        setIsBlurred(false)
        setShowContent(true)
      }, 400)
      return () => clearTimeout(connectTimer)
    } else {
      setShowContent(false)
    }
  }, [account])

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main
        className={cn(
          "flex-1 container mx-auto p-4 md:p-6 lg:p-8 transition-[filter] duration-500 ease-out",
          isBlurred ? "filter blur-lg" : "filter-none", // Increased blur for more impact
        )}
      >
        {!account ? (
          <WelcomeScreen />
        ) : (
          <div className={cn("transition-opacity duration-500", showContent ? "opacity-100" : "opacity-0")}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              {" "}
              {/* Increased gap */}
              <div className="lg:col-span-1">
                <PoolOverview />
              </div>
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <LiquidityCard />
                <SwapCard />
              </div>
              <div className="lg:col-span-3">
                <AdminPanel />
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
