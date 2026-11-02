# Trivial Duelo — dos móviles en tiempo real

Juego web en español para 2 jugadores con 20 preguntas aleatorias (de un banco de 36), 20 segundos por pregunta y puntuación de 100 puntos por acierto. Ambos jugadores ven la misma pregunta y responden simultáneamente. Si ambos responden, se revela la solución inmediatamente; si no, se revela al acabar el tiempo. La siguiente pregunta aparece después de 4,5 segundos.

## Ejecutar en ordenador

Necesitas Node.js 18 o superior. En la carpeta del proyecto:

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

## Publicar para jugar en dos móviles (Render)

1. Crea una cuenta en GitHub y un repositorio nuevo.
2. Sube al repositorio `package.json`, `server.js`, `questions.json` y la carpeta `public`.
3. En https://render.com crea **New > Web Service**, conecta el repositorio.
4. Selecciona **Node**, comando de instalación `npm install` y comando de inicio `npm start`.
5. Cuando termine el despliegue, Render te proporcionará una URL `https://...onrender.com` (el nombre exacto depende de tu servicio).
6. Abre la URL en el móvil 1, introduce un nombre y pulsa **Crear sala**.
7. Pulsa **Compartir invitación** y envía el enlace al móvil 2. El segundo jugador introduce su nombre y pulsa **Unirse**. El anfitrión pulsa **Empezar partida**.

**Importante:** el servidor mantiene las partidas en memoria. Reiniciar el servidor termina las partidas activas. En planes gratuitos de hosting puede haber pausas de inactividad; el primer acceso puede tardar. El juego no admite reconexión de partidas interrumpidas. Para producción con alta disponibilidad sería necesario almacenamiento compartido y recuperación de sesiones.

## Probar en la misma red wifi

Con ambos móviles conectados a la misma wifi que el ordenador, abre `http://IP_LOCAL_DEL_ORDENADOR:3000` (permitiendo el puerto 3000 en el cortafuegos).

## Personalizar preguntas

Edita `questions.json`. Cada pregunta lleva `category`, `text`, `options` (4 respuestas), `correct` (índice 0–3) y `explanation`. Mantén al menos 20 preguntas.
