function TaskCard({ task, onDelete, onMove }) {
  const columns = ['todo', 'in-progress', 'done'];
  const currentIndex = columns.indexOf(task.column);

  const columnLabels = {
    todo: '← To Do',
    'in-progress': 'Progress',
    done: 'Done →',
  };

  const columnBorderColors = {
    todo: 'border-l-[#db4435]',
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
      className={`group relative bg-white hover:bg-[#fcfdfd] border border-slate-200/80 border-l-4 ${columnBorderColors[task.column] || 'border-l-slate-400'} rounded-xl p-4 cursor-grab active:cursor-grabbing shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200 select-none`}
    >
      <div className="flex justify-between items-start gap-2">
        <p className="text-sm font-semibold text-slate-800 leading-snug break-words flex-1 pr-6">
          {task.title}
        </p>
        <button
          type="button"
          className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#db4435] hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer"
          title="Delete task"
          onClick={() => onDelete(task._id)}
        >
          ✕
        </button>
      </div>

      <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500">
        <span>
          {time} · <strong className="text-slate-700 font-medium">{task.createdBy}</strong>
        </span>

        <div className="flex items-center gap-1.5">
          {currentIndex > 0 && (
            <button
              type="button"
              className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50/80 hover:bg-[#fff3f2] hover:border-[#fddad7] hover:text-[#db4435] text-slate-600 text-[11px] font-medium transition-all duration-150 cursor-pointer"
              onClick={() => onMove(task._id, columns[currentIndex - 1])}
            >
              {columnLabels[columns[currentIndex - 1]]}
            </button>
          )}
          {currentIndex < columns.length - 1 && (
            <button
              type="button"
              className="px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50/80 hover:bg-[#fff3f2] hover:border-[#fddad7] hover:text-[#db4435] text-slate-600 text-[11px] font-medium transition-all duration-150 cursor-pointer"
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
