# Avión Party — servidor en internet

Esta carpeta es todo lo que necesita Render para poner Avión Party en internet.
Es el mismo servidor que corre adentro de la app Android, empaquetado con Docker.

## Subirlo (una sola vez, ~10 minutos, desde la compu)

1. **GitHub**: entrá a github.com (creá una cuenta si no tenés) → **New repository** →
   nombre `avion-party` → **Public** → Create.
   En el repo nuevo: **uploading an existing file** → arrastrá **todo lo que hay adentro de esta carpeta**
   (Dockerfile, LEEME.md, `web`, `src`, `desktop`) → **Commit changes**.
2. **Render**: entrá a render.com → **Get Started** → registrate con **GitHub**.
3. **New → Web Service** → elegí el repo `avion-party` (si no aparece: *Configure account* y dale acceso).
4. Completá:
   - **Language / Runtime**: Docker (lo detecta solo por el Dockerfile)
   - **Region**: *Virginia (US East)* si juegan desde Argentina · *Frankfurt* si juegan desde Europa
   - **Instance type**: **Free**
   - Lo demás como viene → **Deploy Web Service**.
5. Esperá a que diga **Live** (unos 5 minutos la primera vez). Arriba aparece la dirección,
   tipo `https://avion-party.onrender.com` (si el nombre estaba tomado le agrega letras al final).

## Usarlo

- En la app Android: **Invitar → 🌐 Jugar por internet** → pegá la dirección → *Pasar al modo internet*.
  Para volver: **Invitar → 📶 Volver al modo hotspot / wifi**.
- Desde cualquier celular o compu: abrí la dirección en el navegador, poné tu nombre y un **código de grupo**.
  Todos los que pongan el mismo código ven las mismas salas y el mismo chat. En **Invitar** está el link con
  el código ya incluido para mandárselo a los demás.

## A tener en cuenta

- El plan gratis **se duerme** si nadie lo usa durante 15 minutos: el primero que entra espera ~1 minuto.
  Mientras haya alguien con la app abierta se mantiene despierto.
- Alcanza para tenerlo prendido todo el mes (750 horas gratis por mes).
- Si cambiás algo del código, subí los archivos de nuevo al repo y Render lo actualiza solo.
- Para probarlo en una compu: `javac -d out src/com/franco/avionparty/core/*.java desktop/DesktopMain.java`
  y después `AVION_CLOUD=1 java -cp out DesktopMain web 8080`.
