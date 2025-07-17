"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { Label } from "./ui/label"
import { Input } from "./ui/input"
import { Button } from "./ui/button"
import { PlusCircle, MinusCircle } from "lucide-react"
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit"
import {
  LIQUIDITY_POOL,
  POOL_PACKAGE_ID,
  SUDC_LP,
  SUI_ADDRESS,
  SUI_DECIMALS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "@/lib/constant"
import { Transaction } from "@mysten/sui/transactions"
import { useQueryClient } from "@tanstack/react-query"
import { toRawAmount, formatBalance } from "@/lib/utils"

export function LiquidityCard() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const queryClient = useQueryClient()
  const [suiAmount, setSuiAmount] = useState("")
  const [usdcAmount, setUsdcAmount] = useState("")
  const [lpAmount, setLpAmount] = useState("")
  const [suiBalance, setSuiBalance] = useState(BigInt(0))
  const [usdcBalance, setUsdcBalance] = useState(BigInt(0))
  const [lpBalance, setLpBalance] = useState(BigInt(0))

  // Fetch balances when account or suiClient changes
  useEffect(() => {
    if (account && suiClient) {
      fetchBalance(account.address, SUI_ADDRESS).then(setSuiBalance)
      fetchBalance(account.address, USDC_ADDRESS).then(setUsdcBalance)
      fetchBalance(account.address, SUDC_LP).then(setLpBalance)
    } else {
      setSuiBalance(BigInt(0))
      setUsdcBalance(BigInt(0))
      setLpBalance(BigInt(0))
    }
  }, [account, suiClient, fetchBalance])

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

  const handleAddLiquidity = async () => {
    if (!account || !suiClient) return
    const rawSuiAmount = toRawAmount(suiAmount, SUI_DECIMALS)
    const rawUsdcAmount = toRawAmount(usdcAmount, USDC_DECIMALS)

    if (rawSuiAmount === BigInt(0) || rawUsdcAmount === BigInt(0)) {
      alert("Please enter amounts greater than zero.")
      return
    }

    const { data: suiCoins } = await suiClient.getCoins({
      owner: account.address,
      coinType: SUI_ADDRESS,
    })
    const { data: usdcCoins } = await suiClient.getCoins({
      owner: account.address,
      coinType: USDC_ADDRESS,
    })

    if (!suiCoins.length || suiBalance < rawSuiAmount) {
      alert("Insufficient SUI balance to add liquidity.")
      return
    }
    if (!usdcCoins.length || usdcBalance < rawUsdcAmount) {
      alert("Insufficient USDC balance to add liquidity.")
      return
    }

    const tx = new Transaction()
    const [suiSplitCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(rawSuiAmount)])
    const [usdcSplitCoins] = tx.splitCoins(tx.object(usdcCoins[0].coinObjectId), [tx.pure.u64(rawUsdcAmount)])

    // Calculate expected LP tokens for slippage protection
    const expectedLpTokens = await calculateLpTokens(rawSuiAmount, rawUsdcAmount)
    const minLpOut = BigInt(Math.floor(Number(expectedLpTokens) * 0.995)) // 0.5% slippage

    tx.moveCall({
      target: `${POOL_PACKAGE_ID}::pool::add_liquidity`,
      arguments: [
        tx.object(LIQUIDITY_POOL),
        suiSplitCoin,
        usdcSplitCoins,
        tx.pure.u64(minLpOut), // Pass min_lp_out
      ],
    })

    try {
      const result = await signAndExecute({
        transaction: tx,
      })
      console.log("Add Liquidity result:", result)
      setSuiAmount("")
      setUsdcAmount("")
      // Refetch balances and pool overview after successful transaction
      fetchBalance(account.address, SUI_ADDRESS).then(setSuiBalance)
      fetchBalance(account.address, USDC_ADDRESS).then(setUsdcBalance)
      fetchBalance(account.address, SUDC_LP).then(setLpBalance)
      queryClient.invalidateQueries({ queryKey: ["getObject", { id: LIQUIDITY_POOL }] }) // Invalidate pool data
    } catch (error) {
      console.error("Adding Liquidity Failed:", error)
      alert("Adding Liquidity Failed: " + error)
    }
  }

  const handleRemoveLiquidity = async () => {
    if (!account || !suiClient) return
    const rawLpAmount = toRawAmount(lpAmount, 0) // LP tokens usually have 0 decimals

    if (rawLpAmount === BigInt(0)) {
      alert("Please enter an LP amount greater than zero.")
      return
    }

    const { data: lpCoins } = await suiClient.getCoins({
      owner: account.address,
      coinType: SUDC_LP,
    })

    if (!lpCoins.length || lpBalance < rawLpAmount) {
      alert("Insufficient LP tokens to remove liquidity.")
      return
    }

    const tx = new Transaction()
    const [lpSplitCoin] = tx.splitCoins(tx.object(lpCoins[0].coinObjectId), [tx.pure.u64(rawLpAmount)])

    // Correctly fetch the pool object as SuiObjectResponse
    const poolDataResponse = await suiClient.getObject({
      id: LIQUIDITY_POOL,
      options: { showContent: true },
    })

    let minSuiOut = BigInt(0)
    let minUsdcOut = BigInt(0)

    // Access data through the 'data' property of SuiObjectResponse
    if (poolDataResponse?.data?.content?.dataType === "moveObject") {
      const fields = poolDataResponse.data.content.fields as {
        sui_reserve: string
        usdc_reserve: string
        lp_treasury: { fields: { total_supply: { fields: { value: string } } } }
      }
      const suiReserve = BigInt(fields.sui_reserve)
      const usdcReserve = BigInt(fields.usdc_reserve)
      const totalLPSupply = BigInt(fields.lp_treasury.fields.total_supply.fields.value)

      if (totalLPSupply > 0) {
        const expectedSui = (rawLpAmount * suiReserve) / totalLPSupply
        const expectedUsdc = (rawLpAmount * usdcReserve) / totalLPSupply
        minSuiOut = BigInt(Math.floor(Number(expectedSui) * 0.995)) // 0.5% slippage
        minUsdcOut = BigInt(Math.floor(Number(expectedUsdc) * 0.995)) // 0.5% slippage
      }
    }

    tx.moveCall({
      target: `${POOL_PACKAGE_ID}::pool::remove_liquidity`,
      arguments: [
        tx.object(LIQUIDITY_POOL),
        lpSplitCoin,
        tx.pure.u64(minSuiOut), // Minimum SUI expected
        tx.pure.u64(minUsdcOut), // Minimum USDC expected
      ],
    })

    try {
      const result = await signAndExecute({
        transaction: tx,
      })
      console.log("Remove Liquidity result:", result)
      setLpAmount("")
      // Refetch balances and pool overview after successful transaction
      fetchBalance(account.address, SUI_ADDRESS).then(setSuiBalance)
      fetchBalance(account.address, USDC_ADDRESS).then(setUsdcBalance)
      fetchBalance(account.address, SUDC_LP).then(setLpBalance)
      queryClient.invalidateQueries({ queryKey: ["getObject", { id: LIQUIDITY_POOL }] }) // Invalidate pool data
    } catch (error) {
      console.error("Removing Liquidity failed:", error)
      alert("Removing Liquidity failed: " + error)
    }
  }

  async function calculateLpTokens(suiAmount: bigint, usdcAmount: bigint): Promise<string> {
    if (!account?.address || suiAmount === BigInt(0) || usdcAmount === BigInt(0)) return "0.0"
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${POOL_PACKAGE_ID}::pool::calculate_lp_tokens_for_amounts`,
        arguments: [tx.object(LIQUIDITY_POOL), tx.pure.u64(suiAmount), tx.pure.u64(usdcAmount)],
      })
      const { results } = await suiClient.devInspectTransactionBlock({
        sender: account.address,
        transactionBlock: tx,
      })
      if (results && results.length > 0 && results[0]?.returnValues && results[0].returnValues.length > 0) {
        const bytes = results[0].returnValues[0][0]
        const rawOutputValue = new DataView(new Uint8Array(bytes).buffer).getBigUint64(0, true)
        return rawOutputValue.toString() // LP tokens usually have 0 decimals, so just return as string
      }
      return "0.0"
    } catch (error) {
      console.error("Failed to calculate LP tokens:", error)
      return "0.0"
    }
  }

  return (
    <Card className="w-full p-4 bg-card border border-border animated-border-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-bold text-foreground">Liquidity</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="add" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-secondary rounded-lg p-1 mb-4 shadow-sm">
            <TabsTrigger
              value="add"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all duration-300 text-base font-medium hover:bg-primary/10"
            >
              <PlusCircle className="h-5 w-5 mr-2" /> Add
            </TabsTrigger>
            <TabsTrigger
              value="remove"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md transition-all duration-300 text-base font-medium hover:bg-primary/10"
            >
              <MinusCircle className="h-5 w-5 mr-2" /> Remove
            </TabsTrigger>
          </TabsList>
          <TabsContent value="add" className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="sui-add" className="text-muted-foreground flex justify-between items-center text-sm">
                <span>SUI Amount</span>
                {account && (
                  <span className="text-xs text-muted-foreground">
                    Balance: {formatBalance(suiBalance, SUI_DECIMALS)} SUI
                  </span>
                )}
              </Label>
              <Input
                id="sui-add"
                type="number"
                placeholder="0.0"
                value={suiAmount}
                onChange={(e) => setSuiAmount(e.target.value)}
                className="bg-input border-border focus-visible:ring-primary text-lg py-2 px-3 rounded-lg shadow-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="usdc-add" className="text-muted-foreground flex justify-between items-center text-sm">
                <span>USDC Amount</span>
                {account && (
                  <span className="text-xs text-muted-foreground">
                    Balance: {formatBalance(usdcBalance, USDC_DECIMALS)} USDC
                  </span>
                )}
              </Label>
              <Input
                id="usdc-add"
                type="number"
                placeholder="0.0"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                className="bg-input border-border focus-visible:ring-primary text-lg py-2 px-3 rounded-lg shadow-sm"
              />
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition-all duration-300 text-lg shadow-md hover:shadow-lg"
              onClick={handleAddLiquidity}
            >
              Add Liquidity
            </Button>
          </TabsContent>
          <TabsContent value="remove" className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="lp-remove" className="text-muted-foreground flex justify-between items-center text-sm">
                <span>LP Tokens to Remove</span>
                {account && (
                  <span className="text-xs text-muted-foreground">Balance: {formatBalance(lpBalance, 0)} LP</span>
                )}
              </Label>
              <Input
                id="lp-remove"
                type="number"
                placeholder="0.0"
                value={lpAmount}
                onChange={(e) => setLpAmount(e.target.value)}
                className="bg-input border-border focus-visible:ring-primary text-lg py-2 px-3 rounded-lg shadow-sm"
              />
            </div>
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-lg transition-all duration-300 text-lg shadow-md hover:shadow-lg"
              onClick={handleRemoveLiquidity}
            >
              Remove Liquidity
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
