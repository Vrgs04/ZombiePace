# Zombie Pace

Zombie Pace es una PWA móvil para iPhone que convierte una caminata, trote o carrera en una sesión de supervivencia visual. Usa Leaflet.js con OpenStreetMap, geolocalización del navegador y zombies simulados que se acercan lentamente al usuario.

## Funciones

- Pantalla inicial con modo, dificultad y aviso de seguridad.
- Mapa casi completo con ubicación real del usuario.
- Zombies rojos generados entre 80 y 220 metros del usuario.
- Movimiento gradual de zombies hacia la ubicación actual.
- Vidas, puntos, tiempo, distancia, velocidad y zombie más cercano.
- Alerta visual cuando un zombie está a menos de 50 metros.
- Pérdida de vida si un zombie llega a menos de 20 metros.
- Aumento ligero de dificultad cada 2 minutos.
- Resumen final e historial local de las últimas 10 sesiones.
- Manifest y service worker básico para instalación como PWA.

## Uso local

Abre la carpeta con un servidor estático. Por ejemplo:

```bash
npx serve .
```

La geolocalización requiere HTTPS o `localhost`. Para probar en iPhone, sube el proyecto a Cloudflare Pages o usa un túnel HTTPS.

## Cloudflare Pages

1. Sube este repositorio o carpeta a GitHub.
2. Crea un proyecto en Cloudflare Pages.
3. Configura el build command vacío.
4. Configura el output directory como `/` o deja la configuración estática por defecto.

## Seguridad

La app no entrega rutas, objetivos físicos ni instrucciones para cruzar calles. Los zombies son únicamente presión visual. El usuario debe mantenerse atento a su entorno y evitar zonas peligrosas.

## Archivos

- `index.html`: estructura de la app y carga de Leaflet.
- `styles.css`: diseño mobile first, oscuro y tipo app.
- `app.js`: geolocalización, mapa, zombies, sesión, puntos e historial.
- `manifest.json`: configuración PWA.
- `service-worker.js`: cache básico de archivos locales y librería CDN.
- `icons/`: iconos para instalación.
"# ZombiePace" 
