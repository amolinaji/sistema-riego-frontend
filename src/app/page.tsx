/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { SensorHumedadServices } from "@/services/sensor-humedad.service";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import io, { type Socket } from "socket.io-client";
import Chart from "chart.js/auto";

// Definición de tipos
interface HumidityData {
  id: number;
  value: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  formattedTime?: string;
}

export default function IrrigationControlPanel() {
  // Services
  const sensorService = new SensorHumedadServices();

  // States
  const [humidityData, setHumidityData] = useState<HumidityData[]>([]);
  const [filteredData, setFilteredData] = useState<HumidityData[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [valveState, setValveState] = useState<boolean>(false);
  const [alarmState, setAlarmState] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const [valveLoading, setValveLoading] = useState<boolean>(false);
  const [alarmLoading, setAlarmLoading] = useState<boolean>(false);
  const [socketInitialized, setSocketInitialized] = useState<boolean>(false);
  const itemsPerPage = 15;

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  // Format date for API
  const formatDateForApi = useCallback((date: Date) => {
    return format(date, "yyyy-MM-dd");
  }, []);

  // Format date for display
  const formatDateForDisplay = useCallback((date: Date) => {
    return format(date, "PPPP", { locale: es });
  }, []);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const formattedDate = formatDateForApi(selectedDate);
      const data = await sensorService.findAllByDate(formattedDate);

      // Format data for display
      const formattedData = data.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        formattedTime: format(new Date(item.createdAt), "HH:mm:ss"),
      }));

      setHumidityData(formattedData);
      paginateData(formattedData, 1);

      // Load valve and alarm states
      const valveData = await sensorService.getValveState();
      setValveState(valveData.state);

      const alarmData = await sensorService.getAlarmState();
      setAlarmState(alarmData.state);

      setIsLoading(false);
    } catch (error) {
      console.error("Error loading data:", error);
      setIsLoading(false);
    }
  }, [selectedDate, formatDateForApi]);

  // Paginate data
  const paginateData = (data: HumidityData[], page: number) => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = data.slice(startIndex, endIndex);
    setFilteredData(paginatedData);
    setTotalPages(Math.ceil(data.length / itemsPerPage));
    setCurrentPage(page);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    paginateData(humidityData, page);
  };

  // Toggle valve state
  const toggleValve = async () => {
    if (valveLoading) return; // Prevenir múltiples clics

    try {
      setValveLoading(true);
      if (valveState) {
        await sensorService.setValveOff();
      } else {
        await sensorService.setValveOn();
      }
      setValveState(!valveState);
    } catch (error) {
      console.error("Error toggling valve:", error);
    } finally {
      setValveLoading(false);
    }
  };

  // Toggle alarm state
  const toggleAlarm = async () => {
    if (alarmLoading) return; // Prevenir múltiples clics

    try {
      setAlarmLoading(true);
      if (alarmState) {
        await sensorService.setAlarmOff();
      } else {
        await sensorService.setAlarmOn();
      }
      setAlarmState(!alarmState);
    } catch (error) {
      console.error("Error toggling alarm:", error);
    } finally {
      setAlarmLoading(false);
    }
  };

  // Toggle socket connection
  const toggleSocket = () => {
    if (socketConnected) {
      disconnectSocket();
      setSocketConnected(false);
    } else {
      initializeSocket();
      setSocketConnected(true);
    }
  };

  // Disconnect socket safely
  const disconnectSocket = () => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.disconnect();
    }
  };

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    // Si ya hay un socket activo, no crear otro
    if (socketRef.current && socketRef.current.connected) {
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || "";

    if (!socketUrl) {
      console.error("Socket URL not found");
      return;
    }

    try {
      const socket = io(socketUrl);

      socket.on("connect", () => {
        console.log("Socket connected");
        setSocketConnected(true);
      });

      socket.on("disconnect", () => {
        console.log("Socket disconnected");
        setSocketConnected(false);
      });

      socket.on("mensajeServer", (message: string) => {
        console.log("Mensaje recibido:", message);
        if (message === "actualizar") {
          // Solo cargar datos cuando recibimos el mensaje específico
          loadData();
        }
      });

      socketRef.current = socket;
      setSocketInitialized(true);
    } catch (error) {
      console.error("Error initializing socket:", error);
      setSocketConnected(false);
    }
  }, [loadData]);

  // Create or update chart
  const updateChart = useCallback(() => {
    if (!chartRef.current) {
      console.warn("El canvas aún no está montado. Esperando...");
      return;
    }

    if (
      !humidityData ||
      !Array.isArray(humidityData) ||
      humidityData.length === 0
    ) {
      console.warn("Datos de humedad no válidos o vacíos");
      return;
    }

    // Destruir gráfico anterior si existe
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null; // Resetear la referencia
    }

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) {
      console.warn("No se pudo obtener el contexto del canvas.");
      return;
    }

    // Filtrar datos inválidos
    const filteredData = humidityData.filter(
      (item) => item.value !== undefined && item.formattedTime !== undefined
    );

    if (filteredData.length === 0) {
      console.warn("No hay datos válidos para graficar");
      return;
    }

    const labels = filteredData.map((item) => item.formattedTime);
    const values = filteredData.map((item) => item.value);

    // Crear un nuevo gráfico
    chartInstanceRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Humedad (%)",
            data: values,
            borderColor: "#0ea5e9",
            backgroundColor: "rgba(14, 165, 233, 0.2)",
            borderWidth: 3,
            tension: 0.1,
            pointBackgroundColor: values.map((value) => {
              if (value < 30) return "#ef4444"; // Rojo para valores bajos
              if (value < 60) return "#f59e0b"; // Ámbar para valores medios
              return "#22c55e"; // Verde para valores buenos
            }),
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "Gráfico de Humedad",
            font: { size: 16, weight: "bold" },
            color: "#0369a1",
            padding: { top: 10, bottom: 20 },
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (context) => `Humedad: ${context.parsed.y}%`,
            },
          },
          legend: { display: true, position: "top" },
        },
        scales: {
          x: { title: { display: true, text: "Hora" } },
          y: {
            title: { display: true, text: "Humedad (%)" },
            min: 0,
            max: 100,
          },
        },
      },
    });
  }, [humidityData]);

  // Download CSV
  const downloadCSV = () => {
    // Create CSV content
    const headers = "ID,Valor de Humedad,Fecha,Hora\n";
    const csvContent = humidityData
      .map((item) => {
        const date = format(new Date(item.createdAt), "yyyy-MM-dd");
        const time = format(new Date(item.createdAt), "HH:mm:ss");
        return `${item.id},${item.value},${date},${time}`;
      })
      .join("\n");

    const fullContent = headers + csvContent;

    // Create download link
    const blob = new Blob([fullContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `datos_humedad_${formatDateForApi(selectedDate)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Date picker - Previous day
  const previousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  // Date picker - Next day
  const nextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  // Date picker - Create a simple calendar
  const renderCalendar = () => {
    if (!calendarOpen) return null;

    const today = new Date();
    const currentMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1
    );
    const daysInMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      0
    ).getDate();
    const firstDayOfMonth = currentMonth.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Week day headers
    const weekDays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

    // Generate calendar grid
    const calendarDays = [];

    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      calendarDays.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        day
      );
      const isSelected = day === selectedDate.getDate();
      const isToday =
        day === today.getDate() &&
        today.getMonth() === selectedDate.getMonth() &&
        today.getFullYear() === selectedDate.getFullYear();

      calendarDays.push(
        <button
          key={`day-${day}`}
          className={`h-8 w-8 rounded-full flex items-center justify-center text-sm
            ${isSelected ? "bg-green-600 text-white font-bold" : ""}
            ${
              isToday && !isSelected
                ? "border border-green-500 font-semibold"
                : ""
            }
            hover:bg-green-100 focus:outline-none`}
          onClick={() => {
            setSelectedDate(
              new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day)
            );
            setCalendarOpen(false);
          }}
        >
          {day}
        </button>
      );
    }

    return (
      <div className="absolute top-full left-0 mt-1 p-3 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
        <div className="flex justify-between items-center mb-2">
          <button
            className="p-1 hover:bg-gray-100 rounded-full"
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setMonth(newDate.getMonth() - 1);
              setSelectedDate(newDate);
            }}
          >
            &lt;
          </button>
          <div className="font-semibold">
            {format(selectedDate, "MMMM yyyy", { locale: es })}
          </div>
          <button
            className="p-1 hover:bg-gray-100 rounded-full"
            onClick={() => {
              const newDate = new Date(selectedDate);
              newDate.setMonth(newDate.getMonth() + 1);
              setSelectedDate(newDate);
            }}
          >
            &gt;
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => (
            <div
              key={day}
              className="h-8 w-8 flex items-center justify-center text-xs font-semibold text-gray-600"
            >
              {day}
            </div>
          ))}
          {calendarDays}
        </div>
        <div className="mt-2 flex justify-between">
          <button
            className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            onClick={() => setSelectedDate(new Date())}
          >
            Hoy
          </button>
          <button
            className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            onClick={() => setCalendarOpen(false)}
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  };

  // Initialize component
  useEffect(() => {
    // Solo inicializar el socket una vez
    if (!socketInitialized) {
      initializeSocket();
    }

    return () => {
      disconnectSocket();
      // Limpiar el gráfico al desmontar
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [initializeSocket, socketInitialized]);

  // Handle date change
  useEffect(() => {
    if (!socketConnected) {
      loadData();
    }
  }, [selectedDate]);

  // Update chart when data changes
  useEffect(() => {
    if (chartRef.current && humidityData.length > 0) {
      console.log(humidityData);
      setTimeout(() => {
        updateChart();
      }, 500);
    } else {
      console.warn("Canvas aún no está disponible o no hay datos");
    }
  }, [humidityData, updateChart]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-green-800 mb-2">
            Panel de Control de Riego
          </h1>
          <p className="text-green-600">
            Sistema de monitoreo y control de humedad
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Control Card */}
          <div className="bg-white rounded-lg shadow-lg border-2 border-green-200 overflow-hidden">
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-center gap-2 text-green-700 font-bold text-lg mb-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Control del Sistema
              </div>
              <p className="text-sm text-gray-600">
                Estado y control de dispositivos
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                    />
                  </svg>
                  <span>Válvula de Riego</span>
                </div>
                <button
                  onClick={toggleValve}
                  disabled={valveLoading}
                  className={`px-3 py-1.5 rounded text-white font-medium text-sm ${
                    valveLoading
                      ? "bg-gray-400 cursor-not-allowed"
                      : valveState
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {valveLoading ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Procesando...
                    </span>
                  ) : valveState ? (
                    "Cerrar Válvula"
                  ) : (
                    "Abrir Válvula"
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-amber-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>Alarma de Alerta</span>
                </div>
                <button
                  onClick={toggleAlarm}
                  disabled={alarmLoading}
                  className={`px-3 py-1.5 rounded text-white font-medium text-sm ${
                    alarmLoading
                      ? "bg-gray-400 cursor-not-allowed"
                      : alarmState
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  {alarmLoading ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Procesando...
                    </span>
                  ) : alarmState ? (
                    "Desactivar Alarma"
                  ) : (
                    "Activar Alarma"
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {socketConnected ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.111 16.404a5.5 5.5 0 007.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                      />
                    </svg>
                  )}
                  <span>Monitoreo en Vivo</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {socketConnected ? "Activo" : "Inactivo"}
                  </span>
                  <label className="inline-flex relative items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={socketConnected}
                      onChange={toggleSocket}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-4 pb-4">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  socketConnected
                    ? "bg-green-100 text-green-800 border border-green-300"
                    : "bg-gray-100 text-gray-800 border border-gray-300"
                }`}
              >
                {socketConnected ? "Datos en tiempo real" : "Datos históricos"}
              </span>
            </div>
          </div>

          {/* Date Selection Card */}
          <div
            className={`bg-white rounded-lg shadow-lg border-2 border-blue-200 overflow-hidden ${
              socketConnected ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-center gap-2 text-blue-700 font-bold text-lg mb-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Selección de Fecha
              </div>
              <p className="text-sm text-gray-600">
                {socketConnected
                  ? "Desactive el monitoreo en vivo para ver datos históricos"
                  : "Seleccione una fecha para ver datos históricos"}
              </p>
            </div>
            <div className="p-4">
              <div className="relative">
                <button
                  onClick={() => setCalendarOpen(!calendarOpen)}
                  disabled={socketConnected}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <div className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-2 text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {formatDateForDisplay(selectedDate)}
                  </div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {renderCalendar()}
              </div>

              <div className="mt-4 flex items-center justify-between gap-4">
                <button
                  className="flex items-center justify-center px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={previousDay}
                  disabled={socketConnected}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 mr-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Anterior
                </button>

                <button
                  className="flex items-center justify-center px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={nextDay}
                  disabled={socketConnected}
                >
                  Siguiente
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4 ml-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-4 pt-0 flex justify-between">
              <button
                className="flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={loadData}
                disabled={socketConnected || isLoading}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Actualizar
              </button>

              <button
                className="flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={downloadCSV}
                disabled={isLoading || humidityData.length === 0}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Descargar CSV
              </button>
            </div>
          </div>

          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-lg border-2 border-teal-200 overflow-hidden">
            <div className="border-b border-gray-100 p-4">
              <div className="flex items-center gap-2 text-teal-700 font-bold text-lg mb-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
                Estado del Sistema
              </div>
              <p className="text-sm text-gray-600">
                Resumen de condiciones actuales
              </p>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-blue-600 mb-1">Válvula</p>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      valveState
                        ? "bg-green-100 text-green-800 border border-green-300"
                        : "bg-gray-100 text-gray-800 border border-gray-300"
                    }`}
                  >
                    {valveState ? "Abierta" : "Cerrada"}
                  </span>
                </div>

                <div className="bg-amber-50 p-4 rounded-lg text-center">
                  <p className="text-sm text-amber-600 mb-1">Alarma</p>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      alarmState
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-gray-100 text-gray-800 border border-gray-300"
                    }`}
                  >
                    {alarmState ? "Activa" : "Inactiva"}
                  </span>
                </div>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-green-600 mb-1">Última lectura</p>
                <p className="text-2xl font-bold text-green-800">
                  {humidityData.length > 0
                    ? `${humidityData[humidityData.length - 1].value}%`
                    : "Sin datos"}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  {humidityData.length > 0
                    ? `Actualizado: ${format(
                        new Date(
                          humidityData[humidityData.length - 1].createdAt
                        ),
                        "HH:mm:ss"
                      )}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-white rounded-lg shadow-lg border-2 border-blue-200 overflow-hidden mb-8">
          <div className="border-b border-gray-100 p-4">
            <h2 className="text-blue-700 font-bold text-lg">
              Gráfico de Humedad
            </h2>
            <p className="text-sm text-gray-600">
              {socketConnected
                ? "Datos en tiempo real"
                : `Datos históricos del ${formatDateForDisplay(selectedDate)}`}
            </p>
          </div>
          <div className="p-4">
            <div className="h-[300px] w-full">
              {humidityData.length > 0 ? (
                <canvas ref={chartRef} className="w-full h-full"></canvas>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500">
                    No hay datos disponibles para mostrar
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-lg shadow-lg border-2 border-green-200 overflow-hidden">
          <div className="border-b border-gray-100 p-4">
            <h2 className="text-green-700 font-bold text-lg">
              Registros de Humedad
            </h2>
            <p className="text-sm text-gray-600">
              {socketConnected
                ? "Datos en tiempo real"
                : `Datos históricos del ${formatDateForDisplay(selectedDate)}`}
            </p>
          </div>
          <div className="p-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700"></div>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border rounded-lg">
                    <thead className="bg-green-50">
                      <tr>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider"
                        >
                          ID
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider"
                        >
                          Valor (%)
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider"
                        >
                          Fecha
                        </th>
                        <th
                          scope="col"
                          className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider"
                        >
                          Hora
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredData.length > 0 ? (
                        filteredData.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {item.id}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                  item.value < 30
                                    ? "bg-red-100 text-red-800 border border-red-300"
                                    : item.value < 60
                                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                                    : "bg-green-100 text-green-800 border border-green-300"
                                }`}
                              >
                                {item.value}%
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(item.createdAt), "dd/MM/yyyy")}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(item.createdAt), "HH:mm:ss")}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 py-4 text-center text-sm text-gray-500"
                          >
                            No hay datos disponibles para esta fecha
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-4 flex justify-center">
                    <nav
                      className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                      aria-label="Pagination"
                    >
                      <button
                        onClick={() =>
                          handlePageChange(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        className={`relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium ${
                          currentPage === 1
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span className="sr-only">Anterior</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>

                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
                          let pageNumber;

                          if (totalPages <= 5) {
                            pageNumber = i + 1;
                          } else if (currentPage <= 3) {
                            pageNumber = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNumber = totalPages - 4 + i;
                          } else {
                            pageNumber = currentPage - 2 + i;
                          }

                          return (
                            <button
                              key={i}
                              onClick={() => handlePageChange(pageNumber)}
                              aria-current={
                                currentPage === pageNumber ? "page" : undefined
                              }
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                currentPage === pageNumber
                                  ? "z-10 bg-green-50 border-green-500 text-green-600"
                                  : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              {pageNumber}
                            </button>
                          );
                        }
                      )}

                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <>
                          <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                            ...
                          </span>
                          <button
                            onClick={() => handlePageChange(totalPages)}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                          >
                            {totalPages}
                          </button>
                        </>
                      )}

                      <button
                        onClick={() =>
                          handlePageChange(
                            Math.min(totalPages, currentPage + 1)
                          )
                        }
                        disabled={currentPage === totalPages}
                        className={`relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium ${
                          currentPage === totalPages
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span className="sr-only">Siguiente</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    </nav>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="p-4 pt-0 flex justify-between border-t border-gray-100 mt-4">
            <p className="text-sm text-gray-500">
              {humidityData.length > 0
                ? `Total: ${humidityData.length} registros`
                : "No hay registros"}
            </p>

            <button
              className="flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={downloadCSV}
              disabled={isLoading || humidityData.length === 0}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Descargar CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
