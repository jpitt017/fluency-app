import type { UseRole } from '@/lib/b1b2/types';

const ROLE_META: Record<UseRole, { label: string; shortLabel: string; classes: string }> = {
  P: {
    label: 'B1 productive',
    shortLabel: 'P · B1 productive',
    classes: 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200',
  },
  B: {
    label: 'Guided B2',
    shortLabel: 'B · Guided B2',
    classes: 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200',
  },
  O: {
    label: 'Optional recognition',
    shortLabel: 'O · Optional',
    classes: 'bg-stone-100 text-stone-700 ring-1 ring-stone-200',
  },
};

export default function VocabRoleBadge({
  role,
  compact = false,
}: {
  role?: UseRole | null;
  compact?: boolean;
}) {
  if (!role || !(role in ROLE_META)) return null;
  const meta = ROLE_META[role];
  return (
    <span
      title={meta.label}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-tight ${meta.classes}`}
    >
      {compact ? meta.shortLabel : meta.label}
    </span>
  );
}
