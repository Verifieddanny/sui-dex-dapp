import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Helper function to convert human-readable amount to raw BigInt units
export function toRawAmount(amountStr: string, decimals: number): bigint {
  if (!amountStr || amountStr.trim() === "") return BigInt(0)
  const parts = amountStr.split(".")
  const integerPart = parts[0] || "0"
  let fractionalPart = parts[1] || ""

  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.substring(0, decimals)
  } else {
    fractionalPart = fractionalPart.padEnd(decimals, "0")
  }

  const combined = integerPart + fractionalPart
  let cleanedCombined = combined.replace(/^0+/, "")
  if (cleanedCombined === "") {
    cleanedCombined = "0"
  }
  return BigInt(cleanedCombined)
}

// Helper function to format BigInt balances for display
export function formatBalance(amount: bigint, decimals: number): string {
  if (amount === BigInt(0)) return "0.00"
  const divisor = BigInt(10 ** decimals)
  const integerPart = amount / divisor
  const fractionalPart = amount % divisor
  const fractionalString = fractionalPart.toString().padStart(decimals, "0")

  // Trim trailing zeros from fractional part, but keep at least two decimal places
  let trimmedFractional = fractionalString.replace(/0+$/, "")
  if (trimmedFractional.length < 2) {
    trimmedFractional = trimmedFractional.padEnd(2, "0")
  }

  const integerPartFormatted = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${integerPartFormatted}.${trimmedFractional}`
}
