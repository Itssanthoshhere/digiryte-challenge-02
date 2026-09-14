import { useState } from 'react';
import TaskCard from './TaskCard';

function Column({ column, title, tasks, onDelete, onMove, onDrop }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const headerColors = {
    todo: 'text-sky-400 border-b-sky-500/20',
    'in-progress': 'text-amber-400 border-b-amber-500/20',
    done: 'text-emerald-400 border-b-emerald-500/20',
  };

  const badgeColors = {
    todo: 'bg-sky-500/10 text-sky-300 border border-sky-500/20',
    'in-progress': 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
    done: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      onDrop(taskId, column);
    }
  };

  return (
    <div
      className={`bg-[#181c2b] rounded-2xl border ${
        isDragOver ? 'border-sky-500/60 ring-2 ring-sky-500/20 bg-sky-950/10' : 'border-slate-800/80'
      } flex flex-col min-h-[320px] md:min-h-[520px] shadow-lg transition-all duration-200`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className={`flex justify-between items-center px-5 py-4 border-b ${headerColors[column] || 'border-slate-800'}`}>
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold tracking-wider uppercase">{title}</h2>
        </div>
        <span className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full ${badgeColors[column] || 'bg-slate-800 text-slate-300'}`}>
          {tasks.length}
        </span>
      </div>

      {/* Task List */}
      <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto max-h-[70vh]">
        {tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-800/60 rounded-xl text-slate-600 text-xs">
            <span>No tasks yet</span>
            <span className="text-[11px] text-slate-500 mt-1">Drag tasks here or create one</span>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default Column;
