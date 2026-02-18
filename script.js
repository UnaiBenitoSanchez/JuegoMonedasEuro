window.elementSdk = {
  init: function (options) {
    this.config = options.defaultConfig;
    if (options.onConfigChange) {
      options.onConfigChange(this.config);
    }
  },
};

window.dataSdk = {
  data: [],
  listener: null,
  init: async function (listener) {
    this.listener = listener;
    const storedData = localStorage.getItem("juego_monedas_data");
    if (storedData) {
      this.data = JSON.parse(storedData);
    }
    setTimeout(() => this.notificarCambios(), 100);
    return { isOk: true };
  },
  create: async function (item) {
    if (!item.__backendId) item.__backendId = "id_" + Date.now();
    if (!item._backendId) item._backendId = item.__backendId;
    this.data.push(item);
    this.saveToStorage();
    this.notificarCambios();
    return { isOk: true };
  },
  update: async function (item) {
    const index = this.data.findIndex(
      (d) =>
        d.__backendId === item.__backendId || d._backendId === item._backendId,
    );
    if (index !== -1) {
      this.data[index] = { ...this.data[index], ...item };
      this.saveToStorage();
      this.notificarCambios();
      return { isOk: true };
    }
    return { isOk: false, error: "Item no encontrado" };
  },
  delete: async function (item) {
    this.data = this.data.filter(
      (d) =>
        d.__backendId !== item.__backendId && d._backendId !== item._backendId,
    );
    this.saveToStorage();
    this.notificarCambios();
    return { isOk: true };
  },
  saveToStorage: function () {
    localStorage.setItem("juego_monedas_data", JSON.stringify(this.data));
  },
  notificarCambios: function () {
    if (this.listener && this.listener.onDataChanged) {
      this.listener.onDataChanged([...this.data]);
    }
  },
};

const defaultConfig = {
  titulo_juego: "🪙 Juego de Monedas Euros 🪙",
  texto_instruccion: "Arrastra las monedas para formar la cantidad indicada",
  mensaje_exito: "¡Excelente trabajo!",
};

const NIVELES = [
  { cantidad: 3 },
  { cantidad: 5 },
  { cantidad: 7 },
  { cantidad: 4 },
  { cantidad: 6 },
  { cantidad: 8 },
  { cantidad: 9 },
  { cantidad: 10 },
];

let todosJugadores = [];
let jugadorActual = null;
let jugadoresPartida = [];
let participantesSeleccionados = [];
let dificultadesSeleccionadas = {};
let partidaActualId = null;
let nivelActual = 1;
let objetivoActualCent = 0;
let sumaActualCent = 0;
let intentos = 0;
let monedasSoltadas = [];
let monedaArrastrada = null;
let dificultadJuego = "facil";
let turnoPendiente = false;

function hablar(texto) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = "es-ES";
    utterance.rate = 1.0;
    utterance.pitch = 1.1;
    window.speechSynthesis.speak(utterance);
  }
}

function reproducirSonidoMonedas() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  const sonidos = [
    { frecuencia: 800, duracion: 0.1, retraso: 0 },
    { frecuencia: 600, duracion: 0.15, retraso: 0.1 },
    { frecuencia: 500, duracion: 0.2, retraso: 0.3 },
  ];

  sonidos.forEach(({ frecuencia, duracion, retraso }) => {
    setTimeout(() => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frecuencia;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + duracion,
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duracion);
    }, retraso * 1000);
  });
}

function crearMonedasCayendo() {
  const container = document.getElementById("falling-coins");
  container.innerHTML = "";

  const monedas = ["🪙", "💰", "🪙", "💰", "🪙"];

  monedas.forEach((moneda, index) => {
    setTimeout(() => {
      const div = document.createElement("div");
      div.className = "falling-coin";
      div.textContent = moneda;
      div.style.left = Math.random() * 80 + 10 + "%";
      div.style.top = "-100px";

      container.appendChild(div);

      setTimeout(() => div.remove(), 2000);
    }, index * 200);
  });
}

function mostrarToast(mensaje) {
  const toast = document.createElement("div");
  toast.className =
    "fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-xl shadow-lg z-50";
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function mostrarModal(html) {
  const modal = document.createElement("div");
  modal.className =
    "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4";
  modal.innerHTML = `<div class="bg-white rounded-2xl p-8 max-w-md">${html}</div>`;
  document.body.appendChild(modal);
  return modal;
}

const dataHandler = {
  onDataChanged(data) {
    todosJugadores = data;
    renderizarListaJugadores();

    if (jugadorActual) {
      const jugadorActualizado = todosJugadores.find(
        (j) => j._backendId === jugadorActual._backendId,
      );
      if (jugadorActualizado) {
        jugadorActual = jugadorActualizado;
        actualizarEstadoTurno();
      }
    }
  },
};

function renderizarListaJugadores() {
  const lista = document.getElementById("lista-jugadores");

  if (todosJugadores.length === 0) {
    lista.innerHTML =
      '<p class="col-span-full text-center text-gray-500 py-8">No hay jugadores. ¡Crea el primero!</p>';
    return;
  }

  lista.innerHTML = todosJugadores
    .sort((a, b) => b.puntos_totales - a.puntos_totales)
    .map(
      (jugador) => `
          <div class="bg-white border-2 border-purple-200 rounded-xl p-4 hover:shadow-lg transition-all">
            <h4 class="text-xl font-bold text-purple-700 mb-2">${escaparHTML(jugador.nombre)}</h4>
            <div class="text-sm text-gray-600 space-y-1">
              <p>⭐ Puntos: <span class="font-bold">${jugador.puntos_totales}</span></p>
              <p>🎮 Nivel: <span class="font-bold">${jugador.nivel_actual}</span></p>
              <p>🔄 Intentos: <span class="font-bold">${jugador.intentos_totales}</span></p>
            </div>
          </div>
        `,
    )
    .join("");

  verificarPartidaActiva();
}

function verificarPartidaActiva() {
  const jugadoresConPartida = todosJugadores.filter(
    (j) => j.partida_id && j.partida_id !== "",
  );
  const container = document.getElementById("continuar-partida-container");

  if (jugadoresConPartida.length > 0) {
    container.classList.remove("hidden");
  } else {
    container.classList.add("hidden");
  }
}

function continuarPartidaActiva() {
  const jugadorConTurno = todosJugadores.find(
    (j) => j.turno_activo && j.partida_id,
  );

  if (jugadorConTurno) {
    irAlJuego(jugadorConTurno.__backendId);
  } else {
    const jugadorEnPartida = todosJugadores.find(
      (j) => j.partida_id && j.partida_id !== "",
    );
    if (jugadorEnPartida) {
      irAlJuego(jugadorEnPartida.__backendId);
    }
  }
}

function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function renderizarSeleccionParticipantes() {
  const lista = document.getElementById("lista-participantes");

  lista.innerHTML = todosJugadores
    .map((jugador) => {
      const seleccionado = participantesSeleccionados.includes(
        jugador.__backendId,
      );
      const dificultadActual =
        dificultadesSeleccionadas[jugador.__backendId] || "facil";

      return `
          <div class="bg-white border-2 ${seleccionado ? "border-green-500 bg-green-50" : "border-gray-300"} rounded-xl p-3 transition-all">
            <div class="flex justify-between items-center mb-2">
              <h4 class="font-bold ${seleccionado ? "text-green-700" : "text-gray-700"}">${escaparHTML(jugador.nombre)}</h4>
              ${seleccionado ? '<span class="text-xl">✓</span>' : ""}
            </div>
            <p class="text-xs text-gray-600 mb-2">⭐ ${jugador.puntos_totales} pts</p>
            
            ${
              seleccionado
                ? `
              <div class="mt-2 space-y-2">
                <label class="text-xs font-semibold text-gray-700 block">Dificultad:</label>
                <div class="flex gap-2">
                  <button 
                    class="flex-1 py-1 px-2 text-xs rounded ${dificultadActual === "facil" ? "bg-yellow-500 text-white font-bold" : "bg-gray-200 text-gray-700"}" 
                    onclick="cambiarDificultadJugador('${jugador.__backendId}', 'facil')"
                  >
                    🟡 Fácil<br><span class="text-[10px]">1€ 2€</span>
                  </button>
                  <button 
                    class="flex-1 py-1 px-2 text-xs rounded ${dificultadActual === "dificil" ? "bg-orange-500 text-white font-bold" : "bg-gray-200 text-gray-700"}" 
                    onclick="cambiarDificultadJugador('${jugador.__backendId}', 'dificil')"
                  >
                    🔶 Difícil<br><span class="text-[10px]">+ céntimos</span>
                  </button>
                </div>
              </div>
            `
                : `
              <button 
                class="w-full py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 font-semibold" 
                onclick="toggleParticipante('${jugador.__backendId}')"
              >
                Seleccionar
              </button>
            `
            }
            
            ${
              seleccionado
                ? `
              <button 
                class="w-full mt-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600" 
                onclick="toggleParticipante('${jugador.__backendId}')"
              >
                Quitar
              </button>
            `
                : ""
            }
          </div>
        `;
    })
    .join("");
}

window.toggleParticipante = function (jugadorId) {
  const index = participantesSeleccionados.indexOf(jugadorId);

  if (index > -1) {
    participantesSeleccionados.splice(index, 1);
    delete dificultadesSeleccionadas[jugadorId];
  } else {
    participantesSeleccionados.push(jugadorId);
    dificultadesSeleccionadas[jugadorId] = "facil";
  }

  renderizarSeleccionParticipantes();
  actualizarBotonConfirmar();
};

window.cambiarDificultadJugador = function (jugadorId, dificultad) {
  dificultadesSeleccionadas[jugadorId] = dificultad;
  renderizarSeleccionParticipantes();
};

function actualizarBotonConfirmar() {
  const boton = document.getElementById("btn-confirmar-participantes");
  boton.disabled = participantesSeleccionados.length < 2;
  boton.textContent =
    participantesSeleccionados.length < 2
      ? "⚠ Selecciona al menos 2 jugadores"
      : `▶ Comenzar (${participantesSeleccionados.length} jugadores)`;
}

async function iniciarPartida() {
  if (participantesSeleccionados.length < 2) {
    mostrarToast("⚠ Selecciona al menos 2 jugadores");
    return;
  }

  const boton = document.getElementById("btn-confirmar-participantes");
  boton.disabled = true;
  boton.textContent = "Iniciando...";

  try {
    partidaActualId = "partida_" + Date.now();

    for (let i = 0; i < participantesSeleccionados.length; i++) {
      const jugadorId = participantesSeleccionados[i];
      const jugador = todosJugadores.find((j) => j.__backendId === jugadorId);
      const dificultadPersonal =
        dificultadesSeleccionadas[jugadorId] || "facil";

      if (jugador) {
        await window.dataSdk.update({
          ...jugador,
          partida_id: partidaActualId,
          orden_turno: i,
          turno_activo: i === 0,
          nivel_actual: 1,
          dificultad_partida: dificultadPersonal,
        });
      }
    }

    hablar("Partida iniciada");
    mostrarToast(`🎮 Partida iniciada`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    document.getElementById("pantalla-jugadores").classList.add("hidden");
    document.getElementById("panel-seleccion").classList.add("hidden");
    document.getElementById("pantalla-estadisticas").classList.add("hidden");
    document.getElementById("pantalla-juego").classList.remove("hidden");

    const primerJugadorId = participantesSeleccionados[0];
    const primerJugador = todosJugadores.find(
      (j) => j.__backendId === primerJugadorId,
    );

    if (primerJugador) {
      irAlJuego(primerJugadorId);
    } else {
      mostrarToast("❌ Error al cargar el primer jugador");
      boton.disabled = false;
      boton.textContent = "▶ Comenzar Partida";
    }
  } catch (error) {
    console.error("Error en iniciarPartida:", error);
    mostrarToast("❌ Error al iniciar la partida");
    boton.disabled = false;
    boton.textContent = "▶ Comenzar Partida";
  }
}

function irAlJuego(jugadorId) {
  const jugador = todosJugadores.find((j) => j.__backendId === jugadorId);
  if (!jugador) return;

  jugadorActual = jugador;
  nivelActual = jugador.nivel_actual;
  turnoPendiente = false;

  if (jugador.dificultad_partida) {
    dificultadJuego = jugador.dificultad_partida;
  }

  jugadoresPartida = todosJugadores
    .filter((j) => j.partida_id === jugador.partida_id)
    .sort((a, b) => a.orden_turno - b.orden_turno);

  document.getElementById("pantalla-jugadores").classList.add("hidden");
  document.getElementById("pantalla-juego").classList.remove("hidden");
  document.getElementById("nombre-jugador-actual").textContent = jugador.nombre;
  document.getElementById("puntos-actuales").textContent =
    jugador.puntos_totales;

  const dificultadTexto =
    dificultadJuego === "facil" ? "🟡 Modo Fácil" : "🔶 Modo Difícil";
  document.getElementById("dificultad-jugador").textContent = dificultadTexto;

  if (jugador.turno_activo) {
    hablar(`Hola ${jugador.nombre}, es tu turno`);
  }

  actualizarEstadoTurno();
  iniciarNivel(nivelActual);
}

function actualizarEstadoTurno() {
  const indicador = document.getElementById("indicador-turno");
  const texto = document.getElementById("texto-turno");
  const btnComprobar = document.getElementById("btn-comprobar");
  const btnReintentar = document.getElementById("btn-reintentar");
  const btnPista = document.getElementById("btn-pista");

  if (jugadorActual.turno_activo) {
    indicador.className =
      "mt-2 px-4 py-2 rounded-full inline-block font-semibold bg-green-200 text-green-800 animate-pulse";
    texto.textContent = "✓ Tu turno";
    btnComprobar.disabled = false;
    btnReintentar.disabled = false;
    btnPista.disabled = false;
  } else {
    indicador.className =
      "mt-2 px-4 py-2 rounded-full inline-block font-semibold bg-gray-200 text-gray-600";
    texto.textContent = "⏳ Esperando turno";
    btnComprobar.disabled = true;
    btnReintentar.disabled = true;
    btnPista.disabled = true;
  }
}

async function pasarTurno() {
  if (jugadoresPartida.length === 0) return;

  const indiceActual = jugadoresPartida.findIndex(
    (j) => j._backendId === jugadorActual._backendId,
  );
  const siguienteIndice = (indiceActual + 1) % jugadoresPartida.length;
  const siguienteJugador = jugadoresPartida[siguienteIndice];

  await window.dataSdk.update({
    ...jugadorActual,
    turno_activo: false,
  });

  await window.dataSdk.update({
    ...siguienteJugador,
    turno_activo: true,
  });

  limpiarRespuesta();

  setTimeout(() => {
    irAlJuego(siguienteJugador.__backendId);
  }, 500);

  mostrarToast(`🎯 Turno de ${siguienteJugador.nombre}`);
  hablar(`Turno de ${siguienteJugador.nombre}`);
}

async function terminarPartida() {
  for (const jugador of jugadoresPartida) {
    await window.dataSdk.update({
      ...jugador,
      partida_id: "",
      turno_activo: false,
      orden_turno: 0,
      dificultad_partida: "",
    });
  }

  const boton = document.getElementById("btn-terminar-partida");
  if (boton) {
    boton.disabled = false;
    boton.textContent = "🏁 Terminar Partida";
  }

  mostrarEstadisticas();
}

function mostrarEstadisticas() {
  const ranking = [...jugadoresPartida].sort(
    (a, b) => b.puntos_totales - a.puntos_totales,
  );

  document.getElementById("pantalla-juego").classList.add("hidden");
  document.getElementById("pantalla-estadisticas").classList.remove("hidden");

  renderizarPodio(ranking);
  renderizarTablaEstadisticas(ranking);

  if (ranking.length > 0) {
    hablar(
      `El ganador es ${ranking[0].nombre} con ${ranking[0].puntos_totales} puntos`,
    );
  }
}

function renderizarPodio(ranking) {
  const podio = document.getElementById("podio-ganadores");

  if (ranking.length === 0) {
    podio.innerHTML = '<p class="text-center text-gray-500">No hay datos</p>';
    return;
  }

  const medallasColores = [
    { bg: "bg-yellow-400", text: "text-yellow-900", emoji: "🥇", lugar: "1º" },
    { bg: "bg-gray-300", text: "text-gray-900", emoji: "🥈", lugar: "2º" },
    { bg: "bg-orange-400", text: "text-orange-900", emoji: "🥉", lugar: "3º" },
  ];

  const top3 = ranking.slice(0, 3);

  podio.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          ${top3
            .map((jugador, index) => {
              const medalla = medallasColores[index];
              return `
              <div class="relative ${medalla.bg} rounded-2xl p-6 shadow-xl transform ${index === 0 ? "md:scale-110" : ""}">
                <div class="text-center">
                  <div class="text-6xl mb-3">${medalla.emoji}</div>
                  <h3 class="text-2xl font-bold ${medalla.text} mb-2">${escaparHTML(jugador.nombre)}</h3>
                  <div class="bg-white bg-opacity-70 rounded-xl p-4 space-y-2">
                    <p class="text-3xl font-black ${medalla.text}">⭐ ${jugador.puntos_totales}</p>
                    <p class="text-sm font-semibold ${medalla.text}">Nivel: ${jugador.nivel_actual}</p>
                    <p class="text-sm ${medalla.text}">Intentos: ${jugador.intentos_totales}</p>
                  </div>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
}

function renderizarTablaEstadisticas(ranking) {
  const tabla = document.getElementById("tabla-estadisticas");

  tabla.innerHTML = ranking
    .map(
      (jugador, index) => `
        <div class="bg-white rounded-xl p-4 flex justify-between items-center shadow hover:shadow-lg transition-all">
          <div class="flex items-center gap-4">
            <span class="text-2xl font-bold ${index < 3 ? "text-purple-700" : "text-gray-500"} w-8">
              ${index + 1}
            </span>
            <div>
              <h4 class="text-lg font-bold text-gray-800">${escaparHTML(jugador.nombre)}</h4>
              <p class="text-sm text-gray-600">Nivel alcanzado: ${jugador.nivel_actual}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-2xl font-bold text-yellow-600">⭐ ${jugador.puntos_totales}</p>
            <p class="text-xs text-gray-500">${jugador.intentos_totales} intentos</p>
            <p class="text-xs text-gray-500">Eficiencia: ${calcularEficiencia(jugador)}</p>
          </div>
        </div>
      `,
    )
    .join("");
}

function calcularEficiencia(jugador) {
  if (jugador.intentos_totales === 0) return "0%";
  const nivelBase = jugador.nivel_actual - 1;
  const intentosIdeales = nivelBase * 1;
  const eficiencia =
    intentosIdeales > 0
      ? Math.round((intentosIdeales / jugador.intentos_totales) * 100)
      : 100;
  return Math.min(eficiencia, 100) + "%";
}

function limpiarRespuesta() {
  monedasSoltadas = [];
  sumaActualCent = 0;
  document.getElementById("suma-actual").textContent = "0.00€";
  zonaSoltar.innerHTML =
    '<p class="text-gray-400 w-full text-center text-lg">Arrastra aquí las monedas</p>';
  document.getElementById("mensaje-feedback").classList.add("hidden");

  const btnSiguiente = document.getElementById("btn-siguiente-nivel");
  btnSiguiente.classList.add("hidden");

  const todasLasMonedas = document.querySelectorAll("#area-monedas .coin");
  todasLasMonedas.forEach((moneda) => {
    moneda.classList.remove("moneda-usada");
    moneda.style.opacity = "1";
    moneda.style.cursor = "grab";
  });
}

function iniciarNivel(nivel) {
  let cantidadAleatoria;
  if (dificultadJuego === "facil") {
    cantidadAleatoria = Math.floor(Math.random() * 8) + 1;
  } else {
    cantidadAleatoria = Math.round((Math.random() * 9.9 + 0.1) * 10) / 10;
  }

  objetivoActualCent = Math.round(cantidadAleatoria * 100);

  document.getElementById("cantidad-objetivo").textContent =
    (objetivoActualCent / 100).toFixed(2) + "€";

  sumaActualCent = 0;
  intentos = 0;
  monedasSoltadas = [];
  turnoPendiente = false;

  document.getElementById("nivel-actual").textContent = nivel;
  document.getElementById("suma-actual").textContent = "0.00€";
  document.getElementById("contador-intentos").textContent = "0";
  document.getElementById("mensaje-feedback").classList.add("hidden");

  const btnSiguiente = document.getElementById("btn-siguiente-nivel");
  btnSiguiente.classList.add("hidden");

  generarMonedas();
}

function generarMonedas() {
  const area = document.getElementById("area-monedas");
  area.innerHTML = "";

  if (dificultadJuego === "facil") {
    for (let i = 0; i < 8; i++) {
      area.appendChild(crearMoneda(100, `m1-${i}`));
    }
    for (let i = 0; i < 6; i++) {
      area.appendChild(crearMoneda(200, `m2-${i}`));
    }
  } else {
    for (let i = 0; i < 6; i++) {
      area.appendChild(crearMoneda(100, `m1-${i}`));
    }
    for (let i = 0; i < 5; i++) {
      area.appendChild(crearMoneda(200, `m2-${i}`));
    }
    for (let i = 0; i < 8; i++) {
      area.appendChild(crearMoneda(50, `m50-${i}`));
    }
    for (let i = 0; i < 10; i++) {
      area.appendChild(crearMoneda(20, `m20-${i}`));
    }
    for (let i = 0; i < 12; i++) {
      area.appendChild(crearMoneda(10, `m10-${i}`));
    }
  }
}

function crearMoneda(valorCent, id) {
  const moneda = document.createElement("div");
  moneda.classList.add("coin");
  moneda.draggable = true;

  moneda.dataset.valor = valorCent;
  moneda.dataset.id = id;

  let etiqueta = "";
  let claseMoneda = "";

  switch (valorCent) {
    case 200:
      etiqueta = "2€";
      claseMoneda = "coin-2";
      break;
    case 100:
      etiqueta = "1€";
      claseMoneda = "coin-1";
      break;
    case 50:
      etiqueta = "50¢";
      claseMoneda = "coin-50";
      break;
    case 20:
      etiqueta = "20¢";
      claseMoneda = "coin-20";
      break;
    case 10:
      etiqueta = "10¢";
      claseMoneda = "coin-10";
      break;
  }

  moneda.classList.add(claseMoneda);
  moneda.dataset.etiqueta = etiqueta;
  moneda.setAttribute("aria-label", etiqueta);

  moneda.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("moneda-usada")) {
      e.preventDefault();
      return;
    }
    monedaArrastrada = e.target;
    e.target.style.opacity = "0.5";
  });

  moneda.addEventListener("dragend", (e) => {
    e.target.style.opacity = "1";
    monedaArrastrada = null;
  });

  moneda.addEventListener("click", () => {
    if (moneda.classList.contains("moneda-usada")) return;

    const valorCent = parseInt(moneda.dataset.valor, 10);

    if (monedasSoltadas.some((m) => m.id === id)) return;

    sumaActualCent += valorCent;

    moneda.classList.add("moneda-usada");
    moneda.style.opacity = "0.3";
    moneda.style.cursor = "not-allowed";

    const nuevaMoneda = crearMoneda(valorCent, id);
    nuevaMoneda.style.cursor = "pointer";
    nuevaMoneda.title = "Click para quitar";
    nuevaMoneda.draggable = false;

    nuevaMoneda.addEventListener("click", () => quitarMoneda(id));

    const placeholder = zonaSoltar.querySelector("p");
    if (placeholder) placeholder.remove();

    zonaSoltar.appendChild(nuevaMoneda);
    monedasSoltadas.push({ id, valorCent });

    document.getElementById("suma-actual").textContent =
      (sumaActualCent / 100).toFixed(2) + "€";

    if (sumaActualCent <= objetivoActualCent) {
      const mensajes = [
        "¡Bien!",
        "¡Excelente!",
        "¡Muy bien!",
        "¡Genial!",
        "¡Perfecto!",
        "¡Sigue así!",
        "¡Vas bien!",
        "¡Buen trabajo!",
      ];
      hablar(mensajes[Math.floor(Math.random() * mensajes.length)]);
    } else {
      hablar("Cuidado, es demasiado");
    }
  });

  return moneda;
}

const zonaSoltar = document.getElementById("zona-soltar");

zonaSoltar.addEventListener("dragover", (e) => {
  e.preventDefault();
  zonaSoltar.classList.add("drag-over");
});

zonaSoltar.addEventListener("dragleave", () => {
  zonaSoltar.classList.remove("drag-over");
});

zonaSoltar.addEventListener("drop", (e) => {
  e.preventDefault();
  zonaSoltar.classList.remove("drag-over");

  if (!monedaArrastrada) return;

  const valorCent = parseInt(monedaArrastrada.dataset.valor, 10);
  sumaActualCent += valorCent;
  const id = monedaArrastrada.dataset.id;

  if (monedasSoltadas.some((m) => m.id === id)) return;

  monedaArrastrada.classList.add("moneda-usada");
  monedaArrastrada.style.opacity = "0.3";
  monedaArrastrada.style.cursor = "not-allowed";

  const nuevaMoneda = crearMoneda(valorCent, id);
  nuevaMoneda.style.cursor = "pointer";
  nuevaMoneda.title = "Click para quitar";
  nuevaMoneda.style.opacity = "1";
  nuevaMoneda.draggable = false;

  nuevaMoneda.addEventListener("click", () => quitarMoneda(id));

  const placeholder = zonaSoltar.querySelector("p");
  if (placeholder) placeholder.remove();

  zonaSoltar.appendChild(nuevaMoneda);
  monedasSoltadas.push({ id, valorCent });

  document.getElementById("suma-actual").textContent =
    (sumaActualCent / 100).toFixed(2) + "€";

  if (sumaActualCent <= objetivoActualCent) {
    const mensajesPositivos = [
      "¡Bien!",
      "¡Excelente!",
      "¡Muy bien!",
      "¡Genial!",
      "¡Perfecto!",
      "¡Sigue así!",
      "¡Vas bien!",
      "¡Buen trabajo!",
      "¡Fantástico!",
      "¡Increíble!",
      "¡Estupendo!",
      "¡Bravo!",
      "¡Lo estás haciendo bien!",
      "¡Magnífico!",
    ];
    const mensajeAleatorio =
      mensajesPositivos[Math.floor(Math.random() * mensajesPositivos.length)];
    hablar(mensajeAleatorio);
  } else {
    hablar("Cuidado, es demasiado");
  }
});

function quitarMoneda(id) {
  const moneda = monedasSoltadas.find((m) => m.id === id);
  if (!moneda) return;

  sumaActualCent -= moneda.valorCent;

  document.getElementById("suma-actual").textContent =
    (sumaActualCent / 100).toFixed(2) + "€";

  monedasSoltadas = monedasSoltadas.filter((m) => m.id !== id);

  const elemento = zonaSoltar.querySelector(`[data-id="${id}"]`);
  if (elemento) elemento.remove();

  const monedaOriginal = document.querySelector(
    `#area-monedas .coin[data-id="${id}"]`,
  );
  if (monedaOriginal) {
    monedaOriginal.classList.remove("moneda-usada");
    monedaOriginal.style.opacity = "1";
    monedaOriginal.style.cursor = "grab";
  }

  if (monedasSoltadas.length === 0) {
    zonaSoltar.innerHTML =
      '<p class="text-gray-400 w-full text-center text-lg">Arrastra aquí las monedas</p>';
  }
}

async function comprobarRespuesta() {
  intentos++;
  document.getElementById("contador-intentos").textContent = intentos;

  const feedback = document.getElementById("mensaje-feedback");
  const textoFeedback = document.getElementById("texto-feedback");
  const btnSiguiente = document.getElementById("btn-siguiente-nivel");

  if (sumaActualCent === objetivoActualCent) {
    const config = window.elementSdk?.config || defaultConfig;
    const puntos = Math.max(10 - intentos, 5);

    reproducirSonidoMonedas();
    crearMonedasCayendo();

    feedback.classList.remove("hidden");
    textoFeedback.className =
      "text-4xl font-bold mb-6 text-green-600 celebrate";
    textoFeedback.innerHTML = `${config.mensaje_exito || defaultConfig.mensaje_exito}<br><span class="text-yellow-500">+${puntos} puntos</span>`;

    hablar(
      `${config.mensaje_exito || defaultConfig.mensaje_exito}. Has ganado ${puntos} puntos`,
    );

    if (jugadorActual && todosJugadores.length < 999) {
      await window.dataSdk.update({
        ...jugadorActual,
        nivel_actual: Math.min(nivelActual + 1, NIVELES.length),
        puntos_totales: jugadorActual.puntos_totales + puntos,
        intentos_totales: jugadorActual.intentos_totales + intentos,
        turno_activo: false,
      });

      document.getElementById("puntos-actuales").textContent =
        jugadorActual.puntos_totales + puntos;
    }

    turnoPendiente = true;
    btnSiguiente.textContent = "Siguiente jugador →";
    btnSiguiente.classList.remove("hidden");

  } else {
    feedback.classList.remove("hidden");
    btnSiguiente.classList.add("hidden");

    if (sumaActualCent > objetivoActualCent) {
      textoFeedback.className = "text-4xl font-bold mb-6 text-orange-600 shake";
      textoFeedback.textContent = "¡Demasiado! Quita monedas";
      hablar("Demasiado, quita algunas monedas");
    } else {
      textoFeedback.className = "text-4xl font-bold mb-6 text-blue-600 shake";
      textoFeedback.textContent = "¡Te falta! Añade más";
      hablar("Te falta, añade más monedas");
    }

    setTimeout(() => {
      feedback.classList.add("hidden");
    }, 2000);
  }
}

document.getElementById("btn-nueva-partida").addEventListener("click", () => {
  if (todosJugadores.length === 0) {
    mostrarToast("⚠ Crea jugadores primero");
    return;
  }

  participantesSeleccionados = [];
  dificultadesSeleccionadas = {};
  document.getElementById("panel-seleccion").classList.remove("hidden");
  renderizarSeleccionParticipantes();
  actualizarBotonConfirmar();
});

document
  .getElementById("btn-continuar-partida")
  .addEventListener("click", () => {
    continuarPartidaActiva();
  });

document
  .getElementById("btn-confirmar-participantes")
  .addEventListener("click", iniciarPartida);

document
  .getElementById("btn-cancelar-seleccion")
  .addEventListener("click", () => {
    participantesSeleccionados = [];
    dificultadesSeleccionadas = {};
    document.getElementById("panel-seleccion").classList.add("hidden");
  });

document
  .getElementById("form-nuevo-jugador")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    if (todosJugadores.length >= 999) {
      mostrarToast("⚠ Límite de 999 jugadores alcanzado");
      return;
    }

    const input = document.getElementById("input-nombre");
    const nombre = input.value.trim();

    if (!nombre) return;

    const boton = e.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = "Creando...";

    const resultado = await window.dataSdk.create({
      id: "j_" + Date.now(),
      nombre: nombre,
      nivel_actual: 1,
      puntos_totales: 0,
      intentos_totales: 0,
      fecha_creacion: new Date().toISOString(),
      turno_activo: false,
      partida_id: "",
      orden_turno: 0,
    });

    boton.disabled = false;
    boton.textContent = "Crear";

    if (resultado.isOk) {
      input.value = "";
      mostrarToast("✅ Jugador creado");
      hablar(`Jugador ${nombre} creado`);
    } else {
      mostrarToast("❌ Error al crear jugador");
    }
  });

document.getElementById("btn-borrar-todos").addEventListener("click", () => {
  const modal = mostrarModal(`
        <h3 class="text-2xl font-bold mb-4 text-red-700">⚠ ¿Estás seguro?</h3>
        <p class="text-gray-600 mb-6">Se borrarán todos los jugadores y sus datos permanentemente.</p>
        <div class="flex gap-3">
          <button id="confirmar-borrado" class="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700">
            Sí, borrar todo
          </button>
          <button id="cancelar-borrado" class="flex-1 px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-400">
            Cancelar
          </button>
        </div>
      `);

  modal
    .querySelector("#confirmar-borrado")
    .addEventListener("click", async () => {
      for (const jugador of todosJugadores) {
        await window.dataSdk.delete(jugador);
      }
      modal.remove();
      mostrarToast("✓ Jugadores eliminados");
      hablar("Todos los jugadores han sido eliminados");
    });

  modal
    .querySelector("#cancelar-borrado")
    .addEventListener("click", () => modal.remove());
});

document.getElementById("btn-volver").addEventListener("click", () => {
  document.getElementById("pantalla-juego").classList.add("hidden");
  document.getElementById("pantalla-jugadores").classList.remove("hidden");
  document.getElementById("panel-seleccion").classList.add("hidden");

  mostrarToast("💾 Partida pausada - Los jugadores pueden continuar");
});

document
  .getElementById("btn-comprobar")
  .addEventListener("click", comprobarRespuesta);

document.getElementById("btn-reintentar").addEventListener("click", () => {
  monedasSoltadas = [];
  sumaActualCent = 0;
  document.getElementById("suma-actual").textContent = "0.00€";
  zonaSoltar.innerHTML =
    '<p class="text-gray-400 w-full text-center text-lg">Arrastra aquí las monedas</p>';
  document.getElementById("mensaje-feedback").classList.add("hidden");

  const todasLasMonedas = document.querySelectorAll("#area-monedas .coin");
  todasLasMonedas.forEach((moneda) => {
    moneda.classList.remove("moneda-usada");
    moneda.style.opacity = "1";
    moneda.style.cursor = "grab";
  });
});

document.getElementById("btn-pista").addEventListener("click", () => {
  const falta = objetivoActualCent - sumaActualCent;
  let pista = "";

  if (falta > 0) {
    const faltaEuros = falta / 100;
    const dos = Math.floor(falta / 200);
    const uno = Math.floor((falta % 200) / 100);
    const cincuenta = Math.floor((falta % 100) / 50);
    const veinte = Math.floor((falta % 50) / 20);
    const diez = (falta % 20) / 10;

    let partes = [];
    if (dos > 0) partes.push(`${dos} de 2€`);
    if (uno > 0) partes.push(`${uno} de 1€`);
    if (cincuenta > 0) partes.push(`${cincuenta} de 50¢`);
    if (veinte > 0) partes.push(`${veinte} de 20¢`);
    if (diez > 0) partes.push(`${diez} de 10¢`);

    pista = `💡 Te faltan ${faltaEuros.toFixed(2)}€. Necesitas: ${partes.join(", ")}`;
  } else if (falta < 0) {
    const sobraEuros = Math.abs(falta) / 100;
    pista = `💡 Sobran ${sobraEuros.toFixed(2)}€. Quita monedas`;
  } else {
    pista = "✓ ¡Perfecto! Pulsa Comprobar";
  }

  mostrarToast(pista);
});

document.getElementById("btn-pasar-turno").addEventListener("click", () => {
  const modal = mostrarModal(`
        <h3 class="text-2xl font-bold mb-4 text-gray-800">¿Pasar turno?</h3>
        <p class="text-gray-600 mb-6">El siguiente jugador tomará el turno</p>
        <div class="flex gap-3">
          <button id="confirmar-pasar" class="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">
            Sí, pasar
          </button>
          <button id="cancelar-pasar" class="flex-1 px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-400">
            Cancelar
          </button>
        </div>
      `);

  modal
    .querySelector("#confirmar-pasar")
    .addEventListener("click", async () => {
      await pasarTurno();
      modal.remove();
      actualizarEstadoTurno();
    });

  modal
    .querySelector("#cancelar-pasar")
    .addEventListener("click", () => modal.remove());
});

document
  .getElementById("btn-terminar-partida")
  .addEventListener("click", () => {
    const modal = mostrarModal(`
        <h3 class="text-2xl font-bold mb-4 text-purple-700">🏁 ¿Terminar partida?</h3>
        <p class="text-gray-600 mb-6">Se mostrarán las estadísticas finales y se terminará la partida.</p>
        <div class="flex gap-3">
          <button id="confirmar-terminar" class="flex-1 px-6 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700">
            Sí, ver estadísticas
          </button>
          <button id="cancelar-terminar" class="flex-1 px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-400">
            Cancelar
          </button>
        </div>
      `);

    modal
      .querySelector("#confirmar-terminar")
      .addEventListener("click", async () => {
        modal.remove();
        const boton = document.getElementById("btn-terminar-partida");
        boton.disabled = true;
        boton.textContent = "Finalizando...";
        await terminarPartida();
      });

    modal
      .querySelector("#cancelar-terminar")
      .addEventListener("click", () => modal.remove());
  });

document.getElementById("btn-volver-inicio").addEventListener("click", () => {
  document.getElementById("pantalla-estadisticas").classList.add("hidden");
  document.getElementById("pantalla-jugadores").classList.remove("hidden");
});

document
  .getElementById("btn-nueva-partida-stats")
  .addEventListener("click", () => {
    document.getElementById("pantalla-estadisticas").classList.add("hidden");
    document.getElementById("pantalla-jugadores").classList.remove("hidden");

    if (todosJugadores.length > 0) {
      participantesSeleccionados = [];
      dificultadesSeleccionadas = {};
      document.getElementById("panel-seleccion").classList.remove("hidden");
      renderizarSeleccionParticipantes();
      actualizarBotonConfirmar();
    }
  });

document.getElementById("btn-siguiente-nivel").addEventListener("click", async () => {
  if (turnoPendiente) {
    turnoPendiente = false;
    await pasarTurno();
  }
});

async function onConfigChange(config) {
  const titulo = document.getElementById("titulo-principal");
  const instrucciones = document.getElementById("texto-instrucciones");

  if (titulo) {
    titulo.textContent = config.titulo_juego || defaultConfig.titulo_juego;
  }

  if (instrucciones) {
    instrucciones.textContent =
      config.texto_instruccion || defaultConfig.texto_instruccion;
  }
}

async function inicializarApp() {
  if (!window.dataSdk) {
    mostrarToast("❌ Error: SDK no disponible");
    return;
  }

  const resultado = await window.dataSdk.init(dataHandler);

  if (!resultado.isOk) {
    mostrarToast("❌ Error al cargar datos");
    console.error("Error Data SDK:", resultado.error);
  }
}

if (window.elementSdk) {
  window.elementSdk.init({
    defaultConfig: defaultConfig,
    onConfigChange: onConfigChange,
    mapToCapabilities: () => ({
      recolorables: [],
      borderables: [],
      fontEditable: undefined,
      fontSizeable: undefined,
    }),
    mapToEditPanelValues: (config) =>
      new Map([
        ["titulo_juego", config.titulo_juego || defaultConfig.titulo_juego],
        [
          "texto_instruccion",
          config.texto_instruccion || defaultConfig.texto_instruccion,
        ],
        ["mensaje_exito", config.mensaje_exito || defaultConfig.mensaje_exito],
      ]),
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", inicializarApp);
} else {
  inicializarApp();
}

function generarMonedasFlotantes() {
  const container = document.getElementById("floating-coins-bg");
  const tipos = [
    { clase: "gold", valor: "1€" },
    { clase: "silver", valor: "2€" },
    { clase: "copper", valor: "50¢" },
  ];

  for (let i = 0; i < 25; i++) {
    const tipo = tipos[Math.floor(Math.random() * tipos.length)];
    const coin = document.createElement("div");
    coin.className = `floating-coin ${tipo.clase}`;
    coin.textContent = tipo.valor;
    coin.style.left = Math.random() * 100 + "%";
    coin.style.animationDuration = Math.random() * 25 + 20 + "s";
    coin.style.animationDelay = Math.random() * 8 + "s";

    container.appendChild(coin);
  }
}

generarMonedasFlotantes();