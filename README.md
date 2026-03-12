# Embrague Relay (Edge WebSocket Hub)

Este es el componente central de control de la arquitectura distribuida de Embrague Labs. 
A nivel de sistema, funciona como un Switchboard Inmortal.

 

## The Relay Pattern
 
**El Orquestrador** al arrancar entra como cliente mudo por `wss://relay.embrague.xyz/connect` con su token de máquina.
**Tu Consola** al entrar al dashboard se conecta por `wss://relay.embrague.xyz/ws/console` validado por sesión humana.

---

##  Tecnologías (Cloudflare Workers & V8)

### 
Mantener miles de zócalos WebSocket (Conexiones TCP) inactivos por días es ineficientemente caro en infraestructura tradicional (Node en contenedores se ahoga en memoria de I/O para sockets durmientes).  

**Cloudflare Workers** no manejan un SO Linux subyacente. Corren un engine ultraligero de V8 en las propias antenas Edge que cachean páginas web (Isolates).
Y para el caso de los sockets mutables, usan **Durable Objects**.

### Durable Objects  
El "Worker" normal (el router de la puerta de entrada) no tiene estado, muere apenas recibe un paquete.
Pero cuando llega una conexión WebSocket, el Worker se la pasa a un **Durable Object**. 
El Durable Object es nuestra "Zona" inmutable que vive fijo en una parte secreta de la memoria RAM global de Cloudflare. Allí es donde nuestro código enciende y mantiene la memoria real sobre las máquinas: *"Sé que el socket con ID z7X es de M7"*. 

### Wrangler
`Wrangler` es sencillamente la herramienta de consola Oficial de Cloudflare (`npx wrangler dev`) que compila localmente en un simulador de Edge súper exacto (V8 nativo simulado). 
Al hacer `npx wrangler deploy`, Cloudflare minimiza nuestro Typescript a la mínima expresión del Universo en 3 segundos y lo enciende instántaneamente en todo el globo.
