import { useEffect, useState } from "react";
import axios from "axios";
import {
  Activity,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Timer,
  Loader2,
  AlertCircle,
  LucideIcon,
  BarChart3,
  LineChart as LineChartIcon,
  Sun,
  Moon,
} from "lucide-react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

// Types
interface MetricsData {
  activitiesToday: number;
  totalDetections: number;
  detectionsByDay: number[];
  hourlyDistribution: Record<string, number>;
  peakHours: string;
  energyMetrics: {
    energySavedPercent: number;
    energyUsedWh: number;
    highSecondsToday: number;
    lowSecondsToday: number;
  };
  sessionsToday: {
    count: number;
    averageDurationSeconds: number;
    maxDurationSeconds: number;
  };
  idleMetrics: {
    lastEventAgeSeconds: number | null;
    maxIdleSeconds: number;
  };
  trends: {
    todayCount: number;
    weekAverage: number;
    deltaVsYesterdayPercent: number | null;
    deltaVsWeekPercent: number | null;
  };
}

interface MotionEvent {
  id: number;
  timestamp: number;
  datetimeIso: string;
  hour: number;
  day: string;
}

interface HealthStatus {
  status: string;
  details: {
    db?: string;
    mqtt?: string;
  };
}

type Theme = "light" | "dark";

// Utility functions
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
};

const formatIdleTime = (seconds: number | null): string => {
  if (seconds === null) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

const formatDateTime = (isoString: string): string => {
  return new Date(isoString).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
};

const getDayLabels = (): string[] => {
  const labels: string[] = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    labels.push(
      d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      })
    );
  }

  return labels;
};

// Components
const Header = ({
  lastUpdate,
  isOnline,
  theme,
  onToggleTheme,
}: {
  lastUpdate: string;
  isOnline: boolean;
  theme: Theme;
  onToggleTheme: () => void;
}) => (
  <header className="glass-card rounded-2xl p-6 mb-6 shadow-card">
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-primary/20 rounded-xl">
          <Activity className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            lumosMQTT
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento de movimento em tempo real
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleTheme}
          className="glass-card rounded-lg p-2 flex items-center gap-2 hover:shadow-glow transition"
        >
          {theme === "dark" ? (
            <>
              <Sun className="w-4 h-4" />
              <span className="text-xs text-muted-foreground">Modo claro</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              <span className="text-xs text-muted-foreground">Modo escuro</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-2 px-4 py-2 glass-card rounded-lg">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isOnline ? "bg-primary pulse-green" : "bg-destructive"
            }`}
          />
          <span className="text-sm font-medium">
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Última atualização</p>
          <p className="text-sm font-mono font-medium text-foreground">
            {lastUpdate}
          </p>
        </div>
      </div>
    </div>
  </header>
);

const MetricCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
}) => (
  <div className="glass-card rounded-xl p-6 shadow-card hover:shadow-glow transition-all duration-300 hover:scale-[1.02] group">
    <div className="flex items-start justify-between mb-4">
      <div className="p-2.5 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
        <Icon className="w-5 h-5 text-primary" />
      </div>
    </div>
    <h3 className="text-sm text-muted-foreground font-medium mb-2">{title}</h3>
    <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
    {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
  </div>
);

const ChartCard = ({
  title,
  children,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  icon: LucideIcon;
}) => (
  <div className="glass-card rounded-xl p-6 shadow-card">
    <div className="flex items-center gap-2 mb-6">
      <Icon className="w-5 h-5 text-primary" />
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    </div>
    <div className="w-full h-56">{children}</div>
  </div>
);

const TrendItem = ({
  label,
  value,
  trend,
  suffix = "",
}: {
  label: string;
  value: string | number;
  trend?: number | null;
  suffix?: string;
}) => {
  const getTrendIcon = () => {
    if (trend === null || trend === undefined)
      return <Minus className="w-4 h-4 text-muted-foreground" />;
    if (trend > 0) return <TrendingUp className="w-4 h-4 text-primary" />;
    if (trend < 0) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getTrendColor = () => {
    if (trend === null || trend === undefined) return "text-muted-foreground";
    if (trend > 0) return "text-primary";
    if (trend < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  return (
    <div className="glass-card rounded-lg p-4 hover:bg-card/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {getTrendIcon()}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
      {trend !== null && trend !== undefined && (
        <p className={`text-xs mt-1 ${getTrendColor()}`}>
          {trend > 0 ? "+" : ""}
          {trend.toFixed(1)}%
        </p>
      )}
    </div>
  );
};

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="glass-card rounded-2xl p-8 shadow-card">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground">Carregando dados...</p>
      </div>
    </div>
  </div>
);

const ErrorCard = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center min-h-screen p-4">
    <div className="glass-card rounded-2xl p-8 shadow-card max-w-md w-full">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="p-3 bg-destructive/20 rounded-xl">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          Erro ao carregar dados
        </h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground mt-2">
          Verifique se o backend está rodando em http://localhost:5050
        </p>
      </div>
    </div>
  </div>
);

const RecentEventsCard = ({
  events,
  onExportCsv,
  onExportJson,
}: {
  events: MotionEvent[];
  onExportCsv: () => void;
  onExportJson: () => void;
}) => (
  <div className="glass-card rounded-xl p-6 shadow-card">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-foreground">
        Eventos recentes
      </h3>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onExportJson}
          className="text-xs px-3 py-1 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
        >
          Exportar JSON
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          className="text-xs px-3 py-1 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
        >
          Exportar CSV
        </button>
      </div>
    </div>
    {events.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        Nenhum evento registrado ainda.
      </p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="py-2 pr-4 text-left">#</th>
              <th className="py-2 pr-4 text-left">Horário</th>
              <th className="py-2 text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr
                key={ev.id}
                className="border-b border-border/40 last:border-0"
              >
                <td className="py-2 pr-4 text-muted-foreground">{ev.id}</td>
                <td className="py-2 pr-4 font-mono text-xs">
                  {formatDateTime(ev.datetimeIso)}
                </td>
                <td className="py-2 font-mono text-xs text-muted-foreground">
                  {ev.timestamp}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// Main Component
const Index = () => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [recentEvents, setRecentEvents] = useState<MotionEvent[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>("--:--:--");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isOnline, setIsOnline] = useState<boolean>(false);

  const apiBase = import.meta.env.VITE_API_BASE_URL;

  const loadMetrics = async () => {
    try {
      const response = await axios.get<MetricsData>(`${apiBase}/api/metrics`);
      setMetrics(response.data);
      setLastUpdate(formatTime(new Date()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecentEvents = async () => {
    try {
      const response = await axios.get<MotionEvent[]>(
        `${apiBase}/api/events?limit=10`
      );
      setRecentEvents(response.data);
    } catch (err) {
      console.error("Erro ao carregar eventos recentes:", err);
    }
  };

  const loadHealth = async () => {
    try {
      const response = await axios.get<HealthStatus>(`${apiBase}/api/health`);
      setIsOnline(response.data.status === "ok");
    } catch (err) {
      console.error("Erro ao carregar healthcheck:", err);
      setIsOnline(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetch(`${apiBase}/api/events/export?limit=1000`);
      if (!res.ok) {
        throw new Error("Falha ao exportar CSV");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "motion_events.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erro ao exportar CSV");
    }
  };

  const handleExportJson = async () => {
    try {
      const res = await fetch(`${apiBase}/api/events?limit=1000`);
      if (!res.ok) {
        throw new Error("Falha ao exportar JSON");
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "motion_events.json";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Erro ao exportar JSON");
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Load theme from localStorage
  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  // Apply theme class to <html> and persist
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  // Poll metrics, events and health
  useEffect(() => {
    const loadAll = () => {
      loadMetrics();
      loadRecentEvents();
      loadHealth();
    };

    loadAll();
    const interval = setInterval(loadAll, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) return <LoadingSpinner />;
  if (error || !metrics)
    return <ErrorCard message={error || "Dados não disponíveis"} />;

  const dayLabels = getDayLabels();

  const detectionsByDayData = dayLabels.map((label, index) => {
    const reversedIndex = metrics.detectionsByDay.length - 1 - index;
    return {
      label,
      value: metrics.detectionsByDay[reversedIndex] ?? 0,
    };
  });

  const hourlyKeys = Object.keys(metrics.hourlyDistribution).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  const hourlyData = hourlyKeys.map((hourKey) => ({
    hour: `${hourKey}h`,
    value: metrics.hourlyDistribution[hourKey],
  }));

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto">
        <Header
          lastUpdate={lastUpdate}
          isOnline={isOnline}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <MetricCard
            title="Total de Detecções"
            value={metrics.totalDetections}
            subtitle="Todas as detecções registradas"
            icon={Activity}
          />
          <MetricCard
            title="Atividades Hoje"
            value={metrics.activitiesToday}
            subtitle="Detecções nas últimas 24h"
            icon={TrendingUp}
          />
          <MetricCard
            title="Energia Economizada"
            value={`${metrics.energyMetrics.energySavedPercent.toFixed(1)}%`}
            subtitle={`${metrics.energyMetrics.energyUsedWh.toFixed(
              2
            )} Wh consumidos`}
            icon={Zap}
          />
          <MetricCard
            title="Sessões Hoje"
            value={metrics.sessionsToday.count}
            subtitle={`Duração média: ${formatDuration(
              metrics.sessionsToday.averageDurationSeconds
            )}`}
            icon={Users}
          />
          <MetricCard
            title="Horário de Pico"
            value={metrics.peakHours}
            subtitle="Maior atividade"
            icon={Clock}
          />
          <MetricCard
            title="Tempo Inativo"
            value={formatIdleTime(metrics.idleMetrics.lastEventAgeSeconds)}
            subtitle="Desde última detecção"
            icon={Timer}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="Detecções por Dia" icon={LineChartIcon}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={detectionsByDayData}
                margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  strokeOpacity={0.1}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke="hsl(215 20% 65%)"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(215 20% 65%)"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222 47% 11%)",
                    border: "1px solid hsl(217 19% 27%)",
                    borderRadius: "0.5rem",
                    color: "white",
                    fontSize: "0.75rem",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(158 64% 52%)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Distribuição Horária Hoje" icon={BarChart3}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={hourlyData}
                margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  strokeOpacity={0.1}
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  stroke="hsl(215 20% 65%)"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(215 20% 65%)"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222 47% 11%)",
                    border: "1px solid hsl(217 19% 27%)",
                    borderRadius: "0.5rem",
                    color: "white",
                    fontSize: "0.75rem",
                  }}
                />
                <Bar
                  dataKey="value"
                  fill="hsl(158 64% 52%)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="glass-card rounded-xl p-6 shadow-card">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Tendências
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <TrendItem
              label="Detecções Hoje"
              value={metrics.trends.todayCount}
            />
            <TrendItem
              label="vs Média Semanal"
              value={
                metrics.trends.deltaVsWeekPercent !== null
                  ? `${metrics.trends.deltaVsWeekPercent.toFixed(1)}%`
                  : "N/A"
              }
              trend={metrics.trends.deltaVsWeekPercent}
            />
            <TrendItem
              label="vs Ontem"
              value={
                metrics.trends.deltaVsYesterdayPercent !== null
                  ? `${metrics.trends.deltaVsYesterdayPercent.toFixed(1)}%`
                  : "N/A"
              }
              trend={metrics.trends.deltaVsYesterdayPercent}
            />
            <TrendItem
              label="vs Média Semanal"
              value={`${metrics.trends.deltaVsWeekPercent.toFixed(1)}%`}
              trend={metrics.trends.deltaVsWeekPercent}
            />
          </div>
        </div>

        <div className="mt-6">
          <RecentEventsCard
            events={recentEvents}
            onExportCsv={handleExportCsv}
            onExportJson={handleExportJson}
          />
        </div>
      </div>
    </div>
  );
};

export default Index;
