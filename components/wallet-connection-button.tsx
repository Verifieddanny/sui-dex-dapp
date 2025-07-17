"use client"

import { useState } from "react"

import { WalletIcon } from "lucide-react"
import { Button } from "./ui/button"
import { useConnectWallet, useDisconnectWallet, useWallets, useCurrentAccount } from "@mysten/dapp-kit"

export function WalletConnectionButton() {
  const { mutate: connect } = useConnectWallet()
  const { mutate: disconnect } = useDisconnectWallet()
  const wallets = useWallets()
  const account = useCurrentAccount()
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const handleConnect = async () => {
    if (wallets.length === 0) {
      alert("No wallets detected! Please install a Sui wallet extension first.")
      return
    }
    setIsConnecting(true)
    try {
      connect(
        { wallet: wallets[0] },
        {
          onSuccess: () => {
            console.log("Wallet connected successfully!")
            setIsConnecting(false)
          },
          onError: (error) => {
            console.error("Failed to connect wallet:", error)
            alert(`Failed to connect wallet: ${error.message}`)
            setIsConnecting(false)
          },
        },
      )
    } catch (error) {
      console.error("Connection error:", error)
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      disconnect(undefined, {
        onSuccess: () => {
          console.log("Wallet disconnected successfully!")
          setIsDisconnecting(false)
        },
        onError: (error) => {
          console.error("Failed to disconnect wallet:", error)
          setIsDisconnecting(false)
        },
      })
    } catch (error) {
      console.error("Disconnect error:", error)
      setIsDisconnecting(false)
    }
  }

  if (account) {
    const truncatedAddress = `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-foreground/80 hidden sm:block">{truncatedAddress}</span>
        <Button
          onClick={handleDisconnect}
          disabled={isDisconnecting}
          variant="outline"
          className="cursor-pointer border-border text-foreground hover:bg-secondary bg-transparent transition-colors duration-200"
        >
          {isDisconnecting ? "Disconnecting..." : "Disconnect"}
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
      className={`flex cursor-pointer items-center space-x-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-2 px-4 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg ${
        isConnecting ? "opacity-70 cursor-not-allowed" : ""
      }`}
    >
      <WalletIcon className="h-5 w-5" />
      <span>{isConnecting ? "Connecting..." : "Get Started Today"}</span>
    </Button>
  )
}
