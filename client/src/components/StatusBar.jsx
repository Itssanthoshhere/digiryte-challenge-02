function StatusBar({ status, serverInfo, userId, deviceId }) {
  const statusStyles = {
    connected: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
    disconnected: 'bg-red-500/15 border-red-500/30 text-red-300',
    reconnecting: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  };

  const dotStyles = {
    connected: 'bg-emerald-400',
    disconnected: 'bg-red-400 animate-ping',
    reconnecting: 'bg-amber-400 animate-bounce',
  };

  const labels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting...',
  };

  return (
    <header className={`w-full flex flex-wrap justify-between items-center px-4 md:px-6 py-2.5 text-xs font-medium border-b transition-colors duration-300 ${statusStyles[status] || statusStyles.connected}`}>
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotStyles[status] || dotStyles.connected}`}></span>
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotStyles[status] || dotStyles.connected}`}></span>
        </span>
        <span className="font-semibold text-slate-100">{labels[status] || status}</span>
        {serverInfo && (
          <span className="text-slate-400 pl-2.5 border-l border-slate-700/60 font-mono text-[11px]">
            Server: <span className="text-sky-400 font-bold">{serverInfo.serverId}</span> (port {serverInfo.port})
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px] mt-1 sm:mt-0">
        <span>User: <strong className="text-indigo-400">{userId}</strong></span>
        <span className="text-slate-600">|</span>
        <span>Tab: <strong className="text-purple-400">{deviceId}</strong></span>
      </div>
    </header>
  );
}

export default StatusBar;
