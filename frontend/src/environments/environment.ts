export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  /** Mapa HDRI opcional para la iluminación (p. ej. '/hdri/estudio.hdr' en public/). null = estudio procedimental. */
  hdri: null as string | null,
  /** Avatares .glb realistas opcionales (ver motor-3d/avatar-glb.ts). null = cuerpo paramétrico. */
  avatares: { Femenino: null as string | null, Masculino: null as string | null },
};
