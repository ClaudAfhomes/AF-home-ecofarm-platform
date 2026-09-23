type BrandLogoProps = { className?: string; compact?: boolean };

export function BrandLogo({ className = '', compact = false }: BrandLogoProps) {
  return <span className={`brand-logo ${compact ? 'brand-logo-compact' : ''} ${className}`.trim()}><img src="/afhomes-logo.png" alt="" aria-hidden="true" width={2249} height={2560} />{compact ? null : <span>AFhomes</span>}</span>;
}
