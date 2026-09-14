import { useState, useEffect, useCallback } from 'react';
import { socket, userId, deviceId } from './socket';
import StatusBar from './components/StatusBar';
import Column from './components/Column';

function App() {
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('connected');
  const [serverInfo, setServerInfo] = useState(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Socket event listeners ──
  useEffect(() => {
    const onConnect = () => {
      console.log('[Socket] Connected:', socket.id);
      setStatus('connected');
    };

    const onDisconnect = (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setStatus('disconnected');
    };

    const onReconnectAttempt = (attempt) => {
      console.log('[Socket] Reconnect attempt:', attempt);
      setStatus('reconnecting');
    };

    const onServerInfo = (data) => {
      setServerInfo(data);
      console.log('[Socket] Connected to server:', data.serverId);
    };

    const onStateSync = (serverTasks) => {
      console.log('[State] Synced', serverTasks.length, 'tasks from server');
      setTasks(serverTasks);
    };

    const onTaskCreated = (task) => {
      setTasks((prev) => {
        if (prev.find((t) => t._id === task._id)) return prev;
        return [...prev, task];
      });
    };

    const onTaskMoved = (task) => {
      setTasks((prev) =>
        prev.map((t) => (t._id === task._id ? task : t))
      );
    };

    const onTaskDeleted = (data) => {
      setTasks((prev) => prev.filter((t) => t._id !== data.taskId));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('server:info', onServerInfo);
    socket.on('state:sync', onStateSync);
    socket.on('task:created', onTaskCreated);
    socket.on('task:moved', onTaskMoved);
    socket.on('task:deleted', onTaskDeleted);

    if (socket.connected) {
      setStatus('connected');
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect_attempt', onReconnectAttempt);
      socket.off('server:info', onServerInfo);
      socket.off('state:sync', onStateSync);
      socket.off('task:created', onTaskCreated);
      socket.off('task:moved', onTaskMoved);
      socket.off('task:deleted', onTaskDeleted);
    };
  }, []);

  // ── Actions ──
  const handleAddTask = useCallback(
    (e) => {
      e.preventDefault();
      const title = taskTitle.trim();
      if (!title || isSubmitting) return;

      setIsSubmitting(true);
      socket.emit('task:create', { title }, (response) => {
        setIsSubmitting(false);
        if (response && response.success) {
          setTaskTitle('');
        } else {
          console.error('Failed to create task:', response?.error);
        }
      });
    },
    [taskTitle, isSubmitting]
  );

  const handleDeleteTask = useCallback((taskId) => {
    socket.emit('task:delete', { taskId });
  }, []);

  const handleMoveTask = useCallback((taskId, toColumn) => {
    socket.emit('task:move', { taskId, toColumn });
  }, []);

  const handleDrop = useCallback((taskId, toColumn) => {
    socket.emit('task:move', { taskId, toColumn });
  }, []);

  // ── Group tasks by column ──
  const tasksByColumn = {
    todo: tasks.filter((t) => t.column === 'todo'),
    'in-progress': tasks.filter((t) => t.column === 'in-progress'),
    done: tasks.filter((t) => t.column === 'done'),
  };

  const columns = [
    { key: 'todo', title: 'To Do' },
    { key: 'in-progress', title: 'In Progress' },
    { key: 'done', title: 'Done' },
  ];

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-100 flex flex-col selection:bg-sky-500/30">
      <StatusBar
        status={status}
        serverInfo={serverInfo}
        userId={userId}
        deviceId={deviceId}
      />

      {/* Header */}
      <header className="text-center pt-8 pb-4 px-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
          Kanban Sync
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-lg mx-auto">
          Distributed real-time sync with Socket.io, Redis Pub/Sub, and MongoDB persistence.
        </p>
      </header>

      {/* Add Task Input */}
      <div className="w-full max-w-xl mx-auto px-4 py-3">
        <form onSubmit={handleAddTask} className="flex gap-2.5">
          <input
            type="text"
            className="flex-1 px-4 py-2.5 bg-[#181c2b] border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 shadow-inner transition duration-200"
            placeholder="Add a new task..."
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            autoComplete="off"
            required
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-sm rounded-xl shadow-md hover:shadow-sky-500/20 active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer whitespace-nowrap"
          >
            {isSubmitting ? 'Adding...' : 'Add Task'}
          </button>
        </form>
      </div>

      {/* Kanban Board Columns */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5 max-w-7xl w-full mx-auto px-4 md:px-6 py-4">
        {columns.map((col) => (
          <Column
            key={col.key}
            column={col.key}
            title={col.title}
            tasks={tasksByColumn[col.key] || []}
            onDelete={handleDeleteTask}
            onMove={handleMoveTask}
            onDrop={handleDrop}
          />
        ))}
      </main>

      {/* Disconnection / Reconnection Overlay */}
      {status !== 'connected' && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="bg-[#181c2b] border border-slate-700/80 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="relative flex justify-center mb-4">
              <div className="w-10 h-10 border-3 border-slate-700 border-t-sky-400 rounded-full animate-spin"></div>
            </div>
            <h3 className="text-base font-bold text-slate-100">
              {status === 'reconnecting' ? 'Reconnecting to cluster...' : 'Connection Interrupted'}
            </h3>
            <p className="text-xs text-slate-400 mt-2">
              Auto-reconnecting. State will automatically recover from MongoDB once reconnected.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
