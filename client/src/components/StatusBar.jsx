import { SERVER_OPTIONS, CURRENT_SERVER_URL, switchServer, simulateHardDisconnect } from '../socket';

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
    <header className={`w-full flex flex-wrap justify-between items-center gap-3 px-4 md:px-6 py-2.5 text-xs font-medium border-b transition-colors duration-300 ${statusStyles[status] || statusStyles.connected}`}>
      {/* Left: Status & Current Server Instance */}
      <div className="flex items-center flex-wrap gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotStyles[status] || dotStyles.connected}`}></span>
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotStyles[status] || dotStyles.connected}`}></span>
        </span>
        <span className="font-semibold text-slate-100">{labels[status] || status}</span>

        {serverInfo && (
          <span className="text-slate-400 pl-2.5 border-l border-slate-700/60 font-mono text-[11px]">
            Connected Node: <strong className="text-sky-400">{serverInfo.serverId}</strong> (port {serverInfo.port})
          </span>
        )}
      </div>

      {/* Middle: Instance Switcher & Disconnect Simulator */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-700/60 rounded-lg px-2 py-1">
          <label htmlFor="server-select" className="text-[11px] text-slate-400">Target:</label>
          <select
            id="server-select"
            className="bg-transparent text-slate-200 text-[11px] font-mono focus:outline-none cursor-pointer"
            value={CURRENT_SERVER_URL}
            onChange={(e) => switchServer(e.target.value)}
          >
            {SERVER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.url} className="bg-[#181c2b] text-slate-200">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => simulateHardDisconnect()}
          className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg text-[11px] font-medium transition cursor-pointer hover:border-red-500/50"
          title="Simulate hard socket disconnect to verify auto-reconnect and state recovery"
        >
          Simulate Disconnect
        </button>
      </div>

      {/* Right: Multi-Device / User & Tab IDs */}
      <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
        <span>User: <strong className="text-indigo-400">{userId}</strong></span>
        <span className="text-slate-600">|</span>
        <span>Tab: <strong className="text-purple-400">{deviceId}</strong></span>
      </div>
    </header>
  );
}

export default StatusBar;
