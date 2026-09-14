import { SERVER_OPTIONS, CURRENT_SERVER_URL, switchServer, simulateHardDisconnect } from '../socket';

function StatusBar({ status, serverInfo, userId, deviceId }) {
  const statusStyles = {
    connected: 'bg-emerald-50/80 border-emerald-200 text-emerald-800',
    disconnected: 'bg-[#fff3f2] border-[#fddad7] text-[#db4435]',
    reconnecting: 'bg-amber-50/80 border-amber-200 text-amber-800',
  };

  const dotStyles = {
    connected: 'bg-emerald-500',
    disconnected: 'bg-[#db4435] animate-ping',
    reconnecting: 'bg-amber-500 animate-bounce',
  };

  const labels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting...',
  };

  return (
    <header className={`w-full flex flex-wrap justify-between items-center gap-3 px-4 md:px-8 py-2.5 text-xs font-medium border-b transition-colors duration-300 ${statusStyles[status] || statusStyles.connected}`}>
      {/* Left: Status & Current Server Instance */}
      <div className="flex items-center flex-wrap gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotStyles[status] || dotStyles.connected}`}></span>
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotStyles[status] || dotStyles.connected}`}></span>
        </span>
        <span className="font-semibold text-slate-900">{labels[status] || status}</span>

        {serverInfo && (
          <span className="text-slate-500 pl-2.5 border-l border-slate-300 font-mono text-[11px]">
            Node: <strong className="text-[#db4435] font-bold">{serverInfo.serverId}</strong> (port {serverInfo.port})
          </span>
        )}
      </div>

      {/* Middle: Instance Switcher & Disconnect Simulator */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-xs rounded-lg px-2.5 py-1">
          <label htmlFor="server-select" className="text-[11px] font-medium text-slate-500">Target:</label>
          <select
            id="server-select"
            className="bg-transparent text-slate-800 text-[11px] font-medium focus:outline-none cursor-pointer"
            value={CURRENT_SERVER_URL}
            onChange={(e) => switchServer(e.target.value)}
          >
            {SERVER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.url} className="bg-white text-slate-800">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => simulateHardDisconnect()}
          className="px-3 py-1 bg-white hover:bg-[#db4435] text-[#db4435] hover:text-white border border-[#fddad7] hover:border-[#db4435] shadow-xs rounded-lg text-[11px] font-semibold transition-all duration-150 cursor-pointer"
          title="Simulate hard socket disconnect to verify auto-reconnect and state recovery"
        >
          Simulate Disconnect
        </button>
      </div>

      {/* Right: Multi-Device / User & Tab IDs */}
      <div className="flex items-center gap-3 text-slate-500 text-[11px]">
        <span>User: <strong className="text-slate-800 font-mono">{userId}</strong></span>
        <span className="text-slate-300">|</span>
        <span>Tab: <strong className="text-[#db4435] font-mono">{deviceId}</strong></span>
      </div>
    </header>
  );
}

export default StatusBar;
