import { useAcp } from "@/hooks/useAcp";

export function Header() {
  const { isConnected, error, reconnect } = useAcp();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
          J
        </div>
        <div>
          <h1 className="text-sm font-semibold">Jada Code</h1>
          <p className="text-xs text-gray-500">Garza OS AI Agent</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {error && (
          <button
            onClick={reconnect}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Reconnect
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-400" : "bg-red-400 animate-pulse"
            }`}
          />
          <span className="text-xs text-gray-500">
            {isConnected ? "Connected" : error ?? "Disconnected"}
          </span>
        </div>
      </div>
    </header>
  );
}
