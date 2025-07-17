"use client"

import { useSuiClientQuery } from "@mysten/dapp-kit"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { DollarSign, TrendingUp, Gauge } from "lucide-react"
import { LIQUIDITY_POOL, SUI_IN_MINT, USDC_DECIMALS } from "@/lib/constant"
import { useEffect } from "react"
import { cn } from "@/lib/utils"

export function PoolOverview() {
  const { data, isLoading } = useSuiClientQuery("getObject", {
    id: LIQUIDITY_POOL,
    options: { showContent: true },
  })

  useEffect(() => {
    console.log(data)
  }, [data])

  const suiReserve =
    data?.data?.content?.dataType === "moveObject"
      ? Number((data.data.content.fields as { sui_reserve: string }).sui_reserve) / SUI_IN_MINT
      : null
  const usdcReserve =
    data?.data?.content?.dataType === "moveObject"
      ? Number((data.data.content.fields as { usdc_reserve: string }).usdc_reserve) / 10 ** USDC_DECIMALS
      : null
  const totalLPSupply =
    data?.data?.content?.dataType === "moveObject"
      ? Number(
          (data.data.content.fields as { lp_treasury: { fields: { total_supply: { fields: { value: string } } } } })
            .lp_treasury.fields.total_supply.fields.value,
        )
      : null

  return (
    <Card className="w-full p-4 bg-card border border-border animated-border-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-2xl font-bold text-foreground flex items-center">
          <Gauge className="h-6 w-6 mr-2 text-primary" /> Pool Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex justify-between items-center p-4 bg-secondary rounded-lg border border-border shadow-sm">
          <div className="flex items-center text-muted-foreground text-base">
            <DollarSign className="h-5 w-5 mr-2 text-primary" />
            <span>SUI Reserve:</span>
          </div>
          <span
            className={cn("font-semibold text-xl text-foreground", isLoading ? "blur-sm animate-pulse" : "filter-none")}
          >
            {suiReserve !== null ? suiReserve.toFixed(2) : "-"} SUI
          </span>
        </div>
        <div className="flex justify-between items-center p-4 bg-secondary rounded-lg border border-border shadow-sm">
          <div className="flex items-center text-muted-foreground text-base">
            <DollarSign className="h-5 w-5 mr-2 text-primary" />
            <span>USDC Reserve:</span>
          </div>
          <span
            className={cn("font-semibold text-xl text-foreground", isLoading ? "blur-sm animate-pulse" : "filter-none")}
          >
            {usdcReserve !== null ? usdcReserve.toFixed(2) : "-"} USDC
          </span>
        </div>
        <div className="flex justify-between items-center p-4 bg-secondary rounded-lg border border-border shadow-sm">
          <div className="flex items-center text-muted-foreground text-base">
            <TrendingUp className="h-5 w-5 mr-2 text-primary" />
            <span>Total LP Supply:</span>
          </div>
          <span
            className={cn("font-semibold text-xl text-foreground", isLoading ? "blur-sm animate-pulse" : "filter-none")}
          >
            {totalLPSupply !== null ? totalLPSupply.toLocaleString() : "-"} LP
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
