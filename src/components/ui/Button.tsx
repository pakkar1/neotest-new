import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'navy' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  navy: 'btn-navy',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
  success: 'btn bg-success text-white hover:bg-green-800',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-[13px]',
  md: '',
  lg: 'px-4 py-2.5 text-[15px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  block,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${block ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  onClick,
  variant = 'ghost',
  disabled,
  type = 'button',
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles: Record<Variant, string> = {
    ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
    secondary: 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
    primary: 'bg-brand-700 text-white hover:bg-brand-800',
    navy: 'bg-navy-800 text-white hover:bg-navy-900',
    danger: 'bg-danger text-white hover:bg-red-800',
    success: 'bg-success text-white hover:bg-green-800',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
    >
      {icon}
    </button>
  );
}
