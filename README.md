# Embrague Relay (Edge WebSocket Hub)

Este es el componente central de control de la arquitectura distribuida de Embrague Labs. 
A nivel de sistema, funciona como un **"Hub de Telefónica"** o Switchboard Inmortal.

## 📌 El Problema de Arquitectura (Por qué existe)
Tus orquestadores locales (las máquinas instaladas en campo, como `M7`/`M8`) viven detrás de Firewalls corporativos o routers de ISPs (Fibertel, Claro, etc) mediante NAT.  
*No tienen puertos abiertos al exterior.*  
Por lo tanto, no hay forma física de que la Consola Web de Embrague le envíe un comando HTTP directo tipo *"Apaga este servicio"*, porque el router del cliente rechazaría el paquete.

## 💡 La Solución: The Relay Pattern
La **única forma** de controlar a M7 a demanda es invirtiendo el modelo: que M7 abra una conexión "Outbound" (*Hacia afuera*) y la deje siempre viva conectada a alguien esperando. Ese "alguien" es este repositorio: **El Relay**.

Ambos actores tiran un cable ciego a encontrarse en el medio:
1. **El Orquestrador (M7)** al arrancar entra como cliente mudo por `wss://relay/connect` con su token de máquina.
2. **Tu Consola (Cliente UI)** al entrar al dashboard se conecta por `wss://relay/ws/console` validado por sesión humana.

El Relay simplemente cruza los cables internamente y rutea en milisegundos una orden como "Restart X" que emite la Consola para que la ejecute la M7, saltándose por completo cualquier necesidad de abrir los puertos de la red interna de la oficina.

---

## 🛠️ Tecnologías Elegidas (Cloudflare Workers & V8)

### ¿Por qué Cloudflare y no Node.js/Docker en Google Run? 
Mantener miles de zócalos WebSocket (Conexiones TCP) inactivos por días es ineficientemente caro en infraestructura tradicional (Node en contenedores se ahoga en memoria de I/O para sockets durmientes).  

**Cloudflare Workers** no manejan un SO Linux subyacente. Corren un engine ultraligero de V8 en las propias antenas Edge que cachean páginas web (Isolates).
Y para el caso de los sockets mutables, usan **Durable Objects**.

### 🧱 Durable Objects (La Mesa Redonda Global)
El "Worker" normal (el router de la puerta de entrada) no tiene estado, muere apenas recibe un paquete.
Pero cuando llega una conexión WebSocket, el Worker se la pasa a un **Durable Object**. 
El Durable Object es nuestra "Zona VIP" inmutable que vive fijo en una parte secreta de la memoria RAM global de Cloudflare. Allí es donde nuestro código enciende y mantiene la memoria real sobre las máquinas: *"Sé que el socket con ID z7X es de M7"*. 

### 🧰 Wrangler (El Cuchillo Suizo de Cloudflare)
Verás referencias a dependencias como `wrangler` en lugar de cosas tradicionales.  
`Wrangler` es sencillamente la herramienta de consola Oficial de Cloudflare (`npx wrangler dev`) que compila localmente en un simulador de Edge súper exacto (V8 nativo simulado). 
Al hacer `npx wrangler deploy`, Cloudflare minimiza nuestro Typescript a la mínima expresión del Universo en 3 segundos y lo enciende instántaneamente en todo el globo. Literal magia de sistemas.
