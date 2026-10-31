import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { AlertCircle } from 'lucide-react';

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className = '',
}: {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="mt-1 text-[12px] leading-snug text-slate-500">{hint}</p> : null}
      {error ? (
        <p className="mt-1 flex items-start gap-1 text-[12px] font-medium text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...rest} />;
}

export function Textarea({ className = '', rows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input ${className}`} rows={rows} {...rest} />;
}

export function Select({
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`input cursor-pointer pr-8 ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-sm hover:bg-slate-50">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
        {...rest}
      />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        {description ? <span className="mt-0.5 block text-[12px] text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function FormSection({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div>
        <h4 className="text-[13px] font-semibold uppercase tracking-wide text-navy-800">{title}</h4>
        {description ? <p className="text-[12px] text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
