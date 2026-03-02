type DocSection = {
  id: string
  title: string
  summary: string
  bullets: string[]
}

const navSections: DocSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    summary: 'Seal is the voice-first frontend that controls Otter job orchestration and runtime interaction.',
    bullets: [
      'React + TypeScript interface for voice-driven workflows',
      'Kanban board for Todo / Running / Blocked+Failed / Done states',
      'Live output and event visibility from SSE updates',
    ],
  },
  {
    id: 'voice-flow',
    title: 'Voice Flow',
    summary: 'Voice prompts are captured client-side and forwarded through Otter to lavoix transcription.',
    bullets: [
      'Push-to-talk and voice prompt replay',
      'Transcript confirmation before queue submission',
      'Model-agnostic prompt execution pipeline',
    ],
  },
  {
    id: 'runtime-ui',
    title: 'Runtime UI',
    summary: 'Task modal integrates browser preview, workspace shell, and runtime status controls.',
    bullets: [
      'Tabbed browser/shell views in task details',
      'Runtime start/stop/restart actions',
      'Persistent shell sessions with cwd continuity',
    ],
  },
  {
    id: 'queue-controls',
    title: 'Queue Controls',
    summary: 'Users can prioritize and control work without leaving the board context.',
    bullets: [
      'Drag/drop prioritization support',
      'Pause/resume for queued jobs',
      'Cancellation and failure visibility in blocked lane',
    ],
  },
]

function App() {
  return (
    <main className="min-h-screen bg-rust-bg text-rust-text">
      <div className="border-b border-rust-border bg-rust-panel/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <a href="#overview" className="text-lg font-semibold tracking-wide text-rust-accentSoft">
            seal docs
          </a>
          <nav className="flex flex-wrap gap-2">
            {navSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-md border border-rust-border px-3 py-1.5 text-sm text-rust-muted transition hover:bg-rust-panelSoft hover:text-rust-text"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-rust-border bg-rust-panel p-5 shadow-glow lg:sticky lg:top-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rust-accentSoft">Sections</p>
          <div className="mt-4 space-y-2">
            {navSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-lg border border-transparent px-3 py-2 text-sm text-rust-muted transition hover:border-rust-border hover:bg-rust-panelSoft hover:text-rust-text"
              >
                {section.title}
              </a>
            ))}
          </div>
          <a
            href="https://github.com/Unchained-Labs/seal"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex rounded-lg bg-rust-accent px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            GitHub Repository
          </a>
        </aside>

        <section className="space-y-4">
          {navSections.map((section) => (
            <article
              key={section.id}
              id={section.id}
              className="scroll-mt-24 rounded-2xl border border-rust-border bg-rust-panel p-6 shadow-glow"
            >
              <h2 className="text-2xl font-semibold">{section.title}</h2>
              <p className="mt-2 text-rust-muted">{section.summary}</p>
              <ul className="mt-4 grid gap-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="rounded-lg border border-rust-border bg-rust-panelSoft px-3 py-2 text-sm">
                    {bullet}
                  </li>
                ))}
              </ul>
            </article>
          ))}

          <article id="commands" className="scroll-mt-24 rounded-2xl border border-rust-border bg-rust-panel p-6 shadow-glow">
            <h2 className="text-2xl font-semibold">Site Commands</h2>
            <pre className="mt-3 overflow-auto rounded-lg bg-rust-bg p-4 text-sm text-rust-accentSoft">
{`cd docs/site
npm install
npm run dev
npm run build
npm run preview`}
            </pre>
          </article>
        </section>
      </div>
    </main>
  )
}

export default App
