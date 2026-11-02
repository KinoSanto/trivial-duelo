# Trivial Duelo

Dos jugadores en tiempo real, 20 preguntas por partida, 20 segundos por pregunta y 100 puntos por acierto. Se conserva el protocolo Socket.IO anterior con campos nuevos aditivos. Tras revelar se esperan 4,5 segundos. Una desconexión termina la partida, igual que antes.

## Banco de 2000 preguntas

| Categoría | Preguntas |
|---|---:|
| Historia | 200 |
| Geografía | 200 |
| Ciencia y naturaleza | 200 |
| Arte y literatura | 150 |
| Deportes | 150 |
| Entretenimiento y cultura general | 150 |
| Cine | 200 |
| Filosofía | 150 |
| CrossFit | 200 |
| Matemáticas | 200 |
| Gramática de inglés | 200 |

El anfitrión elige fácil, medio, difícil o mixto. Inglés incluye 100 ítems B1 y 100 B2. CrossFit tiene 100 preguntas técnicas y 100 situaciones de registro y cálculo. Matemáticas incluye 200 problemas de diez familias. Varias preguntas exploran facetas distintas de un tema: no se afirma que sean 2000 temas independientes.

Enunciados redactados para este proyecto, sin importar bancos de terceros. `content/` conserva las fichas editoriales. `python scripts/build-bank.py` reproduce el JSON de forma determinista. Los IDs dependen de categoría y enunciado: no cambies IDs al corregir únicamente una respuesta o explicación. Si cambias un enunciado, conserva manualmente su ID si quieres conservar su historial.

La validación comprueba recuentos, unicidad, opciones y niveles; no demuestra corrección factual. Consulta [CONTENT_REVIEW.md](CONTENT_REVIEW.md) para el alcance de la revisión.

## Arranque local

Node.js 22 o superior:

```sh
npm install
npm run validate
npm test
npm start
```

También se incluye `pnpm-lock.yaml`: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm start`. Python no es necesario para jugar o desplegar.

Abre `http://localhost:3000`. Sin `DATABASE_URL`, únicamente en desarrollo, se usa historial en memoria que se pierde al reiniciar. El programa no carga `.env` automáticamente: configura el entorno o usa `node --env-file=.env server.js` localmente. No compartas la URL de la base.

## Rotación persistente

En Render o con `NODE_ENV=production`, `DATABASE_URL` es obligatoria. No se sustituye silenciosamente por memoria ni por archivos efímeros. El proceso crea la tabla aditiva `trivia_rotation_v1`; no modifica tablas existentes. La cuenta necesita permisos para crearla y leer/escribir sus filas.

El historial es **global para todas las salas**, sin identificar personas ni almacenar sus nombres. Se reserva un lote al iniciar, dentro de una transacción con bloqueo de fila. Los inicios concurrentes no pueden reservar las mismas preguntas antes de agotar el conjunto. Las reservas de partidas abandonadas también se consumen para priorizar evitar repeticiones.

Mixto permite 100 partidas de 20 antes del reinicio, si solo se juega en ese modo. Los niveles comparten historial; cambiar de nivel no crea otro vacío. Si se agota el conjunto elegible para un nivel, se reinicia ese nivel y se conserva el historial de los demás. Una partida que cruza el límite consume primero las preguntas restantes y completa el lote desde el siguiente ciclo, sin duplicados internos. Después del límite pueden reaparecer preguntas de ciclos anteriores.

No es un historial por pareja: una pareja puede no ver preguntas consumidas por otra sala. Las partidas activas siguen en memoria y un reinicio las termina. Mantén una sola instancia de aplicación porque salas y temporizadores no se comparten entre procesos.

## Render

La conexión queda preparada **sin crear bases ni contratar servicios**. El titular elige PostgreSQL persistente. El PostgreSQL gratuito de Render caduca a los 30 días. No uses SQLite ni JSON en el contenedor para este historial. Configura TLS según el proveedor manteniendo la validación de certificados.

Sigue [DEPLOYMENT.md](DEPLOYMENT.md). No combines esta actualización en `main` antes de configurar y probar la base en un servicio separado. La versión publicada original es el punto de retorno.

`GET /health` devuelve 200 solo si el banco validado está cargado y la base responde; en producción incluye `persistent: true`. Una caída de base devuelve 503 e impide nuevas partidas. Las partidas ya reservadas pueden continuar durante el fallo.
