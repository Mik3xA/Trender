/* Trender — cliente web (JavaScript sin dependencias).
 *
 * - La sesión (JWT) se guarda en localStorage y viaja como Bearer.
 * - Toda respuesta 401 o el botón "Cerrar sesión" llaman a reiniciarEstado(),
 *   que borra almacenamiento, estado en memoria y DOM, y vuelve al login.
 * - El contenido del usuario se pinta siempre con textContent (nunca innerHTML).
 */
'use strict';

(() => {
  const CLAVE_SESION = 'trender.session';
  const NOMBRES_CATEGORIA = { top: 'Top', bottom: 'Bottom', shoes: 'Zapatos' };
  const RUTAS = ['perfil', 'armario', 'visor'];

  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

  const estadoInicial = () => ({ usuario: null, perfil: null, prendas: [], filtro: '', modoAcceso: 'login' });
  let estado = estadoInicial();

  // ------------------------------------------------------------------ sesión

  function leerSesion() {
    try {
      const sesion = JSON.parse(localStorage.getItem(CLAVE_SESION));
      if (sesion?.token && new Date(sesion.expires_at) > new Date()) return sesion;
    } catch {
      /* JSON corrupto o almacenamiento bloqueado */
    }
    return null;
  }

  function guardarSesion(datos) {
    try {
      localStorage.setItem(CLAVE_SESION, JSON.stringify({ token: datos.token, expires_at: datos.expires_at }));
    } catch {
      /* sin almacenamiento: la sesión dura lo que la pestaña */
    }
    estado.token = datos.token;
  }

  // ------------------------------------------------------------------ API

  class ErrorApi extends Error {
    constructor(status, cuerpo) {
      const detalle = cuerpo?.errors?.map((e) => e.message).join(' · ');
      super(detalle || cuerpo?.error || 'No se pudo completar la operación');
      this.status = status;
    }
  }

  async function api(metodo, ruta, cuerpo) {
    const cabeceras = { Accept: 'application/json' };
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    if (estado.token) cabeceras.Authorization = `Bearer ${estado.token}`;

    let respuesta;
    try {
      respuesta = await fetch(ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    } catch {
      throw new ErrorApi(0, { error: 'Sin conexión con el servidor' });
    }
    const datos = await respuesta.json().catch(() => null);
    if (respuesta.status === 401 && estado.token) {
      reiniciarEstado(); // token revocado/expirado: vuelta al login limpio
    }
    if (!respuesta.ok) throw new ErrorApi(respuesta.status, datos);
    return datos.data;
  }

  // ------------------------------------------------------------------ logout / reset

  /** Restablece la interfaz por completo y muestra el login vacío. */
  function reiniciarEstado() {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* almacenamiento no disponible */
    }
    estado = estadoInicial();

    // Armario y visor: se vacía el DOM, no solo se oculta.
    $('#lista-prendas').replaceChildren();
    $('#visor').replaceChildren();
    $('#usuario-email').textContent = '';
    $$('form').forEach((f) => f.reset());
    $$('.aviso').forEach((a) => {
      a.textContent = '';
      if (a.classList.contains('aviso--error')) a.hidden = true;
    });
    marcarFiltro('');

    history.replaceState(null, '', location.pathname);
    $('#vista-app').hidden = true;
    mostrarLogin();
  }

  async function cerrarSesion() {
    const boton = $('#boton-logout');
    boton.disabled = true;
    try {
      await api('POST', '/api/auth/logout');
    } catch {
      /* aunque el servidor no responda, el cliente se limpia igual */
    } finally {
      boton.disabled = false;
      reiniciarEstado();
    }
  }

  // ------------------------------------------------------------------ login

  function mostrarLogin() {
    $('#vista-login').hidden = false;
    cambiarModoAcceso('login');
    $('#form-login input[name=email]').focus();
  }

  function cambiarModoAcceso(modo) {
    estado.modoAcceso = modo;
    $$('#vista-login [data-modo]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.modo === modo)));
    $('#login-enviar').textContent = modo === 'login' ? 'Entrar' : 'Crear cuenta';
    $('#form-login input[name=password]').autocomplete = modo === 'login' ? 'current-password' : 'new-password';
    ocultarError('#login-error');
  }

  async function enviarAcceso(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || password.length < 8) {
      mostrarError('#login-error', 'Introduce un email y una contraseña de al menos 8 caracteres.');
      return;
    }
    const boton = $('#login-enviar');
    boton.disabled = true;
    try {
      const ruta = estado.modoAcceso === 'login' ? '/api/auth/login' : '/api/auth/register';
      const datos = await api('POST', ruta, { email, password });
      guardarSesion(datos);
      form.reset();
      await iniciarApp();
    } catch (err) {
      mostrarError('#login-error', err.message);
    } finally {
      boton.disabled = false;
    }
  }

  // ------------------------------------------------------------------ app

  async function iniciarApp() {
    const { user, profile } = await api('GET', '/api/auth/me');
    estado.usuario = user;
    estado.perfil = profile;
    $('#usuario-email').textContent = user.email;
    $('#vista-login').hidden = true;
    $('#vista-app').hidden = false;
    if (!RUTAS.includes(rutaActual())) location.hash = '#/armario';
    else await navegar();
  }

  function rutaActual() {
    return location.hash.replace(/^#\//, '');
  }

  async function navegar() {
    if (!estado.token) return;
    const ruta = RUTAS.includes(rutaActual()) ? rutaActual() : 'armario';
    $$('.nav__item').forEach((a) => (a.dataset.ruta === ruta ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $$('.vista').forEach((v) => (v.hidden = v.dataset.vista !== ruta));
    $('#lienzo').focus();

    try {
      if (ruta === 'perfil') pintarPerfil();
      if (ruta === 'armario') await cargarArmario();
      if (ruta === 'visor') await pintarVisor();
    } catch (err) {
      if (err.status !== 401) console.error(err);
    }
  }

  // ------------------------------------------------------------------ perfil

  function pintarPerfil() {
    const form = $('#form-perfil');
    for (const campo of ['altura', 'pecho', 'cintura', 'cadera']) {
      form[campo].value = estado.perfil?.[campo] ?? '';
    }
  }

  async function guardarPerfil(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const aviso = $('#perfil-estado');
    const cambios = {};
    for (const campo of ['altura', 'pecho', 'cintura', 'cadera']) {
      const valor = form[campo].value.trim();
      cambios[campo] = valor === '' ? null : Number(valor);
    }
    aviso.classList.remove('aviso--error');
    aviso.textContent = 'Guardando…';
    try {
      estado.perfil = await api('PUT', '/api/profile', cambios);
      aviso.textContent = 'Medidas guardadas.';
    } catch (err) {
      aviso.classList.add('aviso--error');
      aviso.textContent = err.message;
    }
  }

  // ------------------------------------------------------------------ armario

  async function cargarArmario() {
    const consulta = estado.filtro ? `?category=${encodeURIComponent(estado.filtro)}` : '';
    const { items } = await api('GET', `/api/closet${consulta}`);
    estado.prendas = items;
    pintarArmario();
  }

  function pintarArmario() {
    const lista = $('#lista-prendas');
    lista.replaceChildren(...estado.prendas.map(crearTarjetaPrenda));
    $('#armario-vacio').hidden = estado.prendas.length > 0;
  }

  function crearTarjetaPrenda(prenda) {
    const item = document.createElement('li');
    item.className = 'prenda';

    const miniatura = document.createElement('div');
    miniatura.className = 'prenda__miniatura';
    miniatura.textContent = prenda.status === 'pending' ? 'Pendiente de recorte' : NOMBRES_CATEGORIA[prenda.category];

    let dominio = 'Prenda';
    try {
      dominio = new URL(prenda.source_url).hostname.replace(/^www\./, '');
    } catch {
      /* prenda sin link */
    }
    const titulo = document.createElement('p');
    titulo.className = 'prenda__dominio';
    titulo.textContent = dominio;

    const enlace = document.createElement('a');
    enlace.className = 'prenda__link';
    enlace.textContent = prenda.source_url ?? '';
    if (/^https?:\/\//.test(prenda.source_url ?? '')) enlace.href = prenda.source_url;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';

    const pie = document.createElement('div');
    pie.className = 'prenda__pie';

    const selector = document.createElement('select');
    selector.setAttribute('aria-label', 'Categoría');
    for (const [valor, nombre] of Object.entries(NOMBRES_CATEGORIA)) {
      selector.add(new Option(nombre, valor, false, valor === prenda.category));
    }
    selector.addEventListener('change', () => cambiarCategoria(prenda.id, selector));

    const insignia = document.createElement('span');
    insignia.className = `estado estado--${prenda.status}`;
    insignia.textContent = { pending: 'Pendiente', processing: 'Procesando', ready: 'Lista', failed: 'Error' }[prenda.status];

    const borrar = document.createElement('button');
    borrar.type = 'button';
    borrar.className = 'boton boton--texto';
    borrar.textContent = 'Eliminar';
    borrar.addEventListener('click', () => eliminarPrenda(prenda.id, borrar));

    pie.append(selector, insignia, borrar);
    item.append(miniatura, titulo, enlace, pie);
    return item;
  }

  async function agregarPorLink(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    const url = form.url.value.trim();
    ocultarError('#armario-error');
    if (!/^https?:\/\//i.test(url)) {
      mostrarError('#armario-error', 'Pega un link que empiece por http:// o https://');
      return;
    }
    const boton = $('button[type=submit]', form);
    boton.disabled = true;
    try {
      await api('POST', '/api/closet/add-from-link', { url, category: form.category.value });
      form.url.value = '';
      await cargarArmario();
    } catch (err) {
      mostrarError('#armario-error', err.message);
    } finally {
      boton.disabled = false;
    }
  }

  async function cambiarCategoria(id, selector) {
    selector.disabled = true;
    try {
      await api('PATCH', `/api/closet/${encodeURIComponent(id)}`, { category: selector.value });
      await cargarArmario();
    } catch (err) {
      mostrarError('#armario-error', err.message);
    } finally {
      selector.disabled = false;
    }
  }

  async function eliminarPrenda(id, boton) {
    boton.disabled = true;
    try {
      await api('DELETE', `/api/closet/${encodeURIComponent(id)}`);
      await cargarArmario();
    } catch (err) {
      boton.disabled = false;
      mostrarError('#armario-error', err.message);
    }
  }

  function marcarFiltro(filtro) {
    estado.filtro = filtro;
    $$('#filtro-armario [data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro)));
  }

  // ------------------------------------------------------------------ visor

  /** Silueta plana proporcional a las medidas guardadas (cm). */
  function crearSilueta({ altura, pecho, cintura, cadera }) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const alto = 200;
    // Ancho de cada sección ≈ circunferencia / π, escalado a la altura del lienzo.
    const escala = alto / altura;
    const ancho = (c) => (c / Math.PI) * escala * 1.15;
    const cx = 60;
    const y = (fraccion) => alto * (1 - fraccion);
    const hombros = ancho(pecho) * 1.12;

    svg.setAttribute('viewBox', `0 0 120 ${alto + 4}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Avatar de ${altura} cm`);

    const cuerpo = document.createElementNS(ns, 'path');
    const puntos = [
      [hombros / 2, y(0.82)],
      [ancho(pecho) / 2, y(0.72)],
      [ancho(cintura) / 2, y(0.62)],
      [ancho(cadera) / 2, y(0.52)],
      [ancho(cadera) / 2 * 0.9, y(0.47)],
    ];
    const derecha = puntos.map(([dx, py]) => `${cx + dx},${py}`).join(' L');
    const izquierda = puntos.slice().reverse().map(([dx, py]) => `${cx - dx},${py}`).join(' L');
    cuerpo.setAttribute('d', `M${derecha} L${izquierda} Z`);

    const piernaAncho = ancho(cadera) * 0.42;
    const piernas = document.createElementNS(ns, 'path');
    const yCadera = y(0.47);
    piernas.setAttribute(
      'd',
      `M${cx - ancho(cadera) / 2 * 0.9},${yCadera} L${cx - 2},${yCadera} L${cx - 3},${alto} L${cx - piernaAncho - 1},${alto} Z ` +
        `M${cx + 2},${yCadera} L${cx + ancho(cadera) / 2 * 0.9},${yCadera} L${cx + piernaAncho + 1},${alto} L${cx + 3},${alto} Z`
    );

    const brazos = document.createElementNS(ns, 'path');
    const yHombro = y(0.82);
    const yMuneca = y(0.48);
    brazos.setAttribute(
      'd',
      `M${cx - hombros / 2},${yHombro} L${cx - hombros / 2 - 9},${yMuneca} L${cx - hombros / 2 - 4},${yMuneca} L${cx - hombros / 2 + 3},${yHombro + 10} Z ` +
        `M${cx + hombros / 2},${yHombro} L${cx + hombros / 2 + 9},${yMuneca} L${cx + hombros / 2 + 4},${yMuneca} L${cx + hombros / 2 - 3},${yHombro + 10} Z`
    );

    const cabeza = document.createElementNS(ns, 'ellipse');
    cabeza.setAttribute('cx', cx);
    cabeza.setAttribute('cy', y(0.935));
    cabeza.setAttribute('rx', alto * 0.045);
    cabeza.setAttribute('ry', alto * 0.062);

    const cuello = document.createElementNS(ns, 'rect');
    cuello.setAttribute('x', cx - alto * 0.02);
    cuello.setAttribute('y', y(0.875));
    cuello.setAttribute('width', alto * 0.04);
    cuello.setAttribute('height', alto * 0.06);

    const suelo = document.createElementNS(ns, 'line');
    suelo.setAttribute('x1', 10);
    suelo.setAttribute('x2', 110);
    suelo.setAttribute('y1', alto + 2);
    suelo.setAttribute('y2', alto + 2);
    suelo.setAttribute('stroke', '#3d4038');

    for (const parte of [piernas, brazos, cuerpo, cuello, cabeza]) {
      parte.setAttribute('fill', '#6b7041');
      svg.append(parte);
    }
    svg.append(suelo);
    return svg;
  }

  function crearDato(valor, etiqueta) {
    const dato = document.createElement('div');
    dato.className = 'dato';
    const fuerte = document.createElement('strong');
    fuerte.textContent = valor;
    const texto = document.createElement('span');
    texto.textContent = etiqueta;
    dato.append(fuerte, texto);
    return dato;
  }

  async function pintarVisor() {
    const visor = $('#visor');
    const perfil = estado.perfil ?? {};
    const completo = ['altura', 'pecho', 'cintura', 'cadera'].every((c) => typeof perfil[c] === 'number');
    const { items } = await api('GET', '/api/closet');

    const escena = document.createElement('div');
    escena.className = 'visor__escena';
    if (completo) {
      escena.append(crearSilueta(perfil));
    } else {
      const aviso = document.createElement('p');
      aviso.className = 'vacio';
      aviso.append('Completa tus medidas en ');
      const enlace = document.createElement('a');
      enlace.href = '#/perfil';
      enlace.textContent = 'Perfil';
      aviso.append(enlace, ' para generar tu avatar.');
      escena.append(aviso);
    }

    const datos = document.createElement('div');
    datos.className = 'visor__datos';
    const cm = (v) => (typeof v === 'number' ? `${v} cm` : '—');
    datos.append(
      crearDato(cm(perfil.altura), 'Altura'),
      crearDato(cm(perfil.pecho), 'Pecho'),
      crearDato(cm(perfil.cintura), 'Cintura'),
      crearDato(cm(perfil.cadera), 'Cadera'),
      crearDato(String(items.length), 'Prendas en el armario')
    );
    visor.replaceChildren(escena, datos);
  }

  // ------------------------------------------------------------------ utilidades

  function mostrarError(selector, mensaje) {
    const el = $(selector);
    el.textContent = mensaje;
    el.hidden = false;
  }

  function ocultarError(selector) {
    const el = $(selector);
    el.textContent = '';
    el.hidden = true;
  }

  // ------------------------------------------------------------------ arranque

  document.addEventListener('DOMContentLoaded', () => {
    $$('#vista-login [data-modo]').forEach((b) => b.addEventListener('click', () => cambiarModoAcceso(b.dataset.modo)));
    $('#form-login').addEventListener('submit', enviarAcceso);
    $('#form-perfil').addEventListener('submit', guardarPerfil);
    $('#form-link').addEventListener('submit', agregarPorLink);
    $('#boton-logout').addEventListener('click', cerrarSesion);
    $$('#filtro-armario [data-filtro]').forEach((b) =>
      b.addEventListener('click', () => {
        marcarFiltro(b.dataset.filtro);
        cargarArmario().catch(() => {});
      })
    );
    window.addEventListener('hashchange', navegar);

    const sesion = leerSesion();
    if (!sesion) {
      reiniciarEstado();
      return;
    }
    estado.token = sesion.token;
    iniciarApp().catch(() => reiniciarEstado());
  });
})();
