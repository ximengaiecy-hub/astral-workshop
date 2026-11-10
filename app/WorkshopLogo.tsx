export default function WorkshopLogo({ className = "" }: { className?: string }) {
  return <svg className={"workshop-logo " + className} viewBox="0 0 80 80" role="img" aria-label="星界工坊示例标志">
    <path d="M40 5 71 23v34L40 75 9 57V23Z" fill="#17151e" stroke="#cba570" strokeWidth="3" />
    <path d="m40 17 8 15 15 8-15 8-8 15-8-15-15-8 15-8Z" fill="#cba570" />
  </svg>;
}
