import type { ReactNode } from 'react';
import type { Column } from '../ui/DataTable';

export type FieldType =
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'checkbox'
  | 'date'
  | 'time'
  | 'html';

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: SelectOption[];
  colSpan?: 1 | 2;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  defaultValue?: unknown;
  disabled?: boolean;
  autoComplete?: string;
}

export interface FilterDef {
  name: string;
  label: string;
  options: SelectOption[];
}

export interface CrudConfig<T extends { id: string }> {
  title: string;
  description: ReactNode;
  breadcrumb: { label: string; to?: string }[];
  endpoint: '/api/admin' | '/api/exams';
  resource: string;
  fields: FieldDef[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  createLabel?: string;
  filters?: FilterDef[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  deleteMessage?: (row: T) => ReactNode;
  toFormValues?: (row: T) => Record<string, unknown>;
  beforeSubmit?: (values: Record<string, unknown>) => Record<string, unknown>;
  extraToolbar?: ReactNode;
  headerActions?: ReactNode;
  rowActions?: (row: T, helpers: { refresh: () => void }) => ReactNode;
  onRowClick?: (row: T) => void;
  emptyDescription?: ReactNode;
  modalSize?: 'sm' | 'md' | 'lg' | 'xl';
  summary?: ReactNode;
  extraQuery?: Record<string, string>;
  pageSize?: number;
}
