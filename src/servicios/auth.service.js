const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const { crearUsuario, obtenerUsuarioPorEmail } = require('./db.service');

const scrypt = promisify(crypto.scrypt);

const OTP_DEMO = '123456';
const OTP_DELAY_MS = 1000;
const TOKEN_EXPIRATION = '7d';

function obtenerSecreto() {
  const secreto = process.env.JWT_SECRET;

  if (secreto) {
    return secreto;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }

  return 'trender-demo-secret';
}

function normalizarEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function nombreDesdeEmail(email) {
  const base = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base
    .split(' ')
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ') || 'Usuario Trender';
}

function serializarUsuario(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre || nombreDesdeEmail(usuario.email),
    email: usuario.email,
    creadoEn: usuario.created_at
  };
}

function firmarToken(usuario) {
  return jwt.sign(
    {
      email: usuario.email,
      nombre: usuario.nombre || nombreDesdeEmail(usuario.email)
    },
    obtenerSecreto(),
    { subject: usuario.id, expiresIn: TOKEN_EXPIRATION }
  );
}

function crearSesion(usuario) {
  return {
    token: firmarToken(usuario),
    user: serializarUsuario(usuario)
  };
}

function crearUsuarioTemporal(email, prefijo) {
  const id = `${prefijo}_${crypto
    .createHash('sha256')
    .update(email)
    .digest('hex')
    .slice(0, 24)}`;

  return {
    id,
    email,
    nombre: nombreDesdeEmail(email)
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivada = await scrypt(password, salt, 64);
  return `${salt}:${derivada.toString('hex')}`;
}

async function passwordCoincide(password, passwordHash) {
  try {
    const [salt, hash] = String(passwordHash ?? '').split(':');
    if (!salt || !hash) {
      return false;
    }

    const derivada = await scrypt(password, salt, 64);
    const esperada = Buffer.from(hash, 'hex');

    return esperada.length === derivada.length && crypto.timingSafeEqual(esperada, derivada);
  } catch {
    return false;
  }
}

async function solicitarCodigo(email) {
  await new Promise((resolve) => setTimeout(resolve, OTP_DELAY_MS));
  return { email: normalizarEmail(email) };
}

function verificarCodigo(email, codigo) {
  if (String(codigo ?? '').trim() !== OTP_DEMO) {
    return null;
  }

  return crearSesion(crearUsuarioTemporal(normalizarEmail(email), 'otp'));
}

async function registrarUsuario({ nombre, email, password }) {
  const correo = normalizarEmail(email);
  const nombreUsuario = String(nombre ?? '').trim();

  if (!nombreUsuario) {
    const error = new Error('nombre es requerido');
    error.statusCode = 400;
    throw error;
  }

  if (obtenerUsuarioPorEmail(correo)) {
    const error = new Error('El correo ya está registrado');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await hashPassword(password);

  try {
    const usuario = crearUsuario({
      nombre: nombreUsuario,
      email: correo,
      passwordHash
    });

    return crearSesion(usuario);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const duplicado = new Error('El correo ya está registrado');
      duplicado.statusCode = 409;
      throw duplicado;
    }
    throw error;
  }
}

async function iniciarSesion({ email, password }) {
  const usuario = obtenerUsuarioPorEmail(normalizarEmail(email));

  if (!usuario || !(await passwordCoincide(password, usuario.password_hash))) {
    return null;
  }

  return crearSesion(usuario);
}

function obtenerPerfil(token) {
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, obtenerSecreto());

    if (!payload || typeof payload !== 'object' || !payload.sub || !payload.email) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      nombre: payload.nombre || nombreDesdeEmail(payload.email)
    };
  } catch {
    return null;
  }
}

module.exports = {
  solicitarCodigo,
  verificarCodigo,
  registrarUsuario,
  iniciarSesion,
  obtenerPerfil
};
