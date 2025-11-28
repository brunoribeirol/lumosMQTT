# lumosMQTT Motion Dashboard

Dashboard React moderno para monitoramento de movimento em tempo real.

## 🚀 Tecnologias

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Chart.js + react-chartjs-2
- Axios
- Lucide React (ícones)

## 📦 Instalação

```bash
npm install
```

## 🎯 Executar o Projeto

```bash
npm run dev
```

O dashboard estará disponível em `http://localhost:8080`

## ⚙️ Backend

O dashboard consome dados do endpoint:

```
GET http://localhost:5050/api/metrics
```

**Certifique-se de que seu backend Flask está rodando na porta 5050 antes de iniciar o dashboard.**

## 🎨 Features

- ✅ Tema dark moderno com glassmorphism
- ✅ Auto-refresh a cada 3 segundos
- ✅ Cards de métricas com hover effects
- ✅ Gráficos interativos (Chart.js)
- ✅ Indicador de status online/offline
- ✅ Layout responsivo
- ✅ Tratamento de erros
- ✅ Loading states

## 📊 Dados Exibidos

- Total de detecções
- Atividades hoje
- Energia economizada
- Sessões de movimento
- Horário de pico
- Tempo inativo
- Gráfico de detecções por dia (últimos 7 dias)
- Gráfico de distribuição horária
- Tendências (comparação vs ontem e média semanal)

## 🛠️ Estrutura do Projeto

```
src/
├── components/
│   └── Dashboard/
│       ├── Header.tsx
│       ├── MetricCard.tsx
│       ├── ChartCard.tsx
│       ├── TrendItem.tsx
│       ├── LoadingSpinner.tsx
│       └── ErrorCard.tsx
├── services/
│   └── api.ts
├── types/
│   └── metrics.ts
├── utils/
│   └── formatters.ts
└── pages/
    └── Index.tsx
```

## 🎨 Design System

O projeto utiliza um design system baseado em:

- Paleta verde eco/teal (tema natureza)
- Efeitos glassmorphism
- Animações suaves
- Gradientes personalizados
- Sombras e glows

Todas as cores e estilos estão definidos em `src/index.css` e `tailwind.config.ts`.
