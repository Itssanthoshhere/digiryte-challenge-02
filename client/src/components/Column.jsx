import { useState } from 'react';
import TaskCard from './TaskCard';

function Column({ column, title, tasks, onDelete, onMove, onDrop }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const headerColors = {
    todo: 'text-[#db4435] border-b-[#fddad7]',
    'in-progress': 'text-amber-600 border-b-amber-200',
    done: 'text-emerald-600 border-b-emerald-200',
  };

  const badgeColors = {
    todo: 'bg-[#fff3f2] text-[#db4435] border border-[#fddad7]',
    'in-progress': 'bg-amber-50 text-amber-700 border border-amber-200',
    done: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
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
      className={`bg-[#f8fafc] rounded-2xl border ${
        isDragOver ? 'border-[#db4435] ring-2 ring-[#db4435]/20 bg-[#fff3f2]/30' : 'border-slate-200/80'
      } flex flex-col min-h-[340px] md:min-h-[520px] shadow-xs transition-all duration-200`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className={`flex justify-between items-center px-5 py-4 border-b bg-white rounded-t-2xl ${headerColors[column] || 'border-slate-200'}`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${column === 'todo' ? 'bg-[#db4435]' : column === 'in-progress' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          <h2 className="text-sm font-bold tracking-wider uppercase">{title}</h2>
        </div>
        <span className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full ${badgeColors[column] || 'bg-slate-100 text-slate-700'}`}>
          {tasks.length}
        </span>
      </div>

      {/* Task List */}
      <div className="flex-1 p-3.5 flex flex-col gap-3 overflow-y-auto max-h-[70vh]">
        {tasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
            <span className="font-medium text-slate-500">No tasks in this column</span>
            <span className="text-[11px] text-slate-400 mt-1">Drag a task here or add one</span>
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
