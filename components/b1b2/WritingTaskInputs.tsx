import type { WritingCallForArticles, WritingInputEmail } from '@/lib/curriculum/details';

export default function WritingTaskInputs({
  inputEmail,
  callForArticles,
}: {
  inputEmail?: WritingInputEmail | null;
  callForArticles?: WritingCallForArticles | null;
}) {
  if (!inputEmail && !callForArticles) return null;

  return (
    <div className="space-y-3" data-testid="writing-task-inputs">
      {inputEmail && (
        <section
          aria-label="Email and notes for your reply"
          className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm"
        >
          <div className="border-b border-amber-200/80 pb-2 text-xs text-stone-700">
            <p>
              <strong className="text-stone-900">From:</strong> {inputEmail.from}
            </p>
          </div>
          <div className="rounded-lg border border-amber-200/70 bg-white p-3.5 leading-7 text-stone-800">
            <p className="whitespace-pre-line">{inputEmail.body}</p>
            {inputEmail.signOff && (
              <p className="mt-2 font-medium text-stone-700">{inputEmail.signOff}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-950">
              Your notes — cover all four in your reply
            </p>
            <ol className="mt-2 grid gap-2 sm:grid-cols-2">
              {inputEmail.notes.map((note, idx) => (
                <li
                  key={note}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-stone-800"
                >
                  <span className="font-bold text-indigo-800">
                    {idx + 1}. {note}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {callForArticles && (
        <section
          aria-label="Website call for articles"
          className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 text-sm"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">
            {callForArticles.heading}
          </p>
          <p className="whitespace-pre-line leading-6 text-stone-800">
            {callForArticles.body}
          </p>
        </section>
      )}
    </div>
  );
}
