# Cómo instalar OpenReply (versión parchada de Ramtoid)

OpenReply manda un DM automático cuando alguien comenta una palabra clave en tu post de Instagram. Esta guía es para hacerlo sin saber programar. Sigue los pasos en orden.

**Regla de oro:** las llaves y contraseñas solo se pegan en las pantallas de Vercel, Railway, Resend y Meta. Nunca en un chat, ni siquiera con Claude. Si pegaste una por error, cámbiala por una nueva.

## Antes de empezar

### Las piezas

| Pieza | Qué hace | Dónde vive |
| --- | --- | --- |
| Web | El panel, y recibe los avisos de Instagram | Vercel |
| Worker | El programa que manda los DMs, prendido todo el día | Railway |
| Postgres | Guarda campañas y registros | Railway |
| Redis | La fila de mensajes y los límites por hora | Railway |
| Resend | Manda el correo para entrar al panel (no hay contraseña) | Resend |

### Cuánto cuesta (estimado, noviembre de 2026)

| Servicio | Plan | Costo al mes |
| --- | --- | --- |
| Vercel | Pro. Hobby es gratis pero solo para uso personal, sin fines comerciales, y Ramtoid es un negocio | US$20 por persona con acceso de desarrollador |
| Railway | Hobby: US$5 que incluyen US$5 de uso, y lo demás se cobra aparte | US$5 a 15 (estimado: no medí el consumo real) |
| Resend | Gratis: 3,000 correos al mes, 100 al día | US$0 |
| GitHub y Meta | Gratis | US$0 |
| **Total estimado** | | **US$25 a 35** |

Railway cobra por uso: unos US$10 por GB de memoria al mes, US$20 por vCPU y US$0.15 por GB de disco. Revisa tu consumo en Railway a la semana de arrancar.

Precios: [Vercel](https://vercel.com/pricing), [Railway](https://railway.com/pricing), [Resend](https://resend.com/pricing). Confírmalos antes de pagar.

**Alternativa más barata:** un servidor propio con todo adentro (web, worker, Postgres y Redis), desde unos 7 euros al mes en [Hetzner](https://www.hetzner.com/cloud/), siguiendo `docs/deploy-dokploy.md`. Te ahorras Vercel Pro, pero te toca a ti mantenerlo, hacer respaldos y correr las tareas programadas. Tu plan actual de Hostinger no sirve porque no es VPS. Mientras no tengas quien lo cuide, usa el camino de esta guía.

### Qué necesitas

- Tu cuenta de Instagram como Empresa o Creador. Una personal no se puede conectar.
- **Una segunda cuenta de Instagram** para la prueba final, porque OpenReply ignora tus propios comentarios.
- Un bloc de notas privado en tu computadora para ir guardando las llaves.

### Qué cambia en esta versión

- Al activar una campaña, solo responde comentarios nuevos. Nunca los viejos.
- Máximo 200 DMs y 200 respuestas públicas por hora, por cuenta de Instagram.
- Sin `ALLOWED_EMAILS`, nadie puede entrar al panel.
- `/api/health` sin sesión solo dice `ok` o `degraded`.
- Diagnóstico solo para dueños y administradores.

---

## Paso 1. Revisa Meta antes de pagar nada (10 minutos, gratis)

**No te saltes este paso.** Puede cambiar todo tu plan.

Desde octubre de 2026 hay reportes ([issue #104](https://github.com/diwenne/openreply/issues/104)) de que las apps nuevas de Meta solo ofrecen **"API setup with Unified login"**. OpenReply solo funciona con **"API setup with Instagram login"**. Yo no pude comprobarlo, porque requiere crear la app en tu cuenta.

1. Entra a [developers.facebook.com/apps](https://developers.facebook.com/apps) y crea tu cuenta de desarrollador si te la pide.
2. Pulsa **Create App**. Como caso de uso elige **Manage messaging and content on Instagram** (filtra por "All" si no lo ves). Tipo: **Business**. No elijas anuncios ni Facebook Login.
3. Dentro de la app, abre el producto de Instagram y busca cómo se llama la pantalla de configuración.

| Lo que ves | Qué hacer |
| --- | --- |
| **API setup with Instagram login** | Perfecto. Sigue al paso 2. |
| Solo **API setup with Unified login** | Detente, no pagues nada todavía. Lee abajo. |

**Si solo aparece Unified login, tienes dos salidas:**

- **Usar [Zernio](https://zernio.com/pricing)** en lugar de tu propia app de Meta. Las primeras 2 cuentas y 10,000 mensajes al mes son gratis. Luego cuesta US$6 al mes por cuenta, de la 3 a la 10. Sigue esta guía, sáltate los pasos 8 y 9, y conecta la cuenta con `docs/zernio.md`. Ojo: Zernio es un tercero que maneja tus mensajes, y patrocina a OpenReply.
- **Esperar o pedir un cambio de código.** En el issue alguien lo resolvió agregando el permiso `business_management`, pero en su propia integración. OpenReply usa otras direcciones de Meta, así que ese truco solo no basta: hay que programar el soporte. Yo no lo hice.

**No reutilices la app de Meta de RAMTOID BOT.** Una app tiene una sola dirección de webhook, y al cambiarla dejarías sin avisos al bot.

---

## Paso 2. Crea las cuentas

| Cuenta | Link | Nota |
| --- | --- | --- |
| GitHub | [github.com/signup](https://github.com/signup) | Guarda aquí tu copia del código |
| Vercel | [vercel.com/signup](https://vercel.com/signup) | Entra con GitHub y usa el plan Pro |
| Railway | [railway.com](https://railway.com) | Entra con GitHub. Si dice "Limited Trial", verifícate en [railway.com/verify](https://railway.com/verify), o el worker no podrá hablar con Instagram |
| Resend | [resend.com/signup](https://resend.com/signup) | Para el correo de acceso |
| Meta for Developers | [developers.facebook.com/apps](https://developers.facebook.com/apps) | Ya la hiciste en el paso 1 |

---

## Paso 3. Crea tu copia en GitHub y sube los parches

1. Abre [github.com/diwenne/openreply](https://github.com/diwenne/openreply), pulsa **Fork** y luego **Create fork**. Debe quedar `TU-USUARIO/openreply`.
2. Abre **Git Bash** en tu computadora y pega esto, cambiando `TU-USUARIO`:

   ```bash
   cd "/c/Users/rault/Desktop/claude 3/herramientas-bots/openreply"
   git remote add mio https://github.com/TU-USUARIO/openreply.git
   git push mio ramtoid-parches
   ```

   Si se abre una ventana para entrar a GitHub, acéptala.
3. En tu fork, ve a **Settings > General > Default branch**, cambia `main` por `ramtoid-parches` y confirma. Así Vercel y Railway toman los parches sin que hagas nada más.

**Cuidado:** tu fork es público. Es normal, porque el código ya lo es y no lleva llaves. Si GitHub te ofrece "Sync fork" con la opción **Discard commits**, no la uses: borraría los parches.

---

## Paso 4. Genera tus secretos

En Git Bash, corre este comando **4 veces** y guarda cada resultado en tu bloc de notas:

```bash
openssl rand -hex 32
```

Uno para cada nombre: `NEXTAUTH_SECRET`, `CRON_SECRET`, `ENCRYPTION_KEY` y `WEBHOOK_VERIFY_TOKEN`.

**`ENCRYPTION_KEY` no se cambia nunca y debe ser igual en Vercel y en Railway.** Si la cambias, tendrás que reconectar Instagram.

### Las variables

| Variable | Qué poner | Vercel | Railway (worker) |
| --- | --- | --- | --- |
| `NEXTAUTH_URL` | Tu dirección, por ejemplo `https://tu-app.vercel.app`, sin barra al final (la tendrás en el paso 6) | Sí | Sí |
| `NEXTAUTH_SECRET` | Generado | Sí | Sí |
| `CRON_SECRET` | Generado | Sí | Sí |
| `ENCRYPTION_KEY` | Generado, **idéntico en los dos** | Sí | Sí |
| `DATABASE_URL` | De Railway | La **pública** | La **interna** |
| `REDIS_URL` | De Railway | La **pública** | La **interna** |
| `RESEND_API_KEY` | De Resend | Sí | Sí |
| `EMAIL_FROM` | Remitente de los correos | Sí | Sí |
| `ALLOWED_EMAILS` | **Obligatorio.** Los correos que pueden entrar, separados por coma | Sí | Sí |
| `META_GRAPH_API_VERSION` | `v25.0` | Sí | Sí |
| `INSTAGRAM_APP_ID` | De Meta (paso 8) | Sí | Sí |
| `INSTAGRAM_APP_SECRET` | De Meta (paso 8) | Sí | Sí |
| `FACEBOOK_APP_SECRET` | De Meta (paso 8) | Sí | Sí |
| `WEBHOOK_VERIFY_TOKEN` | Generado | Sí | Sí |

Opcionales, solo en el worker: `DM_RATE_LIMIT_PER_HOUR` y `PUBLIC_REPLY_RATE_LIMIT_PER_HOUR`. Si no las pones, valen 200. El máximo que acepta es 750. No las subas sin necesidad.

### Prepara Resend

1. Crea una llave en [resend.com/api-keys](https://resend.com/api-keys). Esa es tu `RESEND_API_KEY`.
2. Elige el remitente:
   - **Con dominio propio (recomendado):** verifícalo en [resend.com/domains](https://resend.com/domains) y usa algo como `OpenReply <login@tudominio.com>`.
   - **Sin dominio, para probar:** usa `OpenReply <onboarding@resend.dev>`. Solo llega al correo de tu cuenta de Resend, así que ese debe ser tu `ALLOWED_EMAILS`.

---

## Paso 5. Railway: base de datos, Redis y worker

1. En [railway.com](https://railway.com) crea un proyecto vacío.
2. Pulsa **New > Database > Add PostgreSQL**.
3. Pulsa **New > Database > Add Redis**.
4. Copia a tu bloc de notas estas direcciones reales (con el ojito, nunca las que dicen `${{...}}`):

   | Dónde | Variable | Para qué |
   | --- | --- | --- |
   | Postgres | `DATABASE_PUBLIC_URL` | `DATABASE_URL` de Vercel |
   | Postgres | `DATABASE_URL` (`postgres.railway.internal`) | `DATABASE_URL` del worker |
   | Redis | `REDIS_PUBLIC_URL` | `REDIS_URL` de Vercel |
   | Redis | `REDIS_URL` (`redis.railway.internal`) | `REDIS_URL` del worker |

5. Pulsa **New > GitHub Repo** y elige tu fork. Revisa en **Settings > Source** que la rama sea `ramtoid-parches`.
6. En **Settings** de ese servicio pon:

   ```
   Build Command:  npm run db:generate
   Start Command:  npm run worker
   ```

   El repo trae un `Dockerfile`, y Railway lo usa si lo detecta. Si en los registros de construcción ves `Using detected Dockerfile!`, es normal: va a tardar más, pero no pasa nada. Lo que sí debe quedar es el **Start Command** `npm run worker`. Sin él arrancaría la web en lugar del worker. Esta parte no la pude probar en Railway.
7. En **Variables** pega las de la tabla, con las direcciones **internas**. Las de Meta y `NEXTAUTH_URL` las agregas después.
8. **Antes de que termine la prueba gratis** (30 días o US$5), pasa al plan Hobby. Si no, los servicios se apagan y después Railway puede borrar la base de datos.

El worker puede marcar errores hasta que el paso 6 cree las tablas. Es normal.

---

## Paso 6. Vercel: la web

1. En [vercel.com](https://vercel.com) pulsa **Add New > Project** e importa tu fork.
2. Abre **Environment Variables** y pega las de la tabla, con las direcciones **públicas**. Márcalas para todos los entornos.
3. Pulsa **Deploy**. Las tablas de la base de datos se crean solas en este paso.
4. Copia tu dirección (`https://tu-app.vercel.app`).
5. Agrega `NEXTAUTH_URL` con esa dirección, sin barra al final, y pulsa **Redeploy**.
6. Agrega `NEXTAUTH_URL` también al worker en Railway y reinícialo.

---

## Paso 7. Revisa que todo responda

Abre `https://tu-app.vercel.app/api/health` en el navegador.

| Lo que ves | Qué significa |
| --- | --- |
| `{"status":"ok"}` | Base de datos, Redis, fila y worker están bien |
| `{"status":"degraded"}` | Algo falla. Entra al panel y vuelve a abrir la página para ver qué |
| Se queda cargando o marca error 504 | Casi seguro la web no alcanza a Redis. Revisa que `REDIS_URL` en Vercel sea la **pública** |

Luego entra a `https://tu-app.vercel.app` con un correo de `ALLOWED_EMAILS` y abre el enlace que te llega (revisa spam). Debes ver el panel con Dashboard, Campaigns y DM Logs.

Si ya entraste, `/api/health` te muestra el detalle:

- `checks.database.status` y `checks.redis.status` deben decir `ok`.
- `checks.queue.status` debe decir `ok`.
- `checks.worker.healthy` debe decir `true`. Si dice `false`, el worker está apagado y **no saldrá ningún DM**, aunque los avisos de Instagram lleguen.

Los mensajes de error completos ya no aparecen aquí: están en los registros (Logs) de Vercel.

---

## Paso 8. Agrega las llaves de Meta

En tu app de Meta:

| Variable | Dónde está |
| --- | --- |
| `INSTAGRAM_APP_ID` | Instagram > API setup with Instagram login. No es el App ID de la página Basic |
| `INSTAGRAM_APP_SECRET` | La misma página, pulsa **Show** |
| `FACEBOOK_APP_SECRET` | App settings > Basic > App secret, pulsa **Show** |

Agrégalas en Vercel y en Railway junto con `WEBHOOK_VERIFY_TOKEN`. Haz **Redeploy** en Vercel y reinicia el worker.

---

## Paso 9. Configura la app de Meta e Instagram

Cambia `tu-app.vercel.app` por tu dirección en todos los pasos.

### Tester: se hace en los dos lados

Sin esto sale el error `Insufficient Developer Role`.

1. **En Meta:** App roles > Roles > Instagram testers. Agrega el usuario exacto de tu cuenta de Instagram y manda la invitación.
2. **En Instagram:** desde el celular y con esa cuenta, ve a tu perfil > menú > Configuración > Apps y sitios web > **Invitaciones de tester** y acéptala. Los nombres pueden variar un poco según la versión.

Repítelo con cada cuenta tuya que quieras conectar.

### Dirección de regreso (OAuth)

En Instagram > Set up Instagram business login > Business login settings, agrega esto en **OAuth redirect URIs**, sin barra final:

```
https://tu-app.vercel.app/api/instagram/callback
```

### Webhook y suscripciones

En el paso **Configure webhooks** del producto Instagram:

1. **Callback URL:** `https://tu-app.vercel.app/api/webhook`
2. **Verify token:** tu `WEBHOOK_VERIFY_TOKEN`
3. Pulsa **Verify and save**. Si el botón está gris, vuelve a pegar el token.
4. Suscríbete a **`comments`** y a **`messages`**. Sin `messages` no funciona responder por DM ni a historias.

### Permisos

OpenReply pide estos permisos al conectar la cuenta:

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`
- `instagram_business_manage_insights`

Para tus propias cuentas con rol de tester no necesitas App Review.

### Publica la app

**Sin publicarla no llegan los comentarios reales.** Es el motivo más común de "hice todo y no pasa nada".

1. Entra a **Publish** en el menú izquierdo.
2. Llena las direcciones legales. OpenReply ya las trae:

   ```
   https://tu-app.vercel.app/privacy
   https://tu-app.vercel.app/terms
   https://tu-app.vercel.app/data-deletion
   ```

   Léelas antes y ajústalas si vas a operar como Ramtoid.
3. Publica. Si Meta te pide App Review para tus propias cuentas, avísale a Claude antes de seguir.

Publicar no abre la app a todo el mundo: solo funcionan las cuentas con rol.

### Conecta Instagram

1. En tu panel ve a **Settings > Connect using your own Meta app**, entra con tu cuenta y acepta. Debe decir **Connected**.
2. **Si esa cuenta usó ManyChat u otra herramienta alguna vez:** desconéctala desde esa herramienta. Luego, en [Meta Business Suite](https://business.facebook.com), ve a Settings > Integrations > **Conversation routing** > Partner apps > **Manage** en tu app, y activa **Access all conversations** y **Take control of conversations**.

---

## Paso 10. Prueba final

1. En **Campaigns** crea una campaña en un post tuyo, con la palabra `TEST`, un mensaje y un enlace con **+ Add A Link**. No pegues la URL en el texto.
2. Pulsa **Go Live**.
3. **Desde tu otra cuenta**, comenta `TEST` en ese post. Debe ser un comentario nuevo, hecho después de activar: los anteriores se ignoran a propósito.
4. Espera el DM. Si esa cuenta no te sigue, llega a **Solicitudes de mensajes**.
5. Abre **DM Logs**: la fila debe decir **Sent**.
6. Abre `/api/health`: debe decir `ok`.

Una prueba extra que vale la pena: comenta `TEST` desde tu otra cuenta con la campaña en pausa, actívala, espera 10 minutos y confirma que **no** llegó ningún DM.

Si no llega nada:

| Síntoma | Causa probable |
| --- | --- |
| DM Logs vacío | La app no está publicada, falta `comments`, o comentaste desde tu misma cuenta |
| `/api/health` dice `degraded` | Entra y revisa `checks.worker.healthy`. Casi siempre es el worker |
| `Insufficient Developer Role` | Falta aceptar la invitación en Instagram |
| `not the thread owner` | Otra herramienta sigue dueña de las conversaciones. Ve a Conversation routing |
| `Unsupported request - method type: get` | Esa cuenta no tiene rol de tester |
| `getaddrinfo ENOTFOUND $` | Pegaste `${{...}}` en vez de la dirección real |
| `callback URL or verify token couldn't be validated` | La web no está desplegada, la URL no termina en `/api/webhook`, o el token no coincide |
| El correo de acceso no llega o marca acceso negado | Tu correo no está en `ALLOWED_EMAILS`, o el remitente no está verificado en Resend |
| DMs repetidos | Hay dos workers. Ve a Advertencias |

---

## Advertencias importantes

- **Una cuenta, una sola herramienta.** Nunca uses OpenReply junto con ManyChat ni con RAMTOID BOT en la misma cuenta de Instagram. Pueden responder dos veces y pelearse las conversaciones.
- **Un solo worker.** Dos workers duplican mensajes. Si cambias de servicio en Railway, borra el viejo completo, no solo su despliegue. No subas réplicas. No corras `npm run worker` en tu computadora apuntando a la base de producción.
- **Cuentas de clientes.** Sin App Review, solo funcionan cuentas con rol en tu app. Para clientes necesitas una de estas:
  - **App Review de Meta:** video del flujo completo, justificación de cada permiso (borradores en `META_APP_REVIEW.md`) y verificación de negocio con documentos. Suelen rechazar la primera vez.
  - **Zernio:** servicio de pago de un tercero, sin revisión de tu parte.

  No uses el rol de tester como atajo para clientes. Empieza con tus cuentas.
- **Respeta las normas de Meta.** Responde solo a quien pidió algo con su comentario. Nada de spam ni de promesas engañosas. Instagram permite una sola respuesta privada por comentario, y sus límites aplican con cualquier herramienta. Una cuenta restringida no se arregla con software. Consulta las [normas de la plataforma de Meta](https://developers.facebook.com/terms/) y, si vas a guardar datos de clientes, revisa tu aviso de privacidad con quien te asesore.
- **Si cambias de dominio,** actualiza `NEXTAUTH_URL` en Vercel y en Railway, la dirección de regreso y el webhook en Meta.

### Si aparece Unified login (issue #104)

Puede pasarte al crear la app (paso 1) o más adelante. Señales:

- Meta solo te ofrece "API setup with Unified login".
- Al iniciar sesión, la dirección usa `facebook.com/dialog/oauth` con `config_id`.
- Errores `code 100, subcode 33`.

Qué hacer:

1. No gastes tiempo moviendo permisos ni pegando ese enlace: esta versión de OpenReply no usa ese flujo.
2. Abre el [issue #104](https://github.com/diwenne/openreply/issues/104) y revisa si ya hay solución oficial.
3. Si no la hay, usa Zernio o pide el cambio de código. Lo que ya montaste (Vercel, Railway, Resend) te sirve igual.

### Cómo se comportan los límites

- **DMs:** al llegar a 200 en la hora, el mensaje espera y se reintenta. Si no encuentra lugar, aparece en DM Logs como omitido por límite. El barrido automático lo vuelve a intentar mientras el comentario tenga menos de 72 horas.
- **Respuestas públicas:** se detiene solo la respuesta pública y el DM sí sale. La respuesta se reintenta en un barrido posterior.
- **Para cambiar el post o las palabras de una campaña activa:** primero páusala, edítala y vuelve a activarla. Si la editas sin pausar, el barrido puede responder comentarios que ya existían desde la última activación.

---

## Pendientes conocidos (no incluidos en esta versión)

- **Selector de workspace:** una persona en varios workspaces solo ve el primero. Por ahora usa un solo workspace con varias cuentas de Instagram.
- **Limpieza de eventos:** los registros de webhooks y eventos no se borran solos, así que la base de datos irá creciendo. Vigila el disco en Railway.
- **Unified Login:** sin soporte, como se explica arriba.
- **Alertas de seguridad de `npm audit`:** quedan 15 en dependencias que no se pidió subir (2 críticas, por la copia de `@auth/core` que trae `@auth/prisma-adapter`; el inicio de sesión usa otra copia ya corregida). Conviene una segunda ronda de actualizaciones con pruebas.
- **`/api/health` se queda colgado si Redis no responde.** Se resuelve con el `REDIS_URL` correcto.

---

## Si quieres que Claude Code te guíe

Abre Claude Code en la carpeta `herramientas-bots/openreply` y pega esto:

```text
Guíame para desplegar OpenReply desde esta carpeta, rama ramtoid-parches. No sé programar: explícame cada paso en español sencillo, de uno en uno, y espera a que te confirme antes de seguir.

Lee primero GUIA-INSTALAR.md y sigue su orden. Para más detalle usa docs/setup.md y, si hace falta, docs/zernio.md. Empieza por el paso 1: revisar en Meta si aparece "API setup with Instagram login". Si solo aparece Unified login, detente y explícame mis opciones antes de que pague algo.

Reglas obligatorias:
1. Nunca me pidas llaves, contraseñas, tokens ni direcciones con contraseña en el chat. Yo las pego directamente en las pantallas de Vercel, Railway, Resend y Meta. Si pego alguna aquí, dime que la cambie y no la repitas.
2. Los secretos los genero yo en mi propia terminal. No corras comandos que los muestren o los guarden, y no leas ni imprimas archivos .env ni variables de entorno.
3. No crees cuentas, no aceptes términos y no pagues nada: eso lo hago yo. Dime el costo antes de cualquier paso que cobre.
4. No escribas valores reales en ningún archivo del repositorio y no hagas commit de secretos.
5. Haz push solo a mi fork y solo después de que te lo confirme. Nunca al repositorio original (diwenne/openreply).
6. No toques la carpeta RAMTOID BOT. No uses esta instalación en una cuenta conectada a ManyChat o a RAMTOID BOT.
7. Debe haber un solo worker. Antes de crear otro, comprueba conmigo que no exista uno.
8. ALLOWED_EMAILS es obligatorio. ENCRYPTION_KEY debe ser idéntica en Vercel y Railway y no debe cambiar.
9. Si una pantalla no coincide con la guía, no inventes pasos: pídeme que te describa lo que veo.
10. Puedes abrir por tu cuenta solo direcciones públicas sin datos privados, como /api/health. Esa página sin sesión solo dice "ok" o "degraded"; para ver el detalle, pídeme que la abra con mi sesión y que me fije en checks.worker.healthy.

Terminamos cuando /api/health diga "ok", un comentario nuevo con la palabra TEST desde mi otra cuenta genere un DM, y esa fila diga Sent en DM Logs. Al final dime qué quedó listo, qué cuesta al mes y qué falta.
```
