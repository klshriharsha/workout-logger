import { describeRecord, type PersonalRecord } from '@/lib/progress'

/** The personal records a session set, as small amber pills. */
export function RecordBadges({ records, className = '' }: { records: PersonalRecord[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`} aria-label="Personal records">
      {records.map((record) => (
        <li
          key={record.kind}
          className="rounded-full bg-amber-tint px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap text-ink-420"
        >
          <span aria-hidden className="text-amber-text">
            ★{' '}
          </span>
          {describeRecord(record)}
        </li>
      ))}
    </ul>
  )
}
