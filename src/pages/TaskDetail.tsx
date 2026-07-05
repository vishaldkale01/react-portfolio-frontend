import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CodeExerciseEditor from '../components/learning/CodeExerciseEditor';
import Timer from '../components/learning/Timer';
import { useAdmin } from '../context/AdminContext';
import { Flashcard, LearningExercise, LearningTask, TaskComment, commentApi, learningApi, timeApi } from '../utils/learningApi';

type ActiveTimerResponse = { activeTimer: unknown | null };
type PracticeTab = 'learn' | 'practice' | 'reflect';

const DEFAULT_CODE_EXERCISE: LearningExercise = {
  type: 'coding',
  language: 'javascript',
  difficulty: 'medium',
  prompt:
    'Write three Node.js examples that show: a closure bug inside a loop, this loss when a method is passed as a callback, and a prototype method override. Then fix all three and explain the before/after behavior.',
  starterCode: `// 1. Closure bug inside a loop
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log('buggy loop:', i), 0);
}

// Fix it with let or an IIFE
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log('fixed loop:', i), 0);
}

// 2. this loss in callback
const player = {
  name: 'Vishal',
  score: 0,
  addPoint() {
    this.score += 1;
    return this.score;
  },
};

// const add = player.addPoint; // this is lost
const add = player.addPoint.bind(player);
console.log(add());

// 3. Prototype method override
function Room(id) {
  this.id = id;
}

Room.prototype.reconnect = function () {
  return 'reconnect room ' + this.id;
};

const room = new Room('A1');
room.reconnect = function () {
  return 'custom reconnect ' + this.id;
};

console.log(room.reconnect());`,
  expectedOutput: 'The fixed examples should print predictable loop indexes, preserve this, and show method shadowing clearly.',
  hints: [
    'var is function scoped, let is block scoped.',
    'Passing an object method as a callback can lose its receiver.',
    'An own method shadows a prototype method with the same name.',
  ],
};

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAdmin();
  const [task, setTask] = useState<LearningTask | null>(null);
  const [allTasks, setAllTasks] = useState<LearningTask[]>([]);
  const [planTitle, setPlanTitle] = useState('Learning');
  const [phaseTitle, setPhaseTitle] = useState('JavaScript Fundamentals');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activeTimer, setActiveTimer] = useState<unknown | null>(null);
  const [activeTab, setActiveTab] = useState<PracticeTab>('learn');
  const [newComment, setNewComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showRoadmapPanel, setShowRoadmapPanel] = useState(() => localStorage.getItem('learningRoadmapPanelHidden') !== 'true');
  const [showStudyPanel, setShowStudyPanel] = useState(() => localStorage.getItem('learningStudyPanelHidden') !== 'true');
  const [logDraft, setLogDraft] = useState({
    lessonSummary: '',
    practiceSummary: '',
    projectConnection: '',
    doubts: '',
    notes: '',
    confidenceScore: '3',
  });

  const currentIndex = allTasks.findIndex((item) => item._id === taskId);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allTasks.length - 1;
  const exercises = useMemo(() => getExercises(task), [task]);
  const primaryExercise = exercises[0] || DEFAULT_CODE_EXERCISE;
  const lessonSections = useMemo(() => getLessonSections(task), [task]);
  const currentProgress = allTasks.length ? Math.round(((currentIndex + 1) / allTasks.length) * 100) : 0;
  const layoutColumns = showRoadmapPanel && showStudyPanel
    ? 'xl:grid-cols-[300px_minmax(0,1fr)_320px]'
    : showRoadmapPanel
      ? 'xl:grid-cols-[300px_minmax(0,1fr)]'
      : showStudyPanel
        ? 'xl:grid-cols-[minmax(0,1fr)_320px]'
        : 'xl:grid-cols-1';

  useEffect(() => {
    localStorage.setItem('learningRoadmapPanelHidden', String(!showRoadmapPanel));
  }, [showRoadmapPanel]);

  useEffect(() => {
    localStorage.setItem('learningStudyPanelHidden', String(!showStudyPanel));
  }, [showStudyPanel]);

  const fetchComments = useCallback(async (id: string) => {
    const response = await commentApi.getTaskComments(id);
    if ('data' in response && response.data) {
      const payload = response.data as unknown;
      setComments(Array.isArray(payload) ? payload : Array.isArray((payload as { data?: unknown[] })?.data) ? (payload as { data: TaskComment[] }).data : []);
    }
  }, []);

  const fetchTaskAndRelated = useCallback(async () => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const plansResponse = await learningApi.getAllPlans();
    if (!('data' in plansResponse) || !plansResponse.data) {
      setLoading(false);
      return;
    }

    let tasks: LearningTask[] = [];
    let currentTask: LearningTask | null = null;
    let matchedPlanTitle = 'Learning';
    let matchedPhaseTitle = 'Practice Task';

    for (const plan of plansResponse.data) {
      const detail = await learningApi.getPlanById(plan._id);
      if ('data' in detail && detail.data) {
        const phaseOrder = new Map(detail.data.phases.map((phase) => [phase._id, phase.order]));
        const phaseTitleById = new Map(detail.data.phases.map((phase) => [phase._id, phase.title]));
        const planTasks = detail.data.tasks
          .slice()
          .sort((a, b) => (phaseOrder.get(a.phaseId || '') || 999) - (phaseOrder.get(b.phaseId || '') || 999) || (a.order || 0) - (b.order || 0));
        const matchingTask = planTasks.find((item) => item._id === taskId) || null;
        if (matchingTask) {
          tasks = planTasks;
          currentTask = matchingTask;
          matchedPlanTitle = plan.title;
          matchedPhaseTitle = phaseTitleById.get(matchingTask.phaseId || '') || 'Practice Task';
          break;
        }
      }
    }

    setAllTasks(tasks);
    setTask(currentTask);
    setPlanTitle(matchedPlanTitle);
    setPhaseTitle(matchedPhaseTitle);

    if (currentTask) {
      await fetchComments(currentTask._id);
      const timerResponse = await timeApi.getActiveTimer(currentTask._id);
      if ('data' in timerResponse && timerResponse.data) {
        setActiveTimer((timerResponse.data as ActiveTimerResponse).activeTimer);
      }

      const sections = getLessonSections(currentTask);
      const taskExercises = getExercises(currentTask);
      setLogDraft((draft) => ({
        ...draft,
        lessonSummary: sections[0]?.content || currentTask.description || '',
        practiceSummary: taskExercises[0]?.prompt || DEFAULT_CODE_EXERCISE.prompt,
        projectConnection: sections.find((section) => section.title.toLowerCase().includes('project'))?.content || '',
        confidenceScore: String(Math.min(5, Math.max(1, Math.round(currentTask.confidenceScore ?? 3)))),
      }));
    }

    setLoading(false);
  }, [fetchComments, taskId]);

  useEffect(() => {
    fetchTaskAndRelated();
  }, [fetchTaskAndRelated]);

  const updateStatus = async (status: LearningTask['status']) => {
    if (!task) return;
    await learningApi.updateTask(task._id, { status });
    await fetchTaskAndRelated();
  };

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskId || !newComment.trim() || (!isAuthenticated && !authorName.trim())) return;

    setSubmitting(true);
    if (isAuthenticated) await commentApi.addAdminComment(taskId, newComment, authorName || 'Admin');
    else await commentApi.addComment(taskId, newComment, authorName);
    setNewComment('');
    if (!isAuthenticated) setAuthorName('');
    await fetchComments(taskId);
    setSubmitting(false);
  };

  const submitDailyLog = async () => {
    if (!task) return;
    setSubmitting(true);
    await learningApi.createDailyLog(task.planId, {
      ...logDraft,
      taskId: task._id,
      date: new Date().toISOString(),
      confidenceScore: Number(logDraft.confidenceScore),
    });
    await fetchTaskAndRelated();
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07111f] text-white flex items-center justify-center">
        Loading practice session...
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#07111f] flex items-center justify-center">
        <div className="text-xl text-red-400">Practice task not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111f] px-3 py-4 text-slate-100 sm:px-5">
      <div className={`mx-auto grid w-full max-w-[1780px] gap-4 ${layoutColumns}`}>
        {showRoadmapPanel && (
          <LearningTaskRail
            allTasks={allTasks}
            currentIndex={currentIndex}
            navigate={navigate}
            onCollapse={() => setShowRoadmapPanel(false)}
            taskId={taskId}
            phaseTitle={phaseTitle}
          />
        )}

        <main className="min-w-0 space-y-4">
          <SessionTopBar
            currentIndex={currentIndex}
            allTasks={allTasks}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
            navigate={navigate}
            phaseTitle={phaseTitle}
            showRoadmapPanel={showRoadmapPanel}
            showStudyPanel={showStudyPanel}
            toggleRoadmapPanel={() => setShowRoadmapPanel((value) => !value)}
            toggleStudyPanel={() => setShowStudyPanel((value) => !value)}
          />

          <PracticeHeaderCard
            task={task}
            planTitle={planTitle}
            phaseTitle={phaseTitle}
            currentProgress={currentProgress}
            isAuthenticated={isAuthenticated}
            updateStatus={updateStatus}
          />

          <PracticeTabs activeTab={activeTab} setActiveTab={setActiveTab} />

          <section className="rounded-2xl border border-slate-700/40 bg-[#0b1628]/90 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.25)]">
            {activeTab === 'learn' && <LearnTab lessonSections={lessonSections} exercise={primaryExercise} flashcards={task.flashcards || []} resources={task.resources || []} />}
            {activeTab === 'practice' && <PracticeWorkTab task={task} exercise={primaryExercise} isAuthenticated={isAuthenticated} />}
            {activeTab === 'reflect' && (
              <ReflectTab
                comments={comments}
                handleAddComment={handleAddComment}
                isAuthenticated={isAuthenticated}
                authorName={authorName}
                setAuthorName={setAuthorName}
                newComment={newComment}
                setNewComment={setNewComment}
                submitting={submitting}
              />
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/40 bg-[#0b1628]/80 p-3">
            <button
              onClick={() => hasPrevious && navigate(`/task/${allTasks[currentIndex - 1]._id}`)}
              disabled={!hasPrevious}
              className="rounded-xl border border-slate-700/60 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800/70 disabled:opacity-40"
            >
              Previous Topic
            </button>
            <div className="flex min-w-[220px] items-center gap-3 text-xs text-slate-400">
              <span>Lesson Progress</span>
              <span className="h-1.5 flex-1 rounded-full bg-slate-800">
                <span className="block h-full rounded-full bg-blue-500" style={{ width: `${currentProgress}%` }} />
              </span>
              <span>{currentProgress}%</span>
            </div>
            <button
              onClick={() => hasNext && navigate(`/task/${allTasks[currentIndex + 1]._id}`)}
              disabled={!hasNext}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
            >
              Next Topic
            </button>
          </div>
        </main>

        {showStudyPanel && (
          <PracticeSidePanel
            activeTimer={activeTimer}
            isAuthenticated={isAuthenticated}
            logDraft={logDraft}
            onCollapse={() => setShowStudyPanel(false)}
            setLogDraft={setLogDraft}
            submitDailyLog={submitDailyLog}
            submitting={submitting}
            task={task}
            updateStatus={updateStatus}
          />
        )}
      </div>
    </div>
  );
}

function LearningTaskRail({
  allTasks,
  currentIndex,
  navigate,
  onCollapse,
  phaseTitle,
  taskId,
}: {
  allTasks: LearningTask[];
  currentIndex: number;
  navigate: ReturnType<typeof useNavigate>;
  onCollapse: () => void;
  phaseTitle: string;
  taskId?: string;
}) {
  return (
    <aside className="hidden min-h-[calc(100vh-120px)] rounded-2xl border border-slate-700/40 bg-[#081322]/95 p-4 xl:block">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">{phaseTitle}</h2>
          <div className="mt-1 text-xs text-slate-500">{currentIndex + 1} / {allTasks.length || 0}</div>
        </div>
        <button onClick={onCollapse} className="rounded-lg border border-slate-700/60 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800/70 hover:text-white">
          Hide
        </button>
      </div>
      <div className="mt-4 h-1.5 rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-blue-500" style={{ width: allTasks.length ? `${((currentIndex + 1) / allTasks.length) * 100}%` : '0%' }} />
      </div>
      <div className="mt-5 space-y-2">
        {allTasks.map((item, index) => {
          const active = item._id === taskId;
          return (
            <button
              key={item._id}
              onClick={() => navigate(`/task/${item._id}`)}
              className={`w-full rounded-xl border p-3 text-left transition ${active ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]' : 'border-slate-700/40 bg-[#0d182a] hover:bg-[#101e33]'}`}
            >
              <div className="flex gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-semibold text-slate-100">{item.title}</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span className={item.status === 'completed' ? 'text-emerald-300' : item.status === 'in-progress' ? 'text-blue-300' : 'text-slate-500'}>{formatStatus(item.status)}</span>
                    <span>~ {item.dueDate ? 'timed' : '5-6 hrs'}</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button className="mt-5 w-full rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-sm text-blue-300">
        + Add Custom Task
      </button>
    </aside>
  );
}

function SessionTopBar({
  allTasks,
  currentIndex,
  hasNext,
  hasPrevious,
  navigate,
  phaseTitle,
  showRoadmapPanel,
  showStudyPanel,
  toggleRoadmapPanel,
  toggleStudyPanel,
}: {
  allTasks: LearningTask[];
  currentIndex: number;
  hasNext: boolean;
  hasPrevious: boolean;
  navigate: ReturnType<typeof useNavigate>;
  phaseTitle: string;
  showRoadmapPanel: boolean;
  showStudyPanel: boolean;
  toggleRoadmapPanel: () => void;
  toggleStudyPanel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/40 bg-[#0b1628]/80 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button onClick={() => navigate(-1)} className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-slate-300 hover:bg-slate-800">
          Back to Lesson
        </button>
        <span className="text-slate-500">Learning</span>
        <span className="text-slate-600">›</span>
        <span className="text-slate-400">{phaseTitle}</span>
        <span className="text-slate-600">›</span>
        <span className="text-blue-300">Practice Task</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <button onClick={toggleRoadmapPanel} className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs transition hover:bg-slate-800 hover:text-white">
          {showRoadmapPanel ? 'Hide roadmap' : 'Show roadmap'}
        </button>
        <button onClick={toggleStudyPanel} className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs transition hover:bg-slate-800 hover:text-white">
          {showStudyPanel ? 'Hide study panel' : 'Show study panel'}
        </button>
        <span>{currentIndex + 1} / {allTasks.length || 0}</span>
        <button onClick={() => hasPrevious && navigate(`/task/${allTasks[currentIndex - 1]._id}`)} disabled={!hasPrevious} className="h-8 w-8 rounded-lg border border-slate-700/60 disabled:opacity-40">‹</button>
        <button onClick={() => hasNext && navigate(`/task/${allTasks[currentIndex + 1]._id}`)} disabled={!hasNext} className="h-8 w-8 rounded-lg border border-slate-700/60 disabled:opacity-40">›</button>
      </div>
    </div>
  );
}

function PracticeHeaderCard({
  currentProgress,
  isAuthenticated,
  phaseTitle,
  planTitle,
  task,
  updateStatus,
}: {
  currentProgress: number;
  isAuthenticated: boolean;
  phaseTitle: string;
  planTitle: string;
  task: LearningTask;
  updateStatus: (status: LearningTask['status']) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-700/40 bg-[radial-gradient(circle_at_80%_20%,rgba(37,99,235,0.22),transparent_30%),#0b1628] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.28)]">
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-200">Practice Task</span>
            <span className="text-xs text-slate-500">{planTitle}</span>
            <span className="text-xs text-slate-600">/</span>
            <span className="text-xs text-slate-400">{phaseTitle}</span>
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.02em] text-white md:text-4xl">
            {task.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            {cleanText(task.description) || 'Practice developer concepts through real examples, debugging, output prediction, and interview-style explanation.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <MetricPill label="5-6 hrs" tone="purple" />
            <MetricPill label={task.priority || 'Medium'} tone="amber" />
            <MetricPill label={formatStatus(task.status)} tone="blue" />
            <div className="flex min-w-[180px] items-center gap-2 text-xs text-slate-400">
              <span>Progress</span>
              <span className="h-1.5 flex-1 rounded-full bg-slate-800">
                <span className="block h-full rounded-full bg-blue-500" style={{ width: `${currentProgress}%` }} />
              </span>
              <span>{currentProgress}%</span>
            </div>
          </div>
        </div>
        <aside className="rounded-xl border border-slate-700/40 bg-[#07111f]/75 p-4">
          <div className="text-xs text-slate-500">Admin controls {isAuthenticated ? '(visible)' : '(read only)'}</div>
          <select
            value={task.status}
            onChange={(event) => updateStatus(event.target.value as LearningTask['status'])}
            disabled={!isAuthenticated}
            className="mt-3 w-full rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none disabled:opacity-60"
          >
            <option value="not-started">Not Started</option>
            <option value="learning">Learning</option>
            <option value="practiced">Practiced</option>
            <option value="revised">Revised</option>
            <option value="completed">Completed</option>
          </select>
          <div className="mt-4 text-xs text-slate-500">Editable by admin only</div>
          <button disabled={!isAuthenticated} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
            Update Task
          </button>
        </aside>
      </div>
    </section>
  );
}

function PracticeTabs({ activeTab, setActiveTab }: { activeTab: PracticeTab; setActiveTab: (tab: PracticeTab) => void }) {
  const tabs: Array<{ key: PracticeTab; label: string }> = [
    { key: 'learn', label: '1. Learn Concept' },
    { key: 'practice', label: '2. Practice Task' },
    { key: 'reflect', label: '3. Reflect & Log' },
  ];

  return (
    <div className="rounded-2xl border border-slate-700/40 bg-[#0b1628]/80 px-3 py-2">
      <div role="tablist" aria-label="Practice session tabs" className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl px-4 py-2 text-sm transition ${activeTab === tab.key ? 'bg-blue-600 text-white shadow-[0_8px_26px_rgba(37,99,235,0.3)]' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LearnTab({
  exercise,
  flashcards,
  lessonSections,
  resources,
}: {
  exercise: LearningExercise;
  flashcards: Flashcard[];
  lessonSections: Array<{ title: string; content: string; order: number }>;
  resources: string[];
}) {
  const [activeStep, setActiveStep] = useState(0);
  const concept = lessonSections.find((section) => /concept|theory/i.test(section.title))?.content;
  const outcomes = lessonSections.find((section) => /outcome|achieve|objective/i.test(section.title))?.content;
  const goal = lessonSections.find((section) => /goal|practice/i.test(section.title))?.content;
  const connection = lessonSections.find((section) => /project|connection/i.test(section.title))?.content;
  const outcomeItems = getOutcomeItems(outcomes);
  const steps = [
    {
      label: 'Concept',
      title: 'Understand the idea',
      content: concept || 'Explain execution context, scope chain, hoisting rules, closures, prototype delegation, and call-site based this behavior.',
      tone: 'blue' as const,
    },
    {
      label: 'Practice Goal',
      title: 'Know what to build',
      content: goal || 'Implement tiny Node.js snippets that reproduce closure bugs in loops, this loss in callbacks, and prototype method shadowing. Then fix each issue and explain the before/after behavior.',
      tone: 'green' as const,
    },
    {
      label: 'Project Connection',
      title: 'Connect it to real work',
      content: connection || 'Connect the exercise to real backend work, such as Fruit Chop re-join logic, real-time multiplayer handlers, callback state bugs, shared mutation, and reconnect behavior.',
      tone: 'orange' as const,
    },
    ...(outcomeItems.length
      ? [{
          label: 'Outcomes',
          title: 'Check what you should achieve',
          content: outcomeItems.join('\n'),
          tone: 'blue' as const,
          outcomes: outcomeItems,
        }]
      : []),
  ];
  const step = steps[activeStep] || steps[0];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/40 bg-[#0a1426] p-4">
        <div className="flex flex-wrap gap-2">
          {steps.map((item, index) => (
            <button
              key={item.label}
              onClick={() => setActiveStep(index)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${activeStep === index ? 'border-blue-500 bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)]' : 'border-slate-700/50 bg-slate-900/50 text-slate-400 hover:text-white'}`}
            >
              {index + 1}. {item.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-5">
            <div className="flex items-start gap-4">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${step.tone === 'green' ? 'bg-emerald-500/15 text-emerald-300' : step.tone === 'orange' ? 'bg-orange-500/15 text-orange-300' : 'bg-blue-500/15 text-blue-300'}`}>
                {String(activeStep + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-blue-300">{step.label}</p>
                <h3 className="mt-2 text-2xl font-semibold leading-tight text-white">{step.title}</h3>
                {step.outcomes ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {step.outcomes.map((item) => (
                      <label key={item} className="flex items-start gap-3 rounded-xl border border-slate-700/40 bg-[#091426] p-3 text-sm leading-5 text-slate-300">
                        <input type="checkbox" className="mt-1 accent-blue-500" />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <RichContent html={step.content} className="mt-4 text-base leading-8 text-slate-300" />
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/40 pt-4">
              <button
                onClick={() => setActiveStep((value) => Math.max(0, value - 1))}
                disabled={activeStep === 0}
                className="rounded-xl border border-slate-700/60 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
              >
                Previous step
              </button>
              <button
                onClick={() => setActiveStep((value) => Math.min(steps.length - 1, value + 1))}
                disabled={activeStep === steps.length - 1}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
              >
                I got this, next
              </button>
            </div>
          </article>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
              <h3 className="text-sm font-semibold text-white">Quick self-check</h3>
              <div className="mt-4 space-y-3">
                {[
                  'Can I explain this without reading?',
                  'Can I connect it to one project bug?',
                  'Can I write one small code example?',
                ].map((item) => (
                  <label key={item} className="flex items-start gap-3 text-sm leading-5 text-slate-300">
                    <input type="checkbox" className="mt-1 accent-blue-500" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
              <h3 className="text-sm font-semibold text-blue-100">Practice preview</h3>
              <p className="mt-2 line-clamp-5 text-sm leading-6 text-blue-100/80">{exercise.prompt || DEFAULT_CODE_EXERCISE.prompt}</p>
            </div>
          </aside>
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ResourcePanel resources={resources} />
        <FlashcardDeck flashcards={flashcards} />
      </div>
    </div>
  );
}

function ResourcePanel({ resources }: { resources: string[] }) {
  const visibleResources = resources.filter(Boolean);
  return (
    <section className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Resources</h3>
          <p className="mt-1 text-sm text-slate-500">Useful links or files connected to this topic.</p>
        </div>
        <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">{visibleResources.length}</span>
      </div>
      {visibleResources.length ? (
        <div className="mt-4 grid gap-2">
          {visibleResources.map((resource) => (
            <a
              key={resource}
              href={resource}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-700/40 bg-[#091426] px-3 py-2 text-sm text-blue-200 transition hover:border-blue-500/50 hover:bg-blue-500/10"
            >
              {resource}
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-700/60 bg-[#091426] p-4 text-sm text-slate-500">
          No resources added yet. Admin can attach docs, videos, repo files, or reference links from the lesson editor.
        </p>
      )}
    </section>
  );
}

function FlashcardDeck({ flashcards }: { flashcards: Flashcard[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const activeCard = flashcards[activeIndex];

  const nextCard = () => {
    if (!flashcards.length) return;
    setShowAnswer(false);
    setActiveIndex((index) => (index + 1) % flashcards.length);
  };

  const previousCard = () => {
    if (!flashcards.length) return;
    setShowAnswer(false);
    setActiveIndex((index) => (index - 1 + flashcards.length) % flashcards.length);
  };

  return (
    <section className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Flashcard Review</h3>
          <p className="mt-1 text-sm text-slate-500">Test recall before moving to practice.</p>
        </div>
        <span className="text-xs text-slate-500">{flashcards.length ? `${activeIndex + 1}/${flashcards.length}` : '0/0'}</span>
      </div>

      {activeCard ? (
        <>
          <button
            onClick={() => setShowAnswer((value) => !value)}
            className="mt-4 min-h-[180px] w-full rounded-2xl border border-blue-500/25 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.18),transparent_36%),#091426] p-5 text-left transition hover:border-blue-500/50"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-blue-300">{showAnswer ? 'Answer' : 'Question'}</p>
            <p className="mt-4 text-lg font-semibold leading-7 text-white">
              {showAnswer ? activeCard.answer : activeCard.question}
            </p>
            <p className="mt-5 text-xs text-slate-500">Click card to {showAnswer ? 'show question' : 'reveal answer'}.</p>
          </button>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {['Again', 'Hard', 'Good', 'Easy'].map((label) => (
              <button key={label} onClick={nextCard} className="rounded-xl border border-slate-700/60 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white">
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <button onClick={previousCard} className="rounded-xl border border-slate-700/60 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800">Previous</button>
            <button onClick={nextCard} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500">Next card</button>
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-700/60 bg-[#091426] p-4 text-sm text-slate-500">
          No flashcards added yet. Admin can add quick Q&A cards to turn this topic into active recall.
        </p>
      )}
    </section>
  );
}

function PracticeWorkTab({ exercise, isAuthenticated, task }: { exercise: LearningExercise; isAuthenticated: boolean; task: LearningTask }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <CodePracticeTab task={task} exercise={exercise} isAuthenticated={isAuthenticated} />
      <HintsTab exercise={exercise} />
    </div>
  );
}

function ReflectTab(props: {
  authorName: string;
  comments: TaskComment[];
  handleAddComment: (event: React.FormEvent) => void;
  isAuthenticated: boolean;
  newComment: string;
  setAuthorName: (value: string) => void;
  setNewComment: (value: string) => void;
  submitting: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <ReviewTab {...props} />
      <section className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
        <h3 className="text-base font-semibold text-white">Before moving on</h3>
        <div className="mt-4 space-y-3">
          {[
            'I can explain the concept in my own words.',
            'I completed or attempted the practice task.',
            'I wrote one project connection or blocker.',
          ].map((item) => (
            <label key={item} className="flex items-start gap-3 text-sm leading-5 text-slate-300">
              <input type="checkbox" className="mt-1 accent-blue-500" />
              <span>{item}</span>
            </label>
          ))}
        </div>
        <p className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs leading-5 text-blue-100">
          Reflection is where the learning sticks. Keep it short, but write what changed in your understanding.
        </p>
      </section>
    </div>
  );
}

function InstructionsTab({ lessonSections }: { lessonSections: Array<{ title: string; content: string; order: number }> }) {
  const concept = lessonSections.find((section) => /concept|theory/i.test(section.title))?.content;
  const outcomes = lessonSections.find((section) => /outcome|achieve|objective/i.test(section.title))?.content;
  const goal = lessonSections.find((section) => /goal|practice/i.test(section.title))?.content;
  const connection = lessonSections.find((section) => /project|connection/i.test(section.title))?.content;
  const outcomeItems = getOutcomeItems(outcomes);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <InstructionCard
          icon="01"
          title="Concept"
          content={concept || 'Explain execution context, scope chain, hoisting rules, closures, prototype delegation, and call-site based this behavior.'}
          tone="blue"
        />
        <InstructionCard
          icon="02"
          title="Practice Goal"
          content={goal || 'Implement tiny Node.js snippets that reproduce closure bugs in loops, this loss in callbacks, and prototype method shadowing. Then fix each issue and explain the before/after behavior.'}
          tone="green"
        />
        <InstructionCard
          icon="03"
          title="Project Connection"
          content={connection || 'Connect the exercise to real backend work, such as Fruit Chop re-join logic, real-time multiplayer handlers, callback state bugs, shared mutation, and reconnect behavior.'}
          tone="orange"
        />
      </div>
      {outcomeItems.length > 0 && (
        <section className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
          <h3 className="text-base font-semibold text-white">What you will achieve</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {outcomeItems.map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-slate-300">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs text-emerald-300">✓</span>
              {item}
            </div>
          ))}
        </div>
        </section>
      )}
    </div>
  );
}

function CodePracticeTab({ exercise, isAuthenticated, task }: { exercise: LearningExercise; isAuthenticated: boolean; task: LearningTask }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">Coding Practice</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{exercise.prompt || DEFAULT_CODE_EXERCISE.prompt}</p>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs capitalize text-amber-200">{exercise.difficulty || 'medium'}</span>
        </div>
      </section>
      <CodeExerciseEditor taskId={task._id} exercise={exercise.type === 'coding' ? exercise : DEFAULT_CODE_EXERCISE} isAdmin={isAuthenticated} />
    </div>
  );
}

function HintsTab({ exercise }: { exercise: LearningExercise }) {
  const hints = exercise.hints?.length ? exercise.hints : DEFAULT_CODE_EXERCISE.hints || [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {hints.map((hint, index) => (
        <div key={hint} className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
          <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/15 text-sm font-semibold text-blue-300">{index + 1}</div>
          <p className="text-sm leading-6 text-slate-300">{hint}</p>
        </div>
      ))}
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
        Tip: do not rush. Focus on understanding why something works, not just how.
      </div>
    </div>
  );
}

function ExplanationTab({ exercise, lessonSections }: { exercise: LearningExercise; lessonSections: Array<{ title: string; content: string; order: number }> }) {
  return (
    <div className="space-y-4">
      {lessonSections.map((section) => (
        <section key={`${section.title}-${section.order}`} className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-300">{section.title}</p>
          <RichContent html={section.content} className="mt-3 text-sm leading-7 text-slate-300" />
        </section>
      ))}
      <section className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
        <h3 className="text-base font-semibold text-white">Expected Explanation</h3>
        <p className="mt-3 text-sm leading-7 text-slate-300">
          {exercise.solution || 'Explain what was broken, why JavaScript behaved that way, and how the fix changes scope, binding, or prototype lookup.'}
        </p>
      </section>
    </div>
  );
}

function ReviewTab({
  authorName,
  comments,
  handleAddComment,
  isAuthenticated,
  newComment,
  setAuthorName,
  setNewComment,
  submitting,
}: {
  authorName: string;
  comments: TaskComment[];
  handleAddComment: (event: React.FormEvent) => void;
  isAuthenticated: boolean;
  newComment: string;
  setAuthorName: (value: string) => void;
  setNewComment: (value: string) => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
        <h3 className="text-base font-semibold text-white">Review Notes</h3>
        <div className="mt-4 space-y-3">
          {comments.length === 0 ? <p className="text-sm text-slate-500">No review notes yet.</p> : comments.map((comment) => (
            <div key={comment._id} className="rounded-xl border border-slate-700/40 bg-[#091426] p-3">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{comment.author}</span>
                <span>{new Date(comment.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{comment.content}</p>
            </div>
          ))}
        </div>
      </section>
      <form onSubmit={handleAddComment} className="rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-4">
        {!isAuthenticated && (
          <input value={authorName} onChange={(event) => setAuthorName(event.target.value)} placeholder="Your name" className="mb-3 w-full rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none" required />
        )}
        <textarea value={newComment} onChange={(event) => setNewComment(event.target.value)} rows={4} placeholder="Write a doubt, note, or explanation in your own words..." className="w-full resize-none rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none" required />
        <button disabled={submitting} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">Add Review Note</button>
      </form>
    </div>
  );
}

function PracticeSidePanel({
  activeTimer,
  isAuthenticated,
  logDraft,
  onCollapse,
  setLogDraft,
  submitDailyLog,
  submitting,
  task,
  updateStatus,
}: {
  activeTimer: unknown | null;
  isAuthenticated: boolean;
  logDraft: {
    lessonSummary: string;
    practiceSummary: string;
    projectConnection: string;
    doubts: string;
    notes: string;
    confidenceScore: string;
  };
  onCollapse: () => void;
  setLogDraft: (draft: {
    lessonSummary: string;
    practiceSummary: string;
    projectConnection: string;
    doubts: string;
    notes: string;
    confidenceScore: string;
  }) => void;
  submitDailyLog: () => void;
  submitting: boolean;
  task: LearningTask;
  updateStatus: (status: LearningTask['status']) => Promise<void>;
}) {
  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-slate-700/40 bg-[#081322]/95 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Session Timer</h2>
          <button onClick={onCollapse} className="rounded-lg border border-slate-700/60 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800/70 hover:text-white">
            Hide
          </button>
        </div>
        <div className="mt-3">
          <Timer taskId={task._id} activeTimer={activeTimer} totalTimeSpent={task.totalTimeSpent} />
        </div>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs text-slate-500">Task Status</span>
            <select value={task.status} onChange={(event) => updateStatus(event.target.value as LearningTask['status'])} disabled={!isAuthenticated} className="mt-1 w-full rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none disabled:opacity-60">
              <option value="not-started">Not Started</option>
              <option value="learning">Learning</option>
              <option value="practiced">Practiced</option>
              <option value="revised">Revised</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <InfoLine label="Priority" value={task.priority || 'medium'} />
          <label className="block">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Confidence</span>
              <span className="font-semibold text-white">{logDraft.confidenceScore} / 5</span>
            </div>
            <input type="range" min="1" max="5" value={logDraft.confidenceScore} onChange={(event) => setLogDraft({ ...logDraft, confidenceScore: event.target.value })} className="mt-2 w-full" />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700/40 bg-[#081322]/95 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Daily Practice Log</h2>
          <span className="text-slate-500">⌃</span>
        </div>
        {isAuthenticated ? (
          <div className="mt-4 space-y-3">
            <LogTextarea label="What did you learn today?" value={logDraft.lessonSummary} onChange={(value) => setLogDraft({ ...logDraft, lessonSummary: value })} />
            <LogTextarea label="Any doubts / blockers?" value={logDraft.doubts} onChange={(value) => setLogDraft({ ...logDraft, doubts: value })} />
            <LogTextarea label="Key takeaway" value={logDraft.practiceSummary} onChange={(value) => setLogDraft({ ...logDraft, practiceSummary: value })} />
            <LogTextarea label="Project connection" value={logDraft.projectConnection} onChange={(value) => setLogDraft({ ...logDraft, projectConnection: value })} />
            <LogTextarea label="Daily recap" value={logDraft.notes} onChange={(value) => setLogDraft({ ...logDraft, notes: value })} />
            <button onClick={submitDailyLog} disabled={submitting} className="w-full rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60">Save Today's Log</button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Log in as admin to save daily logs, coding attempts, and timer sessions.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-700/40 bg-[#081322]/95 p-4">
        <h2 className="text-sm font-semibold text-white">Today's Focus</h2>
        <ul className="mt-4 space-y-3 text-sm text-slate-400">
          <li>Understand deeply</li>
          <li>Practice intentionally</li>
          <li>Build real-world connection</li>
        </ul>
      </section>
    </aside>
  );
}

function InstructionCard({ content, icon, title, tone }: { content: string; icon: string; title: string; tone: 'blue' | 'green' | 'orange' }) {
  const toneClass = tone === 'green' ? 'bg-emerald-500/15 text-emerald-300' : tone === 'orange' ? 'bg-orange-500/15 text-orange-300' : 'bg-blue-500/15 text-blue-300';
  const summary = getLearningSummary(content);
  return (
    <article className="min-h-[210px] rounded-2xl border border-slate-700/40 bg-[#0e1a2e] p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${toneClass}`}>{icon}</span>
        <div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <p className="mt-3 line-clamp-5 text-sm leading-6 text-slate-300">{summary}</p>
        </div>
      </div>
    </article>
  );
}

function MetricPill({ label, tone }: { label: string; tone: 'purple' | 'amber' | 'blue' }) {
  const toneClass = tone === 'amber' ? 'border-amber-500/25 bg-amber-500/10 text-amber-200' : tone === 'purple' ? 'border-purple-500/25 bg-purple-500/10 text-purple-200' : 'border-blue-500/25 bg-blue-500/10 text-blue-200';
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${toneClass}`}>{label}</span>;
}

function LogTextarea({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500" />
    </label>
  );
}

function RichContent({ className = '', html }: { className?: string; html: string }) {
  return (
    <div
      className={`prose-rich max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(html) }}
    />
  );
}

function getLessonSections(task: LearningTask | null) {
  if (!task) return [];
  const dynamicSections = task.lessonSections?.slice().sort((a, b) => a.order - b.order) || [];
  if (dynamicSections.length > 0) return dynamicSections;

  return [
    task.pythonConcept ? { title: 'Concept', content: task.pythonConcept, order: 1 } : null,
    task.tradingConcept ? { title: 'Practice Goal', content: task.tradingConcept, order: 2 } : null,
    task.projectConnection ? { title: 'Project Connection', content: task.projectConnection, order: 3 } : null,
  ].filter(Boolean) as Array<{ title: string; content: string; order: number }>;
}

function getExercises(task: LearningTask | null) {
  if (!task) return [];
  const exercises = task.exercises?.length ? task.exercises : task.exercise ? [task.exercise] : [];
  return exercises.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold capitalize text-white">{value}</span>
    </div>
  );
}

function cleanText(value?: string) {
  return (value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLearningSummary(value: string) {
  const text = cleanText(value);
  if (!text) return '';
  const firstParagraph = text.split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)[0]?.trim() || text;
  return firstParagraph.length > 180 ? `${firstParagraph.slice(0, 177).trim()}...` : firstParagraph;
}

function getOutcomeItems(value?: string) {
  if (!value) return [];
  const html = sanitizeLessonHtml(value);
  const listItems = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  if (listItems.length > 0) return listItems.slice(0, 8);

  return cleanText(html)
    .split(/\n+|•|- /)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function sanitizeLessonHtml(value: string) {
  return (value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function formatStatus(status: LearningTask['status']) {
  if (status === 'pending' || status === 'not-started') return 'Not Started';
  if (status === 'in-progress' || status === 'learning') return 'Learning';
  if (status === 'practiced') return 'Practiced';
  if (status === 'revised') return 'Revised';
  if (status === 'completed') return 'Completed';
  return 'Not Started';
}
