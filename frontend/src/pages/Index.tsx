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
} from "lucide-react";

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
    lastEventAgeSeconds: number;
    maxIdleSeconds: number;
  };
  trends: {
    todayCount: number;
    weekAverage: number;
    deltaVsYesterdayPercent: number | null;
    deltaVsWeekPercent: number;
  };
}

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

const formatIdleTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

const getDayLabels = (): string[] => {
  const labels = ["Hoje"];
  for (let i = 1; i < 7; i++) labels.push(`D-${i}`);
  return labels;
};

// Components
const Header = ({
  lastUpdate,
  isOnline,
}: {
  lastUpdate: string;
  isOnline: boolean;
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

const SimpleBarChart = ({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) => {
  const maxValue = Math.max(...data, 1);
  return (
    <div className="flex items-end justify-between gap-2 h-full px-2">
      {data.map((value, index) => {
        const height = (value / maxValue) * 100;
        return (
          <div key={index} className="flex flex-col items-center flex-1 gap-2">
            <div
              className="w-full bg-muted rounded-t-lg relative"
              style={{ height: `${Math.max(height, 4)}%` }}
            >
              <div className="absolute inset-0 bg-gradient-primary rounded-t-lg opacity-80" />
            </div>
            <span className="text-xs text-muted-foreground">
              {labels[index]}
            </span>
            <span className="text-xs font-medium text-foreground">{value}</span>
          </div>
        );
      })}
    </div>
  );
};

const SimpleLineChart = ({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) => {
  const maxValue = Math.max(...data, 1);
  const points = data.map((value, index) => ({
    x: (index / (data.length - 1)) * 100,
    y: 100 - (value / maxValue) * 80,
  }));

  const pathData = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  return (
    <div className="relative h-full">
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(158 64% 52%)" stopOpacity="0.3" />
            <stop
              offset="100%"
              stopColor="hsl(158 64% 52%)"
              stopOpacity="0.05"
            />
          </linearGradient>
        </defs>
        <path d={`${pathData} L 100 100 L 0 100 Z`} fill="url(#lineGradient)" />
        <path
          d={pathData}
          stroke="hsl(158 64% 52%)"
          strokeWidth="0.5"
          fill="none"
        />
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="1"
            fill="hsl(158 64% 52%)"
          />
        ))}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-xs text-muted-foreground">
        {labels.map((label, index) => (
          <span key={index}>{label}</span>
        ))}
      </div>
    </div>
  );
};

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

// Main Component
const Index = () => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>("--:--:--");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    try {
      const response = await axios.get<MetricsData>(
        "http://localhost:5050/api/metrics"
      );
      setMetrics(response.data);
      setLastUpdate(formatTime(new Date()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 3000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return <LoadingSpinner />;
  if (error || !metrics)
    return <ErrorCard message={error || "Dados não disponíveis"} />;

  const dayLabels = getDayLabels();
  const hourlyKeys = Object.keys(metrics.hourlyDistribution).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  const hourlyLabels = hourlyKeys.map((h) => `${h}h`);
  const hourlyValues = hourlyKeys.map((h) => metrics.hourlyDistribution[h]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Header lastUpdate={lastUpdate} isOnline={!error} />

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
            <SimpleLineChart
              data={metrics.detectionsByDay}
              labels={dayLabels}
            />
          </ChartCard>
          <ChartCard title="Distribuição Horária Hoje" icon={BarChart3}>
            <SimpleBarChart data={hourlyValues} labels={hourlyLabels} />
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
              label="Média Semanal"
              value={metrics.trends.weekAverage.toFixed(1)}
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
      </div>
    </div>
  );
};

export default Index;
