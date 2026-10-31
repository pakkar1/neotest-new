import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Button, IconButton } from '../ui/Button';
import { DataTable, Pagination } from '../ui/DataTable';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { Checkbox, Field, Input, Select, Textarea } from '../ui/Field';
import { useToast } from '../ui/Toast';
import { apiRequest, ApiClientError } from '../../services/api';
import { useDebouncedValue } from '../../hooks';
import type { Paginated } from '../../shared/types';
import type { CrudConfig, FieldDef } from './types';

function initialValues(fields: FieldDef[], row?: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const fromRow = row?.[field.name];
    if (row && fromRow !== undefined) values[field.name] = fromRow;
    else if (field.defaultValue !== undefined) values[field.name] = field.defaultValue;
    else if (field.type === 'checkbox') values[field.name] = false;
    else if (field.type === 'multiselect') values[field.name] = [];
    else values[field.name] = '';
  }
  return values;
}

function validate(fields: FieldDef[], values: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.required) {
      const empty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        errors[field.name] = `${field.label} wajib diisi.`;
        continue;
      }
    }
    if (field.type === 'email' && typeof value === 'string' && value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      errors[field.name] = 'Format email tidak valid.';
    }
  }
  return errors;
}

export function CrudResource<T extends { id: string }>({ config }: { config: CrudConfig<T> }) {
  const toast = useToast();
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() => initialValues(config.fields));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 350);
  const pageSize = config.pageSize ?? 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string | number> = {
        resource: config.resource,
        page,
        pageSize,
        ...(config.extraQuery ?? {}),
      };
      if (debouncedSearch) query.q = debouncedSearch;
      for (const [key, value] of Object.entries(filters)) {
        if (value) query[key] = value;
      }
      const result = await apiRequest<Paginated<T>>(config.endpoint, { query });
      setRows(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [config, page, pageSize, debouncedSearch, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters]);

  const openCreate = () => {
    setEditing(null);
    setValues(initialValues(config.fields));
    setFieldErrors({});
    setModalOpen(true);
  };

  const openEdit = (row: T) => {
    setEditing(row);
    const source = config.toFormValues
      ? config.toFormValues(row)
      : (row as unknown as Record<string, unknown>);
    setValues(initialValues(config.fields, source));
    setFieldErrors({});
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = validate(config.fields, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      const payload = config.beforeSubmit ? config.beforeSubmit(values) : values;
      if (editing) {
        await apiRequest(config.endpoint, {
          method: 'PATCH',
          query: { resource: config.resource, id: editing.id },
          body: payload,
        });
        toast.success('Perubahan disimpan.');
      } else {
        await apiRequest(config.endpoint, {
          method: 'POST',
          query: { resource: config.resource },
          body: payload,
        });
        toast.success('Data berhasil ditambahkan.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const details = Array.isArray(err.details)
          ? (err.details as { path?: string; message?: string }[])
          : [];
        if (details.length > 0) {
          const mapped: Record<string, string> = {};
          for (const item of details) {
            if (item.path) mapped[item.path.split('.').pop() ?? item.path] = item.message ?? err.message;
          }
          setFieldErrors(mapped);
        }
        toast.error('Gagal menyimpan', err.message);
      } else {
        toast.error('Gagal menyimpan data.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await apiRequest(config.endpoint, {
        method: 'DELETE',
        query: { resource: config.resource, id: deleting.id },
      });
      toast.success('Data dihapus.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('Gagal menghapus', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns = useMemo(() => {
    const base = [...config.columns];
    if (config.canEdit || config.canDelete || config.rowActions) {
      base.push({
        key: '__actions',
        header: 'Aksi',
        align: 'right',
        width: '110px',
        render: (row: T) => (
          <div className="flex items-center justify-end gap-1">
            {config.rowActions?.(row, { refresh: load })}
            {config.canEdit ? (
              <IconButton
                label="Ubah"
                variant="secondary"
                icon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => openEdit(row)}
              />
            ) : null}
            {config.canDelete ? (
              <IconButton
                label="Hapus"
                variant="secondary"
                icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}
                onClick={() => setDeleting(row)}
              />
            ) : null}
          </div>
        ),
      });
    }
    return base;
  }, [config, load]);

  return (
    <div>
      <PageHeader
        title={config.title}
        description={config.description}
        breadcrumb={config.breadcrumb}
        actions={
          <>
            {config.headerActions}
            <Button
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void load()}
            >
              Muat ulang
            </Button>
            {config.canCreate !== false ? (
              <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                {config.createLabel ?? 'Tambah data'}
              </Button>
            ) : null}
          </>
        }
      />

      {config.summary}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="Belum ada data"
        emptyDescription={config.emptyDescription}
        emptyAction={
          config.canCreate !== false ? (
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              {config.createLabel ?? 'Tambah data'}
            </Button>
          ) : undefined
        }
        onRowClick={config.onRowClick}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-8"
                placeholder={config.searchPlaceholder ?? 'Cari…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Pencarian"
              />
            </div>
            {config.filters?.map((filter) => (
              <Select
                key={filter.name}
                value={filters[filter.name] ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, [filter.name]: e.target.value }))}
                aria-label={filter.label}
                className="w-auto min-w-[130px]"
              >
                <option value="">{filter.label}</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            ))}
            {config.extraToolbar}
          </div>
        }
        footer={<Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size={config.modalSize ?? 'md'}
        title={editing ? `Ubah ${config.title.toLowerCase()}` : `${config.createLabel ?? 'Tambah data'}`}
        description="Kolom bertanda * wajib diisi. Validasi juga dilakukan di server."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" form="crud-form" loading={saving}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="crud-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {config.fields.map((field) => {
            if (field.type === 'checkbox') {
              return (
                <div key={field.name} className={field.colSpan === 2 ? 'sm:col-span-2' : ''}>
                  <Checkbox
                    label={field.label}
                    description={field.help}
                    checked={Boolean(values[field.name])}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.name]: e.target.checked }))
                    }
                  />
                </div>
              );
            }
            if (field.type === 'multiselect') {
              const selected = Array.isArray(values[field.name])
                ? (values[field.name] as string[])
                : [];
              return (
                <Field
                  key={field.name}
                  label={field.label}
                  required={field.required}
                  hint={field.help}
                  error={fieldErrors[field.name]}
                  className={field.colSpan === 2 ? 'sm:col-span-2' : ''}
                >
                  <div className="thin-scroll grid max-h-40 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                    {(field.options ?? []).length === 0 ? (
                      <p className="p-2 text-[12px] text-slate-500">Belum ada pilihan tersedia.</p>
                    ) : null}
                    {(field.options ?? []).map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-700"
                          checked={selected.includes(option.value)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selected, option.value]
                              : selected.filter((v) => v !== option.value);
                            setValues((prev) => ({ ...prev, [field.name]: next }));
                          }}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </Field>
              );
            }
            return (
              <Field
                key={field.name}
                label={field.label}
                required={field.required}
                hint={field.help}
                error={fieldErrors[field.name]}
                htmlFor={`field-${field.name}`}
                className={field.colSpan === 2 ? 'sm:col-span-2' : ''}
              >
                {field.type === 'select' ? (
                  <Select
                    id={`field-${field.name}`}
                    value={String(values[field.name] ?? '')}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    disabled={field.disabled}
                  >
                    <option value="">{field.placeholder ?? 'Pilih…'}</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : field.type === 'textarea' ? (
                  <Textarea
                    id={`field-${field.name}`}
                    rows={field.rows ?? 3}
                    value={String(values[field.name] ?? '')}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    disabled={field.disabled}
                  />
                ) : (
                  <Input
                    id={`field-${field.name}`}
                    type={field.type === 'html' ? 'text' : field.type}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    autoComplete={field.autoComplete}
                    value={String(values[field.name] ?? '')}
                    placeholder={field.placeholder}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.name]: field.type === 'number' ? e.target.value : e.target.value,
                      }))
                    }
                    disabled={field.disabled}
                  />
                )}
              </Field>
            );
          })}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus data?"
        message={
          config.deleteMessage
            ? config.deleteMessage(deleting as T)
            : 'Data akan dihapus (soft delete) dan riwayat ujian tetap dipertahankan bila ada.'
        }
        confirmLabel="Hapus"
        loading={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
