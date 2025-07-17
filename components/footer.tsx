import Link from "next/link"

export function Footer() {
  return (
    <footer className="p-4 text-center text-sm text-muted-foreground border-t border-border relative z-50 w-full">
      Built by{" "}
      <Link
        href="https://github.com/verifieddanny"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline font-medium transition-colors duration-200"
      >
        DevDanny
      </Link>
    </footer>
  )
}
