"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Label } from "./ui/label"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Repeat2 } from "lucide-react"
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit"
import { LIQUIDITY_POOL, POOL_PACKAGE_ID, SUI_ADDRESS, SUI_DECIMALS, USDC_ADDRESS, USDC_DECIMALS } from "@/lib/constant"
import { Transaction } from "@mysten/sui/transactions"
import { useQueryClient } from "@tanstack/react-query"
import { toRawAmount, formatBalance } from "@/lib/utils"

export function SwapCard() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const queryClient = useQueryClient()
  const [payAmount, setPayAmount] = useState("")
  const [receiveAmount, setReceiveAmount] = useState("0.0")
  const [payToken, setPayToken] = useState("SUI")
  const [receiveToken, setReceiveToken] = useState("USDC")
  const [suiBalance, setSuiBalance] = useState(BigInt(0))
  const [usdcBalance, setUsdcBalance] = useState(BigInt(0))
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch balances when account or suiClient changes
  useEffect(() => {
    if (account && suiClient) {
      fetchBalance(account.address, SUI_ADDRESS).then(setSuiBalance)
      fetchBalance(account.address, USDC_ADDRESS).then(setUsdcBalance)
    } else {
      setSuiBalance(BigInt(0))
      setUsdcBalance(BigInt(0))
    }
  }, [account, suiClient, fetchBalance])

  // Effect to update receive amount when payToken or payAmount changes (debounced)
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
    debounceTimeoutRef.current = setTimeout(async () => {
      if (!payAmount || payAmount.trim() === "" || isNaN(Number(payAmount))) {
        setReceiveAmount("0.0")
        return
      }
      const output = await fetchSwapOutput(payToken, payAmount)
      setReceiveAmount(output)
    }, 300) // Debounce for 300ms
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [payAmount, payToken, account, suiClient, fetchSwapOutput]) 

  // Function to fetch coin balance
  async function fetchBalance(address: string, coinType: string): Promise<bigint> {
    try {
      const { data: coins } = await suiClient.getCoins({
        owner: address,
        coinType,
      })
      return coins.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0))
    } catch (error) {
      console.error(`Failed to fetch balance for ${coinType}:`, error)
      return BigInt(0)
    }
  }

  async function fetchSwapOutput(payToken: string, payAmountStr: string): Promise<string> {
    console.log(`[fetchSwapOutput] Called with payToken: ${payToken}, payAmountStr: "${payAmountStr}"`)
    if (!payAmountStr || payAmountStr.trim() === "" || isNaN(Number(payAmountStr))) {
      console.log("[fetchSwapOutput] Invalid input string, returning '0.0'.")
      return "0.0"
    }

    const payDecimals = payToken === "SUI" ? SUI_DECIMALS : USDC_DECIMALS
    const receiveDecimals = payToken === "SUI" ? USDC_DECIMALS : SUI_DECIMALS
    const rawPayAmount = toRawAmount(payAmountStr, payDecimals)
    console.log(`[fetchSwapOutput] Converted rawPayAmount: ${rawPayAmount.toString()}`)

    if (rawPayAmount === BigInt(0) && Number(payAmountStr) !== 0) {
      console.log("[fetchSwapOutput] Raw amount is zero but input was not '0', returning '0.0'.")
      return "0.0"
    }

    if (!account?.address) {
      console.log("[fetchSwapOutput] Account not connected, returning '0.0'.")
      return "0.0"
    }

    try {
      const tx = new Transaction()
      let targetFunction: string
      if (payToken === "SUI") {
        targetFunction = `${POOL_PACKAGE_ID}::pool::get_usdc_output_amount`
      } else {
        targetFunction = `${POOL_PACKAGE_ID}::pool::get_sui_output_amount`
      }

      tx.moveCall({
        target: targetFunction,
        arguments: [tx.object(LIQUIDITY_POOL), tx.pure.u64(rawPayAmount)],
      })

      console.log(`[fetchSwapOutput] Dev-inspecting transaction for target: ${targetFunction}`)
      const { results, error } = await suiClient.devInspectTransactionBlock({
        sender: account.address,
        transactionBlock: tx,
      })

      if (error) {
        console.error("[fetchSwapOutput] DevInspect error:", error)
        return "0.0"
      }

      console.log("[fetchSwapOutput] DevInspect results:", JSON.stringify(results, null, 2))

      if (results && results.length > 0 && results[0]?.returnValues && results[0].returnValues.length > 0) {
        const bytes = results[0].returnValues[0][0]
        const rawOutputValue = new DataView(new Uint8Array(bytes).buffer).getBigUint64(0, true)
        console.log(`[fetchSwapOutput] Raw output value from devInspect: ${rawOutputValue.toString()}`)
        return formatBalance(rawOutputValue, receiveDecimals)
      } else {
        console.log(
          "[fetchSwapOutput] DevInspect succeeded but no valid return values found, returning '0.0'. This might indicate a Move contract revert for the given input.",
        )
        return "0.0"
      }
    } catch (e) {
      console.error("[fetchSwapOutput] Caught unexpected error during devInspect:", e)
      return "0.0"
    }
  }

  const handleSwap = async () => {
    if (!account || !suiClient) return

    const coinType = payToken === "SUI" ? SUI_ADDRESS : USDC_ADDRESS
    const payDecimals = payToken === "SUI" ? SUI_DECIMALS : USDC_DECIMALS
    const receiveDecimals = payToken === "SUI" ? USDC_DECIMALS : SUI_DECIMALS

    const expectedOutput = await fetchSwapOutput(payToken, payAmount)
    const slippageTolerance = 0.005 // 0.5% slippage tolerance
    const minAmount = (Number.parseFloat(expectedOutput) * (1 - slippageTolerance)).toFixed(receiveDecimals)
    const minAmountRaw = toRawAmount(minAmount, receiveDecimals)

    const { data: coins } = await suiClient.getCoins({
      owner: account.address,
      coinType,
    })

    if (!coins.length) {
      alert(`No available ${payToken} coins for swap`)
      return
    }

    const tx = new Transaction()
    let splitCoin
    if (payToken === "SUI") {
      ;[splitCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(toRawAmount(payAmount, payDecimals))])
      tx.moveCall({
        target: `${POOL_PACKAGE_ID}::pool::swap_sui_to_usdc`,
        arguments: [
          tx.object(LIQUIDITY_POOL),
          splitCoin,
          tx.pure.u64(minAmountRaw), // Pass min_usdc_out
        ],
      })
    } else {
      const inputCoinId = coins[0].coinObjectId
      ;[splitCoin] = tx.splitCoins(tx.object(inputCoinId), [tx.pure.u64(toRawAmount(payAmount, payDecimals))])
      tx.moveCall({
        target: `${POOL_PACKAGE_ID}::pool::swap_usdc_to_sui`,
        arguments: [
          tx.object(LIQUIDITY_POOL),
          splitCoin,
          tx.pure.u64(minAmountRaw), // Pass min_sui_out
        ],
      })
    }

    try {
      const result = await signAndExecute({
        transaction: tx,
      })
      console.log("Swap result:", result)
      setPayAmount("")
      setReceiveAmount("0.0")
      fetchBalance(account.address, SUI_ADDRESS).then(setSuiBalance)
      fetchBalance(account.address, USDC_ADDRESS).then(setUsdcBalance)
      queryClient.invalidateQueries({ queryKey: ["getObject", { id: LIQUIDITY_POOL }] })
    } catch (error) {
      console.error("Swap failed:", error)
      alert("Swap failed: " + error)
    }
  }

  const handlePayAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const amount = e.target.value
    setPayAmount(amount)
  }

  const handleTokenSwapDirection = () => {
    const tempPayToken = payToken
    setPayToken(receiveToken)
    setReceiveToken(tempPayToken)
    setPayAmount("")
    setReceiveAmount("0.0")
  }

  const currentPayBalance = payToken === "SUI" ? suiBalance : usdcBalance
  const currentPayDecimals = payToken === "SUI" ? SUI_DECIMALS : USDC_DECIMALS
  // const currentReceiveDecimals = receiveToken === "SUI" ? SUI_DECIMALS : USDC_DECIMALS

  return (
    <Card className="w-full p-4 bg-card border border-border animated-border-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-bold text-foreground">Swap</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sui-to-usdc" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-secondary rounded-lg p-1 mb-4 shadow-sm">
            <TabsTrigger
              value="sui-to-usdc"
              onClick={() => {
                setPayToken("SUI")
                setReceiveToken("USDC")
                setPayAmount("")
                setReceiveAmount("0.0")
              }}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all duration-300 text-base font-medium hover:bg-primary/10"
            >
              SUI to USDC
            </TabsTrigger>
            <TabsTrigger
              value="usdc-to-sui"
              onClick={() => {
                setPayToken("USDC")
                setReceiveToken("SUI")
                setPayAmount("")
                setReceiveAmount("0.0")
              }}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all duration-300 text-base font-medium hover:bg-primary/10"
            >
              USDC to SUI
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sui-to-usdc" className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="pay-amount" className="text-muted-foreground flex justify-between items-center text-sm">
                <span>You Pay</span>
                {account && (
                  <span className="text-xs text-muted-foreground">
                    Balance: {formatBalance(currentPayBalance, currentPayDecimals)} {payToken}
                  </span>
                )}
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="pay-amount"
                  type="number"
                  placeholder="0.0"
                  value={payAmount}
                  onChange={handlePayAmountChange}
                  className="bg-input border-border focus-visible:ring-primary text-lg py-2 px-3 rounded-lg shadow-sm"
                />
                <Select value={payToken} onValueChange={setPayToken}>
                  <SelectTrigger className="w-[120px] bg-input border-border focus:ring-primary rounded-lg text-base">
                    <SelectValue placeholder="Token" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground rounded-lg">
                    <SelectItem value="SUI">SUI</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleTokenSwapDirection}
                className="text-primary hover:bg-primary/10 transition-transform duration-200 hover:scale-110"
              >
                <Repeat2 className="h-7 w-7" />
                <span className="sr-only">Swap token direction</span>
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receive-amount" className="text-muted-foreground text-sm">
                You Receive
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="receive-amount"
                  type="text"
                  placeholder="0.0"
                  value={receiveAmount}
                  readOnly
                  disabled
                  className="bg-input border-border text-lg py-2 px-3 rounded-lg shadow-sm"
                />
                <Select value={receiveToken} onValueChange={setReceiveToken}>
                  <SelectTrigger className="w-[120px] bg-input border-border focus:ring-primary rounded-lg text-base">
                    <SelectValue placeholder="Token" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground rounded-lg">
                    <SelectItem value="SUI">SUI</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition-all duration-300 text-lg shadow-md hover:shadow-lg"
              onClick={handleSwap}
            >
              Swap
            </Button>
          </TabsContent>
          <TabsContent value="usdc-to-sui" className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label
                htmlFor="pay-amount-usdc"
                className="text-muted-foreground flex justify-between items-center text-sm"
              >
                <span>You Pay</span>
                {account && (
                  <span className="text-xs text-muted-foreground">
                    Balance: {formatBalance(currentPayBalance, currentPayDecimals)} {payToken}
                  </span>
                )}
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="pay-amount-usdc"
                  type="number"
                  placeholder="0.0"
                  value={payAmount}
                  onChange={handlePayAmountChange}
                  className="bg-input border-border focus-visible:ring-primary text-lg py-2 px-3 rounded-lg shadow-sm"
                />
                <Select value={payToken} onValueChange={setPayToken}>
                  <SelectTrigger className="w-[120px] bg-input border-border focus:ring-primary rounded-lg text-base">
                    <SelectValue placeholder="Token" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground rounded-lg">
                    <SelectItem value="SUI">SUI</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleTokenSwapDirection}
                className="text-primary hover:bg-primary/10 transition-transform duration-200 hover:scale-110"
              >
                <Repeat2 className="h-7 w-7" />
                <span className="sr-only">Swap token direction</span>
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receive-amount-sui" className="text-muted-foreground text-sm">
                You Receive
              </Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="receive-amount-sui"
                  type="text"
                  placeholder="0.0"
                  value={receiveAmount}
                  readOnly
                  disabled
                  className="bg-input border-border text-lg py-2 px-3 rounded-lg shadow-sm"
                />
                <Select value={receiveToken} onValueChange={setReceiveToken}>
                  <SelectTrigger className="w-[120px] bg-input border-border focus:ring-primary rounded-lg text-base">
                    <SelectValue placeholder="Token" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover text-popover-foreground rounded-lg">
                    <SelectItem value="SUI">SUI</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition-all duration-300 text-lg shadow-md hover:shadow-lg cursor-pointer"
              onClick={handleSwap}
            >
              Swap
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
