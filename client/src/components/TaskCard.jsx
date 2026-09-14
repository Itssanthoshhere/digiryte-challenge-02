function TaskCard({ task, onDelete, onMove }) {
  const columns = ['todo', 'in-progress', 'done'];
  const currentIndex = columns.indexOf(task.column);

  const columnLabels = {
    todo: '← To Do',
    'in-progress': 'Progress',
    done: 'Done →',
  };

  const columnBorderColors = {
    todo: 'border-l-sky-500',
    'in-progress': 'border-l-amber-500',
    done: 'border-l-emerald-500',
  };

  const time = new Date(task.createdAt || Date.now()).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', task._id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('opacity-50', 'scale-95');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('opacity-50', 'scale-95');
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      id={`task-${task._id}`}
      className={`group relative bg-[#202538] hover:bg-[#262c42] border border-slate-700/60 border-l-[3.5px] ${columnBorderColors[task.column] || 'border-l-slate-500'} rounded-xl p-3.5 cursor-grab active:cursor-grabbing shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 select-none`}
    >
      <div className="flex justify-between items-start gap-2">
        <p className="text-sm font-medium text-slate-100 leading-snug break-words flex-1 pr-6">
          {task.title}
        </p>
        <button
          type="button"
          className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/15 opacity-0 group-hover:opacity-100 transition-all duration-150"
          title="Delete task"
          onClick={() => onDelete(task._id)}
        >
          ✕
        </button>
      </div>

      <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-700/40 text-[11px] text-slate-400">
        <span className="font-mono">
          {time} · <span className="text-slate-300 font-semibold">{task.createdBy}</span>
        </span>

        <div className="flex items-center gap-1.5">
          {currentIndex > 0 && (
            <button
              type="button"
              className="px-2 py-0.5 rounded border border-slate-700/80 bg-slate-800/60 hover:bg-sky-500/15 hover:border-sky-500/60 hover:text-sky-300 text-slate-400 text-[11px] transition-all duration-150"
              onClick={() => onMove(task._id, columns[currentIndex - 1])}
            >
              {columnLabels[columns[currentIndex - 1]]}
            </button>
          )}
          {currentIndex < columns.length - 1 && (
            <button
              type="button"
              className="px-2 py-0.5 rounded border border-slate-700/80 bg-slate-800/60 hover:bg-sky-500/15 hover:border-sky-500/60 hover:text-sky-300 text-slate-400 text-[11px] transition-all duration-150"
              onClick={() => onMove(task._id, columns[currentIndex + 1])}
            >
              {columnLabels[columns[currentIndex + 1]]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskCard;
