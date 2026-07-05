import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DailyLearningLog, LearningTask, PlanDetail as PlanDetailType, learningApi, timeApi } from '../utils/learningApi';
import { useTheme } from '../context/ThemeContext';

const formatDuration = (seconds = 0) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const statusProgress = (status: LearningTask['status']) => {
  if (status === 'completed') return 100;
  if (status === 'revised') return 85;
  if (status === 'practiced') return 65;
  if (status === 'in-progress' || status === 'learning') return 35;
  return 0;
};

const formatTopicStatus = (status: LearningTask['status']) => {
  if (status === 'pending' || status === 'not-started') return 'Not Started';
  if (status === 'in-progress' || status === 'learning') return 'Learning';
  if (status === 'practiced') return 'Practiced';
  if (status === 'revised') return 'Revised';
  return 'Completed';
};
const cleanText = (value?: string) => {
  return (value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const getTaskSummary = (task: LearningTask) => {
  const raw = task.lessonSections?.slice().sort((a, b) => a.order - b.order)[0]?.content || task.exercise?.prompt || task.description || task.aim || '';
  return cleanText(raw);
};

export default function PlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [detail, setDetail] = useState<PlanDetailType | null>(null);
  const [dailyLogs, setDailyLogs] = useState<DailyLearningLog[]>([]);
  const [stats, setStats] = useState({ todaySeconds: 0, weekSeconds: 0, totalSeconds: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      setLoading(true);
      const [planResponse, logsResponse, dailyResponse, weeklyResponse, planStatsResponse] = await Promise.all([
        learningApi.getPlanById(id),
        learningApi.getDailyLogs(id, 8),
        timeApi.getDailyStats(),
        timeApi.getWeeklyStats(),
        timeApi.getPlanStats(id),
      ]);

      if ('error' in planResponse) {
        setError(planResponse.error || 'Unable to load plan');
      } else if (planResponse.data) {
        setDetail(planResponse.data);
      }

      if ('data' in logsResponse && logsResponse.data) setDailyLogs(logsResponse.data);
      setStats({
        todaySeconds: 'data' in dailyResponse && dailyResponse.data ? dailyResponse.data.totalSeconds : 0,
        weekSeconds: 'data' in weeklyResponse && weeklyResponse.data ? weeklyResponse.data.totalSeconds : 0,
        totalSeconds: 'data' in planStatsResponse && planStatsResponse.data ? planStatsResponse.data.totalSeconds : 0,
      });
      setLoading(false);
    };

    fetchData();
  }, [id]);

  const phaseRows = useMemo(() => {
    if (!detail) return [];
    return detail.phases
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((phase) => {
        const tasks = detail.tasks
          .filter((task) => task.phaseId === phase._id)
          .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt.localeCompare(b.createdAt));
        const completed = tasks.filter((task) => task.status === 'completed').length;
        const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
        return { phase, tasks, completed, progress };
      });
  }, [detail]);

  const orderedTasks = useMemo(() => phaseRows.flatMap((row) => row.tasks), [phaseRows]);
  const completedTasks = orderedTasks.filter((task) => task.status === 'completed').length;
  const totalProgress = orderedTasks.length ? Math.round((completedTasks / orderedTasks.length) * 100) : 0;
  const currentTask = orderedTasks.find((task) => task.status !== 'completed') || orderedTasks[0];

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-[#0f1529] text-white' : 'bg-gray-100 text-gray-900'}`}>
        Loading roadmap...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-[#0f1529]' : 'bg-gray-100'}`}>
        <div className="text-red-400">Error: {error || 'Plan not found'}</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen px-4 py-8 sm:px-6 ${theme === 'dark' ? 'bg-[#0f1529] text-white' : 'bg-gray-100 text-gray-900'}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        <button onClick={() => navigate('/learning')} className={theme === 'dark' ? 'text-sm text-blue-300 hover:text-blue-200 transition-colors' : 'text-sm text-blue-600 hover:text-blue-500 transition-colors'}>
          &larr; Back to learning plans
        </button>

        <section className={`rounded-2xl border p-6 transition-all duration-300 ${theme === 'dark' ? 'border-gray-800 bg-gradient-to-br from-[#10182c] to-[#0e1628]' : 'border-gray-300 bg-white shadow-sm'}`}>
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-blue-400 font-semibold">Roadmap</p>
              <h1 className={`mt-2 text-3xl font-bold tracking-tight md:text-4xl ${theme === 'dark' ? 'text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400' : 'text-gray-900'}`}>{detail.plan.title}</h1>
              {detail.plan.description && <p className={`mt-4 max-w-3xl leading-7 text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{detail.plan.description}</p>}
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Progress" value={`${totalProgress}%`} />
                <Metric label="Tasks" value={`${completedTasks}/${orderedTasks.length}`} />
                <Metric label="Today" value={formatDuration(stats.todaySeconds)} />
                <Metric label="This Week" value={formatDuration(stats.weekSeconds)} />
              </div>
            </div>

            <div className={`rounded-xl border p-5 flex flex-col justify-between ${theme === 'dark' ? 'border-blue-500/20 bg-[#16223f]/60' : 'border-blue-200 bg-blue-50'}`}>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-400 font-semibold">Current Lesson</p>
                {currentTask ? (
                  <>
                    <h2 className={`mt-3 text-lg font-bold leading-snug ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{currentTask.title}</h2>
                    <p className={`mt-2 text-xs leading-5 line-clamp-3 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{getTaskSummary(currentTask) || 'Continue your next learning task.'}</p>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-gray-400">No tasks in this roadmap yet.</p>
                )}
              </div>
              {currentTask && (
                <button onClick={() => navigate(`/task/${currentTask._id}`)} className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition-colors shadow-md hover:shadow-blue-500/10">
                  Open Study Page
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <section className="relative pl-6 sm:pl-8 space-y-8 py-4">
            {/* Continuous vertical timeline path line */}
            <div className={`absolute left-[11px] sm:left-[15px] top-0 bottom-0 w-0.5 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`} />

            {phaseRows.map(({ phase, tasks, completed, progress }) => (
              <div key={phase._id} className="relative space-y-4">
                {/* Timeline node marker */}
                <div className={`absolute -left-[21px] sm:-left-[25px] top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                  theme === 'dark' ? 'bg-[#0f1529]' : 'bg-gray-100'
                } ${
                  progress === 100 
                    ? 'border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' 
                    : progress > 0 
                      ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]' 
                      : 'border-gray-500 dark:border-gray-700'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${
                    progress === 100 
                      ? 'bg-green-500' 
                      : progress > 0 
                        ? 'bg-blue-500' 
                        : 'bg-gray-500 dark:bg-gray-700'
                  }`} />
                </div>

                {/* Phase content header */}
                <div className="flex flex-col gap-1 pl-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400">Phase {phase.order}</span>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
                    <h2 className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{phase.title}</h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{completed}/{tasks.length} completed ({progress}%)</span>
                  </div>
                  {phase.description && <p className={`text-xs leading-5 max-w-3xl mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{phase.description}</p>}
                </div>

                {/* Tasks list in timeline */}
                <div className="space-y-3 pl-1">
                  {tasks.map((task) => (
                    <button
                      key={task._id}
                      onClick={() => navigate(`/task/${task._id}`)}
                      className={`group relative grid w-full gap-4 rounded-xl border p-4 text-left transition-all duration-300 md:grid-cols-[1fr_120px_100px] ${
                        theme === 'dark'
                          ? 'border-gray-800 bg-[#16223f]/25 hover:border-blue-500/30 hover:bg-[#16223f]/50 hover:shadow-lg hover:shadow-blue-500/5'
                          : 'border-gray-200 bg-white hover:border-blue-500/30 hover:bg-gray-50 hover:shadow-md'
                      }`}
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded-full border ${
                            task.status === 'completed' 
                              ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                              : task.status === 'in-progress' || task.status === 'learning' || task.status === 'practiced' || task.status === 'revised'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              task.status === 'completed' 
                                ? 'bg-green-400 animate-pulse' 
                                : task.status === 'in-progress' || task.status === 'learning' || task.status === 'practiced' || task.status === 'revised'
                                  ? 'bg-blue-400 animate-pulse' 
                                  : 'bg-gray-400'
                            }`} />
                            {formatTopicStatus(task.status)}
                          </span>
                          {typeof task.confidenceScore === 'number' && (
                            <span className="text-[9px] font-bold tracking-wider uppercase border border-purple-500/25 bg-purple-500/10 px-2 py-0.5 rounded-full text-purple-300">
                              Confidence {Math.min(5, Math.max(1, Math.round(task.confidenceScore)))}/5
                            </span>
                          )}
                        </div>
                        <h3 className={`mt-1.5 text-base font-semibold group-hover:text-blue-500 transition-colors duration-200 ${theme === 'dark' ? 'text-slate-100 group-hover:text-blue-400' : 'text-slate-800'}`}>{task.title}</h3>
                        <p className={`mt-1 line-clamp-2 text-xs leading-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{getTaskSummary(task)}</p>
                      </div>
                      <div className="flex flex-col justify-center text-xs">
                        <span className="text-gray-500 dark:text-gray-400/60 uppercase tracking-wider text-[8px] font-bold font-mono">Time Spent</span>
                        <span className={`font-semibold mt-0.5 font-mono ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>{formatDuration(task.totalTimeSpent)}</span>
                      </div>
                      <div className="flex flex-col justify-center gap-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-gray-500 dark:text-gray-400/60 uppercase tracking-wider text-[8px] font-bold font-mono">Progress</span>
                          <span className={`font-bold font-mono ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`}>{statusProgress(task.status)}%</span>
                        </div>
                        <div className={`h-1 w-full rounded-full overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`}>
                          <div className={`h-full rounded-full transition-all duration-500 ${
                            task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                          }`} style={{ width: `${statusProgress(task.status)}%` }} />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <aside className="space-y-4">
            <div className={`rounded-2xl border p-5 transition-all duration-300 ${theme === 'dark' ? 'border-gray-800 bg-[#10182c]/80' : 'border-gray-300 bg-white shadow-sm'}`}>
              <h2 className={`text-base font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>Study Totals</h2>
              <div className="mt-4 space-y-3 text-sm">
                <MetricLine label="Roadmap time" value={formatDuration(stats.totalSeconds)} />
                <MetricLine label="Today" value={formatDuration(stats.todaySeconds)} />
                <MetricLine label="This week" value={formatDuration(stats.weekSeconds)} />
              </div>
            </div>

            <div className={`rounded-2xl border p-5 transition-all duration-300 ${theme === 'dark' ? 'border-gray-800 bg-[#10182c]/80' : 'border-gray-300 bg-white shadow-sm'}`}>
              <h2 className={`text-base font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}`}>Recent Daily Logs</h2>
              <div className="mt-4 space-y-3">
                {dailyLogs.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No daily logs yet. Add one from a study page.</p>
                ) : (
                  dailyLogs.map((log) => (
                    <div key={log._id} className={`rounded-xl border p-4 transition-all ${theme === 'dark' ? 'border-gray-800 bg-[#0d1426]' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500 font-mono">
                        <span>{new Date(log.date).toLocaleDateString()}</span>
                        {typeof log.confidenceScore === 'number' && <span className="text-purple-400">Confidence {log.confidenceScore}/10</span>}
                      </div>
                      <p className={`mt-2.5 text-xs leading-5 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>{log.notes || log.practiceSummary || log.doubts || 'Learning log added.'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-700/40 bg-slate-50 dark:bg-gray-900/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
