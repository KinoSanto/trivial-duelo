# Publicación sin modificar la versión activa durante la preparación

Estado observado el 2 de noviembre de 2026: el servicio `trivial-duelo`, ID `srv-dbkamkoae00c738b1opg`, está en Oregon, plan Free, publica la rama `main` con `npm install` y `npm start`. Último commit publicado observado: `2f6acf4a2956d2f12710762de7fade626c5c9b29`. La versión anterior no tenía historial persistente que migrar.

## Preparación del código

- Rama `feature/banco-2000-rotacion`, sin modificar `main`.
- Banco validado de 2000 preguntas y tres dificultades.
- Tabla nueva `trivia_rotation_v1`; creación idempotente durante el arranque.
- Arranque bloqueado en Render sin `DATABASE_URL`.
- Estado de salud que comprueba PostgreSQL.
- Pruebas del juego y del selector; prueba SQL con PGlite que cierra y reabre almacenamiento en disco.

La prueba SQL embebida no sustituye una prueba contra PostgreSQL real con varias conexiones. Esa comprobación forma parte de la validación de preproducción pendiente.

## Antes de publicar

1. El titular elige una base PostgreSQL persistente. No se ha creado ni contratado ninguna. Comprueba vencimiento, copias de seguridad y condiciones del plan. No pongas la URL de conexión en GitHub ni en capturas. El PostgreSQL gratuito de Render caduca a los 30 días.
2. Crea un **servicio web separado de prueba** conectado a esta rama. Mantén una sola instancia. No cambies la rama del servicio activo para hacer pruebas.
3. Configura `DATABASE_URL` como secreto del servicio nuevo, con la conexión y opciones TLS del proveedor. Añade `NODE_ENV=production`, `NODE_VERSION=22`, instalación `npm install` e inicio `npm start`. Configura `/health` como Health Check Path. Para instalación reproducible utiliza `pnpm install --frozen-lockfile`; se conservan los comandos npm originales por compatibilidad.
4. Comprueba `/health`: `ok: true`, `persistent: true`, `questions: 2000`. Sin base disponible, el despliegue nuevo debe fallar antes de servir. Esto no debe reemplazar el servicio activo.
5. Crea dos salas concurrentes con cuatro clientes y comprueba que sus primeros lotes no se solapan. Reinicia solo el servicio de prueba y comprueba que la rotación sigue. Repite cambiando dificultad. Verifica con un corte temporal de acceso a la base que no se inicia una partida sin reservar su historial.
6. Juega desde dos teléfonos: nombres iguales y distintos, enlace de invitación, tres dificultades, 20 rondas, contador de 20 s, respuesta simultánea, límite de dos jugadores, resultado y desconexión. La automatización comprueba gran parte del protocolo; esta revisión valida la experiencia móvil y el proveedor real.
7. Utiliza una base de pruebas distinta de producción: la tabla es global dentro de la base conectada y las pruebas consumen preguntas.

## Sustitución de la versión activa

Solo después de los pasos anteriores y de revisar los cambios:

1. Elige un momento sin partidas activas: la aplicación original no permite trasladar sesiones entre procesos. El despliegue de Render mantiene disponibilidad HTTP, pero no conserva las conexiones WebSocket ni salas en memoria. No se puede prometer continuidad de una partida activa durante el cambio.
2. Guarda el commit de retorno citado arriba y una copia de la nueva base. En Render, detén temporalmente el auto-despliegue del servicio activo para controlar el momento.
3. Combina la rama revisada en `main`. Configura los secretos/versión Node y el health check del servicio activo y despliega manualmente el commit aprobado. Cambiar variables también puede disparar un despliegue: coordínalo con el auto-despliegue desactivado y sin partidas activas.
4. Comprueba salud, acceso web y una partida de humo antes de anunciar la actualización. Reactiva el auto-despliegue si se desea.

## Retorno

Si la validación falla, usa Rollback al despliegue del commit `2f6acf4a2956d2f12710762de7fade626c5c9b29`. La versión anterior ignora la tabla nueva y `DATABASE_URL`. No borres esa tabla: permite volver a la actualización conservando el historial. El retorno restaura el banco original y su selección aleatoria; no ofrece la rotación nueva ni recupera partidas interrumpidas.

Documentación: [límites gratuitos](https://render.com/docs/free), [despliegues](https://render.com/docs/deploys), [PostgreSQL](https://render.com/docs/postgresql).
