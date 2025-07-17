"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit"
import { ADMIN_ADDRESS, LIQUIDITY_POOL, POOL_PACKAGE_ID, SUI_DECIMALS, USDC_DECIMALS } from "@/lib/constant"
import { Transaction } from "@mysten/sui/transactions"
import { useQueryClient } from "@tanstack/react-query"
import { DollarSign, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

// Helper function to format BigInt balances for display (copied from SwapCard/LiquidityCard)
function formatBalance(amount: bigint, decimals: number): string {
  if (amount === BigInt(0)) return "0.00"
  const divisor = BigInt(10 ** decimals)
  const integerPart = amount / divisor
  const fractionalPart = amount % divisor
  const fractionalString = fractionalPart.toString().padStart(decimals, "0")
  let trimmedFractional = fractionalString.replace(/0+$/, "")
  if (trimmedFractional.length < 2) {
    trimmedFractional = trimmedFractional.padEnd(2, "0")
  }
  const integerPartFormatted = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${integerPartFormatted}.${trimmedFractional}`
}

export function AdminPanel() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const queryClient = useQueryClient()
  const [feeSui, setFeeSui] = useState(BigInt(0))
  const [feeUsdc, setFeeUsdc] = useState(BigInt(0))
  const [isLoadingFees, setIsLoadingFees] = useState(true)

  const fetchFees = async () => {
    if (!account || !suiClient) {
      setFeeSui(BigInt(0))
      setFeeUsdc(BigInt(0))
      setIsLoadingFees(false)
      return
    }
    setIsLoadingFees(true)
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${POOL_PACKAGE_ID}::pool::get_fees`,
        arguments: [tx.object(LIQUIDITY_POOL)],
      })
      const { results } = await suiClient.devInspectTransactionBlock({
        sender: account.address,
        transactionBlock: tx,
      })
      if (results && results.length > 0 && results[0]?.returnValues && results[0].returnValues.length === 2) {
        const suiBytes = results[0].returnValues[0][0]
        const usdcBytes = results[0].returnValues[1][0]
        const rawSuiFee = new DataView(new Uint8Array(suiBytes).buffer).getBigUint64(0, true)
        const rawUsdcFee = new DataView(new Uint8Array(usdcBytes).buffer).getBigUint64(0, true)
        setFeeSui(rawSuiFee)
        setFeeUsdc(rawUsdcFee)
      }
    } catch (error) {
      console.error("Failed to fetch fees:", error)
      setFeeSui(BigInt(0))
      setFeeUsdc(BigInt(0))
    } finally {
      setIsLoadingFees(false)
    }
  }

  // Fetch fees on component mount and when account/suiClient changes
  useEffect(() => {
    fetchFees()
  }, [account, suiClient, fetchFees])

  const handleCollectFees = async () => {
    if (!account || !suiClient) return
    const tx = new Transaction()
    tx.moveCall({
      target: `${POOL_PACKAGE_ID}::pool::collect_fees`,
      arguments: [tx.object(LIQUIDITY_POOL)],
    })
    try {
      const result = await signAndExecute({
        transaction: tx,
      })
      console.log("Collect Fees result:", result)
  
      // Refetch fees and pool overview after successful transaction
      fetchFees()
      queryClient.invalidateQueries({ queryKey: ["getObject", { id: LIQUIDITY_POOL }] }) // Invalidate pool data
    } catch (error) {
      console.error("Collecting Fees failed:", error)
      alert("Collecting Fees failed: " + error)
    }
  }

  // Optional: Restrict access to admin panel to specific addresses
  const isAdmin = account?.address === ADMIN_ADDRESS;
  if (!isAdmin) return null;

  return (
    <Card className="w-full p-4 bg-card border border-border animated-border-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-bold text-foreground flex items-center">
          <Wallet className="h-6 w-6 mr-2 text-primary" /> Admin Panel (Collect Fees)
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex justify-between items-center p-4 bg-secondary rounded-lg border border-border shadow-sm">
          <div className="flex items-center text-muted-foreground">
            <DollarSign className="h-4 w-4 mr-2" />
            <span>Accumulated SUI Fees:</span>
          </div>
          <span
            className={cn(
              "font-semibold text-lg text-foreground",
              isLoadingFees ? "blur-sm animate-pulse" : "filter-none",
            )}
          >
            {formatBalance(feeSui, SUI_DECIMALS)} SUI
          </span>
        </div>
        <div className="flex justify-between items-center p-4 bg-secondary rounded-lg border border-border shadow-sm">
          <div className="flex items-center text-muted-foreground">
            <DollarSign className="h-4 w-4 mr-2" />
            <span>Accumulated USDC Fees:</span>
          </div>
          <span
            className={cn(
              "font-semibold text-lg text-foreground",
              isLoadingFees ? "blur-sm animate-pulse" : "filter-none",
            )}
          >
            {formatBalance(feeUsdc, USDC_DECIMALS)} USDC
          </span>
        </div>
        <Button
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition-all duration-300 shadow-md hover:shadow-lg"
          onClick={handleCollectFees}
          disabled={isLoadingFees || (feeSui === BigInt(0) && feeUsdc === BigInt(0))}
        >
          Collect All Fees
        </Button>
      </CardContent>
    </Card>
  )
}
