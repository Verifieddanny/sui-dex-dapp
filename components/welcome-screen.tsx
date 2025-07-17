"use client"

import { WalletConnectionButton } from "./wallet-connection-button"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"

export function WelcomeScreen() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-120px)] p-4 text-center overflow-hidden">
      {/* Tiling background animation */}
      <div className="absolute inset-0 tiling-background opacity-5 -bottom-7"></div>
      <div className="absolute inset-0 tiling-background opacity-10"></div>
      
      {/* Modern grid lines - horizontal */}
      <div className="absolute inset-x-0 top-[15%] h-[1px] bg-border opacity-60 z-0"></div>
      <div className="absolute inset-x-0 top-[35%] h-[1px] bg-border opacity-45 z-0"></div>
      <div className="absolute inset-x-0 top-[60%] h-[1px] bg-border opacity-70 z-0"></div>
      <div className="absolute inset-x-0 top-[80%] h-[1px] bg-border opacity-50 z-0"></div>
      
      {/* Modern grid lines - vertical */}
      <div className="absolute inset-y-0 left-[20%] w-[1px] bg-border opacity-60 z-0"></div>
      <div className="absolute inset-y-0 left-[40%] w-[1px] bg-border opacity-45 z-0"></div>
      <div className="absolute inset-y-0 left-[65%] w-[1px] bg-border opacity-65 z-0"></div>
      <div className="absolute inset-y-0 left-[85%] w-[1px] bg-border opacity-50 z-0"></div>
      
      {/* Purple faded glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-t from-primary/30 to-transparent blur-3xl pointer-events-none z-0"></div>
      
      <div className="relative z-10 w-full max-w-4xl p-10 md:p-12">
        <div className="flex justify-center mb-6">
          <div className="flex items-center -space-x-2">
            <Avatar className="size-8 border-2 border-background">
              <AvatarImage
                src="https://assets.basehub.com/fa068a12/6sGiFfUGTaMBQFStD16V5/figma-image-500x500.png?height=100&quality=100&width=100"
                alt="Avatar 1"
              />
              <AvatarFallback>U1</AvatarFallback>
            </Avatar>
            <Avatar className="size-8 border-2 border-background">
              <AvatarImage
                src="https://assets.basehub.com/fa068a12/XdbZC6Y1mPpNarRwWXWGs/103cd669723f80c168b5d84ec8bbe0a5.png?height=100&quality=100&width=100"
                alt="Avatar 2"
              />
              <AvatarFallback>U2</AvatarFallback>
            </Avatar>
            <Avatar className="size-8 border-2 border-background">
              <AvatarImage
                src="https://assets.basehub.com/fa068a12/eXjW9QO3AKz15Ru0lRyaL/97a514e9e8c98d647f06c12400f1f0bd-(1).png?height=100&quality=100&width=100"
                alt="Avatar 3"
              />
              <AvatarFallback>U3</AvatarFallback>
            </Avatar>
            <span className="ml-3 text-sm text-muted-foreground">1,254 on Sui LP DEX</span>
          </div>
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-foreground leading-tight mb-4">
          Streamlined Liquidity for Iterating Fast
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mt-6 leading-relaxed max-w-2xl mx-auto">
          Connect your wallet to dive into the next generation of decentralized finance on Sui. Experience seamless,
          secure, and efficient token swaps and liquidity provision.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
          <WalletConnectionButton />
        </div>
      </div>
    </div>
  )
}