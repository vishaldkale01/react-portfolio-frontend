import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Mark, mergeAttributes, Node as TiptapNode } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { LearningExercise, LearningPlan, LearningTask, LessonSection, Phase, PlanDetail as PlanDetailType, TaskComment, commentApi, learningApi } from '../../utils/learningApi';
import { useTheme } from '../../context/ThemeContext';

type LessonTab = 'overview' | 'theory' | 'practice' | 'code' | 'interview' | 'notes';
const TASK_STATUS_OPTIONS: Array<{ value: LearningTask['status']; label: string }> = [
  { value: 'not-started', label: 'Not Started' },
  { value: 'learning', label: 'Learning' },
  { value: 'practiced', label: 'Practiced' },
  { value: 'revised', label: 'Revised' },
  { value: 'completed', label: 'Completed' },
];

const ImageBlock = TiptapNode.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: 'Learning visual' },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },
});

const LinkMark = Mark.create({
  name: 'link',
  inclusive: false,
  addAttributes() {
    return {
      href: { default: null },
      target: { default: '_blank' },
      rel: { default: 'noreferrer' },
    };
  },
  parseHTML() {
    return [{ tag: 'a[href]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes), 0];
  },
});

function stripLearningHtml(value?: string) {
  return (value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<li[^>]*>/gi, ' - ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeLearningHtml(value?: string, maxLength = 180) {
  const text = stripLearningHtml(value);
  if (!text) return 'Add learning material for this section.';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

function sanitizeLearningHtml(value: string) {
  return (value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function LearningRichContent({ className = '', html }: { className?: string; html: string }) {
  return (
    <div
      className={`prose-rich max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeLearningHtml(html) }}
    />
  );
}

export default function LearningManagementPanel() {
  useTheme();
  const isDark = true;
  const [plans, setPlans] = useState<LearningPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PlanDetailType | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOptionsPanel, setShowOptionsPanel] = useState(() => localStorage.getItem('learningDetailsCollapsed') !== 'true');
  const [isRoadmapCollapsed, setIsRoadmapCollapsed] = useState(() => localStorage.getItem('learningRoadmapCollapsed') === 'true');
  const [activeTab, setActiveTab] = useState<LessonTab>(() => (localStorage.getItem('learningActiveTab') as LessonTab) || 'overview');
  const [roadmapSearch, setRoadmapSearch] = useState('');
  const [roadmapFilter, setRoadmapFilter] = useState('All');
  const [codeLanguage, setCodeLanguage] = useState<'javascript' | 'python'>('javascript');
  const [codeValue, setCodeValue] = useState('');
  const [codeOutput, setCodeOutput] = useState('');
  const [notesContent, setNotesContent] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  const [openInterviewIndex, setOpenInterviewIndex] = useState(0);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [showImportPlan, setShowImportPlan] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [showImportPhase, setShowImportPhase] = useState(false);
  const [showEditPlan, setShowEditPlan] = useState(false);
  const [planDraft, setPlanDraft] = useState({ title: '', description: '' });
  const [planImportJson, setPlanImportJson] = useState('');
  const [planImportError, setPlanImportError] = useState('');
  const [planImporting, setPlanImporting] = useState(false);
  const [showPlanPrompt, setShowPlanPrompt] = useState(false);
  const [phaseDraft, setPhaseDraft] = useState({ title: '', description: '' });
  const [phaseImportJson, setPhaseImportJson] = useState('');
  const [phaseImportError, setPhaseImportError] = useState('');
  const [phaseImporting, setPhaseImporting] = useState(false);
  const [showPhasePrompt, setShowPhasePrompt] = useState(false);
  const [taskRows, setTaskRows] = useState<Array<{ title: string; description: string; status: LearningTask['status']; priority: 'low' | 'medium' | 'high'; dueDate: string; phaseId: string }>>([
    { title: '', description: '', status: 'not-started', priority: 'medium', dueDate: '', phaseId: '' },
  ]);
  const [detailDraft, setDetailDraft] = useState({
    title: '',
    description: '',
    lessonSections: [] as LessonSection[],
    exercises: [] as ExerciseDraft[],
    confidenceScore: '',
    status: 'not-started' as LearningTask['status'],
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
  });

  const fetchPlans = async () => {
    setLoading(true);
    const response = await learningApi.getAllPlans(true);
    if ('data' in response && response.data) {
      setPlans(response.data);
      if (!selectedPlan && response.data[0]?._id) {
        await fetchPlanDetail(response.data[0]._id);
      }
    }
    setLoading(false);
  };

  const fetchPlanDetail = async (planId: string, options: { keepTask?: boolean } = {}) => {
    const response = await learningApi.getPlanById(planId, true);
    if ('data' in response && response.data) {
      const detail = response.data;
      setSelectedPlan(detail);
      if (!options.keepTask) setSelectedTaskId(null);
      setSelectedPhaseId((current) =>
        current && detail.phases.some((phase) => phase._id === current)
          ? current
          : detail.phases.slice().sort((a, b) => a.order - b.order)[0]?._id || 'unassigned',
      );
    }
  };

  useEffect(() => {
    fetchPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('learningRoadmapCollapsed', String(isRoadmapCollapsed));
  }, [isRoadmapCollapsed]);

  useEffect(() => {
    localStorage.setItem('learningDetailsCollapsed', String(!showOptionsPanel));
  }, [showOptionsPanel]);

  useEffect(() => {
    localStorage.setItem('learningActiveTab', activeTab);
  }, [activeTab]);

  const tasks = useMemo(() => selectedPlan?.tasks ?? [], [selectedPlan]);

  const sortedPhases = useMemo(
    () => selectedPlan?.phases.slice().sort((a, b) => a.order - b.order) ?? [],
    [selectedPlan],
  );

  const unassignedTasks = useMemo(
    () => tasks.filter((task) => !task.phaseId),
    [tasks],
  );

  const selectedPhaseTasks = useMemo(() => {
    if (selectedPhaseId === 'unassigned') return unassignedTasks;
    return tasks
      .filter((task) => task.phaseId === selectedPhaseId)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt.localeCompare(b.createdAt));
  }, [selectedPhaseId, tasks, unassignedTasks]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null;
    return tasks.find((task) => task._id === selectedTaskId) ?? null;
  }, [tasks, selectedTaskId]);

  const selectedTaskIndex = useMemo(
    () => tasks.findIndex((task) => task._id === selectedTaskId),
    [tasks, selectedTaskId],
  );

  const filteredPlans = useMemo(() => {
    const search = roadmapSearch.trim().toLowerCase();
    return plans.filter((plan) => {
      const matchesSearch = !search || [plan.title, plan.description, plan.status].some((value) => value?.toLowerCase().includes(search));
      const matchesFilter =
        roadmapFilter === 'All' ||
        (roadmapFilter === 'Active' && plan.status === 'active') ||
        plan.title.toLowerCase().includes(roadmapFilter.toLowerCase()) ||
        plan.description?.toLowerCase().includes(roadmapFilter.toLowerCase());
      return matchesSearch && matchesFilter;
    });
  }, [plans, roadmapFilter, roadmapSearch]);

  const currentProgress = useMemo(() => {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((task) => task.status === 'completed').length / tasks.length) * 100);
  }, [tasks]);

  const dashboardStats = useMemo(() => {
    const normalized = (status: LearningTask['status']) => (status === 'pending' ? 'not-started' : status);
    const todayTopic = tasks.find((task) => !['completed', 'revised'].includes(normalized(task.status))) || tasks[0] || null;
    return {
      activePlan: selectedPlan?.plan.title || 'No active plan',
      todayTopic,
      pending: tasks.filter((task) => normalized(task.status) === 'not-started' || normalized(task.status) === 'learning').length,
      completed: tasks.filter((task) => task.status === 'completed').length,
      practicePending: tasks.filter((task) => ['not-started', 'learning', 'pending'].includes(task.status)).length,
      revisionPending: tasks.filter((task) => task.status === 'practiced').length,
    };
  }, [selectedPlan, tasks]);

  useEffect(() => {
    const loadCommentsAndDraft = async () => {
      if (!selectedTask) {
        setTaskComments([]);
        return;
      }

      setDetailDraft({
        title: selectedTask.title || '',
        description: selectedTask.description || '',
        lessonSections: selectedTask.lessonSections || buildLegacyLessonSections(selectedTask),
        exercises: toExerciseDrafts(selectedTask),
        confidenceScore: typeof selectedTask.confidenceScore === 'number' ? String(Math.min(5, Math.max(1, Math.round(selectedTask.confidenceScore)))) : '',
        status: selectedTask.status,
        priority: selectedTask.priority || 'medium',
        dueDate: selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().slice(0, 10) : '',
      });
      const firstExercise = selectedTask.exercises?.[0] || selectedTask.exercise;
      setCodeLanguage(firstExercise?.language || 'javascript');
      setCodeValue(firstExercise?.starterCode || DEFAULT_CODE_SAMPLE);
      setCodeOutput('');
      setNotesContent(selectedTask.notes?.[0]?.content || buildDefaultNotes(selectedTask));
      setNotesSaved(false);

      setCommentsLoading(true);
      try {
        const response = await commentApi.getTaskComments(selectedTask._id);
        if ('data' in response && response.data) {
          const payload = response.data as unknown;
          const comments = Array.isArray(payload)
            ? payload
            : Array.isArray((payload as { data?: unknown[] })?.data)
              ? (payload as { data: TaskComment[] }).data
              : [];
          setTaskComments(comments);
        } else {
          setTaskComments([]);
        }
      } catch {
        setTaskComments([]);
      } finally {
        setCommentsLoading(false);
      }
    };

    loadCommentsAndDraft();
  }, [selectedTask]);

  const mergeSelectedTaskLocal = (payload: Partial<LearningTask>) => {
    if (!selectedTask) return;
    const mergedTask = { ...selectedTask, ...payload };
    setSelectedPlan((current) =>
      current
        ? {
            ...current,
            tasks: current.tasks.map((task) => (task._id === selectedTask._id ? mergedTask : task)),
          }
        : current,
    );
  };

  const updateSelectedTaskInline = async (payload: Partial<LearningTask>, options: { skipRefetch?: boolean; skipLocalUpdate?: boolean } = {}) => {
    if (!selectedTask || !selectedPlan) return;
    const response = await learningApi.updateTask(selectedTask._id, payload);
    if ('error' in response) {
      alert(response.error || 'Task save failed');
      return;
    }
    if (response.data && !options.skipLocalUpdate) {
      const mergedTask = { ...response.data, ...payload };
      setSelectedPlan((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((task) => (task._id === response.data!._id ? mergedTask : task)),
            }
          : current,
      );
    }
    if (!options.skipRefetch) {
      await fetchPlanDetail(selectedPlan.plan._id, { keepTask: true });
    }
  };

  const updateTaskInlineById = async (taskId: string, payload: Partial<LearningTask>) => {
    if (!selectedPlan) return;
    await learningApi.updateTask(taskId, payload);
    await fetchPlanDetail(selectedPlan.plan._id);
    setSelectedTaskId(null);
  };

  const deleteTask = async (taskId: string) => {
    if (!selectedPlan || !confirm('Delete this task?')) return;
    await learningApi.deleteTask(taskId);
    await fetchPlanDetail(selectedPlan.plan._id);
  };

  const submitComment = async () => {
    if (!selectedTask || !commentDraft.trim()) return;
    setSubmittingComment(true);
    const response = await commentApi.addComment(selectedTask._id, commentDraft.trim(), 'You');
    if ('data' in response && response.data) {
      const payload = response.data as unknown;
      const newComment =
        payload && typeof payload === 'object' && 'data' in (payload as object)
          ? (payload as { data: TaskComment }).data
          : (payload as TaskComment);
      if (newComment?._id) {
        setTaskComments((prev) => [newComment, ...prev]);
        setCommentDraft('');
      }
    }
    setSubmittingComment(false);
  };

  const createPlan = async () => {
    const title = planDraft.title.trim();
    if (!title) return;
    await learningApi.createPlan({ title, description: planDraft.description, status: 'active' });
    setPlanDraft({ title: '', description: '' });
    setShowAddPlan(false);
    await fetchPlans();
  };

  const importPlanFromJson = async () => {
    setPlanImportError('');

    let parsed: unknown;
    try {
      parsed = JSON.parse(planImportJson);
    } catch {
      setPlanImportError('Invalid JSON. Please check commas, quotes, and brackets.');
      return;
    }

    const planImport = normalizePlanImport(parsed);
    if ('error' in planImport) {
      setPlanImportError(planImport.error);
      return;
    }

    setPlanImporting(true);
    const planResponse = await learningApi.createPlan({
      title: planImport.title,
      description: planImport.description,
      goals: planImport.goals,
      status: planImport.status,
      targetEndDate: planImport.targetEndDate,
    });

    if ('error' in planResponse || !planResponse.data) {
      setPlanImporting(false);
      setPlanImportError(planResponse.error || 'Could not create plan.');
      return;
    }

    for (const [phaseIndex, phase] of planImport.phases.entries()) {
      const phaseResponse = await learningApi.createPhase({
        title: phase.title,
        description: phase.description,
        order: phase.order || phaseIndex + 1,
        planId: planResponse.data._id,
        status: phaseIndex === 0 ? 'in-progress' : 'not-started',
      });

      if ('error' in phaseResponse || !phaseResponse.data) {
        setPlanImporting(false);
        setPlanImportError(phaseResponse.error || `Could not create phase ${phaseIndex + 1}.`);
        return;
      }

      await Promise.all(
        phase.tasks.map((task, taskIndex) =>
          learningApi.createTask({
            ...task,
            order: task.order || taskIndex + 1,
            phaseId: phaseResponse.data!._id,
            planId: planResponse.data!._id,
            status: task.status || 'not-started',
            priority: task.priority || 'medium',
          }),
        ),
      );
    }

    setPlanImporting(false);
    setPlanImportJson('');
    setShowImportPlan(false);
    setShowAddPlan(false);
    await fetchPlans();
    await fetchPlanDetail(planResponse.data._id);
  };

  const loadPlanJsonFile = async (file?: File) => {
    if (!file) return;
    setPlanImportError('');
    if (!file.name.toLowerCase().endsWith('.json')) {
      setPlanImportError('Please select a .json file.');
      return;
    }
    setPlanImportJson(await file.text());
  };

  const copyPlanPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PLAN_JSON_PROMPT);
    } catch {
      setPlanImportError('Could not copy automatically. You can manually select and copy the prompt.');
    }
  };

  const updatePlanInline = async () => {
    if (!selectedPlan) return;
    const title = planDraft.title.trim();
    if (!title) return;
    await learningApi.updatePlan(selectedPlan.plan._id, { title, description: planDraft.description });
    setShowEditPlan(false);
    await fetchPlanDetail(selectedPlan.plan._id);
    await fetchPlans();
  };

  const togglePlanVisibility = async () => {
    if (!selectedPlan) return;
    const nextIsPublic = !(selectedPlan.plan.isPublic ?? true);
    const response = await learningApi.updatePlan(selectedPlan.plan._id, { isPublic: nextIsPublic });
    if ('error' in response) {
      alert(response.error || 'Could not update plan visibility');
      return;
    }
    setSelectedPlan((current) =>
      current
        ? { ...current, plan: { ...current.plan, isPublic: nextIsPublic } }
        : current,
    );
    setPlans((current) =>
      current.map((plan) => (plan._id === selectedPlan.plan._id ? { ...plan, isPublic: nextIsPublic } : plan)),
    );
  };

  const deleteSelectedPlan = async () => {
    if (!selectedPlan) return;
    const confirmed = confirm(`Delete the complete roadmap "${selectedPlan.plan.title}"? This will remove its phases, tasks, logs, and submissions.`);
    if (!confirmed) return;

    const deletedPlanId = selectedPlan.plan._id;
    const response = await learningApi.deletePlan(deletedPlanId);
    if ('error' in response) {
      alert(response.error || 'Could not delete roadmap');
      return;
    }

    const plansResponse = await learningApi.getAllPlans(true);
    const remainingPlans = 'data' in plansResponse && plansResponse.data
      ? plansResponse.data.filter((plan) => plan._id !== deletedPlanId)
      : [];

    setPlans(remainingPlans);
    setSelectedTaskId(null);
    setSelectedPhaseId(null);
    setTaskComments([]);

    if (remainingPlans[0]?._id) {
      await fetchPlanDetail(remainingPlans[0]._id);
    } else {
      setSelectedPlan(null);
    }
  };

  const markSelectedTaskComplete = async () => {
    if (!selectedTask) return;
    const nextStatus: LearningTask['status'] = selectedTask.status === 'completed' ? 'learning' : 'completed';
    setDetailDraft((prev) => ({ ...prev, status: nextStatus }));
    await updateSelectedTaskInline({ status: nextStatus });
  };

  const runCodeSample = () => {
    const languageLabel = codeLanguage === 'python' ? 'Python' : 'JavaScript';
    setCodeOutput(`${languageLabel} runner placeholder\n\nCode is ready to execute once a safe execution service is connected.`);
  };

  const resetCodeSample = () => {
    const firstExercise = selectedTask?.exercises?.[0] || selectedTask?.exercise;
    setCodeValue(firstExercise?.starterCode || DEFAULT_CODE_SAMPLE);
    setCodeOutput('');
  };

  const copyCodeSample = async () => {
    try {
      await navigator.clipboard.writeText(codeValue);
      setCodeOutput('Code copied to clipboard.');
    } catch {
      setCodeOutput('Could not copy code automatically.');
    }
  };

  const saveNotes = async () => {
    if (!selectedTask || !notesContent.trim()) return;
    const response = await learningApi.addTaskNote(selectedTask._id, notesContent.trim());
    if ('error' in response) {
      alert(response.error || 'Could not save notes');
      return;
    }
    setNotesSaved(true);
  };

  const createTask = async () => {
    if (!selectedPlan) return;
    const validRows = taskRows.filter((row) => row.title.trim());
    if (!validRows.length) return;
    await Promise.all(
      validRows.map((row) =>
        learningApi.createTask({
          title: row.title.trim(),
          description: row.description,
          status: row.status,
          priority: row.priority,
          dueDate: row.dueDate || undefined,
          phaseId: row.phaseId || undefined,
          planId: selectedPlan.plan._id,
        }),
      ),
    );
    setTaskRows([{ title: '', description: '', status: 'not-started', priority: 'medium', dueDate: '', phaseId: selectedPlan.phases[0]?._id || '' }]);
    setShowAddTask(false);
    await fetchPlanDetail(selectedPlan.plan._id);
  };

  const createPhase = async () => {
    if (!selectedPlan || !phaseDraft.title.trim()) return;
    const order = selectedPlan.phases.length + 1;
    const response = await learningApi.createPhase({
      title: phaseDraft.title.trim(),
      description: phaseDraft.description,
      order,
      planId: selectedPlan.plan._id,
      status: selectedPlan.phases.length === 0 ? 'in-progress' : 'not-started',
    });
    if ('data' in response && response.data) {
      setSelectedPhaseId(response.data._id);
      setPhaseDraft({ title: '', description: '' });
      setShowAddPhase(false);
      await fetchPlanDetail(selectedPlan.plan._id);
    }
  };

  const deletePhase = async (phaseId: string) => {
    if (!selectedPlan || !confirm('Delete this phase? Its tasks will move to Needs phase.')) return;
    const response = await learningApi.deletePhase(phaseId);
    if ('error' in response) {
      alert(response.error || 'Could not delete phase');
      return;
    }
    if (selectedPhaseId === phaseId) {
      setSelectedPhaseId('unassigned');
      setSelectedTaskId(null);
    }
    await fetchPlanDetail(selectedPlan.plan._id, { keepTask: true });
  };

  const importPhaseFromJson = async () => {
    if (!selectedPlan) return;
    setPhaseImportError('');

    let parsed: unknown;
    try {
      parsed = JSON.parse(phaseImportJson);
    } catch {
      setPhaseImportError('Invalid JSON. Please check commas, quotes, and brackets.');
      return;
    }

    const phaseImport = normalizePhaseImport(parsed);
    if ('error' in phaseImport) {
      setPhaseImportError(phaseImport.error);
      return;
    }

    setPhaseImporting(true);
    const order = selectedPlan.phases.length + 1;
    const phaseResponse = await learningApi.createPhase({
      title: phaseImport.title,
      description: phaseImport.description,
      order,
      planId: selectedPlan.plan._id,
      status: selectedPlan.phases.length === 0 ? 'in-progress' : 'not-started',
    });

    if ('error' in phaseResponse || !phaseResponse.data) {
      setPhaseImporting(false);
      setPhaseImportError(phaseResponse.error || 'Could not create phase.');
      return;
    }

    await Promise.all(
      phaseImport.tasks.map((task, index) =>
        learningApi.createTask({
          ...task,
          order: index + 1,
          phaseId: phaseResponse.data!._id,
          planId: selectedPlan.plan._id,
          status: task.status || 'not-started',
          priority: task.priority || 'medium',
        }),
      ),
    );

    setPhaseImporting(false);
    setPhaseImportJson('');
    setShowImportPhase(false);
    setSelectedPhaseId(phaseResponse.data._id);
    await fetchPlanDetail(selectedPlan.plan._id);
  };

  const loadPhaseJsonFile = async (file?: File) => {
    if (!file) return;
    setPhaseImportError('');
    if (!file.name.toLowerCase().endsWith('.json')) {
      setPhaseImportError('Please select a .json file.');
      return;
    }
    setPhaseImportJson(await file.text());
  };

  const copyPhasePrompt = async () => {
    try {
      await navigator.clipboard.writeText(PHASE_JSON_PROMPT);
    } catch {
      setPhaseImportError('Could not copy automatically. You can manually select and copy the prompt.');
    }
  };

  const openAddTask = () => {
    if (!selectedPlan) return;
    const defaultPhaseId = selectedPhaseId && selectedPhaseId !== 'unassigned'
      ? selectedPhaseId
      : selectedPlan.phases[0]?._id || '';
    setTaskRows((rows) =>
      rows.map((row) => ({
        ...row,
        phaseId: row.phaseId || defaultPhaseId,
      })),
    );
    setShowAddTask((value) => !value);
  };

  const nextTask = () => {
    if (selectedTaskIndex < 0 || selectedTaskIndex >= tasks.length - 1) return;
    setSelectedTaskId(tasks[selectedTaskIndex + 1]._id);
  };

  const prevTask = () => {
    if (selectedTaskIndex <= 0) return;
    setSelectedTaskId(tasks[selectedTaskIndex - 1]._id);
  };

  const getTaskProgress = (status: LearningTask['status']) => {
    if (status === 'completed') return 100;
    if (status === 'revised') return 85;
    if (status === 'practiced') return 65;
    if (status === 'in-progress' || status === 'learning') return 35;
    return 0;
  };

  const normalizeDescription = (value: string) =>
    value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const bgMain = isDark ? 'bg-[#070d1b]' : 'bg-gray-50';
  const bgSidebar = isDark ? 'bg-[#070f1f]' : 'bg-white';
  const borderCol = isDark ? 'border-[#14253f]' : 'border-gray-200';
  const textPrimary = isDark ? 'text-white' : 'text-gray-900';
  const textMuted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`h-[calc(100vh-92px)] w-full overflow-hidden ${bgMain} ${textPrimary}`}>
      <div className={`h-full flex`}>
        <aside className={`hidden md:flex flex-col flex-shrink-0 h-full w-[232px] border-r ${borderCol} ${bgSidebar}`}>
          <div className="h-[68px] px-6 flex items-center">
            <div className="text-[34px] font-semibold text-[#2f7cff] leading-none">Vishal Kale</div>
          </div>
          <nav className="flex-1 overflow-y-auto py-2 space-y-1">
            <SidebarItem label="project types" icon="folder" isOpen isDark={isDark} />
            <SidebarItem label="skills" icon="code" isOpen isDark={isDark} />
            <SidebarItem label="projects" icon="briefcase" isOpen isDark={isDark} />
            <SidebarItem label="experiences" icon="user" isOpen isDark={isDark} />
            <SidebarItem label="contacts" icon="id" isOpen isDark={isDark} />
            <SidebarItem label="settings" icon="settings" isOpen isDark={isDark} />
            <SidebarItem label="learning" icon="book" active isOpen isDark={isDark} />
          </nav>
        </aside>

        <aside className={`hidden md:flex h-full flex-col flex-shrink-0 border-r transition-all duration-200 ${isRoadmapCollapsed ? 'w-12' : 'w-[312px]'} ${borderCol} ${bgSidebar}`}>
          <div className={`flex items-center justify-between px-3 h-[68px] border-b ${isDark ? 'border-[#12203b]' : 'border-gray-200'}`}>
            {!isRoadmapCollapsed && <h3 className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Learning Roadmap</h3>}
            <div className="flex items-center gap-2">
              {!isRoadmapCollapsed && (
                <>
                  <button onClick={() => { openAddTask(); setShowAddPlan(false); }} className={`h-6 px-2 rounded border text-[11px] ${isDark ? 'border-[#1f3150] text-gray-300 hover:bg-[#13203a]' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>Task</button>
                  <button onClick={() => { setShowAddPlan((v) => !v); setShowAddTask(false); setShowImportPlan(false); }} className={`h-6 w-6 rounded border ${isDark ? 'border-[#1f3150] text-gray-300 hover:bg-[#13203a]' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>+</button>
                </>
              )}
              <button
                onClick={() => setIsRoadmapCollapsed((value) => !value)}
                aria-label={isRoadmapCollapsed ? 'Expand learning roadmap' : 'Collapse learning roadmap'}
                className={`h-7 w-7 rounded border ${isDark ? 'border-[#1f3150] text-gray-300 hover:bg-[#13203a]' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
              >
                {isRoadmapCollapsed ? '>' : '<'}
              </button>
            </div>
          </div>
          {isRoadmapCollapsed ? (
            <div className="flex flex-1 items-start justify-center pt-4 text-xs text-gray-500 [writing-mode:vertical-rl]">
              Roadmap
            </div>
          ) : (
          <>
          {showAddPlan && (
            <div className={`px-3 py-3 border-b ${isDark ? 'border-[#12203b] bg-[#0b1429]' : 'border-gray-200 bg-gray-50'} space-y-2`}>
              <input value={planDraft.title} onChange={(e) => setPlanDraft((p) => ({ ...p, title: e.target.value }))} placeholder="Plan title" className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 text-sm text-gray-100" />
              <textarea value={planDraft.description} onChange={(e) => setPlanDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Plan description" rows={2} className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 text-sm text-gray-100 resize-none" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowImportPlan((value) => !value)} className="px-2 py-1 text-xs text-blue-300">Import JSON</button>
                <button onClick={() => setShowAddPlan(false)} className="px-2 py-1 text-xs text-gray-300">Cancel</button>
                <button onClick={createPlan} className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white">Add plan</button>
              </div>
            </div>
          )}
          {showAddPlan && showImportPlan && (
            <div className={`px-3 py-3 border-b ${isDark ? 'border-[#12203b] bg-[#07101f]' : 'border-gray-200 bg-gray-50'} space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-gray-500">Import full plan</div>
                  <p className="mt-1 text-xs text-gray-500">Creates plan, phases, tasks, exercises, and flashcards.</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowPlanPrompt((value) => !value)} className="rounded border border-[#2a3b57] px-2 py-1 text-[11px] text-gray-200">Prompt</button>
                  <label className="cursor-pointer rounded border border-[#2a3b57] px-2 py-1 text-[11px] text-gray-200">
                    File
                    <input type="file" accept="application/json,.json" onChange={(event) => loadPlanJsonFile(event.target.files?.[0])} className="hidden" />
                  </label>
                </div>
              </div>

              {showPlanPrompt && (
                <div className="rounded-md border border-[#223655] bg-[#0b1429] p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-gray-500">AI prompt</span>
                    <button onClick={copyPlanPrompt} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">Copy</button>
                  </div>
                  <textarea readOnly value={PLAN_JSON_PROMPT} rows={8} className="w-full resize-none rounded-md border border-[#2a3b57] bg-[#0c1424] px-2 py-1.5 font-mono text-[11px] text-gray-200 outline-none" />
                </div>
              )}

              <textarea
                value={planImportJson}
                onChange={(event) => {
                  setPlanImportJson(event.target.value);
                  setPlanImportError('');
                }}
                placeholder='Paste full plan JSON here: {"title":"...","phases":[{"title":"...","tasks":[...]}]}'
                rows={8}
                className="w-full resize-y rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 font-mono text-[11px] text-gray-100 outline-none"
              />
              {planImportError && <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-200">{planImportError}</div>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowImportPlan(false)} className="px-2 py-1 text-xs text-gray-300">Cancel import</button>
                <button disabled={planImporting || !planImportJson.trim()} onClick={importPlanFromJson} className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white disabled:opacity-50">
                  {planImporting ? 'Importing...' : 'Import plan'}
                </button>
              </div>
            </div>
          )}
          <div className="border-b border-[#12203b] px-3 py-3 space-y-3">
            <div className="relative">
              <input
                value={roadmapSearch}
                onChange={(event) => setRoadmapSearch(event.target.value)}
                placeholder="Search lessons..."
                className="w-full rounded-lg border border-[#1f3150] bg-[#0b1426] px-3 py-2 pr-12 text-xs text-gray-100 outline-none placeholder:text-gray-500 focus:border-[#2f7cff]"
              />
              <span className="absolute right-3 top-2.5 text-[10px] text-gray-500">Ctrl K</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['All', 'Active', 'JavaScript', 'Backend', 'Algo'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setRoadmapFilter(filter)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] transition ${roadmapFilter === filter ? 'border-[#2f7cff] bg-[#2f7cff] text-white' : 'border-[#1f3150] bg-[#0b1426] text-gray-400 hover:text-gray-200'}`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>{selectedPlan?.plan.title || 'Learning plans'}</span>
              <span>{filteredPlans.length}/{plans.length}</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {filteredPlans.map((plan) => (
              <button
                key={plan._id}
                onClick={() => fetchPlanDetail(plan._id)}
                className={`w-full rounded-lg border px-4 py-2.5 text-left transition ${selectedPlan?.plan._id === plan._id
                  ? isDark
                    ? 'border-[#2970ff] bg-[#0d1a31] shadow-[0_0_0_1px_rgba(41,112,255,0.25)]'
                    : 'border-blue-500 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
                  : isDark
                    ? 'border-[#1b2c49] bg-[#0c172d] hover:bg-[#101e38]'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
              >
                <div className={`line-clamp-2 text-[15px] font-medium leading-[1.35] ${selectedPlan?.plan._id === plan._id ? (isDark ? 'text-blue-100' : 'text-blue-900') : textPrimary}`}>{plan.title}</div>
                <div className={`mt-1.5 flex items-center gap-1.5 text-[12px] ${selectedPlan?.plan._id === plan._id ? 'text-[#2f7cff]' : textMuted}`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${selectedPlan?.plan._id === plan._id ? 'bg-[#2f7cff]' : (isDark ? 'bg-gray-600' : 'bg-gray-400')}`} />
                  <span>{plan.status}</span>
                  {plan.isPublic === false && (
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                      hidden
                    </span>
                  )}
                </div>
              </button>
            ))}
            {filteredPlans.length === 0 && (
              <div className="rounded-lg border border-dashed border-[#1f3150] px-3 py-6 text-center text-xs text-gray-500">
                No roadmap items match this filter.
              </div>
            )}
          </div>
          <div className="border-t border-[#12203b] p-3">
            <button onClick={() => { openAddTask(); setShowAddPlan(false); }} className="w-full rounded-lg border border-[#1f3150] px-3 py-2 text-xs text-gray-300 hover:bg-[#13203a]">
              + Add Custom Task
            </button>
          </div>
          </>
          )}
        </aside>

        <main className={`min-w-0 h-full overflow-hidden ${bgMain}`}>
          {!selectedPlan || loading ? (
            <div className={`h-full flex items-center justify-center ${textMuted}`}>Loading plan...</div>
          ) : !selectedTask ? (
            <div className="h-full overflow-y-auto">
                <div className={`sticky top-0 z-20 border-b backdrop-blur px-5 py-3 ${borderCol} ${isDark ? 'bg-[#070d1b]/95' : 'bg-white/90'}`}>
                  <div className="min-w-0 text-xs text-gray-400">
                    <span className="text-[#2f7cff]">Rocks</span>
                    <span className="mx-2 text-gray-600">/</span>
                    <span className="truncate text-gray-300">{selectedPlan.plan.title}</span>
                  </div>
                </div>
              <div className="px-0 py-1">
                <div className={`grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-4 px-4 pb-2 items-center ${textMuted}`}>
                  <div className="text-xs">Streak: <span className={`${textPrimary} font-semibold`}>{Math.min(tasks.filter((t) => t.status === 'completed').length, 7)}d</span></div>
                  <div className="text-xs">Completed: <span className={`${textPrimary} font-semibold`}>{tasks.filter((t) => t.status === 'completed').length}/{tasks.length || 0}</span></div>
                  <div className="text-xs">Progress: <span className={`${textPrimary} font-semibold`}>{tasks.length ? Math.round((tasks.filter((t) => t.status === 'completed').length / tasks.length) * 100) : 0}%</span></div>
                  <div className="text-xs">Status: <span className={`${textPrimary} font-semibold`}>{selectedPlan.plan.status}</span></div>
                  <div className="text-xs">Target: <span className={`${textPrimary} font-semibold`}>{selectedPlan.plan.targetEndDate ? new Date(selectedPlan.plan.targetEndDate).toLocaleDateString() : '-'}</span></div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        if (!selectedPlan) return;
                        setPlanDraft({ title: selectedPlan.plan.title, description: selectedPlan.plan.description || '' });
                        setShowEditPlan(true);
                      }}
                      className="h-7 px-3 rounded border border-[#2a3b57] text-xs text-gray-200 hover:bg-[#12213b]"
                    >
                      Edit plan
                    </button>
                    <button
                      onClick={togglePlanVisibility}
                      className={`h-7 px-3 rounded border text-xs ${selectedPlan.plan.isPublic === false ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15'}`}
                    >
                      {selectedPlan.plan.isPublic === false ? 'Hidden from users' : 'Visible to users'}
                    </button>
                    <a
                      href={`/portfolio/learning/${selectedPlan.plan._id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-7 items-center rounded border border-[#2a3b57] px-3 text-xs text-blue-200 hover:bg-[#12213b]"
                    >
                      Preview public
                    </a>
                    <button
                      onClick={deleteSelectedPlan}
                      className="h-7 px-3 rounded border border-red-500/35 bg-red-500/10 text-xs text-red-200 hover:bg-red-500/15"
                    >
                      Delete roadmap
                    </button>
                    <button onClick={() => setShowAddPhase((v) => !v)} className="h-7 px-3 rounded border border-[#2a3b57] text-xs text-gray-200 hover:bg-[#12213b]">+ Add phase</button>
                    <button onClick={() => setShowImportPhase((v) => !v)} className="h-7 px-3 rounded border border-[#2a3b57] text-xs text-gray-200 hover:bg-[#12213b]">Import phase JSON</button>
                    <button onClick={openAddTask} className="h-7 px-3 rounded border border-[#2a3b57] text-xs text-gray-200 hover:bg-[#12213b]">+ Add task</button>
                  </div>
                </div>
                {selectedPlan?.plan.description && (
                  <div className={`px-4 pb-3 text-sm ${textMuted}`}>{selectedPlan.plan.description}</div>
                )}
                <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-6">
                  <AdminMetricCard label="Active Plan" value={dashboardStats.activePlan} className="xl:col-span-2" />
                  <AdminMetricCard label="Today's Topic" value={dashboardStats.todayTopic?.title || 'No topic selected'} className="xl:col-span-2" />
                  <AdminMetricCard label="Pending Topics" value={String(dashboardStats.pending)} />
                  <AdminMetricCard label="Completed" value={String(dashboardStats.completed)} />
                  <AdminMetricCard label="Practice Pending" value={String(dashboardStats.practicePending)} />
                  <AdminMetricCard label="Revision Pending" value={String(dashboardStats.revisionPending)} />
                </div>
                {showAddPhase && (
                  <div className={`mx-4 mb-3 rounded-lg border p-3 ${isDark ? 'border-[#1b2c49] bg-[#0b1429]' : 'border-gray-200 bg-white'} space-y-2`}>
                    <input
                      value={phaseDraft.title}
                      onChange={(e) => setPhaseDraft((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Phase title, e.g. HTML Foundations"
                      className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 text-sm text-gray-100"
                    />
                    <textarea
                      value={phaseDraft.description}
                      onChange={(e) => setPhaseDraft((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Phase description"
                      rows={2}
                      className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 text-sm text-gray-100 resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddPhase(false)} className="px-2 py-1 text-xs text-gray-300">Cancel</button>
                      <button onClick={createPhase} className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white">Add phase</button>
                    </div>
                  </div>
                )}
                {showImportPhase && (
                  <div className={`mx-4 mb-3 rounded-lg border p-3 ${isDark ? 'border-[#1b2c49] bg-[#0b1429]' : 'border-gray-200 bg-white'} space-y-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-gray-500">Import phase from JSON</div>
                        <p className="mt-1 text-xs text-gray-500">Paste generated JSON or upload a .json file. This creates one phase and its tasks in the current plan.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setShowPhasePrompt((value) => !value)} className="rounded border border-[#2a3b57] px-2.5 py-1 text-xs text-gray-200 hover:bg-[#12213b]">Prompt</button>
                        <label className="cursor-pointer rounded border border-[#2a3b57] px-2.5 py-1 text-xs text-gray-200 hover:bg-[#12213b]">
                          Select file
                          <input type="file" accept="application/json,.json" onChange={(event) => loadPhaseJsonFile(event.target.files?.[0])} className="hidden" />
                        </label>
                      </div>
                    </div>

                    {showPhasePrompt && (
                      <div className="rounded-md border border-[#223655] bg-[#07101f] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="text-xs uppercase tracking-[0.14em] text-gray-500">AI prompt for phase JSON</div>
                          <button onClick={copyPhasePrompt} className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500">Copy prompt</button>
                        </div>
                        <textarea readOnly value={PHASE_JSON_PROMPT} rows={9} className="w-full resize-none rounded-md border border-[#2a3b57] bg-[#0c1424] px-3 py-2 font-mono text-xs text-gray-200 outline-none" />
                      </div>
                    )}

                    <textarea
                      value={phaseImportJson}
                      onChange={(event) => {
                        setPhaseImportJson(event.target.value);
                        setPhaseImportError('');
                      }}
                      placeholder='Paste phase JSON here, e.g. {"title":"Python Basics","tasks":[{"title":"Variables","lessonSections":[...],"exercises":[...]}]}'
                      rows={10}
                      className="w-full resize-y rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 font-mono text-xs text-gray-100 outline-none"
                    />

                    {phaseImportError && (
                      <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{phaseImportError}</div>
                    )}

                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowImportPhase(false)} className="px-2 py-1 text-xs text-gray-300">Cancel</button>
                      <button disabled={phaseImporting || !phaseImportJson.trim()} onClick={importPhaseFromJson} className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50">
                        {phaseImporting ? 'Importing...' : 'Import phase'}
                      </button>
                    </div>
                  </div>
                )}
                {showAddTask && (
                  <div className={`mx-4 mb-3 rounded-lg border p-3 ${isDark ? 'border-[#1b2c49] bg-[#0b1429]' : 'border-gray-200 bg-white'} space-y-2`}>
                    {selectedPlan.phases.length === 0 && (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        This plan has no phases yet. Add a phase first if you want tasks to appear grouped in the roadmap.
                      </div>
                    )}
                    {taskRows.map((row, idx) => (
                      <div key={idx} className="rounded-md border border-[#223655] p-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-400">Task {idx + 1}</div>
                          {taskRows.length > 1 && (
                            <button
                              onClick={() => setTaskRows((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-xs text-red-300"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          value={row.title}
                          onChange={(e) =>
                            setTaskRows((prev) => prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item)))
                          }
                          placeholder="Task title"
                          className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 text-sm text-gray-100"
                        />
                        <textarea
                          value={row.description}
                          onChange={(e) =>
                            setTaskRows((prev) => prev.map((item, i) => (i === idx ? { ...item, description: e.target.value } : item)))
                          }
                          placeholder="Task description"
                          rows={2}
                          className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 text-sm text-gray-100 resize-none"
                        />
                        <select
                          value={row.phaseId}
                          onChange={(e) => setTaskRows((prev) => prev.map((item, i) => (i === idx ? { ...item, phaseId: e.target.value } : item)))}
                          className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1.5 text-xs text-gray-100"
                        >
                          <option value="">No phase</option>
                          {selectedPlan.phases
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((phase) => (
                              <option key={phase._id} value={phase._id}>
                                Phase {phase.order}: {phase.title}
                              </option>
                            ))}
                        </select>
                        <div className="grid grid-cols-3 gap-2">
                          <select value={row.status === 'pending' ? 'not-started' : row.status} onChange={(e) => setTaskRows((prev) => prev.map((item, i) => (i === idx ? { ...item, status: e.target.value as LearningTask['status'] } : item)))} className="rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1 text-xs text-gray-100">
                            {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                          <select value={row.priority} onChange={(e) => setTaskRows((prev) => prev.map((item, i) => (i === idx ? { ...item, priority: e.target.value as 'low' | 'medium' | 'high' } : item)))} className="rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1 text-xs text-gray-100"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
                          <input type="date" value={row.dueDate} onChange={(e) => setTaskRows((prev) => prev.map((item, i) => (i === idx ? { ...item, dueDate: e.target.value } : item)))} className="rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1 text-xs text-gray-100" />
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setTaskRows((prev) => [...prev, { title: '', description: '', status: 'not-started', priority: 'medium', dueDate: '', phaseId: selectedPlan.phases[0]?._id || '' }])}
                        className="px-2 py-1 text-xs text-blue-300"
                      >
                        + Row
                      </button>
                      <button onClick={() => setShowAddTask(false)} className="px-2 py-1 text-xs text-gray-300">Cancel</button>
                      <button onClick={createTask} className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white">Add all</button>
                    </div>
                  </div>
                )}
                <div className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.14em] text-gray-500">Roadmap phases</div>
                    <div className="text-xs text-gray-500">{sortedPhases.length} phases</div>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {sortedPhases.map((phase) => {
                      const phaseTasks = tasks.filter((task) => task.phaseId === phase._id);
                      const completed = phaseTasks.filter((task) => task.status === 'completed').length;
                      const isSelected = selectedPhaseId === phase._id;
                      return (
                        <div
                          key={phase._id}
                          onClick={() => {
                            setSelectedPhaseId(phase._id);
                            setSelectedTaskId(null);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              setSelectedPhaseId(phase._id);
                              setSelectedTaskId(null);
                            }
                          }}
                          className={`min-w-[220px] rounded-lg border px-3 py-2 text-left cursor-pointer ${isSelected ? 'border-[#2f7cff] bg-[#0d1a31]' : 'border-[#1b2c49] bg-[#0c172d] hover:bg-[#101e38]'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] uppercase tracking-wide text-gray-500">Phase {phase.order}</div>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                deletePhase(phase._id);
                              }}
                              className="rounded px-1.5 py-0.5 text-[11px] text-red-300 hover:bg-red-500/10 hover:text-red-200"
                              aria-label={`Delete ${phase.title}`}
                            >
                              Delete
                            </button>
                          </div>
                          <div className="mt-1 line-clamp-1 text-sm font-semibold text-gray-100">{phase.title}</div>
                          <div className="mt-1 text-xs text-gray-500">{completed}/{phaseTasks.length} tasks</div>
                        </div>
                      );
                    })}
                    {unassignedTasks.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedPhaseId('unassigned');
                          setSelectedTaskId(null);
                        }}
                        className={`min-w-[220px] rounded-lg border px-3 py-2 text-left ${selectedPhaseId === 'unassigned' ? 'border-[#2f7cff] bg-[#0d1a31]' : 'border-[#1b2c49] bg-[#0c172d] hover:bg-[#101e38]'}`}
                      >
                        <div className="text-[11px] uppercase tracking-wide text-gray-500">Needs phase</div>
                        <div className="mt-1 line-clamp-1 text-sm font-semibold text-gray-100">Unassigned Tasks</div>
                        <div className="mt-1 text-xs text-gray-500">{unassignedTasks.length} tasks</div>
                      </button>
                    )}
                    {sortedPhases.length === 0 && unassignedTasks.length === 0 && (
                      <button onClick={() => setShowAddPhase(true)} className="min-w-[220px] rounded-lg border border-dashed border-[#2a3b57] px-3 py-4 text-left text-sm text-gray-400 hover:bg-[#101e38]">
                        Add your first phase
                      </button>
                    )}
                  </div>
                </div>

                {selectedPhaseTasks.length === 0 ? (
                  <div className={`px-4 py-10 text-center ${textMuted}`}>
                    {selectedPhaseId ? 'No tasks in this phase yet. Use + Add task to create one here.' : 'Select or create a phase to start adding tasks.'}
                  </div>
                ) : (
                  selectedPhaseTasks.map((task) => {
                    const progress = getTaskProgress(task.status);
                    return (
                      <button
                        key={task._id}
                        onClick={() => setSelectedTaskId(task._id)}
                        className={`w-full grid grid-cols-[130px_minmax(260px,1fr)_190px_150px_110px] items-center gap-3 px-4 py-3 text-left ${isDark ? 'hover:bg-[#0e1a33]' : 'hover:bg-gray-50'} border-b ${isDark ? 'border-[#152742]' : 'border-gray-100'}`}
                      >
                        <div className="flex items-center gap-2">
                          <select
                            value={task.status === 'pending' ? 'not-started' : task.status}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => updateTaskInlineById(task._id, { status: e.target.value as LearningTask['status'] })}
                            className="rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1 text-[11px] text-gray-200 outline-none"
                          >
                            {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>

                        <div className="min-w-0">
                          <div className={`truncate text-[15px] ${textPrimary}`}>{task.title}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 min-w-[30px]">{progress}%</span>
                          <div className={`h-1.5 w-full rounded-full ${isDark ? 'bg-[#2a3b57]' : 'bg-gray-200'}`}>
                            <div className="h-full rounded-full bg-green-500" style={{ width: `${progress}%` }} />
                          </div>
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="date"
                            value={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ''}
                            onChange={(e) => updateTaskInlineById(task._id, { dueDate: e.target.value || undefined })}
                            className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1 text-[11px] text-gray-200 outline-none"
                          />
                        </div>

                        <div onClick={(e) => e.stopPropagation()}>
                          <select
                            value={task.priority || 'medium'}
                            onChange={(e) => updateTaskInlineById(task._id, { priority: e.target.value as 'low' | 'medium' | 'high' })}
                            className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-1 text-[11px] uppercase text-gray-200 outline-none"
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className={`h-full grid grid-cols-1 ${showOptionsPanel ? 'xl:grid-cols-[1fr_296px]' : 'xl:grid-cols-1'}`}>
              <section className="min-w-0 h-full overflow-y-auto">
                <div className={`sticky top-0 z-20 border-b backdrop-blur px-5 py-3 ${borderCol} ${isDark ? 'bg-[#070d1b]/95' : 'bg-white/90'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs text-gray-400">
                      <button onClick={() => setSelectedTaskId(null)} className="text-[#2f7cff] hover:underline">
                        Back
                      </button>
                      <span className="mx-2 text-gray-600">/</span>
                      <span className="truncate text-gray-300">Day 1 - JavaScript Introduction</span>
                    </div>
                    <div className={`flex items-center gap-2 text-xs text-gray-400 ${showOptionsPanel ? 'xl:hidden' : 'xl:flex'}`}>
                      <span>{selectedTaskIndex >= 0 ? `${selectedTaskIndex + 1} / ${tasks.length}` : '-'}</span>
                      <button
                        onClick={prevTask}
                        disabled={selectedTaskIndex <= 0}
                        className="h-7 w-7 rounded border border-[#233758] text-gray-300 disabled:opacity-30"
                      >
                        ^
                      </button>
                      <button
                        onClick={nextTask}
                        disabled={selectedTaskIndex < 0 || selectedTaskIndex >= tasks.length - 1}
                        className="h-7 w-7 rounded border border-[#233758] text-gray-300 disabled:opacity-30"
                      >
                        v
                      </button>
                      <button
                        onClick={() => setShowOptionsPanel((prev) => !prev)}
                        className="px-2.5 h-7 rounded border border-[#233758] text-gray-300"
                      >
                        {showOptionsPanel ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </div>

                <LessonWorkspace
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  codeLanguage={codeLanguage}
                  codeOutput={codeOutput}
                  codeValue={codeValue}
                  commentDraft={commentDraft}
                  commentsLoading={commentsLoading}
                  currentProgress={currentProgress}
                  detailDraft={detailDraft}
                  isDark={isDark}
                  notesContent={notesContent}
                  notesSaved={notesSaved}
                  openInterviewIndex={openInterviewIndex}
                  selectedTask={selectedTask}
                  setCodeLanguage={setCodeLanguage}
                  setCodeValue={setCodeValue}
                  setCommentDraft={setCommentDraft}
                  setDetailDraft={setDetailDraft}
                  setNotesContent={setNotesContent}
                  setNotesSaved={setNotesSaved}
                  setOpenInterviewIndex={setOpenInterviewIndex}
                  submittingComment={submittingComment}
                  taskComments={taskComments}
                  textMuted={textMuted}
                  textPrimary={textPrimary}
                  copyCodeSample={copyCodeSample}
                  markSelectedTaskComplete={markSelectedTaskComplete}
                  normalizeDescription={normalizeDescription}
                  resetCodeSample={resetCodeSample}
                  runCodeSample={runCodeSample}
                  saveNotes={saveNotes}
                  submitComment={submitComment}
                  updateSelectedTaskInline={updateSelectedTaskInline}
                  showOptionsPanel={showOptionsPanel}
                />
              </section>

              <aside
                className={`${showOptionsPanel ? 'block' : 'hidden'} border-l ${borderCol} ${bgSidebar} h-full overflow-y-auto`}
              >
                <div className={`sticky top-0 z-10 border-b px-4 py-3 ${borderCol} ${bgSidebar}`}>
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
                    <span>{selectedTaskIndex >= 0 ? `${selectedTaskIndex + 1} / ${tasks.length}` : '-'}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={prevTask}
                        disabled={selectedTaskIndex <= 0}
                        className="h-7 w-7 rounded border border-[#233758] text-gray-300 disabled:opacity-30"
                      >
                        ^
                      </button>
                      <button
                        onClick={nextTask}
                        disabled={selectedTaskIndex < 0 || selectedTaskIndex >= tasks.length - 1}
                        className="h-7 w-7 rounded border border-[#233758] text-gray-300 disabled:opacity-30"
                      >
                        v
                      </button>
                      <button
                        onClick={() => setShowOptionsPanel(false)}
                        className="h-7 rounded border border-[#233758] px-2 text-gray-300"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <h5 className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Options</h5>

                  <Field label="Status">
                    <select
                      value={detailDraft.status === 'pending' ? 'not-started' : detailDraft.status}
                      onChange={(e) => {
                        const status = e.target.value as LearningTask['status'];
                        setDetailDraft((prev) => ({ ...prev, status }));
                        updateSelectedTaskInline({ status });
                      }}
                      className="w-full input-dark"
                    >
                      {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </Field>

                  <Field label="Due Date">
                    <input
                      type="date"
                      value={detailDraft.dueDate}
                      onChange={(e) => {
                        const dueDate = e.target.value;
                        setDetailDraft((prev) => ({ ...prev, dueDate }));
                        updateSelectedTaskInline({ dueDate: dueDate || undefined });
                      }}
                      className="w-full input-dark"
                    />
                  </Field>

                  <Field label="Priority">
                    <select
                      value={detailDraft.priority}
                      onChange={(e) => {
                        const priority = e.target.value as 'low' | 'medium' | 'high';
                        setDetailDraft((prev) => ({ ...prev, priority }));
                        updateSelectedTaskInline({ priority });
                      }}
                      className="w-full input-dark"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </Field>

                  <Field label="Confidence Score">
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={detailDraft.confidenceScore}
                      onChange={(e) => setDetailDraft((prev) => ({ ...prev, confidenceScore: e.target.value }))}
                      onBlur={() =>
                        updateSelectedTaskInline({
                          confidenceScore: detailDraft.confidenceScore === '' ? undefined : Number(detailDraft.confidenceScore),
                        })
                      }
                      className="w-full input-dark"
                    />
                  </Field>

                  <div className={`border-t pt-4 text-xs space-y-2 ${isDark ? 'border-[#1a2c48] text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                    <MetaRow label="Created" value={new Date(selectedTask.createdAt).toLocaleDateString()} isDark={isDark} />
                    <MetaRow label="Updated" value={new Date(selectedTask.updatedAt).toLocaleDateString()} isDark={isDark} />
                    <MetaRow label="Task ID" value={selectedTask._id.slice(-6).toUpperCase()} isDark={isDark} />
                  </div>

                  <button
                    onClick={() => deleteTask(selectedTask._id)}
                    className={`w-full rounded-md border px-3 py-2 text-sm font-medium transition-colors ${isDark
                        ? 'border-[#7d2632] bg-[#32131d] text-[#ff6d7f] hover:bg-[#3a1722]'
                        : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300'
                      }`}
                  >
                    Delete task
                  </button>
                </div>
              </aside>
            </div>
          )}
        </main>
      </div>

      {showEditPlan && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-2xl rounded-xl border ${isDark ? 'border-[#1b2c49] bg-[#0b1429]' : 'border-gray-200 bg-white'} p-4 space-y-3`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-lg font-semibold ${textPrimary}`}>Edit Plan</h3>
              <button onClick={() => setShowEditPlan(false)} className={`${textMuted}`}>×</button>
            </div>
            <input
              value={planDraft.title}
              onChange={(e) => setPlanDraft((p) => ({ ...p, title: e.target.value }))}
              placeholder="Plan title"
              className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm text-gray-100"
            />
            <textarea
              value={planDraft.description}
              onChange={(e) => setPlanDraft((p) => ({ ...p, description: e.target.value }))}
              rows={5}
              placeholder="Plan description"
              className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm text-gray-100 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEditPlan(false)} className="px-3 py-1.5 text-sm text-gray-300">Cancel</button>
              <button onClick={updatePlanInline} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LessonWorkspace({
  activeTab,
  codeLanguage,
  codeOutput,
  codeValue,
  commentDraft,
  commentsLoading,
  currentProgress,
  detailDraft,
  isDark,
  notesContent,
  notesSaved,
  openInterviewIndex,
  selectedTask,
  setActiveTab,
  setCodeLanguage,
  setCodeValue,
  setCommentDraft,
  setDetailDraft,
  setNotesContent,
  setNotesSaved,
  setOpenInterviewIndex,
  submittingComment,
  taskComments,
  textMuted,
  textPrimary,
  copyCodeSample,
  markSelectedTaskComplete,
  normalizeDescription,
  resetCodeSample,
  runCodeSample,
  saveNotes,
  submitComment,
  updateSelectedTaskInline,
  showOptionsPanel,
}: {
  activeTab: LessonTab;
  codeLanguage: 'javascript' | 'python';
  codeOutput: string;
  codeValue: string;
  commentDraft: string;
  commentsLoading: boolean;
  currentProgress: number;
  detailDraft: {
    title: string;
    description: string;
    lessonSections: LessonSection[];
    exercises: ExerciseDraft[];
    confidenceScore: string;
    status: LearningTask['status'];
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
  };
  isDark: boolean;
  notesContent: string;
  notesSaved: boolean;
  openInterviewIndex: number;
  selectedTask: LearningTask;
  setActiveTab: (tab: LessonTab) => void;
  setCodeLanguage: (language: 'javascript' | 'python') => void;
  setCodeValue: (value: string) => void;
  setCommentDraft: (value: string) => void;
  setDetailDraft: React.Dispatch<React.SetStateAction<{
    title: string;
    description: string;
    lessonSections: LessonSection[];
    exercises: ExerciseDraft[];
    confidenceScore: string;
    status: LearningTask['status'];
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
  }>>;
  setNotesContent: (value: string) => void;
  setNotesSaved: (value: boolean) => void;
  setOpenInterviewIndex: (value: number) => void;
  submittingComment: boolean;
  taskComments: TaskComment[];
  textMuted: string;
  textPrimary: string;
  copyCodeSample: () => void;
  markSelectedTaskComplete: () => void;
  normalizeDescription: (value: string) => string;
  resetCodeSample: () => void;
  runCodeSample: () => void;
  saveNotes: () => void;
  submitComment: () => void;
  updateSelectedTaskInline: (payload: Partial<LearningTask>, options?: { skipRefetch?: boolean; skipLocalUpdate?: boolean }) => Promise<void>;
  showOptionsPanel: boolean;
}) {
  const description = normalizeDescription(detailDraft.description || selectedTask.description || '');
  const exercises = detailDraft.exercises.length ? detailDraft.exercises : [createExerciseDraft(1)];
  const tabs: Array<{ key: LessonTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'theory', label: 'Theory' },
    { key: 'practice', label: 'Practice' },
    { key: 'code', label: 'Code' },
    { key: 'interview', label: 'Interview' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div className="w-full px-6 md:px-8 xl:px-9 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className={`min-w-0 ${showOptionsPanel ? 'max-w-[780px]' : 'max-w-[1120px]'}`}>
          <div className="mb-4 text-xs text-gray-500">
            <span className="text-[#2f7cff]">Learning</span>
            <span className="mx-2">/</span>
            <span>Roadmap</span>
            <span className="mx-2">/</span>
            <span>Lesson {selectedTask.order || 1}</span>
          </div>
          <h1
            contentEditable
            suppressContentEditableWarning
            onInput={(e) =>
              setDetailDraft((prev) => ({
                ...prev,
                title: (e.currentTarget.textContent || '').trimStart(),
              }))
            }
            onBlur={() => {
              const next = detailDraft.title.trim();
              if (next && next !== selectedTask.title) {
                updateSelectedTaskInline({ title: next });
              }
            }}
            className={`outline-none text-[34px] md:text-[40px] leading-[1.12] font-semibold tracking-[-0.01em] ${textPrimary}`}
          >
            {detailDraft.title}
          </h1>
          <p
            contentEditable
            suppressContentEditableWarning
            onInput={(e) =>
              setDetailDraft((prev) => ({
                ...prev,
                description: e.currentTarget.textContent || '',
              }))
            }
            onBlur={() => {
              const cleaned = normalizeDescription(detailDraft.description);
              if (cleaned !== normalizeDescription(selectedTask.description || '')) {
                updateSelectedTaskInline({ description: cleaned });
              }
            }}
            className={`mt-3 outline-none text-[14px] leading-[1.7] ${showOptionsPanel ? 'max-w-[760px]' : 'max-w-[1060px]'} ${isDark ? 'text-slate-300' : 'text-gray-600'}`}
          >
            {description || 'Add a short lesson description...'}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-gray-400">
            <span>Estimated Study Time: 5-6 hrs</span>
            <span className="flex items-center gap-2">
              Your Progress:
              <span className="font-semibold text-gray-200">{currentProgress}%</span>
              <span className="h-1.5 w-32 rounded-full bg-[#1d2d49]">
                <span className="block h-full rounded-full bg-[#2f7cff]" style={{ width: `${currentProgress}%` }} />
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={markSelectedTaskComplete} className="rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]">
            {selectedTask.status === 'completed' ? 'Mark In Progress' : 'Mark as Complete'}
          </button>
          <button aria-label="Bookmark lesson" className="h-9 w-9 rounded-lg border border-[#203451] text-gray-300 hover:bg-[#101d33]">□</button>
        </div>
      </div>

      <div className="mt-6 border-y border-[#162844]">
        <div role="tablist" aria-label="Lesson tabs" className="flex flex-wrap gap-1 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-2 text-xs transition ${activeTab === tab.key ? 'bg-[#10284d] text-[#60a5fa] shadow-[inset_0_-2px_0_#2f7cff]' : 'text-gray-400 hover:bg-[#0e1a30] hover:text-gray-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-6 ${showOptionsPanel ? 'max-w-[980px]' : 'max-w-none'}`}>
        {activeTab === 'overview' && <OverviewTab selectedTask={selectedTask} isDark={isDark} />}
        {activeTab === 'theory' && (
          <TheoryTab
            detailDraft={detailDraft}
            isDark={isDark}
            setDetailDraft={setDetailDraft}
            updateSelectedTaskInline={updateSelectedTaskInline}
          />
        )}
        {activeTab === 'practice' && (
          <PracticeTab
            detailDraft={detailDraft}
            isDark={isDark}
            setDetailDraft={setDetailDraft}
            updateSelectedTaskInline={updateSelectedTaskInline}
          />
        )}
        {activeTab === 'code' && (
          <CodeTab
            codeLanguage={codeLanguage}
            codeOutput={codeOutput}
            codeValue={codeValue}
            setCodeLanguage={setCodeLanguage}
            setCodeValue={setCodeValue}
            copyCodeSample={copyCodeSample}
            resetCodeSample={resetCodeSample}
            runCodeSample={runCodeSample}
          />
        )}
        {activeTab === 'interview' && (
          <InterviewTab openInterviewIndex={openInterviewIndex} setOpenInterviewIndex={setOpenInterviewIndex} />
        )}
        {activeTab === 'notes' && (
          <NotesTab
            notesContent={notesContent}
            notesSaved={notesSaved}
            setNotesContent={(value) => {
              setNotesContent(value);
              setNotesSaved(false);
            }}
            saveNotes={saveNotes}
          />
        )}
      </div>

      <div className={`mt-8 border-t pt-6 ${showOptionsPanel ? 'max-w-[860px]' : 'max-w-none'} ${isDark ? 'border-[#172945]' : 'border-gray-200'}`}>
        <h4 className={`text-[18px] font-semibold mb-4 ${textPrimary}`}>Comments</h4>
        <div className="space-y-3 mb-4">
          {commentsLoading ? (
            <p className={`text-sm ${textMuted}`}>Loading comments...</p>
          ) : taskComments.length === 0 ? (
            <p className={`text-sm ${textMuted}`}>No comments yet.</p>
          ) : (
            taskComments.map((comment) => (
              <div key={comment._id} className={`rounded-xl border px-4 py-3 ${isDark ? 'border-[#1b2d49] bg-[#0f1a31]' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className={`text-sm font-medium ${textPrimary}`}>{comment.author}</div>
                  <div className={`text-xs ${textMuted}`}>{new Date(comment.createdAt).toLocaleString()}</div>
                </div>
                <p className={`mt-1 whitespace-pre-wrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{comment.content}</p>
              </div>
            ))
          )}
        </div>
        <textarea
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          rows={4}
          placeholder="Leave a comment..."
          className="w-full rounded-xl border border-[#223655] bg-[#0f1a31] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#2f7cff]"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={submitComment}
            disabled={submittingComment || !commentDraft.trim()}
            className="rounded-xl bg-[#2f66df] px-4 py-2 text-sm font-semibold text-white disabled:opacity-45 hover:bg-[#2552b3] transition-colors"
          >
            {submittingComment ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ selectedTask, isDark }: { selectedTask: LearningTask; isDark: boolean }) {
  const concepts = getConceptCards(selectedTask);
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-100">What you'll learn</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {concepts.map((concept) => (
            <div key={concept.title} className="rounded-xl border border-[#1d304d] bg-[#0c172a] p-4">
              <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full ${concept.bg}`}>{concept.icon}</div>
              <div className="text-sm font-semibold text-gray-100">{concept.title}</div>
              <p className="mt-2 text-xs leading-5 text-gray-400">{concept.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-100">Lesson Roadmap</h3>
        {['Scope in JavaScript', 'Closures Deep Dive', 'Hoisting Explained'].map((item, index) => (
          <div key={item} className={`flex items-center justify-between border-t py-3 first:border-t-0 ${isDark ? 'border-[#172945]' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? 'bg-green-500/20 text-green-300' : index === 1 ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-700 text-gray-400'}`}>
                {index + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-gray-100">{item}</div>
                <div className="text-xs text-gray-500">{index === 0 ? 'Completed' : index === 1 ? 'In Progress' : 'Locked'}</div>
              </div>
            </div>
            <span className={`text-xs ${index === 0 ? 'text-green-300' : index === 1 ? 'text-blue-300' : 'text-gray-500'}`}>{index === 0 ? 'Completed' : index === 1 ? 'In Progress' : 'Locked'}</span>
          </div>
        ))}
      </section>
      <div className="flex justify-between">
        <button className="rounded-lg border border-[#1d304d] px-4 py-2 text-xs text-gray-300 hover:bg-[#101d33]">Previous Lesson</button>
        <button className="rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]">Next Lesson</button>
      </div>
    </div>
  );
}

function TheoryTab({
  detailDraft,
  isDark,
  setDetailDraft,
  updateSelectedTaskInline,
}: {
  detailDraft: { lessonSections: LessonSection[] };
  isDark: boolean;
  setDetailDraft: React.Dispatch<React.SetStateAction<any>>;
  updateSelectedTaskInline: (payload: Partial<LearningTask>, options?: { skipRefetch?: boolean; skipLocalUpdate?: boolean }) => Promise<void>;
}) {
  const cards = getTheoryCards(detailDraft.lessonSections);
  return (
    <div className="space-y-4">
      <SimpleLearningMaterialEditor
        sections={detailDraft.lessonSections}
        onSave={(lessonSections) => {
          setDetailDraft((prev: any) => ({ ...prev, lessonSections }));
          updateSelectedTaskInline({ lessonSections }, { skipRefetch: true, skipLocalUpdate: true });
        }}
      />
      {cards.map((card, index) => (
        <section key={card.title} className="grid gap-4 rounded-xl border border-[#1d304d] bg-[#0b1428] p-4 md:grid-cols-[44px_1fr_220px]">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${card.color}`}>{index + 1}</div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">{card.title}</h3>
            <LearningRichContent html={card.content} className="mt-2 text-sm leading-7 text-gray-300" />
            {card.bullets.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-500">
                {card.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            )}
          </div>
          <div className="rounded-lg border border-[#244266] bg-[#0d1d35] p-3 text-xs leading-5 text-blue-200">
            <div className="mb-1 font-semibold text-blue-300">{card.calloutTitle}</div>
            {card.callout}
          </div>
        </section>
      ))}
      <LessonSectionsEditor
        sections={detailDraft.lessonSections}
        onChange={(lessonSections) => setDetailDraft((prev: any) => ({ ...prev, lessonSections }))}
        onSave={(openNew = false) => {
          const lessonSections = normalizeLessonSections(detailDraft.lessonSections);
          if (detailDraft.lessonSections.length > 0 && lessonSections.length === 0) {
            alert('Add a section title and content before saving a lesson section.');
            return false;
          }
          setDetailDraft((prev: any) => ({
            ...prev,
            lessonSections: openNew ? [{ title: '', content: '', order: lessonSections.length + 1 }, ...lessonSections] : lessonSections,
          }));
          updateSelectedTaskInline({ lessonSections }, { skipRefetch: true, skipLocalUpdate: true });
          return true;
        }}
      />
    </div>
  );
}

function SimpleLearningMaterialEditor({
  onSave,
  sections,
}: {
  onSave: (sections: LessonSection[]) => void;
  sections: LessonSection[];
}) {
  const getSectionContent = (pattern: RegExp) => sections.find((section) => pattern.test(section.title))?.content || '';
  const [concept, setConcept] = useState(() => getSectionContent(/concept|theory|learn/i));
  const [outcomes, setOutcomes] = useState(() => getSectionContent(/outcome|achieve|objective/i));
  const [practiceGoal, setPracticeGoal] = useState(() => getSectionContent(/practice|goal|exercise/i));
  const [projectConnection, setProjectConnection] = useState(() => getSectionContent(/project|connection|real/i));
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setConcept(getSectionContent(/concept|theory|learn/i));
    setOutcomes(getSectionContent(/outcome|achieve|objective/i));
    setPracticeGoal(getSectionContent(/practice|goal|exercise/i));
    setProjectConnection(getSectionContent(/project|connection|real/i));
  }, [sections]);

  const saveSimpleMaterial = () => {
    const simpleSections: LessonSection[] = [
      { title: 'Concept', content: concept.trim(), order: 1 },
      { title: 'Learning Outcomes', content: outcomes.trim(), order: 2 },
      { title: 'Practice Goal', content: practiceGoal.trim(), order: 3 },
      { title: 'Project Connection', content: projectConnection.trim(), order: 4 },
    ].filter((section) => section.content);

    const remainingSections = sections.filter((section) => !/concept|theory|learn|outcome|achieve|objective|practice|goal|exercise|project|connection|real/i.test(section.title));
    const nextSections = normalizeLessonSections([...simpleSections, ...remainingSections.map((section, index) => ({ ...section, order: simpleSections.length + index + 1 }))]);

    if (nextSections.length === 0) {
      alert('Add at least one learning material field before saving.');
      return;
    }

    onSave(nextSections);
  };

  const editorBody = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-blue-300">Simple learning material</div>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            Write rich learning content for users. Add headings, lists, code, images, and video links.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsFullscreen((value) => !value)}
            className="rounded-lg border border-[#2a3b57] px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-[#12213b]"
          >
            {isFullscreen ? 'Exit full screen' : 'Full screen editor'}
          </button>
          <button
            onClick={saveSimpleMaterial}
            className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          >
            Save material
          </button>
        </div>
      </div>

      <div className={`mt-5 grid gap-5 ${isFullscreen ? 'xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : 'xl:grid-cols-2'}`}>
        <label className={`block ${isFullscreen ? 'xl:row-span-2' : ''}`}>
          <span className="text-sm font-semibold text-gray-200">Concept</span>
          <RichTextEditor
            value={concept}
            onChange={setConcept}
            placeholder="Explain the concept in simple language..."
            minHeight={isFullscreen ? 520 : 220}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-200">What users will achieve</span>
          <RichTextEditor
            value={outcomes}
            onChange={setOutcomes}
            placeholder="Add bullet outcomes, e.g. understand setup, create first component, explain folder structure..."
            minHeight={isFullscreen ? 245 : 220}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-200">Practice Goal</span>
          <RichTextEditor
            value={practiceGoal}
            onChange={setPracticeGoal}
            placeholder="What should the learner build, debug, or explain?"
            minHeight={isFullscreen ? 245 : 220}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gray-200">Project Connection</span>
          <RichTextEditor
            value={projectConnection}
            onChange={setProjectConnection}
            placeholder="Connect this lesson to a real project or bug..."
            minHeight={isFullscreen ? 245 : 220}
          />
        </label>
      </div>
    </>
  );

  if (isFullscreen) {
    return (
      <section className="fixed inset-0 z-[100] overflow-y-auto bg-[#050b16] p-5 text-white">
        <div className="mx-auto max-w-7xl rounded-2xl border border-blue-500/25 bg-[#0b1429] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
          {editorBody}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-blue-500/25 bg-[#0b1429] p-4 shadow-[0_16px_50px_rgba(37,99,235,0.08)]">
      {editorBody}
    </section>
  );
}

function RichTextEditor({
  minHeight = 220,
  onChange,
  placeholder,
  value,
}: {
  minHeight?: number;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit, ImageBlock, LinkMark],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'px-3 py-2 text-sm leading-6 text-gray-100 outline-none',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const nextHtml = value || '';
    if (currentHtml !== nextHtml) {
      editor.commands.setContent(nextHtml, false);
    }
  }, [editor, value]);

  const insertImage = () => {
    if (!editor) return;
    const url = window.prompt('Paste image URL');
    if (!url) return;
    editor.chain().focus().insertContent(`<img src="${escapeHtmlAttribute(url)}" alt="Learning visual" />`).run();
  };

  const insertVideo = () => {
    if (!editor) return;
    const url = window.prompt('Paste video URL');
    if (!url) return;
    editor.chain().focus().insertContent(`<p><a href="${escapeHtmlAttribute(url)}" target="_blank" rel="noreferrer">Watch video</a></p>`).run();
  };

  return (
    <div className="relative mt-2 overflow-hidden rounded-lg border border-[#2a3b57] bg-[#111d31] focus-within:border-blue-500">
      <div className="flex flex-wrap gap-1 border-b border-[#223655] bg-[#0b1429] p-2">
        <EditorButton active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</EditorButton>
        <EditorButton active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</EditorButton>
        <EditorButton active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>B</EditorButton>
        <EditorButton active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>I</EditorButton>
        <EditorButton active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</EditorButton>
        <EditorButton active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</EditorButton>
        <EditorButton active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>Quote</EditorButton>
        <EditorButton active={editor?.isActive('codeBlock')} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>Code</EditorButton>
        <EditorButton onClick={insertImage}>Image</EditorButton>
        <EditorButton onClick={insertVideo}>Video</EditorButton>
      </div>
      {!value && <div className="pointer-events-none absolute px-3 py-2 text-sm text-gray-500">{placeholder}</div>}
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function EditorButton({ active = false, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs transition ${active ? 'border-blue-500 bg-blue-600 text-white' : 'border-[#2a3b57] text-gray-300 hover:bg-[#172640]'}`}
    >
      {children}
    </button>
  );
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function PracticeTab({
  detailDraft,
  isDark,
  setDetailDraft,
  updateSelectedTaskInline,
}: {
  detailDraft: { exercises: ExerciseDraft[] };
  isDark: boolean;
  setDetailDraft: React.Dispatch<React.SetStateAction<any>>;
  updateSelectedTaskInline: (payload: Partial<LearningTask>, options?: { skipRefetch?: boolean; skipLocalUpdate?: boolean }) => Promise<void>;
}) {
  const exercises = detailDraft.exercises.length ? detailDraft.exercises : [createExerciseDraft(1)];
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-100">Guided Practice</h3>
            <p className="mt-1 text-sm text-gray-500">Apply what you've learned with hands-on exercises.</p>
          </div>
          <div className="rounded-full border border-[#203451] px-3 py-1 text-xs text-gray-300">0/{exercises.length} completed</div>
        </div>
        {exercises.map((exercise, index) => (
          <div key={index} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#12356d] text-sm font-semibold text-blue-200">{index + 1}</span>
              <div>
                <h4 className="text-sm font-semibold text-gray-100">{exercise.prompt || ['Scope in Action', 'Closures Deep Dive', 'this & Prototypes'][index] || 'Practice Exercise'}</h4>
                <p className="mt-1 max-w-xl text-xs leading-5 text-gray-500">{exercise.solution || 'Practice the concept with a focused exercise and note what you learn.'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] capitalize ${exercise.difficulty === 'hard' ? 'border-red-500/30 text-red-300' : exercise.difficulty === 'medium' ? 'border-amber-500/30 text-amber-300' : 'border-green-500/30 text-green-300'}`}>{exercise.difficulty || 'easy'}</span>
              <button className="rounded-lg bg-[#2563eb] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]">Start Practice</button>
            </div>
          </div>
        ))}
        <ExercisesEditor
          exercises={detailDraft.exercises}
          onChange={(exercises) => setDetailDraft((prev: any) => ({ ...prev, exercises }))}
          onSave={(openNew = false, template?: ExerciseDraft) => {
            const exercises = detailDraft.exercises.map(fromExerciseDraft).filter(Boolean) as LearningExercise[];
            if (detailDraft.exercises.length > 0 && exercises.length === 0) {
              alert('Add a prompt, starter code, expected output, hint, or solution before saving an exercise.');
              return false;
            }
            const savedDrafts = exercises.map((exercise, index) => toExerciseDraft(exercise, index + 1));
            setDetailDraft((prev: any) => ({
              ...prev,
              exercises: openNew ? [createExerciseDraft(savedDrafts.length + 1, template), ...savedDrafts] : savedDrafts,
            }));
            updateSelectedTaskInline({ exercises, exercise: exercises[0] }, { skipRefetch: true, skipLocalUpdate: true });
            return true;
          }}
        />
      </div>
      <aside className="rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
        <h3 className="text-sm font-semibold text-gray-100">Before you start</h3>
        {['Review the theory', 'Understand the examples', 'Take notes', 'Ready to practice'].map((item, index) => (
          <label key={item} className={`mt-4 flex items-start gap-3 border-t pt-4 text-sm ${isDark ? 'border-[#172945] text-gray-300' : 'border-gray-200 text-gray-700'}`}>
            <input type="checkbox" defaultChecked={index < 2} className="mt-1" />
            <span>{item}</span>
          </label>
        ))}
        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
          Don't rush. Focus on understanding why something works, not just how.
        </div>
      </aside>
    </div>
  );
}

function CodeTab({
  codeLanguage,
  codeOutput,
  codeValue,
  setCodeLanguage,
  setCodeValue,
  copyCodeSample,
  resetCodeSample,
  runCodeSample,
}: {
  codeLanguage: 'javascript' | 'python';
  codeOutput: string;
  codeValue: string;
  setCodeLanguage: (language: 'javascript' | 'python') => void;
  setCodeValue: (value: string) => void;
  copyCodeSample: () => void;
  resetCodeSample: () => void;
  runCodeSample: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_240px]">
      <div className="space-y-4">
        <section className="rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-100">Problem</h3>
            <span className="rounded-full border border-green-500/30 px-2.5 py-1 text-[11px] text-green-300">Easy</span>
          </div>
          <p className="text-sm leading-6 text-gray-400">Create a function that returns a counter. Each time the returned function is called, it should increment and return the count.</p>
        </section>
        <section className="overflow-hidden rounded-xl border border-[#1d304d] bg-[#06101f]">
          <div className="flex items-center justify-between border-b border-[#1d304d] px-4 py-3">
            <select value={codeLanguage} onChange={(event) => setCodeLanguage(event.target.value as 'javascript' | 'python')} className="rounded-md border border-[#203451] bg-[#0d1a2d] px-3 py-1.5 text-xs text-gray-200 outline-none">
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>
            <button onClick={copyCodeSample} className="rounded-md border border-[#203451] px-3 py-1.5 text-xs text-gray-300 hover:bg-[#101d33]">Copy Code</button>
          </div>
          <textarea value={codeValue} onChange={(event) => setCodeValue(event.target.value)} rows={12} className="w-full resize-y bg-[#050b16] px-5 py-4 font-mono text-sm leading-6 text-blue-100 outline-none" spellCheck={false} />
          <div className="flex items-center gap-2 border-t border-[#1d304d] px-4 py-3">
            <button onClick={runCodeSample} className="rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]">Run Code</button>
            <button onClick={resetCodeSample} className="rounded-lg border border-[#203451] px-4 py-2 text-xs text-gray-300 hover:bg-[#101d33]">Reset</button>
          </div>
        </section>
        <section className="rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-100">Output</h3>
            <button className="text-xs text-gray-500" onClick={() => setCodeValue(codeValue)}>Clear</button>
          </div>
          <pre className="min-h-[92px] whitespace-pre-wrap rounded-lg bg-[#050b16] p-3 text-xs leading-5 text-gray-400">{codeOutput || 'Run your code to see output here...'}</pre>
        </section>
      </div>
      <aside className="rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
        <h3 className="text-sm font-semibold text-gray-100">Tips</h3>
        <ul className="mt-3 space-y-3 text-xs leading-5 text-gray-400">
          <li>The inner function remembers the count variable.</li>
          <li>That's closure in action.</li>
          <li>Each call uses preserved lexical scope.</li>
        </ul>
        <button className="mt-5 w-full rounded-lg border border-[#203451] px-3 py-2 text-xs text-gray-300 hover:bg-[#101d33]">Need a hint?</button>
      </aside>
    </div>
  );
}

function InterviewTab({ openInterviewIndex, setOpenInterviewIndex }: { openInterviewIndex: number; setOpenInterviewIndex: (index: number) => void }) {
  const questions = getInterviewQuestions();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-gray-100">Interview Prep</h3>
          <p className="mt-1 text-sm text-gray-500">High-impact questions with concise answers to help you revise.</p>
        </div>
        <div className="rounded-xl border border-[#1d304d] bg-[#0b1428] px-4 py-3 text-sm text-gray-300">Interview Score <span className="font-semibold text-blue-300">72/100</span></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {['All Questions', 'Scope', 'Closures', 'Hoisting', 'This', 'Prototypes'].map((chip, index) => (
          <button key={chip} className={`rounded-full border px-3 py-1 text-xs ${index === 0 ? 'border-[#2f7cff] bg-[#2f7cff] text-white' : 'border-[#203451] text-gray-400 hover:text-gray-200'}`}>{chip}</button>
        ))}
      </div>
      {questions.map((question, index) => (
        <div key={question.question} className="rounded-xl border border-[#1d304d] bg-[#0b1428]">
          <button onClick={() => setOpenInterviewIndex(openInterviewIndex === index ? -1 : index)} className="flex w-full items-center justify-between px-4 py-3 text-left">
            <span className="text-sm font-semibold text-gray-100">{index + 1}. {question.question}</span>
            <span className="text-xs text-amber-300">{index === 0 ? 'Most Asked' : 'Open'}</span>
          </button>
          {openInterviewIndex === index && (
            <div className="border-t border-[#1d304d] px-4 py-4">
              <p className="text-sm leading-6 text-gray-400">{question.answer}</p>
              {question.code && <pre className="mt-4 overflow-x-auto rounded-lg bg-[#050b16] p-3 font-mono text-xs leading-5 text-blue-100">{question.code}</pre>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NotesTab({ notesContent, notesSaved, setNotesContent, saveNotes }: { notesContent: string; notesSaved: boolean; setNotesContent: (value: string) => void; saveNotes: () => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_260px]">
      <section className="rounded-xl border border-[#1d304d] bg-[#0b1428]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1d304d] px-4 py-3 text-xs text-gray-400">
          <span className="rounded border border-[#203451] px-2 py-1">Normal</span>
          {['B', 'I', 'U', 'Code', 'List', 'Link', 'Quote'].map((tool) => <button key={tool} className="rounded px-2 py-1 hover:bg-[#101d33]">{tool}</button>)}
        </div>
        <textarea value={notesContent} onChange={(event) => setNotesContent(event.target.value)} rows={16} className="w-full resize-y bg-transparent px-5 py-4 text-sm leading-7 text-gray-200 outline-none" />
        <div className="flex items-center justify-between border-t border-[#1d304d] px-4 py-3 text-xs text-gray-500">
          <span>{notesSaved ? 'Saved just now' : 'Auto-save ready'}</span>
          <button onClick={saveNotes} className="rounded-lg bg-[#2563eb] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1d4ed8]">Save Notes</button>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
          <h3 className="text-sm font-semibold text-gray-100">Quick Summary</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-gray-400">
            <li>Scope: variable accessibility</li>
            <li>Closures: preserving state</li>
            <li>Hoisting: declaration lifting</li>
            <li>this: context based invocation</li>
          </ul>
        </div>
        <div className="rounded-xl border border-[#1d304d] bg-[#0b1428] p-4">
          <h3 className="text-sm font-semibold text-gray-100">Revision Points</h3>
          <ul className="mt-3 space-y-2 text-xs text-gray-400">
            {['Scope chain & lexical environment', 'Closures with real examples', 'Hoisting in variables & functions', 'Prototypes & prototype chain'].map((item) => <li key={item}>○ {item}</li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}

const DEFAULT_CODE_SAMPLE = `function createCounter() {
  let count = 0;

  return function () {
    count = count + 1;
    return count;
  };
}

const counter = createCounter();
console.log(counter());
console.log(counter());`;

function buildDefaultNotes(task: LearningTask) {
  return `Understanding the core concepts

${task.description || 'Add your personal study notes here.'}

Key Takeaways:
- Write down the most important idea.
- Add confusing points or doubts.
- Connect this lesson to a real project file.

Examples to revisit:
- Add one example after practice.`;
}

function getConceptCards(task: LearningTask) {
  const sourceSections = task.lessonSections?.slice().sort((a, b) => a.order - b.order) || [];
  const fallback = [
    { title: 'Scope', text: 'Understand global, function, and block scope with practical examples.', icon: '◎', bg: 'bg-blue-500/20 text-blue-300' },
    { title: 'Closures', text: 'Learn how closures work and how they preserve lexical scope.', icon: '▣', bg: 'bg-green-500/20 text-green-300' },
    { title: 'Hoisting', text: 'Understand variable and function hoisting with real code behavior.', icon: '↑', bg: 'bg-purple-500/20 text-purple-300' },
    { title: 'this', text: 'Understand how this changes based on context and how to control it.', icon: 'this', bg: 'bg-amber-500/20 text-amber-300' },
    { title: 'Prototypes', text: 'Explore prototypes, prototype chain, and inheritance.', icon: '◇', bg: 'bg-teal-500/20 text-teal-300' },
  ];

  if (!sourceSections.length) return fallback;
  return sourceSections.slice(0, 5).map((section, index) => ({
    title: section.title,
    text: summarizeLearningHtml(section.content),
    icon: ['◎', '▣', '↑', 'this', '◇'][index] || '•',
    bg: ['bg-blue-500/20 text-blue-300', 'bg-green-500/20 text-green-300', 'bg-purple-500/20 text-purple-300', 'bg-amber-500/20 text-amber-300', 'bg-teal-500/20 text-teal-300'][index] || 'bg-blue-500/20 text-blue-300',
  }));
}

function getTheoryCards(sections: LessonSection[]) {
  const fallback = [
    {
      title: 'Execution Context',
      content: 'Every JavaScript code runs inside an execution context. It has a creation phase and an execution phase.',
      bullets: ['Creation phase allocates memory and initializes variables.', 'Execution phase runs code line by line.'],
      calloutTitle: 'Key Takeaway',
      callout: 'Everything in JavaScript happens inside an execution context.',
      color: 'bg-blue-500/20 text-blue-300',
    },
    {
      title: 'Scope Chain',
      content: 'JavaScript uses lexical scoping. If a variable is not found locally, JavaScript looks outward.',
      bullets: ['Local scope -> Outer scope -> Global scope'],
      calloutTitle: 'Remember',
      callout: 'JavaScript looks outward, never inward.',
      color: 'bg-green-500/20 text-green-300',
    },
    {
      title: 'Closures',
      content: 'A closure is a function that remembers variables from its lexical scope even after the outer function finishes.',
      bullets: ['Useful for data privacy and state preservation.'],
      calloutTitle: 'Key Takeaway',
      callout: 'Closures let functions remember their environment.',
      color: 'bg-purple-500/20 text-purple-300',
    },
    {
      title: 'Hoisting',
      content: 'Declarations are processed before execution. var, let, const, and functions behave differently.',
      bullets: ['var is hoisted and initialized with undefined.', 'let and const are hoisted but not initialized.'],
      calloutTitle: 'Watch Out',
      callout: 'Accessing let/const before declaration throws an error.',
      color: 'bg-amber-500/20 text-amber-300',
    },
    {
      title: 'Prototypes',
      content: 'Every JavaScript object has a prototype. Prototypes allow objects to inherit properties and methods.',
      bullets: ['Backbone of inheritance in JavaScript.'],
      calloutTitle: 'Key Takeaway',
      callout: 'Prototypes enable reuse and power inheritance.',
      color: 'bg-teal-500/20 text-teal-300',
    },
  ];

  if (!sections.length) return fallback;
  return sections.slice().sort((a, b) => a.order - b.order).map((section, index) => ({
    title: section.title,
    content: section.content,
    bullets: [],
    calloutTitle: 'Key Takeaway',
    callout: 'Connect this concept to your current project before moving on.',
    color: ['bg-blue-500/20 text-blue-300', 'bg-green-500/20 text-green-300', 'bg-purple-500/20 text-purple-300', 'bg-amber-500/20 text-amber-300', 'bg-teal-500/20 text-teal-300'][index] || 'bg-blue-500/20 text-blue-300',
  }));
}

function getInterviewQuestions() {
  return [
    {
      question: 'What is a closure in JavaScript?',
      answer: 'A closure is the combination of a function bundled together with references to its surrounding state. It allows a function to access variables from an outer function even after the outer function has finished executing.',
      code: `function outer(x) {
  return function inner(y) {
    return x + y;
  };
}

const add = outer(5);
add(3); // 8`,
    },
    { question: 'How does JavaScript handle variable scope?', answer: 'JavaScript uses lexical scope, so variable lookup follows where functions are written, not where they are called.' },
    { question: 'What is the difference between == and ===?', answer: '== allows type coercion before comparison, while === compares both value and type.' },
    { question: 'Explain hoisting in JavaScript.', answer: 'Hoisting is JavaScript behavior where declarations are processed before execution. var is initialized as undefined, while let and const remain in the temporal dead zone.' },
    { question: 'What does the this keyword refer to?', answer: 'this depends on call site and binding rules, such as method call, explicit binding, constructor call, or lexical binding with arrow functions.' },
    { question: 'What are prototypes in JavaScript?', answer: 'Prototypes are objects used for property lookup and inheritance. Objects can access behavior from their prototype chain.' },
  ];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-gray-400">{label}</div>
      <div className="[&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:px-3 [&>select]:py-2 [&>select]:text-sm [&>select]:outline-none [&>select]:dark:bg-[#0c1424] [&>select]:dark:border-[#1e304b] [&>select]:dark:text-white [&>select]:dark:focus:border-blue-500 [&>select]:bg-white [&>select]:border-gray-300 [&>select]:text-gray-900 [&>select]:focus:border-blue-500 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:px-3 [&>input]:py-2 [&>input]:text-sm [&>input]:outline-none [&>input]:dark:bg-[#0c1424] [&>input]:dark:border-[#1e304b] [&>input]:dark:text-white [&>input]:dark:[color-scheme:dark] [&>input]:dark:focus:border-blue-500 [&>input]:bg-white [&>input]:border-gray-300 [&>input]:text-gray-900 [&>input]:focus:border-blue-500">
        {children}
      </div>
    </label>
  );
}

type PhaseImportTask = Partial<LearningTask> & {
  title: string;
};

type PhaseImportPayload = {
  title: string;
  description?: string;
  tasks: PhaseImportTask[];
};

type PlanImportPayload = {
  title: string;
  description?: string;
  goals?: string[];
  status: LearningPlan['status'];
  targetEndDate?: string;
  phases: Array<PhaseImportPayload & { order: number }>;
};

function normalizePlanImport(value: unknown): PlanImportPayload | { error: string } {
  if (!value || typeof value !== 'object') {
    return { error: 'JSON must be an object with title and phases.' };
  }

  const root = value as Record<string, unknown>;
  const planSource = root.plan && typeof root.plan === 'object'
    ? { ...(root.plan as Record<string, unknown>), phases: root.phases ?? (root.plan as Record<string, unknown>).phases }
    : root;

  const title = typeof planSource.title === 'string' ? planSource.title.trim() : '';
  if (!title) return { error: 'Plan title is required.' };

  const rawPhases = Array.isArray(planSource.phases) ? planSource.phases : [];
  if (rawPhases.length === 0) return { error: 'At least one phase is required in phases[].' };

  const phases = rawPhases.map((rawPhase, index) => {
    const phase = normalizePhaseImport(rawPhase);
    if ('error' in phase) return { error: `Phase ${index + 1}: ${phase.error}` };
    return {
      ...phase,
      order: rawPhase && typeof rawPhase === 'object' && Number.isFinite(Number((rawPhase as Record<string, unknown>).order))
        ? Number((rawPhase as Record<string, unknown>).order)
        : index + 1,
    };
  });

  const invalidPhase = phases.find((phase) => 'error' in phase);
  if (invalidPhase && 'error' in invalidPhase) return invalidPhase;

  return {
    title,
    description: typeof planSource.description === 'string' ? planSource.description.trim() : '',
    goals: Array.isArray(planSource.goals) ? planSource.goals.filter((goal): goal is string => typeof goal === 'string' && goal.trim()) : [],
    status: isPlanStatus(planSource.status) ? planSource.status : 'active',
    targetEndDate: typeof planSource.targetEndDate === 'string' ? planSource.targetEndDate : undefined,
    phases: phases as Array<PhaseImportPayload & { order: number }>,
  };
}

function normalizePhaseImport(value: unknown): PhaseImportPayload | { error: string } {
  if (!value || typeof value !== 'object') {
    return { error: 'JSON must be an object with title and tasks.' };
  }

  const root = value as Record<string, unknown>;
  const phaseSource = root.phase && typeof root.phase === 'object'
    ? { ...(root.phase as Record<string, unknown>), tasks: root.tasks ?? (root.phase as Record<string, unknown>).tasks }
    : root;

  const title = typeof phaseSource.title === 'string' ? phaseSource.title.trim() : '';
  if (!title) return { error: 'Phase title is required.' };

  const rawTasks = Array.isArray(phaseSource.tasks) ? phaseSource.tasks : [];
  if (rawTasks.length === 0) return { error: 'At least one task is required in tasks[].' };

  const tasks = rawTasks.map((rawTask, index) => normalizePhaseImportTask(rawTask, index));
  const invalidTask = tasks.find((task) => 'error' in task);
  if (invalidTask && 'error' in invalidTask) return invalidTask;

  return {
    title,
    description: typeof phaseSource.description === 'string' ? phaseSource.description.trim() : '',
    tasks: tasks as PhaseImportTask[],
  };
}

function normalizePhaseImportTask(value: unknown, index: number): PhaseImportTask | { error: string } {
  if (!value || typeof value !== 'object') {
    return { error: `Task ${index + 1} must be an object.` };
  }

  const task = value as Record<string, unknown>;
  const title = typeof task.title === 'string' ? task.title.trim() : '';
  if (!title) return { error: `Task ${index + 1} is missing title.` };

  const status = isTaskStatus(task.status) ? task.status : 'not-started';
  const priority = isTaskPriority(task.priority) ? task.priority : 'medium';
  const lessonSections = Array.isArray(task.lessonSections)
    ? normalizeLessonSections(task.lessonSections as LessonSection[])
    : [];
  const exercises = Array.isArray(task.exercises)
    ? normalizeImportedExercises(task.exercises)
    : task.exercise && typeof task.exercise === 'object'
      ? normalizeImportedExercises([task.exercise])
      : [];

  return {
    title,
    description: typeof task.description === 'string' ? task.description.trim() : '',
    aim: typeof task.aim === 'string' ? task.aim.trim() : undefined,
    lessonSections,
    exercises,
    exercise: exercises[0],
    resources: Array.isArray(task.resources) ? task.resources.filter((item): item is string => typeof item === 'string' && item.trim()) : [],
    flashcards: Array.isArray(task.flashcards) ? normalizeFlashcards(task.flashcards) : [],
    confidenceScore: Number.isFinite(Number(task.confidenceScore)) ? Math.min(5, Math.max(1, Math.round(Number(task.confidenceScore)))) : undefined,
    status,
    priority,
    dueDate: typeof task.dueDate === 'string' ? task.dueDate : undefined,
    order: Number.isFinite(Number(task.order)) ? Number(task.order) : index + 1,
  };
}

function normalizeImportedExercises(values: unknown[]): LearningExercise[] {
  return values
    .map((value, index) => {
      if (!value || typeof value !== 'object') return null;
      const exercise = value as Record<string, unknown>;
      const type = isExerciseType(exercise.type) ? exercise.type : 'reading';
      const language = isExerciseLanguage(exercise.language) ? exercise.language : 'javascript';
      const prompt = typeof exercise.prompt === 'string' ? exercise.prompt.trim() : '';
      const starterCode = typeof exercise.starterCode === 'string' ? exercise.starterCode : undefined;
      const expectedOutput = typeof exercise.expectedOutput === 'string' ? exercise.expectedOutput : undefined;
      const hints = Array.isArray(exercise.hints) ? exercise.hints.filter((hint): hint is string => typeof hint === 'string' && hint.trim()) : [];
      const solution = typeof exercise.solution === 'string' ? exercise.solution : undefined;
      const hasContent = [prompt, starterCode, expectedOutput, solution, ...hints].some((item) => typeof item === 'string' && item.trim());
      if (!hasContent) return null;
      return {
        type,
        language: type === 'coding' ? language : undefined,
        prompt: prompt || 'Practice exercise',
        starterCode: type === 'coding' ? starterCode : undefined,
        expectedOutput: type === 'coding' ? expectedOutput : undefined,
        hints,
        solution,
        difficulty: isExerciseDifficulty(exercise.difficulty) ? exercise.difficulty : 'easy',
        order: Number.isFinite(Number(exercise.order)) ? Number(exercise.order) : index + 1,
      } satisfies LearningExercise;
    })
    .filter((exercise): exercise is LearningExercise => exercise !== null)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((exercise, index) => ({ ...exercise, order: index + 1 }));
}

function normalizeFlashcards(values: unknown[]) {
  return values
    .map((value) => {
      if (!value || typeof value !== 'object') return null;
      const card = value as Record<string, unknown>;
      const question = typeof card.question === 'string' ? card.question.trim() : '';
      const answer = typeof card.answer === 'string' ? card.answer.trim() : '';
      return question && answer ? { question, answer } : null;
    })
    .filter((card): card is { question: string; answer: string } => card !== null);
}

function isTaskStatus(value: unknown): value is LearningTask['status'] {
  return value === 'pending' || value === 'not-started' || value === 'in-progress' || value === 'learning' || value === 'practiced' || value === 'revised' || value === 'completed';
}

function isTaskPriority(value: unknown): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isPlanStatus(value: unknown): value is LearningPlan['status'] {
  return value === 'active' || value === 'completed' || value === 'paused' || value === 'archived';
}

function isExerciseType(value: unknown): value is LearningExercise['type'] {
  return value === 'coding' || value === 'reading' || value === 'quiz' || value === 'project' || value === 'debugging';
}

function isExerciseLanguage(value: unknown): value is 'javascript' | 'python' {
  return value === 'javascript' || value === 'python';
}

function isExerciseDifficulty(value: unknown): value is 'easy' | 'medium' | 'hard' {
  return value === 'easy' || value === 'medium' || value === 'hard';
}

const PHASE_JSON_PROMPT = `Create one learning roadmap phase as valid JSON only. Do not include markdown fences or explanation.

The JSON must match this shape:
{
  "title": "Phase title",
  "description": "Short phase goal",
  "tasks": [
    {
      "title": "Task title",
      "description": "Short overview",
      "priority": "medium",
      "status": "not-started",
      "lessonSections": [
        { "title": "Concept", "content": "What to learn", "order": 1 },
        { "title": "Practice Goal", "content": "What to do", "order": 2 },
        { "title": "Project Connection", "content": "How it connects to project work", "order": 3 }
      ],
      "exercises": [
        {
          "type": "coding",
          "language": "python",
          "difficulty": "easy",
          "prompt": "Practice instruction",
          "starterCode": "# starter code",
          "expectedOutput": "Expected result",
          "hints": ["Hint 1"],
          "solution": "Short solution or explanation",
          "order": 1
        }
      ],
      "flashcards": [
        { "question": "Question?", "answer": "Answer." }
      ]
    }
  ]
}

Rules:
- Return valid JSON only.
- Create 3 to 7 tasks.
- Use generic learning fields, not app-specific IDs.
- Supported exercise types: coding, reading, quiz, project, debugging.
- Supported coding languages: javascript, python.
- Supported difficulty: easy, medium, hard.
- Keep content concise and practical.`;

const PLAN_JSON_PROMPT = `Create one complete learning roadmap plan as valid JSON only. Do not include markdown fences or explanation.

The JSON must match this shape:
{
  "title": "Plan title",
  "description": "What this roadmap helps the learner achieve",
  "goals": ["Goal 1", "Goal 2"],
  "status": "active",
  "targetEndDate": "2026-12-31",
  "phases": [
    {
      "title": "Phase title",
      "description": "Short phase goal",
      "order": 1,
      "tasks": [
        {
          "title": "Task title",
          "description": "Short overview",
          "priority": "medium",
          "status": "not-started",
          "lessonSections": [
            { "title": "Concept", "content": "What to learn", "order": 1 },
            { "title": "Practice Goal", "content": "What to do", "order": 2 },
            { "title": "Project Connection", "content": "How it connects to project work", "order": 3 }
          ],
          "exercises": [
            {
              "type": "coding",
              "language": "python",
              "difficulty": "easy",
              "prompt": "Practice instruction",
              "starterCode": "# starter code",
              "expectedOutput": "Expected result",
              "hints": ["Hint 1"],
              "solution": "Short solution or explanation",
              "order": 1
            }
          ],
          "flashcards": [
            { "question": "Question?", "answer": "Answer." }
          ]
        }
      ]
    }
  ]
}

Rules:
- Return valid JSON only.
- Create 3 to 6 phases.
- Create 3 to 7 tasks per phase.
- Use generic learning fields, not app-specific IDs.
- Supported plan status: active, completed, paused, archived.
- Supported task status: not-started, learning, practiced, revised, completed.
- Supported priority: low, medium, high.
- Supported exercise types: coding, reading, quiz, project, debugging.
- Supported coding languages: javascript, python.
- Supported difficulty: easy, medium, hard.
- Keep content practical and concise.`;

type ExerciseDraft = {
  type: 'coding' | 'reading' | 'quiz' | 'project' | 'debugging';
  language: 'javascript' | 'python';
  prompt: string;
  starterCode: string;
  expectedOutput: string;
  hintsText: string;
  solution: string;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
};

function LessonSectionsEditor({
  sections,
  onChange,
  onSave,
}: {
  sections: LessonSection[];
  onChange: (sections: LessonSection[]) => void;
  onSave: (openNew?: boolean) => boolean;
}) {
  const sectionsTopRef = useRef<HTMLDivElement | null>(null);
  const [openSectionIndex, setOpenSectionIndex] = useState(0);
  const updateSection = (index: number, patch: Partial<LessonSection>) => {
    onChange(sections.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  };
  const addSection = () => {
    onChange([{ title: '', content: '', order: sections.length + 1 }, ...sections]);
    setOpenSectionIndex(0);
  };
  const removeSection = (index: number) => {
    onChange(sections.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i + 1 })));
    setOpenSectionIndex((current) => {
      if (index === current) return Math.max(0, current - 1);
      if (index < current) return current - 1;
      return current;
    });
  };
  const saveSectionAndOpenNew = () => {
    const saved = onSave(true);
    if (!saved) return;
    setOpenSectionIndex(0);
    requestAnimationFrame(() => {
      sectionsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <section ref={sectionsTopRef} className="rounded-xl border border-[#223655] bg-[#0b1429] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Lesson sections</div>
          <p className="mt-1 text-xs text-gray-500">Add any labels: JavaScript Concept, Practice Goal, Project Connection, Interview Connection.</p>
        </div>
        <button
          onClick={addSection}
          className="rounded-md border border-[#2a3b57] px-3 py-1 text-xs text-gray-200 hover:bg-[#12213b]"
        >
          Add section
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {sections.length === 0 && <p className="text-sm text-gray-500">No lesson sections yet.</p>}
        {sections.map((section, index) => (
          <div key={index} className="rounded-lg border border-[#1d304d] bg-[#0f1a31] p-3">
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => setOpenSectionIndex((current) => (current === index ? -1 : index))} className="min-w-0 flex-1 text-left">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-semibold text-gray-200">Section {section.order || index + 1}</span>
                  {section.title && <span className="truncate text-xs text-gray-400">{section.title}</span>}
                  {section.content && <span className="truncate text-xs text-gray-600">{summarizeLearningHtml(section.content, 140)}</span>}
                </div>
              </button>
              <button
                onClick={() => removeSection(index)}
                className="rounded-md border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
              >
                Remove
              </button>
              <button onClick={() => setOpenSectionIndex((current) => (current === index ? -1 : index))} className="rounded-md border border-[#2a3b57] px-3 py-2 text-xs text-gray-200 hover:bg-[#12213b]">
                {openSectionIndex === index ? 'Close' : 'Open'}
              </button>
            </div>
            {openSectionIndex === index && (
              <div className="mt-3">
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <input
                    value={section.title}
                    onChange={(event) => updateSection(index, { title: event.target.value })}
                    placeholder="Section title"
                    className="rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm text-gray-100 outline-none"
                  />
                  <input
                    type="number"
                    value={section.order}
                    onChange={(event) => updateSection(index, { order: Number(event.target.value) })}
                    className="rounded-md border border-[#2a3b57] bg-[#1b2a42] px-2 py-2 text-sm text-gray-100 outline-none"
                  />
                </div>
                <div className="mt-2">
                  <RichTextEditor
                    value={section.content}
                    onChange={(content) => updateSection(index, { content })}
                    placeholder="Write section content with headings, lists, code, images, or video links..."
                    minHeight={260}
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button onClick={saveSectionAndOpenNew} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Save this section</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <button onClick={() => onSave()} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Save sections</button>
      </div>
    </section>
  );
}

function ExercisesEditor({
  exercises,
  onChange,
  onSave,
}: {
  exercises: ExerciseDraft[];
  onChange: (exercises: ExerciseDraft[]) => void;
  onSave: (openNew?: boolean, template?: ExerciseDraft) => boolean;
}) {
  const exercisesTopRef = useRef<HTMLDivElement | null>(null);
  const [openExerciseIndex, setOpenExerciseIndex] = useState(0);
  const addExercise = () => {
    const template = exercises[openExerciseIndex];
    const nextExercises = [
      createExerciseDraft(1, template),
      ...exercises.map((exercise, index) => ({ ...exercise, order: index + 2 })),
    ];
    onChange(nextExercises);
    setOpenExerciseIndex(0);
  };
  const updateExercise = (index: number, patch: Partial<ExerciseDraft>) => {
    onChange(exercises.map((exercise, i) => (i === index ? { ...exercise, ...patch } : exercise)));
  };
  const removeExercise = (index: number) => {
    onChange(exercises.filter((_, i) => i !== index).map((exercise, i) => ({ ...exercise, order: i + 1 })));
    setOpenExerciseIndex((current) => {
      if (index === current) return Math.max(0, current - 1);
      if (index < current) return current - 1;
      return current;
    });
  };
  const saveExerciseAndOpenNew = () => {
    const saved = onSave(true, exercises[openExerciseIndex]);
    if (!saved) return;
    setOpenExerciseIndex(0);
    requestAnimationFrame(() => {
      exercisesTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <section ref={exercisesTopRef} className="rounded-xl border border-[#223655] bg-[#0b1429] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-gray-500">Exercises</div>
          <p className="mt-1 text-xs text-gray-500">Admin can add multiple practice items. Coding exercises show the code editor on the study page.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={addExercise} className="rounded-md border border-[#2a3b57] px-3 py-1.5 text-xs text-gray-200 hover:bg-[#12213b]">Add exercise</button>
          <button onClick={() => onSave()} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Save exercises</button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {exercises.length === 0 && <p className="text-sm text-gray-500">No exercises yet. Add one when this task needs practice.</p>}
        {exercises.map((exercise, index) => (
          <div key={index} className="rounded-lg border border-[#1d304d] bg-[#0f1a31] p-3">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setOpenExerciseIndex((current) => (current === index ? -1 : index))}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-semibold text-gray-200">Exercise {exercise.order || index + 1}</span>
                  <span className="rounded-full border border-[#2a3b57] px-2 py-0.5 text-[10px] uppercase text-gray-400">{exercise.type}</span>
                  {exercise.prompt && <span className="truncate text-xs text-gray-500">{exercise.prompt}</span>}
                </div>
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => removeExercise(index)} className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10">Remove</button>
                <button
                  onClick={() => setOpenExerciseIndex((current) => (current === index ? -1 : index))}
                  className="rounded-md border border-[#2a3b57] px-3 py-1.5 text-xs text-gray-200 hover:bg-[#12213b]"
                >
                  {openExerciseIndex === index ? 'Close' : 'Open'}
                </button>
              </div>
            </div>

            {openExerciseIndex === index && (
              <div className="mt-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <SelectField label="Type" value={exercise.type} onChange={(value) => updateExercise(index, { type: value as ExerciseDraft['type'] })} options={['coding', 'reading', 'quiz', 'project', 'debugging']} />
                  <SelectField label="Language" value={exercise.language} onChange={(value) => updateExercise(index, { language: value as ExerciseDraft['language'] })} options={['javascript', 'python']} disabled={exercise.type !== 'coding'} />
                  <SelectField label="Difficulty" value={exercise.difficulty} onChange={(value) => updateExercise(index, { difficulty: value as ExerciseDraft['difficulty'] })} options={['easy', 'medium', 'hard']} />
                  <Field label="Order">
                    <input type="number" value={exercise.order} onChange={(event) => updateExercise(index, { order: Number(event.target.value) })} />
                  </Field>
                </div>

                <label className="mt-3 block">
                  <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-gray-500">Prompt</div>
                  <textarea value={exercise.prompt} onChange={(event) => updateExercise(index, { prompt: event.target.value })} rows={3} className="w-full resize-none rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm text-gray-100 outline-none" />
                </label>

                {exercise.type === 'coding' && (
                  <>
                    <label className="mt-3 block">
                      <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-gray-500">Starter code</div>
                      <textarea value={exercise.starterCode} onChange={(event) => updateExercise(index, { starterCode: event.target.value })} rows={6} className="w-full resize-none rounded-md border border-[#2a3b57] bg-[#07101f] px-3 py-2 font-mono text-sm text-gray-100 outline-none" />
                    </label>
                    <label className="mt-3 block">
                      <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-gray-500">Expected output</div>
                      <input value={exercise.expectedOutput} onChange={(event) => updateExercise(index, { expectedOutput: event.target.value })} className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm text-gray-100 outline-none" />
                    </label>
                  </>
                )}

                <label className="mt-3 block">
                  <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-gray-500">Hints (one per line)</div>
                  <textarea value={exercise.hintsText} onChange={(event) => updateExercise(index, { hintsText: event.target.value })} rows={3} className="w-full resize-none rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm text-gray-100 outline-none" />
                </label>

                <label className="mt-3 block">
                  <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-gray-500">Solution</div>
                  <textarea value={exercise.solution} onChange={(event) => updateExercise(index, { solution: event.target.value })} rows={4} className="w-full resize-none rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm text-gray-100 outline-none" />
                </label>

                <div className="mt-3 flex justify-end">
                  <button onClick={saveExerciseAndOpenNew} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">Save this exercise</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SelectField({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; disabled?: boolean }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs uppercase tracking-[0.12em] text-gray-500">{label}</div>
      <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-[#2a3b57] bg-[#1b2a42] px-3 py-2 text-sm capitalize text-gray-100 outline-none disabled:opacity-50">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function createExerciseDraft(order = 1, template?: ExerciseDraft): ExerciseDraft {
  return {
    type: template?.type || 'reading',
    language: template?.language || 'javascript',
    prompt: '',
    starterCode: '',
    expectedOutput: '',
    hintsText: '',
    solution: '',
    difficulty: template?.difficulty || 'easy',
    order,
  };
}

function toExerciseDraft(exercise?: LearningExercise, fallbackOrder = 1): ExerciseDraft {
  return {
    ...createExerciseDraft(exercise?.order || fallbackOrder),
    type: exercise?.type || 'reading',
    language: exercise?.language || 'javascript',
    prompt: exercise?.prompt || '',
    starterCode: exercise?.starterCode || '',
    expectedOutput: exercise?.expectedOutput || '',
    hintsText: exercise?.hints?.join('\n') || '',
    solution: exercise?.solution || '',
    difficulty: exercise?.difficulty || 'easy',
  };
}

function toExerciseDrafts(task: LearningTask): ExerciseDraft[] {
  const exercises = task.exercises?.length
    ? task.exercises
    : task.exercise
      ? [task.exercise]
      : [];

  return exercises
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((exercise, index) => toExerciseDraft(exercise, index + 1));
}

function fromExerciseDraft(exercise: ExerciseDraft, index: number): LearningExercise | undefined {
  const hasExerciseContent = [
    exercise.prompt,
    exercise.starterCode,
    exercise.expectedOutput,
    exercise.hintsText,
    exercise.solution,
  ].some((value) => value.trim());

  if (!hasExerciseContent) return undefined;

  return {
    type: exercise.type,
    language: exercise.type === 'coding' ? exercise.language : undefined,
    prompt: exercise.prompt.trim() || 'Practice exercise',
    starterCode: exercise.type === 'coding' ? exercise.starterCode : undefined,
    expectedOutput: exercise.type === 'coding' ? exercise.expectedOutput : undefined,
    hints: exercise.hintsText.split('\n').map((hint) => hint.trim()).filter(Boolean),
    solution: exercise.solution || undefined,
    difficulty: exercise.difficulty,
    order: Number.isFinite(exercise.order) && exercise.order > 0 ? exercise.order : index + 1,
  };
}

function normalizeLessonSections(sections: LessonSection[]): LessonSection[] {
  return sections
    .map((section, index) => ({
      title: section.title.trim(),
      content: section.content.trim(),
      order: Number.isFinite(section.order) && section.order > 0 ? section.order : index + 1,
    }))
    .filter((section) => section.title && section.content)
    .sort((a, b) => a.order - b.order)
    .map((section, index) => ({ ...section, order: index + 1 }));
}

function buildLegacyLessonSections(task: LearningTask) {
  return [
    task.pythonConcept ? { title: 'Python Concept', content: task.pythonConcept, order: 1 } : null,
    task.tradingConcept ? { title: 'Trading Concept', content: task.tradingConcept, order: 2 } : null,
    task.projectConnection ? { title: 'Project Connection', content: task.projectConnection, order: 3 } : null,
  ].filter(Boolean);
}

function MetaRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div>
      <div className="uppercase tracking-[0.12em] text-gray-500">{label}</div>
      <div className={`mt-0.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{value}</div>
    </div>
  );
}

function AdminMetricCard({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`min-w-0 rounded-xl border border-[#1b2c49] bg-[#0b1429] px-4 py-3 ${className}`}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-gray-100">{value}</div>
    </div>
  );
}

type SideIcon = 'folder' | 'code' | 'briefcase' | 'user' | 'id' | 'settings' | 'book';

function SidebarItem({ label, icon, active = false, isOpen, isDark }: { label: string; icon: SideIcon; active?: boolean; isOpen: boolean; isDark: boolean }) {
  return (
    <button
      className={`group flex items-center h-[42px] transition-all duration-200 ${isOpen ? 'w-[calc(100%-24px)] mx-3 px-3' : 'w-[42px] justify-center mx-auto mb-2'} rounded-xl text-[15px] ${active
          ? 'bg-[#2f7cff] text-white shadow-[0_4px_14px_rgba(47,124,255,0.3)]'
          : isDark
            ? 'text-gray-300 hover:bg-[#111d34] hover:text-white'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        } ${!isOpen && 'mb-2'}`}
      title={!isOpen ? label : undefined}
    >
      <span className="flex items-center gap-3 whitespace-nowrap overflow-hidden">
        <SidebarIcon icon={icon} />
        {isOpen && <span className="truncate">{label}</span>}
      </span>
    </button>
  );
}

function SidebarIcon({ icon }: { icon: SideIcon }) {
  const common = 'h-4 w-4 text-current opacity-90';
  if (icon === 'folder') return <svg className={common} viewBox="0 0 24 24" fill="none"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z" stroke="currentColor" strokeWidth="1.7" /></svg>;
  if (icon === 'code') return <svg className={common} viewBox="0 0 24 24" fill="none"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (icon === 'briefcase') return <svg className={common} viewBox="0 0 24 24" fill="none"><path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1M3 9h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm0 0a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" stroke="currentColor" strokeWidth="1.7" /></svg>;
  if (icon === 'user') return <svg className={common} viewBox="0 0 24 24" fill="none"><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm8 8a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  if (icon === 'id') return <svg className={common} viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" /><circle cx="9" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.7" /><path d="M14 10h4M14 14h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  if (icon === 'settings') return <svg className={common} viewBox="0 0 24 24" fill="none"><path d="m12 3 1.2 2.1 2.4.5.5 2.4L18 9l-1.9 1.9.5 2.4-2.4.5L12 16l-2.1-1.2-2.4.5-.5-2.4L5 11l1.9-1.9-.5-2.4 2.4-.5L12 3Z" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.5" /></svg>;
  return <svg className={common} viewBox="0 0 24 24" fill="none"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" /><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}
