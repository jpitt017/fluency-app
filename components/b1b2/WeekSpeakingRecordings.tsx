import SpeakingRecording from './SpeakingRecording';

export type WeekSpeakingRecordingLink = {
  id: string;
  label: string;
  href: string;
};

/**
 * Reused on a learner's week page and in the teacher console. The URLs are
 * short app routes; the 60-second signed Storage link is created only when the
 * audio element actually requests the file.
 */
export default function WeekSpeakingRecordings({
  recordings,
  title = 'Your recordings',
  emptyMessage = null,
}: {
  recordings: WeekSpeakingRecordingLink[];
  title?: string;
  emptyMessage?: string | null;
}) {
  if (!recordings.length && !emptyMessage) return null;
  return <section className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/60 p-4" aria-label={title}>
    <h3 className="font-semibold">{title}</h3>
    {recordings.length === 0
      ? <p className="text-sm text-stone-600">{emptyMessage}</p>
      : <ul className="space-y-3">
        {recordings.map((recording) => <li key={recording.id} className="space-y-1">
          <p className="text-sm font-medium text-stone-700">{recording.label}</p>
          <SpeakingRecording
            recordingUrl={recording.href}
            label={recording.label}
            dataTestId={`week-speaking-recording-${recording.id}`}
          />
        </li>)}
      </ul>}
  </section>;
}
