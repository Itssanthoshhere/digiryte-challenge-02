import { useState, useEffect, useCallback } from 'react';
import {
  socket,
  userId,
  boardId,
  deviceId,
  emitMutation,
  updateLastSeenVersion,
} from './socket';
import StatusBar from './components/StatusBar';
import Column from './components/Column';

function App() {
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('connected');
  const [serverInfo, setServerInfo] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const showErrorToast = (msg) => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage(null);
    }, 4000);
  };

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

    const onPresenceUpdate = (data) => {
      if (data && data.activeUsers) {
        setActiveUsers(data.activeUsers);
      }
    };

    const onStateSync = (data) => {
      const serverTasks = Array.isArray(data) ? data : data.tasks || [];
      const version = data.boardVersion || 0;
      console.log('[State] Full Sync:', serverTasks.length, 'tasks, version:', version);
      setTasks(serverTasks);
      updateLastSeenVersion(version);
    };

    const onStateDelta = (data) => {
      const events = data.events || [];
      console.log('[State] Delta Sync:', events.length, 'missed events received');
      events.forEach((evt) => {
        if (evt.version) updateLastSeenVersion(evt.version);
        if (evt.eventType === 'task:created' && evt.payload.task) {
          setTasks((prev) => {
            if (prev.some((t) => t._id === evt.payload.task._id)) return prev;
            return [...prev, evt.payload.task];
          });
        } else if (evt.eventType === 'task:moved' && evt.payload.task) {
          setTasks((prev) =>
            prev.map((t) => (t._id === evt.payload.task._id ? evt.payload.task : t))
          );
        } else if (evt.eventType === 'task:deleted' && evt.payload.taskId) {
          setTasks((prev) => prev.filter((t) => t._id !== evt.payload.taskId));
        }
      });
    };

    const onTaskCreated = (data) => {
      const task = data.task || data;
      if (data.boardVersion) updateLastSeenVersion(data.boardVersion);
      setTasks((prev) => {
        if (prev.find((t) => t._id === task._id)) return prev;
        return [...prev, task];
      });
    };

    const onTaskMoved = (data) => {
      const task = data.task || data;
      if (data.boardVersion) updateLastSeenVersion(data.boardVersion);
      setTasks((prev) => prev.map((t) => (t._id === task._id ? task : t)));
    };

    const onTaskDeleted = (data) => {
      if (data.boardVersion) updateLastSeenVersion(data.boardVersion);
      setTasks((prev) => prev.filter((t) => t._id !== data.taskId));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect_attempt', onReconnectAttempt);
    socket.on('server:info', onServerInfo);
    socket.on('presence:update', onPresenceUpdate);
    socket.on('state:sync', onStateSync);
    socket.on('state:delta', onStateDelta);
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
      socket.off('presence:update', onPresenceUpdate);
      socket.off('state:sync', onStateSync);
      socket.off('state:delta', onStateDelta);
      socket.off('task:created', onTaskCreated);
      socket.off('task:moved', onTaskMoved);
      socket.off('task:deleted', onTaskDeleted);
    };
  }, []);

  // ── Actions with Optimistic UI & Server ACK Error Handling ──
  const handleAddTask = useCallback(
    (e) => {
      e.preventDefault();
      const title = taskTitle.trim();
      if (!title || isSubmitting) return;

      setIsSubmitting(true);
      emitMutation('task:create', { title }, (response) => {
        setIsSubmitting(false);
        if (response && response.success) {
          setTaskTitle('');
        } else if (response && response.error) {
          showErrorToast(`Create Failed: ${response.error.message || response.error}`);
        }
      });
    },
    [taskTitle, isSubmitting]
  );

  const handleDeleteTask = useCallback((taskId) => {
    const targetTask = tasks.find((t) => t._id === taskId);
    const expectedVersion = targetTask ? targetTask.version : undefined;

    // Optimistic remove
    setTasks((prev) => prev.filter((t) => t._id !== taskId));

    emitMutation('task:delete', { taskId, expectedVersion }, (response) => {
      if (response && !response.success) {
        showErrorToast(`Delete Rejected: ${response.error.message || response.error}`);
        // Re-sync if optimistic action failed
        socket.emit('board:sync', { boardId });
      }
    });
  }, [tasks]);

  const handleMoveTask = useCallback(
    (taskId, toColumn) => {
      const targetTask = tasks.find((t) => t._id === taskId);
      if (!targetTask || targetTask.column === toColumn) return;

      const expectedVersion = targetTask.version;

      // Optimistic move
      setTasks((prev) =>
        prev.map((t) => (t._id === taskId ? { ...t, column: toColumn } : t))
      );

      emitMutation(
        'task:move',
        { taskId, toColumn, expectedVersion },
        (response) => {
          if (response && !response.success) {
            showErrorToast(`Move Rejected: ${response.error.message || response.error}`);
            // Re-sync state on concurrency conflict or validation error
            socket.emit('board:sync', { boardId });
          }
        }
      );
    },
    [tasks]
  );

  // ── Group tasks by column & sort by order ──
  const sortTasks = (taskList) =>
    [...taskList].sort((a, b) => (a.order > b.order ? 1 : a.order < b.order ? -1 : 0));

  const tasksByColumn = {
    todo: sortTasks(tasks.filter((t) => t.column === 'todo')),
    'in-progress': sortTasks(tasks.filter((t) => t.column === 'in-progress')),
    done: sortTasks(tasks.filter((t) => t.column === 'done')),
  };

  const columns = [
    { key: 'todo', title: 'To Do' },
    { key: 'in-progress', title: 'In Progress' },
    { key: 'done', title: 'Done' },
  ];

  return (
    <div className="min-h-screen bg-[#fafbfd] text-[#233642] flex flex-col selection:bg-[#fff3f2] selection:text-[#db4435]">
      <StatusBar
        status={status}
        serverInfo={serverInfo}
        userId={userId}
        deviceId={deviceId}
        activeUsers={activeUsers}
      />

      {/* Error Toast Notification */}
      {errorMessage && (
        <div className="fixed top-14 right-6 z-50 bg-[#db4435] text-white font-semibold text-xs px-4 py-3 rounded-xl shadow-lg border border-red-700 animate-bounce">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Header */}
      <header className="text-center pt-6 pb-2 px-4 flex flex-col items-center">
        <div className="flex items-center gap-3.5 mb-1.5">
          <img
            src="/logo.svg"
            alt="Digiryte Logo"
            className="h-10 w-10 rounded-xl shadow-md border border-slate-200/80 transition-transform duration-200 hover:scale-105"
          />
          <div className="text-left">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171c26] flex items-center gap-1.5">
              Digiryte <span className="text-[#db4435]">Sync</span>
            </h1>
            <p className="text-[11px] font-semibold tracking-wider uppercase text-[#5d6d77]">
              Enterprise Real-Time Kanban
            </p>
          </div>
        </div>
        <p className="text-[#5d6d77] text-xs sm:text-sm mt-0.5 max-w-lg mx-auto">
          JWT Authenticated • Room Scoped (`{boardId}`) • Fractional Indexing • Optimistic Concurrency Control
        </p>
      </header>

      {/* Add Task Form */}
      <div className="w-full max-w-xl mx-auto px-4 py-3">
        <form onSubmit={handleAddTask} className="flex gap-2.5">
          <input
            type="text"
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:border-[#db4435] focus:ring-2 focus:ring-[#db4435]/15 shadow-xs transition duration-200"
            placeholder="Add a new task..."
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            autoComplete="off"
            required
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-[#db4435] hover:bg-[#b5372b] text-white font-semibold text-sm rounded-xl shadow-[0_2px_8px_rgba(219,68,53,0.25)] hover:shadow-[0_4px_14px_rgba(219,68,53,0.35)] active:scale-95 disabled:opacity-50 transition-all duration-200 cursor-pointer whitespace-nowrap"
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
            onDrop={handleMoveTask}
          />
        ))}
      </main>

      {/* Disconnection Overlay */}
      {status !== 'connected' && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs flex flex-col items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="relative flex justify-center mb-4">
              <div className="w-10 h-10 border-3 border-slate-200 border-t-[#db4435] rounded-full animate-spin"></div>
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {status === 'reconnecting' ? 'Reconnecting to Cluster...' : 'Connection Interrupted'}
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              Mutations queued locally. Will flush automatically upon reconnecting to Redis cluster.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
